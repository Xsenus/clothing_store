using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

public interface IYooKassaPaymentService
{
    Task<bool> IsManualRefreshAvailableAsync(CancellationToken cancellationToken = default);
    Task<YooKassaAdminTestResult> TestIntegrationAsync(
        YooKassaIntegrationOverrides overrides,
        string paymentMethod,
        decimal? amount,
        string? returnUrl,
        CancellationToken cancellationToken = default);
    Task<OrderPaymentCheckoutResult> CreatePaymentAsync(Order order, string paymentMethod, string? returnUrl, CancellationToken cancellationToken = default);
    Task<OrderPaymentCheckoutResult> GetCheckoutAsync(Order order, string? returnUrl, CancellationToken cancellationToken = default);
    Task<OrderPayment?> RefreshOrderPaymentAsync(Order order, CancellationToken cancellationToken = default);
    Task CancelPendingPaymentsForOrderAsync(string orderId, string reason, CancellationToken cancellationToken = default);
    Task<YooKassaNotificationHandleResult> HandleNotificationAsync(YooKassaNotificationPayload payload, CancellationToken cancellationToken = default);
    Task<int> ProcessPendingPaymentsAsync(CancellationToken cancellationToken = default);
}

public sealed record YooKassaNotificationHandleResult(
    bool Accepted,
    bool Ignored,
    string Detail,
    OrderPayment? Payment = null);

public sealed record YooKassaIntegrationOverrides(
    bool Enabled,
    string? ShopId,
    string? SecretKey,
    bool TestMode,
    string? LabelPrefix,
    int? PaymentTimeoutMinutes,
    bool AllowBankCards,
    bool AllowSbp,
    bool AllowYooMoney);

public sealed record YooKassaAdminTestResult(
    string Mode,
    bool TestMode,
    string PaymentMethod,
    string PaymentType,
    decimal Amount,
    string Currency,
    string Status,
    string Detail,
    string? PaymentId = null,
    string? ConfirmationUrl = null,
    string? CreatedAt = null,
    bool? Paid = null);

public sealed class YooKassaPaymentService : IYooKassaPaymentService
{
    private const string ProviderName = "yookassa";
    private const string CurrencyCode = "RUB";
    private const string ApiBaseUrl = "https://api.yookassa.ru/v3";
    private const int MaxPendingPaymentsPerSync = 10;
    private static readonly TimeSpan PendingSyncInterval = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(15);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly HashSet<string> PendingPaymentStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "pending"
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly IOrderInventoryService _orderInventoryService;
    private readonly ILogger<YooKassaPaymentService> _logger;

    public YooKassaPaymentService(
        IHttpClientFactory httpClientFactory,
        StoreDbContext db,
        IConfiguration configuration,
        IOrderInventoryService orderInventoryService,
        ILogger<YooKassaPaymentService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _db = db;
        _configuration = configuration;
        _orderInventoryService = orderInventoryService;
        _logger = logger;
    }

    public async Task<bool> IsManualRefreshAvailableAsync(CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(cancellationToken);
        return !string.IsNullOrWhiteSpace(settings.ShopId)
            && !string.IsNullOrWhiteSpace(settings.SecretKey);
    }

    public async Task<YooKassaAdminTestResult> TestIntegrationAsync(
        YooKassaIntegrationOverrides overrides,
        string paymentMethod,
        decimal? amount,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(overrides, cancellationToken);
        EnsurePaymentsEnabled(settings);

        var paymentDescriptor = ResolvePaymentDescriptor(paymentMethod, settings);
        var normalizedAmount = NormalizeMoney(amount ?? 100m);
        if (normalizedAmount <= 0m)
            throw new InvalidOperationException("Для теста YooKassa укажите сумму больше 0 ₽.");

        if (!settings.TestMode)
        {
            await ProbeApiAccessAsync(settings, cancellationToken);

            return new YooKassaAdminTestResult(
                Mode: "api_access",
                TestMode: false,
                PaymentMethod: paymentDescriptor.Method,
                PaymentType: paymentDescriptor.PaymentType,
                Amount: normalizedAmount,
                Currency: CurrencyCode,
                Status: "api_access_confirmed",
                Detail: "API-доступ подтвержден. Для безопасного сквозного теста переведите YooKassa в режим тестового магазина и повторите проверку.");
        }

        var response = await CreateRemoteTestPaymentAsync(
            paymentDescriptor,
            normalizedAmount,
            returnUrl,
            settings,
            cancellationToken);

        return new YooKassaAdminTestResult(
            Mode: "test_payment",
            TestMode: true,
            PaymentMethod: paymentDescriptor.Method,
            PaymentType: paymentDescriptor.PaymentType,
            Amount: ParseAmount(response.Amount?.Value) ?? normalizedAmount,
            Currency: NormalizeOptionalText(response.Amount?.Currency) ?? CurrencyCode,
            Status: NormalizePaymentStatus(response.Status),
            Detail: "Тестовый платеж создан. Откройте confirmation URL и завершите оплату тестовыми данными YooKassa, если хотите проверить сценарий до конца.",
            PaymentId: NormalizeOptionalText(response.Id),
            ConfirmationUrl: NormalizeOptionalText(response.Confirmation?.ConfirmationUrl),
            CreatedAt: NormalizeOptionalText(response.CreatedAt),
            Paid: response.Paid);
    }

    public async Task<OrderPaymentCheckoutResult> CreatePaymentAsync(
        Order order,
        string paymentMethod,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(cancellationToken);
        EnsurePaymentsEnabled(settings);

        var paymentDescriptor = ResolvePaymentDescriptor(paymentMethod, settings);
        var amount = NormalizeMoney(order.TotalAmount);
        if (amount <= 0m)
            throw new InvalidOperationException("Нельзя создать платеж YooKassa с нулевой суммой.");

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var payment = new OrderPayment
        {
            OrderId = order.Id,
            Provider = ProviderName,
            PaymentMethod = paymentDescriptor.Method,
            PaymentType = paymentDescriptor.PaymentType,
            Status = "pending",
            Currency = CurrencyCode,
            RequestedAmount = (double)amount,
            ChargeAmount = (double)amount,
            ExpectedReceivedAmount = (double)amount,
            ReceiverAccount = settings.ShopId,
            Label = BuildPaymentLabel(settings.LabelPrefix),
            ReturnUrl = NormalizeReturnUrl(returnUrl),
            ExpiresAt = now + (long)TimeSpan.FromMinutes(Math.Max(settings.PaymentTimeoutMinutes, 60)).TotalMilliseconds,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.OrderPayments.Add(payment);
        await _db.SaveChangesAsync(cancellationToken);

        try
        {
            var response = await CreateRemotePaymentAsync(order, payment, paymentDescriptor, settings, cancellationToken);
            await SyncPaymentFromResponseAsync(
                payment,
                order,
                response,
                verificationSource: "create",
                notificationEvent: null,
                payloadJson: JsonSerializer.Serialize(response, JsonOptions),
                cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);

            if (!string.Equals(NormalizePaymentStatus(payment.Status), "pending", StringComparison.Ordinal))
                throw new InvalidOperationException("YooKassa не вернула активный счет для оплаты. Попробуйте создать платеж повторно.");

            return BuildCheckoutResult(payment, response);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            var errorNow = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            payment.Status = "error";
            payment.LastCheckedAt = errorNow;
            payment.LastError = LimitText(ex.Message, 500);
            payment.UpdatedAt = errorNow;
            await _db.SaveChangesAsync(cancellationToken);
            throw;
        }
    }

    public async Task<OrderPaymentCheckoutResult> GetCheckoutAsync(
        Order order,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        var payment = await _db.OrderPayments
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync(x => x.OrderId == order.Id, cancellationToken)
            ?? throw new InvalidOperationException("Платеж YooKassa для заказа не найден.");

        if (!string.Equals(payment.Provider, ProviderName, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Заказ не связан с платежом YooKassa.");

        if (!PendingPaymentStatuses.Contains(payment.Status))
            throw new InvalidOperationException("Повторно открыть можно только активный платеж YooKassa.");

        var normalizedReturnUrl = NormalizeReturnUrl(returnUrl);
        if (!string.IsNullOrWhiteSpace(normalizedReturnUrl)
            && !string.Equals(payment.ReturnUrl, normalizedReturnUrl, StringComparison.Ordinal))
        {
            payment.ReturnUrl = normalizedReturnUrl;
            payment.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await _db.SaveChangesAsync(cancellationToken);
        }

        var settings = await ResolveSettingsAsync(cancellationToken);
        EnsureApiAccessConfigured(settings);
        if (string.IsNullOrWhiteSpace(payment.OperationId))
            throw new InvalidOperationException("У платежа YooKassa отсутствует идентификатор провайдера. Создайте новый платеж.");

        var response = await GetRemotePaymentAsync(payment.OperationId, settings, cancellationToken);
        await SyncPaymentFromResponseAsync(
            payment,
            order,
            response,
            verificationSource: "checkout",
            notificationEvent: null,
            payloadJson: JsonSerializer.Serialize(response, JsonOptions),
            cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.Equals(NormalizePaymentStatus(payment.Status), "pending", StringComparison.Ordinal))
            throw new InvalidOperationException("Активный платеж YooKassa больше недоступен.");

        return BuildCheckoutResult(payment, response);
    }

    public async Task<OrderPayment?> RefreshOrderPaymentAsync(Order order, CancellationToken cancellationToken = default)
    {
        var payment = await _db.OrderPayments
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync(x => x.OrderId == order.Id, cancellationToken);
        if (payment is null)
            return null;

        var settings = await ResolveSettingsAsync(cancellationToken);
        EnsureApiAccessConfigured(settings);

        if (string.IsNullOrWhiteSpace(payment.OperationId))
            throw new InvalidOperationException("У платежа YooKassa отсутствует идентификатор провайдера.");

        var response = await GetRemotePaymentAsync(payment.OperationId, settings, cancellationToken);
        await SyncPaymentFromResponseAsync(
            payment,
            order,
            response,
            verificationSource: "manual-refresh",
            notificationEvent: null,
            payloadJson: JsonSerializer.Serialize(response, JsonOptions),
            cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        return payment;
    }

    public async Task CancelPendingPaymentsForOrderAsync(
        string orderId,
        string reason,
        CancellationToken cancellationToken = default)
    {
        var normalizedOrderId = orderId?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalizedOrderId))
            return;

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var payments = await _db.OrderPayments
            .Where(x => x.OrderId == normalizedOrderId && x.Provider == ProviderName && x.Status.ToLower() == "pending")
            .ToListAsync(cancellationToken);

        foreach (var payment in payments)
        {
            payment.Status = "canceled";
            payment.LastCheckedAt = now;
            payment.LastError = LimitText(reason, 500);
            payment.UpdatedAt = now;
        }
    }

    public async Task<YooKassaNotificationHandleResult> HandleNotificationAsync(
        YooKassaNotificationPayload payload,
        CancellationToken cancellationToken = default)
    {
        var remotePaymentId = NormalizeOptionalText(payload.Object?.Id);
        if (string.IsNullOrWhiteSpace(remotePaymentId))
            return new YooKassaNotificationHandleResult(false, false, "В уведомлении YooKassa отсутствует payment id.");

        var settings = await ResolveSettingsAsync(cancellationToken);
        EnsureApiAccessConfigured(settings);

        var localPaymentId = NormalizeOptionalText(GetMetadataValue(payload.Object?.Metadata, "payment_id"));
        var payment = !string.IsNullOrWhiteSpace(localPaymentId)
            ? await _db.OrderPayments.FirstOrDefaultAsync(x => x.Id == localPaymentId, cancellationToken)
            : null;
        payment ??= await _db.OrderPayments.FirstOrDefaultAsync(x => x.OperationId == remotePaymentId, cancellationToken);
        if (payment is null)
            return new YooKassaNotificationHandleResult(true, true, "Платеж YooKassa не найден в локальной базе.");

        var order = await _db.Orders.FirstOrDefaultAsync(x => x.Id == payment.OrderId, cancellationToken);
        if (order is null)
            return new YooKassaNotificationHandleResult(true, true, "Заказ для платежа YooKassa не найден.");

        var response = await GetRemotePaymentAsync(remotePaymentId, settings, cancellationToken);
        await SyncPaymentFromResponseAsync(
            payment,
            order,
            response,
            verificationSource: "webhook",
            notificationEvent: NormalizeOptionalText(payload.Event),
            payloadJson: JsonSerializer.Serialize(payload, JsonOptions),
            cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        return new YooKassaNotificationHandleResult(true, false, "Уведомление YooKassa обработано.", payment);
    }

    public async Task<int> ProcessPendingPaymentsAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var pendingPayments = await _db.OrderPayments
            .Where(x => x.Provider == ProviderName && x.Status.ToLower() == "pending")
            .OrderBy(x => x.LastCheckedAt ?? 0)
            .ThenBy(x => x.CreatedAt)
            .Take(MaxPendingPaymentsPerSync)
            .ToListAsync(cancellationToken);
        if (pendingPayments.Count == 0)
            return 0;

        var orderIds = pendingPayments.Select(x => x.OrderId).Distinct().ToList();
        var ordersById = await _db.Orders
            .Where(x => orderIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, StringComparer.Ordinal, cancellationToken);
        var settings = await ResolveSettingsAsync(cancellationToken);
        var hasApiAccess = !string.IsNullOrWhiteSpace(settings.ShopId) && !string.IsNullOrWhiteSpace(settings.SecretKey);

        var updatedCount = 0;
        foreach (var payment in pendingPayments)
        {
            if (!ordersById.TryGetValue(payment.OrderId, out var order))
                continue;

            var lastCheckedAt = payment.LastCheckedAt ?? 0;
            var shouldSync = hasApiAccess
                && !string.IsNullOrWhiteSpace(payment.OperationId)
                && now - lastCheckedAt >= (long)PendingSyncInterval.TotalMilliseconds;
            if (shouldSync)
            {
                try
                {
                    var response = await GetRemotePaymentAsync(payment.OperationId!, settings, cancellationToken);
                    await SyncPaymentFromResponseAsync(
                        payment,
                        order,
                        response,
                        verificationSource: "background",
                        notificationEvent: null,
                        payloadJson: JsonSerializer.Serialize(response, JsonOptions),
                        cancellationToken);
                    updatedCount++;
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    payment.LastCheckedAt = now;
                    payment.UpdatedAt = now;
                    payment.LastError = LimitText(ex.Message, 500);
                    _logger.LogWarning(ex, "Failed to sync YooKassa payment {PaymentId} for order {OrderId}", payment.Id, order.Id);
                }
            }
            else if (payment.ExpiresAt.HasValue && payment.ExpiresAt.Value <= now)
            {
                await ExpirePaymentAsync(payment, order, now, "background", "Срок ожидания оплаты YooKassa истек.", cancellationToken);
                updatedCount++;
            }
        }

        if (_db.ChangeTracker.HasChanges())
            await _db.SaveChangesAsync(cancellationToken);

        return updatedCount;
    }

    private OrderPaymentCheckoutResult BuildCheckoutResult(OrderPayment payment, YooKassaPaymentResponse response)
    {
        var confirmationUrl = NormalizeOptionalText(response.Confirmation?.ConfirmationUrl);
        if (string.IsNullOrWhiteSpace(confirmationUrl))
            throw new InvalidOperationException("YooKassa не вернула confirmation_url для активного платежа.");

        return new OrderPaymentCheckoutResult(
            Payment: payment,
            Action: confirmationUrl,
            Method: "REDIRECT",
            Fields: new Dictionary<string, string>(StringComparer.Ordinal));
    }

    private async Task SyncPaymentFromResponseAsync(
        OrderPayment payment,
        Order order,
        YooKassaPaymentResponse response,
        string verificationSource,
        string? notificationEvent,
        string? payloadJson,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var normalizedStatus = NormalizePaymentStatus(response.Status);
        var paymentAmount = ParseAmount(response.Amount?.Value);

        payment.OperationId = NormalizeOptionalText(response.Id) ?? payment.OperationId;
        payment.NotificationType = notificationEvent ?? payment.NotificationType;
        payment.PaymentType = NormalizeOptionalText(response.PaymentMethod?.Type) ?? payment.PaymentType;
        payment.ReceiverAccount = NormalizeOptionalText(response.Recipient?.AccountId) ?? payment.ReceiverAccount;
        payment.LastPayloadJson = string.IsNullOrWhiteSpace(payloadJson) ? payment.LastPayloadJson : payloadJson;
        payment.VerificationSource = verificationSource;
        payment.LastCheckedAt = now;
        payment.UpdatedAt = now;

        if (!string.IsNullOrWhiteSpace(response.Amount?.Currency))
            payment.Currency = response.Amount!.Currency!.Trim().ToUpperInvariant();

        if (!string.IsNullOrWhiteSpace(response.CancellationDetails?.Party))
            payment.Sender = NormalizeOptionalText(response.CancellationDetails.Party);

        if (string.Equals(normalizedStatus, "pending", StringComparison.Ordinal))
        {
            payment.Status = "pending";
            payment.LastError = null;
            return;
        }

        if (paymentAmount.HasValue && !AmountsMatch((decimal)payment.ExpectedReceivedAmount, paymentAmount.Value))
        {
            await MarkPaymentForReviewAsync(
                payment,
                order,
                now,
                verificationSource,
                "Сумма платежа YooKassa не совпала с ожидаемой суммой заказа.",
                cancellationToken);
            return;
        }

        if (!string.Equals(payment.Currency, CurrencyCode, StringComparison.OrdinalIgnoreCase))
        {
            await MarkPaymentForReviewAsync(
                payment,
                order,
                now,
                verificationSource,
                "YooKassa вернула платеж в неподдерживаемой валюте.",
                cancellationToken);
            return;
        }

        if (string.Equals(normalizedStatus, "succeeded", StringComparison.Ordinal))
        {
            await ApplySuccessfulPaymentAsync(
                payment,
                order,
                paymentAmount ?? (decimal)payment.ExpectedReceivedAmount,
                verificationSource,
                notificationEvent,
                payloadJson,
                ParseDateTimeToUnixMilliseconds(response.PaidAt)
                    ?? ParseDateTimeToUnixMilliseconds(response.CapturedAt)
                    ?? now,
                cancellationToken);
            return;
        }

        if (string.Equals(normalizedStatus, "canceled", StringComparison.Ordinal))
        {
            var reason = NormalizeOptionalText(response.CancellationDetails?.Reason);
            if (string.Equals(reason, "expired_on_confirmation", StringComparison.OrdinalIgnoreCase))
            {
                await ExpirePaymentAsync(
                    payment,
                    order,
                    now,
                    verificationSource,
                    "Срок ожидания оплаты YooKassa истек.",
                    cancellationToken);
                return;
            }

            ApplyCanceledPayment(
                payment,
                order,
                now,
                verificationSource,
                notificationEvent,
                payloadJson,
                BuildCancellationMessage(response.CancellationDetails));
            return;
        }

        await MarkPaymentForReviewAsync(
            payment,
            order,
            now,
            verificationSource,
            $"YooKassa вернула неподдерживаемый статус платежа: {normalizedStatus}.",
            cancellationToken);
    }

    private async Task ApplySuccessfulPaymentAsync(
        OrderPayment payment,
        Order order,
        decimal receivedAmount,
        string verificationSource,
        string? notificationEvent,
        string? payloadJson,
        long paidAt,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (string.Equals(NormalizePaymentStatus(payment.Status), "paid", StringComparison.Ordinal))
        {
            payment.LastCheckedAt = now;
            payment.UpdatedAt = now;
            payment.LastError = null;
            payment.NotificationType = notificationEvent ?? payment.NotificationType;
            payment.LastPayloadJson = string.IsNullOrWhiteSpace(payloadJson) ? payment.LastPayloadJson : payloadJson;
            payment.PaidAt ??= paidAt;
            return;
        }

        payment.Status = "paid";
        payment.ReceivedAmount = (double)receivedAmount;
        payment.ActualWithdrawAmount = (double)receivedAmount;
        payment.NotificationType = notificationEvent ?? payment.NotificationType;
        payment.VerificationSource = verificationSource;
        payment.LastPayloadJson = string.IsNullOrWhiteSpace(payloadJson) ? payment.LastPayloadJson : payloadJson;
        payment.PaidAt = paidAt;
        payment.LastCheckedAt = now;
        payment.LastError = null;
        payment.UpdatedAt = now;

        var normalizedOrderStatus = NormalizeOrderStatus(order.Status);
        if (normalizedOrderStatus is "canceled" or "cancelled" or "returned")
        {
            await MarkPaymentForReviewAsync(
                payment,
                order,
                now,
                verificationSource,
                "Оплата поступила по заказу, который уже находится в терминальном статусе.",
                cancellationToken);
            return;
        }

        if (!string.Equals(normalizedOrderStatus, "paid", StringComparison.Ordinal))
        {
            order.Status = "paid";
            order.UpdatedAt = now;
            order.StatusHistoryJson = AppendOrderHistory(
                order.StatusHistoryJson,
                new Dictionary<string, object?>
                {
                    ["kind"] = "payment_confirmed",
                    ["status"] = "paid",
                    ["changedAt"] = now,
                    ["changedBy"] = ProviderName,
                    ["comment"] = "Оплата YooKassa подтверждена автоматически"
                });
        }
    }

    private void ApplyCanceledPayment(
        OrderPayment payment,
        Order order,
        long now,
        string verificationSource,
        string? notificationEvent,
        string? payloadJson,
        string message)
    {
        var alreadyCanceled = string.Equals(NormalizePaymentStatus(payment.Status), "canceled", StringComparison.Ordinal);
        payment.Status = "canceled";
        payment.NotificationType = notificationEvent ?? payment.NotificationType;
        payment.VerificationSource = verificationSource;
        payment.LastPayloadJson = string.IsNullOrWhiteSpace(payloadJson) ? payment.LastPayloadJson : payloadJson;
        payment.LastCheckedAt = now;
        payment.LastError = LimitText(message, 500);
        payment.UpdatedAt = now;

        if (string.Equals(NormalizeOrderStatus(order.Status), "pending_payment", StringComparison.Ordinal) && !alreadyCanceled)
        {
            order.UpdatedAt = now;
            order.StatusHistoryJson = AppendOrderHistory(
                order.StatusHistoryJson,
                new Dictionary<string, object?>
                {
                    ["kind"] = "payment_canceled",
                    ["status"] = "pending_payment",
                    ["changedAt"] = now,
                    ["changedBy"] = ProviderName,
                    ["comment"] = message
                });
        }
    }

    private async Task MarkPaymentForReviewAsync(
        OrderPayment payment,
        Order order,
        long now,
        string verificationSource,
        string reason,
        CancellationToken cancellationToken)
    {
        payment.Status = "review_required";
        payment.VerificationSource = verificationSource;
        payment.LastCheckedAt = now;
        payment.LastError = LimitText(reason, 500);
        payment.UpdatedAt = now;

        order.UpdatedAt = now;
        order.StatusHistoryJson = AppendOrderHistory(
            order.StatusHistoryJson,
            new Dictionary<string, object?>
            {
                ["kind"] = "payment_review_required",
                ["status"] = NormalizeOrderStatus(order.Status),
                ["changedAt"] = now,
                ["changedBy"] = ProviderName,
                ["comment"] = reason
            });

        await Task.CompletedTask;
    }

    private async Task ExpirePaymentAsync(
        OrderPayment payment,
        Order order,
        long now,
        string verificationSource,
        string reason,
        CancellationToken cancellationToken)
    {
        payment.Status = "expired";
        payment.VerificationSource = verificationSource;
        payment.LastCheckedAt = now;
        payment.LastError = LimitText(reason, 500);
        payment.UpdatedAt = now;

        var normalizedOrderStatus = NormalizeOrderStatus(order.Status);
        if (normalizedOrderStatus is "canceled" or "cancelled" or "returned")
            return;

        var systemUserId = await ResolveSystemUserIdAsync(order.UserId, cancellationToken);
        await _orderInventoryService.ReleaseOrderStockAsync(order, systemUserId, now, "payment_expired", cancellationToken);

        order.Status = "canceled";
        order.UpdatedAt = now;
        order.StatusHistoryJson = AppendOrderHistory(
            order.StatusHistoryJson,
            new Dictionary<string, object?>
            {
                ["kind"] = "payment_expired",
                ["status"] = "canceled",
                ["changedAt"] = now,
                ["changedBy"] = ProviderName,
                ["comment"] = "Срок оплаты YooKassa истек, резерв товара снят автоматически"
            });
    }

    private async Task<string> ResolveSystemUserIdAsync(string fallbackUserId, CancellationToken cancellationToken)
    {
        var systemUserId = await _db.Users
            .AsNoTracking()
            .Where(x => x.IsSystem)
            .Select(x => x.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(systemUserId))
            return systemUserId!;

        var adminUserId = await _db.Users
            .AsNoTracking()
            .Where(x => x.IsAdmin)
            .Select(x => x.Id)
            .FirstOrDefaultAsync(cancellationToken);
        return string.IsNullOrWhiteSpace(adminUserId) ? fallbackUserId : adminUserId!;
    }

    private async Task<YooKassaPaymentResponse> CreateRemotePaymentAsync(
        Order order,
        OrderPayment payment,
        YooKassaPaymentDescriptor descriptor,
        YooKassaSettings settings,
        CancellationToken cancellationToken)
    {
        var returnUrl = BuildReturnUrl(payment.ReturnUrl, order, payment);
        if (string.IsNullOrWhiteSpace(returnUrl))
            throw new InvalidOperationException("Для YooKassa не передан корректный URL возврата после оплаты.");

        var requestPayload = new
        {
            amount = new
            {
                value = ((decimal)payment.ChargeAmount).ToString("0.00", CultureInfo.InvariantCulture),
                currency = payment.Currency
            },
            capture = true,
            confirmation = new
            {
                type = "redirect",
                return_url = returnUrl
            },
            description = BuildDescription(order),
            payment_method_data = new
            {
                type = descriptor.PaymentType
            },
            metadata = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["order_id"] = order.Id,
                ["order_number"] = order.OrderNumber.ToString(CultureInfo.InvariantCulture),
                ["payment_id"] = payment.Id,
                ["label"] = payment.Label
            }
        };

        return await SendAsync<YooKassaPaymentResponse>(
            HttpMethod.Post,
            "payments",
            settings,
            requestPayload,
            payment.Label,
            cancellationToken);
    }

    private async Task<YooKassaPaymentResponse> CreateRemoteTestPaymentAsync(
        YooKassaPaymentDescriptor descriptor,
        decimal amount,
        string? returnUrl,
        YooKassaSettings settings,
        CancellationToken cancellationToken)
    {
        var normalizedReturnUrl = NormalizeReturnUrl(returnUrl);
        if (string.IsNullOrWhiteSpace(normalizedReturnUrl))
            throw new InvalidOperationException("Для теста YooKassa передан некорректный URL возврата.");

        var idempotenceKey = BuildPaymentLabel(settings.LabelPrefix);
        var requestPayload = new
        {
            amount = new
            {
                value = amount.ToString("0.00", CultureInfo.InvariantCulture),
                currency = CurrencyCode
            },
            capture = true,
            confirmation = new
            {
                type = "redirect",
                return_url = normalizedReturnUrl
            },
            description = "Тест интеграции YooKassa из админки",
            payment_method_data = new
            {
                type = descriptor.PaymentType
            },
            metadata = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["integration_test"] = "true",
                ["payment_method"] = descriptor.Method,
                ["label"] = idempotenceKey
            }
        };

        return await SendAsync<YooKassaPaymentResponse>(
            HttpMethod.Post,
            "payments",
            settings,
            requestPayload,
            idempotenceKey,
            cancellationToken);
    }

    private Task<YooKassaPaymentResponse> GetRemotePaymentAsync(
        string paymentId,
        YooKassaSettings settings,
        CancellationToken cancellationToken)
        => SendAsync<YooKassaPaymentResponse>(
            HttpMethod.Get,
            $"payments/{Uri.EscapeDataString(paymentId)}",
            settings,
            null,
            null,
            cancellationToken);

    private async Task<TResponse> SendAsync<TResponse>(
        HttpMethod method,
        string relativePath,
        YooKassaSettings settings,
        object? payload,
        string? idempotenceKey,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(method, $"{ApiBaseUrl}/{relativePath}");
        request.Headers.Authorization = CreateBasicAuthHeader(settings.ShopId, settings.SecretKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        if (!string.IsNullOrWhiteSpace(idempotenceKey))
            request.Headers.Add("Idempotence-Key", idempotenceKey);

        if (payload is not null)
        {
            request.Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json");
        }

        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        linkedCts.CancelAfter(RequestTimeout);

        using var response = await client.SendAsync(request, linkedCts.Token);
        if (!response.IsSuccessStatusCode)
        {
            var responseText = await response.Content.ReadAsStringAsync(linkedCts.Token);
            throw new HttpRequestException(BuildApiErrorMessage(response.StatusCode, responseText));
        }

        await using var responseStream = await response.Content.ReadAsStreamAsync(linkedCts.Token);
        var parsed = await JsonSerializer.DeserializeAsync<TResponse>(responseStream, JsonOptions, linkedCts.Token);
        return parsed ?? throw new InvalidOperationException("YooKassa вернула пустой ответ.");
    }

    private async Task ProbeApiAccessAsync(YooKassaSettings settings, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{ApiBaseUrl}/payments/{Guid.NewGuid():N}");
        request.Headers.Authorization = CreateBasicAuthHeader(settings.ShopId, settings.SecretKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        linkedCts.CancelAfter(RequestTimeout);

        using var response = await client.SendAsync(request, linkedCts.Token);
        if (response.IsSuccessStatusCode
            || response.StatusCode == System.Net.HttpStatusCode.NotFound
            || response.StatusCode == System.Net.HttpStatusCode.BadRequest)
        {
            return;
        }

        var responseText = await response.Content.ReadAsStringAsync(linkedCts.Token);
        throw new HttpRequestException(BuildApiErrorMessage(response.StatusCode, responseText));
    }

    private Task<YooKassaSettings> ResolveSettingsAsync(CancellationToken cancellationToken)
        => ResolveSettingsAsync(overrides: null, cancellationToken);

    private async Task<YooKassaSettings> ResolveSettingsAsync(YooKassaIntegrationOverrides? overrides, CancellationToken cancellationToken)
    {
        bool enabled;
        string? shopId;
        string? secretKey;
        bool testMode;
        string? labelPrefix;
        int paymentTimeoutMinutes;
        bool allowBankCards;
        bool allowSbp;
        bool allowYooMoney;

        if (overrides is not null)
        {
            enabled = overrides.Enabled;
            shopId = overrides.ShopId;
            secretKey = overrides.SecretKey;
            testMode = overrides.TestMode;
            labelPrefix = overrides.LabelPrefix;
            paymentTimeoutMinutes = overrides.PaymentTimeoutMinutes ?? 60;
            allowBankCards = overrides.AllowBankCards;
            allowSbp = overrides.AllowSbp;
            allowYooMoney = overrides.AllowYooMoney;
        }
        else
        {
            enabled = await GetBooleanSettingAsync(
                "payments_yookassa_enabled",
                "Integrations:YooKassa:Enabled",
                fallback: false,
                cancellationToken);
            shopId = await GetSettingOrConfigAsync(
                "yookassa_shop_id",
                "Integrations:YooKassa:ShopId",
                cancellationToken);
            secretKey = await GetSettingOrConfigAsync(
                "yookassa_secret_key",
                "Integrations:YooKassa:SecretKey",
                cancellationToken);
            testMode = await GetBooleanSettingAsync(
                "yookassa_test_mode",
                "Integrations:YooKassa:TestMode",
                fallback: false,
                cancellationToken);
            labelPrefix = await GetSettingOrConfigAsync(
                "yookassa_label_prefix",
                "Integrations:YooKassa:LabelPrefix",
                cancellationToken);
            paymentTimeoutMinutes = await GetIntSettingAsync(
                "yookassa_payment_timeout_minutes",
                "Integrations:YooKassa:PaymentTimeoutMinutes",
                fallback: 60,
                cancellationToken);
            allowBankCards = await GetBooleanSettingAsync(
                "yookassa_allow_bank_cards",
                "Integrations:YooKassa:AllowBankCards",
                fallback: true,
                cancellationToken);
            allowSbp = await GetBooleanSettingAsync(
                "yookassa_allow_sbp",
                "Integrations:YooKassa:AllowSbp",
                fallback: true,
                cancellationToken);
            allowYooMoney = await GetBooleanSettingAsync(
                "yookassa_allow_yoomoney",
                "Integrations:YooKassa:AllowYooMoney",
                fallback: true,
                cancellationToken);
        }

        return new YooKassaSettings(
            Enabled: enabled,
            ShopId: NormalizeOptionalText(shopId) ?? string.Empty,
            SecretKey: NormalizeOptionalText(secretKey),
            TestMode: testMode,
            LabelPrefix: NormalizeLabelPrefix(labelPrefix),
            PaymentTimeoutMinutes: Math.Clamp(paymentTimeoutMinutes, 60, 10080),
            AllowBankCards: allowBankCards,
            AllowSbp: allowSbp,
            AllowYooMoney: allowYooMoney);
    }

    private async Task<string?> GetSettingOrConfigAsync(string key, string configPath, CancellationToken cancellationToken)
    {
        var row = await _db.AppSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Key == key, cancellationToken);
        if (row is not null && !string.IsNullOrWhiteSpace(row.Value))
            return row.Value.Trim();

        var configValue = _configuration[configPath];
        return string.IsNullOrWhiteSpace(configValue) ? null : configValue.Trim();
    }

    private async Task<bool> GetBooleanSettingAsync(string key, string configPath, bool fallback, CancellationToken cancellationToken)
    {
        var raw = await GetSettingOrConfigAsync(key, configPath, cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
            return fallback;

        return raw.Trim().ToLowerInvariant() switch
        {
            "1" or "true" or "yes" or "on" => true,
            "0" or "false" or "no" or "off" => false,
            _ => fallback
        };
    }

    private async Task<int> GetIntSettingAsync(string key, string configPath, int fallback, CancellationToken cancellationToken)
    {
        var raw = await GetSettingOrConfigAsync(key, configPath, cancellationToken);
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : fallback;
    }

    private static void EnsurePaymentsEnabled(YooKassaSettings settings)
    {
        if (!settings.Enabled)
            throw new InvalidOperationException("Онлайн-оплата YooKassa отключена в интеграциях.");

        EnsureApiAccessConfigured(settings);

        if (!settings.AllowBankCards && !settings.AllowSbp && !settings.AllowYooMoney)
            throw new InvalidOperationException("Для YooKassa не выбран ни один доступный способ оплаты.");
    }

    private static void EnsureApiAccessConfigured(YooKassaSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ShopId))
            throw new InvalidOperationException("В интеграциях не указан Shop ID YooKassa.");

        if (string.IsNullOrWhiteSpace(settings.SecretKey))
            throw new InvalidOperationException("В интеграциях не указан Secret Key YooKassa.");
    }

    private static YooKassaPaymentDescriptor ResolvePaymentDescriptor(string paymentMethod, YooKassaSettings settings)
    {
        var normalizedMethod = NormalizePaymentMethodValue(paymentMethod);
        return normalizedMethod switch
        {
            "yookassa_card" when settings.AllowBankCards => new YooKassaPaymentDescriptor("yookassa_card", "bank_card"),
            "yookassa_sbp" when settings.AllowSbp => new YooKassaPaymentDescriptor("yookassa_sbp", "sbp"),
            "yookassa_yoomoney" when settings.AllowYooMoney => new YooKassaPaymentDescriptor("yookassa_yoomoney", "yoo_money"),
            "yookassa" when settings.AllowBankCards => new YooKassaPaymentDescriptor("yookassa_card", "bank_card"),
            "yookassa" when settings.AllowSbp => new YooKassaPaymentDescriptor("yookassa_sbp", "sbp"),
            "yookassa" when settings.AllowYooMoney => new YooKassaPaymentDescriptor("yookassa_yoomoney", "yoo_money"),
            "yookassa_card" => throw new InvalidOperationException("Оплата банковской картой через YooKassa отключена в интеграциях."),
            "yookassa_sbp" => throw new InvalidOperationException("Оплата через СБП в YooKassa отключена в интеграциях."),
            "yookassa_yoomoney" => throw new InvalidOperationException("Оплата кошельком ЮMoney через YooKassa отключена в интеграциях."),
            "yookassa" => throw new InvalidOperationException("Для YooKassa не настроен ни один доступный способ оплаты."),
            _ => throw new InvalidOperationException("Указан неподдерживаемый способ оплаты YooKassa.")
        };
    }

    private static AuthenticationHeaderValue CreateBasicAuthHeader(string shopId, string? secretKey)
    {
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{shopId}:{secretKey ?? string.Empty}"));
        return new AuthenticationHeaderValue("Basic", credentials);
    }

    private static string BuildDescription(Order order)
        => $"Заказ №{OrderPresentation.FormatOrderNumber(order.OrderNumber)}";

    private static string BuildPaymentLabel(string prefix)
    {
        var paymentId = Guid.NewGuid().ToString("N");
        var normalizedPrefix = string.IsNullOrWhiteSpace(prefix) ? "store" : prefix.Trim();
        var label = $"{normalizedPrefix}.{paymentId}";
        return label.Length <= 64 ? label : label[..64];
    }

    private static string? BuildReturnUrl(string? returnUrl, Order order, OrderPayment payment)
    {
        var normalizedReturnUrl = NormalizeReturnUrl(returnUrl);
        if (string.IsNullOrWhiteSpace(normalizedReturnUrl))
            return null;

        return QueryHelpers.AddQueryString(normalizedReturnUrl, new Dictionary<string, string?>(StringComparer.Ordinal)
        {
            ["paymentStatus"] = "return",
            ["orderId"] = order.Id,
            ["paymentId"] = payment.Id
        });
    }

    private static string NormalizePaymentMethodValue(string? paymentMethod)
    {
        var normalized = paymentMethod?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "cod" : normalized;
    }

    private static string NormalizePaymentStatus(string? status)
    {
        var normalized = status?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "pending" : normalized;
    }

    private static string NormalizeOrderStatus(string? status)
    {
        var normalized = status?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "processing" : normalized;
    }

    private static string? NormalizeOptionalText(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static string NormalizeLabelPrefix(string? value)
    {
        var normalized = new string((value ?? string.Empty)
            .Trim()
            .Where(ch => char.IsLetterOrDigit(ch) || ch is '.' or '_' or '-')
            .ToArray());

        if (string.IsNullOrWhiteSpace(normalized))
            return "store";

        return normalized.Length <= 24 ? normalized : normalized[..24];
    }

    private static string? NormalizeReturnUrl(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return null;

        return Uri.TryCreate(trimmed, UriKind.Absolute, out var parsedUri)
            && (parsedUri.Scheme == Uri.UriSchemeHttp || parsedUri.Scheme == Uri.UriSchemeHttps)
            ? parsedUri.ToString()
            : null;
    }

    private static decimal NormalizeMoney(double value)
        => NormalizeMoney((decimal)value);

    private static decimal NormalizeMoney(decimal value)
    {
        if (value < 0m)
            value = 0m;

        return Math.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private static decimal? ParseAmount(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        return decimal.TryParse(value.Trim().Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            ? NormalizeMoney(parsed)
            : null;
    }

    private static long? ParseDateTimeToUnixMilliseconds(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        return DateTimeOffset.TryParse(value.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed)
            ? parsed.ToUnixTimeMilliseconds()
            : null;
    }

    private static bool AmountsMatch(decimal expected, decimal actual)
        => Math.Abs(expected - actual) <= 0.01m;

    private static string BuildCancellationMessage(YooKassaCancellationDetails? cancellationDetails)
    {
        var party = NormalizeOptionalText(cancellationDetails?.Party);
        var reason = NormalizeOptionalText(cancellationDetails?.Reason);
        if (string.IsNullOrWhiteSpace(party) && string.IsNullOrWhiteSpace(reason))
            return "Платеж YooKassa был отменен.";

        if (string.IsNullOrWhiteSpace(party))
            return $"Платеж YooKassa был отменен: {reason}.";

        if (string.IsNullOrWhiteSpace(reason))
            return $"Платеж YooKassa был отменен. Инициатор: {party}.";

        return $"Платеж YooKassa был отменен. Инициатор: {party}, причина: {reason}.";
    }

    private static string? GetMetadataValue(Dictionary<string, string>? metadata, string key)
        => metadata is not null && metadata.TryGetValue(key, out var value)
            ? NormalizeOptionalText(value)
            : null;

    private static string BuildApiErrorMessage(System.Net.HttpStatusCode statusCode, string? responseBody)
    {
        var compactBody = LimitText(NormalizeOptionalText(responseBody), 300);
        return string.IsNullOrWhiteSpace(compactBody)
            ? $"YooKassa вернула ошибку {(int)statusCode}."
            : $"YooKassa вернула ошибку {(int)statusCode}: {compactBody}";
    }

    private static string AppendOrderHistory(string? raw, Dictionary<string, object?> entry)
    {
        List<Dictionary<string, object?>> history;
        if (string.IsNullOrWhiteSpace(raw))
        {
            history = [];
        }
        else
        {
            try
            {
                history = JsonSerializer.Deserialize<List<Dictionary<string, object?>>>(raw) ?? [];
            }
            catch
            {
                history = [];
            }
        }

        history.Add(entry);
        return JsonSerializer.Serialize(history);
    }

    private static string? LimitText(string? value, int maxLength)
    {
        var normalized = NormalizeOptionalText(value);
        if (string.IsNullOrWhiteSpace(normalized))
            return normalized;

        return normalized!.Length <= maxLength
            ? normalized
            : normalized[..maxLength];
    }

    private sealed record YooKassaSettings(
        bool Enabled,
        string ShopId,
        string? SecretKey,
        bool TestMode,
        string LabelPrefix,
        int PaymentTimeoutMinutes,
        bool AllowBankCards,
        bool AllowSbp,
        bool AllowYooMoney);

    private sealed record YooKassaPaymentDescriptor(string Method, string PaymentType);
}

public sealed class YooKassaNotificationPayload
{
    public string? Type { get; set; }
    public string? Event { get; set; }

    [JsonPropertyName("object")]
    public YooKassaPaymentResponse? Object { get; set; }
}

public sealed class YooKassaPaymentResponse
{
    public string? Id { get; set; }
    public string? Status { get; set; }
    public bool? Paid { get; set; }
    public YooKassaAmount? Amount { get; set; }
    public YooKassaConfirmation? Confirmation { get; set; }
    public string? Description { get; set; }
    public Dictionary<string, string>? Metadata { get; set; }

    [JsonPropertyName("payment_method")]
    public YooKassaPaymentMethod? PaymentMethod { get; set; }

    public YooKassaRecipient? Recipient { get; set; }

    [JsonPropertyName("cancellation_details")]
    public YooKassaCancellationDetails? CancellationDetails { get; set; }

    [JsonPropertyName("created_at")]
    public string? CreatedAt { get; set; }

    [JsonPropertyName("paid_at")]
    public string? PaidAt { get; set; }

    [JsonPropertyName("captured_at")]
    public string? CapturedAt { get; set; }

    public bool? Test { get; set; }
}

public sealed class YooKassaAmount
{
    public string? Value { get; set; }
    public string? Currency { get; set; }
}

public sealed class YooKassaConfirmation
{
    public string? Type { get; set; }

    [JsonPropertyName("confirmation_url")]
    public string? ConfirmationUrl { get; set; }
}

public sealed class YooKassaPaymentMethod
{
    public string? Type { get; set; }
    public string? Id { get; set; }
    public bool? Saved { get; set; }
}

public sealed class YooKassaRecipient
{
    [JsonPropertyName("account_id")]
    public string? AccountId { get; set; }

    [JsonPropertyName("gateway_id")]
    public string? GatewayId { get; set; }
}

public sealed class YooKassaCancellationDetails
{
    public string? Party { get; set; }
    public string? Reason { get; set; }
}
