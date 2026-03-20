using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

public interface IYooMoneyPaymentService
{
    Task<bool> IsManualRefreshAvailableAsync(CancellationToken cancellationToken = default);
    Task<YooMoneyAdminTestResult> TestIntegrationAsync(
        YooMoneyIntegrationOverrides overrides,
        string paymentMethod,
        decimal? amount,
        string? returnUrl,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyDictionary<string, OrderPayment>> GetLatestPaymentsByOrderIdAsync(IEnumerable<string> orderIds, CancellationToken cancellationToken = default);
    Task<OrderPayment?> GetLatestPaymentAsync(string orderId, CancellationToken cancellationToken = default);
    Task<YooMoneyCheckoutResult> CreatePaymentAsync(Order order, string paymentMethod, string? returnUrl, CancellationToken cancellationToken = default);
    Task<YooMoneyCheckoutResult> GetCheckoutAsync(Order order, string? returnUrl, CancellationToken cancellationToken = default);
    Task<OrderPayment?> RefreshOrderPaymentAsync(Order order, CancellationToken cancellationToken = default);
    Task CancelPendingPaymentsForOrderAsync(string orderId, string reason, CancellationToken cancellationToken = default);
    Task<YooMoneyNotificationHandleResult> HandleNotificationAsync(YooMoneyNotificationPayload payload, CancellationToken cancellationToken = default);
    Task<int> ProcessPendingPaymentsAsync(CancellationToken cancellationToken = default);
}

public sealed record YooMoneyCheckoutResult(
    OrderPayment Payment,
    string Action,
    string Method,
    IReadOnlyDictionary<string, string> Fields);

public sealed record YooMoneyNotificationHandleResult(
    bool Accepted,
    bool Ignored,
    string Detail,
    OrderPayment? Payment = null);

public sealed record YooMoneyIntegrationOverrides(
    bool Enabled,
    string? WalletNumber,
    string? NotificationSecret,
    string? AccessToken,
    string? LabelPrefix,
    int? PaymentTimeoutMinutes,
    bool AllowBankCards,
    bool AllowWallet);

public sealed record YooMoneyAdminTestResult(
    string PaymentMethod,
    string PaymentType,
    decimal RequestedAmount,
    decimal ChargeAmount,
    decimal ExpectedReceivedAmount,
    string WalletNumber,
    string CheckoutAction,
    string CheckoutMethod,
    IReadOnlyDictionary<string, string> CheckoutFields,
    bool TokenValid,
    string TokenDetail,
    YooMoneyAdminOperationSnapshot? LastOperation,
    string Note);

public sealed record YooMoneyAdminOperationSnapshot(
    string? OperationId,
    string? Status,
    string? DateTime,
    string? Amount,
    string? Type);

public sealed class YooMoneyNotificationPayload
{
    public string? NotificationType { get; set; }
    public string? OperationId { get; set; }
    public string? Amount { get; set; }
    public string? WithdrawAmount { get; set; }
    public string? Currency { get; set; }
    public string? DateTime { get; set; }
    public string? Sender { get; set; }
    public string? Codepro { get; set; }
    public string? Label { get; set; }
    public string? Sha1Hash { get; set; }
    public string? Unaccepted { get; set; }
}

public sealed class YooMoneyPaymentService : IYooMoneyPaymentService
{
    private const string ProviderName = "yoomoney";
    private const string CurrencyCode = "RUB";
    private const string CurrencyNumericCode = "643";
    private const string QuickPayActionUrl = "https://yoomoney.ru/quickpay/confirm";
    private const string OperationHistoryUrl = "https://yoomoney.ru/api/operation-history";
    private const int MaxPendingPaymentsPerSync = 10;
    private static readonly TimeSpan PendingSyncInterval = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(10);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly HashSet<string> PendingPaymentStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "pending"
    };

    private static readonly HashSet<string> TerminalOrderStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "paid",
        "in_transit",
        "delivered",
        "completed",
        "canceled",
        "cancelled",
        "returned"
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly IOrderInventoryService _orderInventoryService;
    private readonly ILogger<YooMoneyPaymentService> _logger;

    public YooMoneyPaymentService(
        IHttpClientFactory httpClientFactory,
        StoreDbContext db,
        IConfiguration configuration,
        IOrderInventoryService orderInventoryService,
        ILogger<YooMoneyPaymentService> logger)
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
        return !string.IsNullOrWhiteSpace(settings.AccessToken);
    }

    public async Task<YooMoneyAdminTestResult> TestIntegrationAsync(
        YooMoneyIntegrationOverrides overrides,
        string paymentMethod,
        decimal? amount,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(overrides, cancellationToken);
        EnsurePaymentsEnabled(settings);

        if (string.IsNullOrWhiteSpace(settings.AccessToken))
            throw new InvalidOperationException("Для проверки YooMoney добавьте access token с правом operation-history.");

        var paymentDescriptor = ResolvePaymentDescriptor(paymentMethod, settings);
        var requestedAmount = NormalizeMoney(amount ?? 100m);
        if (requestedAmount <= 0m)
            throw new InvalidOperationException("Для проверки YooMoney укажите сумму больше 0 ₽.");

        var chargeAmount = CalculateChargeAmount(requestedAmount, paymentDescriptor.PaymentType);
        var expectedReceivedAmount = CalculateExpectedReceivedAmount(chargeAmount, paymentDescriptor.PaymentType);
        var paymentId = Guid.NewGuid().ToString("N");
        var payment = new OrderPayment
        {
            Id = paymentId,
            OrderId = $"integration-test-{paymentId[..8]}",
            Provider = ProviderName,
            PaymentMethod = paymentDescriptor.Method,
            PaymentType = paymentDescriptor.PaymentType,
            Currency = CurrencyCode,
            ChargeAmount = (double)chargeAmount,
            ExpectedReceivedAmount = (double)expectedReceivedAmount,
            ReceiverAccount = settings.WalletNumber,
            Label = BuildPaymentLabel(settings.LabelPrefix),
            ReturnUrl = NormalizeReturnUrl(returnUrl),
        };
        var fakeOrder = new Order
        {
            Id = payment.OrderId,
            OrderNumber = 0
        };

        var history = await GetOperationHistoryAsync(settings.AccessToken, label: null, records: 1, cancellationToken);
        if (!string.IsNullOrWhiteSpace(history.Error))
            throw new InvalidOperationException($"YooMoney вернул ошибку при проверке access token: {history.Error}");

        var checkout = BuildCheckoutResult(fakeOrder, payment);
        var lastOperation = history.Operations?
            .OrderByDescending(operation => ParseDateTimeToUnixMilliseconds(operation.DateTime) ?? 0)
            .FirstOrDefault();

        return new YooMoneyAdminTestResult(
            PaymentMethod: paymentDescriptor.Method,
            PaymentType: paymentDescriptor.PaymentType,
            RequestedAmount: requestedAmount,
            ChargeAmount: chargeAmount,
            ExpectedReceivedAmount: expectedReceivedAmount,
            WalletNumber: settings.WalletNumber,
            CheckoutAction: checkout.Action,
            CheckoutMethod: checkout.Method,
            CheckoutFields: checkout.Fields,
            TokenValid: true,
            TokenDetail: "Access token валиден: operation-history ответил без ошибки.",
            LastOperation: lastOperation is null
                ? null
                : new YooMoneyAdminOperationSnapshot(
                    OperationId: NormalizeOptionalText(lastOperation.OperationId),
                    Status: NormalizeOptionalText(lastOperation.Status),
                    DateTime: NormalizeOptionalText(lastOperation.DateTime),
                    Amount: NormalizeOptionalText(lastOperation.Amount),
                    Type: NormalizeOptionalText(lastOperation.Type)),
            Note: "У YooMoney quickpay нет отдельного sandbox-контура, поэтому для полного end-to-end теста нужен реальный платеж на небольшую сумму.");
    }

    public async Task<IReadOnlyDictionary<string, OrderPayment>> GetLatestPaymentsByOrderIdAsync(
        IEnumerable<string> orderIds,
        CancellationToken cancellationToken = default)
    {
        var ids = orderIds
            .Where(static id => !string.IsNullOrWhiteSpace(id))
            .Select(static id => id.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (ids.Count == 0)
            return new Dictionary<string, OrderPayment>(StringComparer.Ordinal);

        var payments = await _db.OrderPayments
            .AsNoTracking()
            .Where(x => ids.Contains(x.OrderId))
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.UpdatedAt)
            .ToListAsync(cancellationToken);

        return payments
            .GroupBy(x => x.OrderId, StringComparer.Ordinal)
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);
    }

    public async Task<OrderPayment?> GetLatestPaymentAsync(string orderId, CancellationToken cancellationToken = default)
    {
        var normalizedOrderId = orderId?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalizedOrderId))
            return null;

        return await _db.OrderPayments
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync(x => x.OrderId == normalizedOrderId, cancellationToken);
    }

    public async Task<YooMoneyCheckoutResult> CreatePaymentAsync(
        Order order,
        string paymentMethod,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(cancellationToken);
        EnsurePaymentsEnabled(settings);
        var paymentDescriptor = ResolvePaymentDescriptor(paymentMethod, settings);
        var requestedAmount = NormalizeMoney(order.TotalAmount);
        if (requestedAmount <= 0m)
            throw new InvalidOperationException("Нельзя выставить счет ЮMoney с нулевой суммой.");

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var chargeAmount = CalculateChargeAmount(requestedAmount, paymentDescriptor.PaymentType);
        var expectedReceivedAmount = CalculateExpectedReceivedAmount(chargeAmount, paymentDescriptor.PaymentType);
        var payment = new OrderPayment
        {
            OrderId = order.Id,
            Provider = ProviderName,
            PaymentMethod = paymentDescriptor.Method,
            PaymentType = paymentDescriptor.PaymentType,
            Status = "pending",
            Currency = CurrencyCode,
            RequestedAmount = (double)requestedAmount,
            ChargeAmount = (double)chargeAmount,
            ExpectedReceivedAmount = (double)expectedReceivedAmount,
            ReceiverAccount = settings.WalletNumber,
            Label = BuildPaymentLabel(settings.LabelPrefix),
            ReturnUrl = NormalizeReturnUrl(returnUrl),
            ExpiresAt = now + (long)TimeSpan.FromMinutes(settings.PaymentTimeoutMinutes).TotalMilliseconds,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.OrderPayments.Add(payment);
        await _db.SaveChangesAsync(cancellationToken);
        return BuildCheckoutResult(order, payment);
    }

    public async Task<YooMoneyCheckoutResult> GetCheckoutAsync(
        Order order,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        var payment = await GetLatestPaymentAsync(order.Id, cancellationToken)
            ?? throw new InvalidOperationException("Счет ЮMoney для заказа не найден.");

        if (!string.Equals(payment.Provider, ProviderName, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Заказ не связан со счетом ЮMoney.");

        if (!PendingPaymentStatuses.Contains(payment.Status))
            throw new InvalidOperationException("Повторно открыть можно только активный счет ЮMoney.");

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (payment.ExpiresAt.HasValue && payment.ExpiresAt.Value <= now)
        {
            await ExpirePaymentAsync(payment, order, now, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            throw new InvalidOperationException("Срок действия счета ЮMoney истек. Оформите заказ заново.");
        }

        var normalizedReturnUrl = NormalizeReturnUrl(returnUrl);
        if (!string.IsNullOrWhiteSpace(normalizedReturnUrl)
            && !string.Equals(payment.ReturnUrl, normalizedReturnUrl, StringComparison.Ordinal))
        {
            payment.ReturnUrl = normalizedReturnUrl;
            payment.UpdatedAt = now;
            await _db.SaveChangesAsync(cancellationToken);
        }

        return BuildCheckoutResult(order, payment);
    }

    public async Task<OrderPayment?> RefreshOrderPaymentAsync(Order order, CancellationToken cancellationToken = default)
    {
        var payment = await GetLatestPaymentAsync(order.Id, cancellationToken);
        if (payment is null)
            return null;

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (!PendingPaymentStatuses.Contains(payment.Status))
            return payment;

        if (payment.ExpiresAt.HasValue && payment.ExpiresAt.Value <= now)
        {
            await ExpirePaymentAsync(payment, order, now, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return payment;
        }

        var settings = await ResolveSettingsAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(settings.AccessToken))
            throw new InvalidOperationException("OAuth access token ЮMoney не настроен. Добавьте его в интеграциях, чтобы включить ручную перепроверку оплаты.");

        await TrySyncPaymentFromHistoryAsync(payment, order, settings.AccessToken, now, cancellationToken);
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
            .Where(x => x.OrderId == normalizedOrderId && x.Status.ToLower() == "pending")
            .ToListAsync(cancellationToken);

        foreach (var payment in payments)
        {
            payment.Status = "canceled";
            payment.LastError = LimitText(reason, 500);
            payment.UpdatedAt = now;
        }
    }

    public async Task<YooMoneyNotificationHandleResult> HandleNotificationAsync(
        YooMoneyNotificationPayload payload,
        CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(settings.NotificationSecret))
            return new YooMoneyNotificationHandleResult(false, false, "Секрет уведомлений ЮMoney не настроен.");

        if (!VerifyNotificationHash(payload, settings.NotificationSecret))
            return new YooMoneyNotificationHandleResult(false, false, "Неверная подпись уведомления ЮMoney.");

        var label = NormalizeOptionalText(payload.Label);
        if (string.IsNullOrWhiteSpace(label))
            return new YooMoneyNotificationHandleResult(true, true, "Уведомление без label пропущено.");

        var payment = await _db.OrderPayments
            .FirstOrDefaultAsync(x => x.Label == label, cancellationToken);
        if (payment is null)
            return new YooMoneyNotificationHandleResult(true, true, "Платеж с указанной меткой не найден.");

        var order = await _db.Orders
            .FirstOrDefaultAsync(x => x.Id == payment.OrderId, cancellationToken);
        if (order is null)
            return new YooMoneyNotificationHandleResult(true, true, "Заказ для платежа не найден.");

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        payment.LastPayloadJson = SerializeNotificationPayload(payload);
        payment.LastCheckedAt = now;
        payment.UpdatedAt = now;

        if (string.Equals(payment.Status, "paid", StringComparison.OrdinalIgnoreCase)
            && string.Equals(payment.OperationId, NormalizeOptionalText(payload.OperationId), StringComparison.Ordinal))
        {
            payment.LastError = null;
            await _db.SaveChangesAsync(cancellationToken);
            return new YooMoneyNotificationHandleResult(true, false, "Дубликат успешного уведомления обработан.", payment);
        }

        if (!TryParseNotificationAmounts(payload, out var receivedAmount, out var withdrawAmount))
        {
            await MarkPaymentForReviewAsync(
                payment,
                order,
                now,
                "webhook",
                "Не удалось разобрать сумму в уведомлении ЮMoney.",
                cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return new YooMoneyNotificationHandleResult(true, false, "Уведомление требует ручной проверки.", payment);
        }

        payment.ReceivedAmount = (double)receivedAmount;
        payment.ActualWithdrawAmount = (double?)withdrawAmount;
        payment.OperationId = NormalizeOptionalText(payload.OperationId);
        payment.NotificationType = NormalizeOptionalText(payload.NotificationType);
        payment.Sender = NormalizeOptionalText(payload.Sender);
        payment.VerificationSource = "webhook";

        if (!string.Equals(NormalizeOptionalText(payload.Currency), CurrencyNumericCode, StringComparison.Ordinal))
        {
            await MarkPaymentForReviewAsync(
                payment,
                order,
                now,
                "webhook",
                "ЮMoney прислал платеж в неподдерживаемой валюте.",
                cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return new YooMoneyNotificationHandleResult(true, false, "Уведомление требует ручной проверки.", payment);
        }

        var expectedNotificationType = GetExpectedNotificationType(payment.PaymentType);
        if (!string.Equals(expectedNotificationType, NormalizeOptionalText(payload.NotificationType), StringComparison.OrdinalIgnoreCase))
        {
            await MarkPaymentForReviewAsync(
                payment,
                order,
                now,
                "webhook",
                "Тип входящего платежа ЮMoney не совпал с типом выставленного счета.",
                cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return new YooMoneyNotificationHandleResult(true, false, "Уведомление требует ручной проверки.", payment);
        }

        if (!AmountsMatch((decimal)payment.ExpectedReceivedAmount, receivedAmount)
            || (withdrawAmount.HasValue && !AmountsMatch((decimal)payment.ChargeAmount, withdrawAmount.Value)))
        {
            await MarkPaymentForReviewAsync(
                payment,
                order,
                now,
                "webhook",
                "Сумма перевода ЮMoney не совпала с ожидаемой суммой счета.",
                cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return new YooMoneyNotificationHandleResult(true, false, "Уведомление требует ручной проверки.", payment);
        }

        var paidAt = ParseDateTimeToUnixMilliseconds(payload.DateTime) ?? now;
        await ApplySuccessfulPaymentAsync(
            payment,
            order,
            receivedAmount,
            withdrawAmount,
            NormalizeOptionalText(payload.OperationId),
            NormalizeOptionalText(payload.NotificationType),
            NormalizeOptionalText(payload.Sender),
            "webhook",
            payment.LastPayloadJson,
            paidAt,
            cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        return new YooMoneyNotificationHandleResult(true, false, "Оплата подтверждена.", payment);
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

        var updatedCount = 0;
        foreach (var payment in pendingPayments)
        {
            if (!ordersById.TryGetValue(payment.OrderId, out var order))
                continue;

            if (payment.ExpiresAt.HasValue && payment.ExpiresAt.Value <= now)
            {
                await ExpirePaymentAsync(payment, order, now, cancellationToken);
                updatedCount++;
            }
        }

        var settings = await ResolveSettingsAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(settings.AccessToken))
        {
            foreach (var payment in pendingPayments.Where(x => PendingPaymentStatuses.Contains(x.Status)))
            {
                if (!ordersById.TryGetValue(payment.OrderId, out var order))
                    continue;

                var lastCheckedAt = payment.LastCheckedAt ?? 0;
                if (now - lastCheckedAt < (long)PendingSyncInterval.TotalMilliseconds)
                    continue;

                await TrySyncPaymentFromHistoryAsync(payment, order, settings.AccessToken, now, cancellationToken);
                updatedCount++;
            }
        }

        if (_db.ChangeTracker.HasChanges())
            await _db.SaveChangesAsync(cancellationToken);

        return updatedCount;
    }

    private YooMoneyCheckoutResult BuildCheckoutResult(Order order, OrderPayment payment)
    {
        var fields = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["receiver"] = payment.ReceiverAccount,
            ["quickpay-form"] = "button",
            ["paymentType"] = payment.PaymentType,
            ["sum"] = ((decimal)payment.ChargeAmount).ToString("0.00", CultureInfo.InvariantCulture),
            ["label"] = payment.Label
        };

        var successUrl = BuildSuccessUrl(payment.ReturnUrl, order, payment);
        if (!string.IsNullOrWhiteSpace(successUrl))
            fields["successURL"] = successUrl;

        return new YooMoneyCheckoutResult(
            Payment: payment,
            Action: QuickPayActionUrl,
            Method: "POST",
            Fields: fields);
    }

    private async Task TrySyncPaymentFromHistoryAsync(
        OrderPayment payment,
        Order order,
        string accessToken,
        long now,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await GetOperationHistoryAsync(accessToken, payment.Label, records: 10, cancellationToken);
            payment.LastCheckedAt = now;
            payment.UpdatedAt = now;

            if (!string.IsNullOrWhiteSpace(response.Error))
            {
                payment.LastError = LimitText($"ЮMoney вернул ошибку проверки истории: {response.Error}", 500);
                return;
            }

            var operation = response.Operations?
                .Where(operation => string.Equals(NormalizeOptionalText(operation.Label), payment.Label, StringComparison.Ordinal))
                .Where(operation => string.Equals(NormalizeOptionalText(operation.Direction), "in", StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(operation => ParseDateTimeToUnixMilliseconds(operation.DateTime) ?? 0)
                .FirstOrDefault();

            if (operation is null)
            {
                payment.LastError = null;
                return;
            }

            var operationStatus = NormalizeOptionalText(operation.Status)?.ToLowerInvariant();
            if (operationStatus is not "success")
            {
                payment.LastError = operationStatus switch
                {
                    "refused" => "Платеж ЮMoney был отменен отправителем или не был завершен.",
                    "in_progress" => "ЮMoney еще не завершил перевод.",
                    _ => payment.LastError
                };
                return;
            }

            var receivedAmount = ParseAmount(operation.Amount);
            if (!receivedAmount.HasValue)
            {
                await MarkPaymentForReviewAsync(
                    payment,
                    order,
                    now,
                    "operation-history",
                    "ЮMoney вернул успешную операцию без корректной суммы.",
                    cancellationToken);
                return;
            }

            if (!AmountsMatch((decimal)payment.ExpectedReceivedAmount, receivedAmount.Value))
            {
                await MarkPaymentForReviewAsync(
                    payment,
                    order,
                    now,
                    "operation-history",
                    "Сумма операции ЮMoney из истории не совпала с ожидаемой суммой счета.",
                    cancellationToken);
                return;
            }

            var payloadJson = JsonSerializer.Serialize(operation, JsonOptions);
            await ApplySuccessfulPaymentAsync(
                payment,
                order,
                receivedAmount.Value,
                null,
                NormalizeOptionalText(operation.OperationId),
                null,
                null,
                "operation-history",
                payloadJson,
                ParseDateTimeToUnixMilliseconds(operation.DateTime) ?? now,
                cancellationToken);
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
            _logger.LogWarning(ex, "Failed to sync YooMoney payment {PaymentId} for order {OrderId}", payment.Id, order.Id);
        }
    }

    private async Task ApplySuccessfulPaymentAsync(
        OrderPayment payment,
        Order order,
        decimal receivedAmount,
        decimal? withdrawAmount,
        string? operationId,
        string? notificationType,
        string? sender,
        string verificationSource,
        string? payloadJson,
        long paidAt,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        payment.Status = "paid";
        payment.ReceivedAmount = (double)receivedAmount;
        payment.ActualWithdrawAmount = (double?)withdrawAmount;
        payment.OperationId = operationId ?? payment.OperationId;
        payment.NotificationType = notificationType ?? payment.NotificationType;
        payment.Sender = sender ?? payment.Sender;
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

            var history = ParseOrderHistory(order.StatusHistoryJson);
            history.Add(new Dictionary<string, object?>
            {
                ["kind"] = "payment_confirmed",
                ["status"] = "paid",
                ["changedAt"] = now,
                ["changedBy"] = ProviderName,
                ["comment"] = "Оплата ЮMoney подтверждена автоматически"
            });
            order.StatusHistoryJson = JsonSerializer.Serialize(history);
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

        var history = ParseOrderHistory(order.StatusHistoryJson);
        history.Add(new Dictionary<string, object?>
        {
            ["kind"] = "payment_review_required",
            ["status"] = NormalizeOrderStatus(order.Status),
            ["changedAt"] = now,
            ["changedBy"] = ProviderName,
            ["comment"] = reason
        });
        order.StatusHistoryJson = JsonSerializer.Serialize(history);
        order.UpdatedAt = now;

        await Task.CompletedTask;
    }

    private async Task ExpirePaymentAsync(
        OrderPayment payment,
        Order order,
        long now,
        CancellationToken cancellationToken)
    {
        if (!PendingPaymentStatuses.Contains(payment.Status))
            return;

        payment.Status = "expired";
        payment.LastCheckedAt = now;
        payment.LastError = "Срок действия счета ЮMoney истек.";
        payment.UpdatedAt = now;

        var normalizedOrderStatus = NormalizeOrderStatus(order.Status);
        if (normalizedOrderStatus is not "canceled" and not "cancelled" and not "returned" && !TerminalOrderStatuses.Contains(normalizedOrderStatus))
        {
            var systemUserId = await ResolveSystemUserIdAsync(order.UserId, cancellationToken);
            await _orderInventoryService.ReleaseOrderStockAsync(order, systemUserId, now, "payment_expired", cancellationToken);

            order.Status = "canceled";
            order.UpdatedAt = now;

            var history = ParseOrderHistory(order.StatusHistoryJson);
            history.Add(new Dictionary<string, object?>
            {
                ["kind"] = "payment_expired",
                ["status"] = "canceled",
                ["changedAt"] = now,
                ["changedBy"] = ProviderName,
                ["comment"] = "Счет ЮMoney истек, резерв товара снят автоматически"
            });
            order.StatusHistoryJson = JsonSerializer.Serialize(history);
        }
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

        return string.IsNullOrWhiteSpace(adminUserId)
            ? fallbackUserId
            : adminUserId!;
    }

    private Task<YooMoneySettings> ResolveSettingsAsync(CancellationToken cancellationToken)
        => ResolveSettingsAsync(overrides: null, cancellationToken);

    private async Task<YooMoneySettings> ResolveSettingsAsync(YooMoneyIntegrationOverrides? overrides, CancellationToken cancellationToken)
    {
        bool enabled;
        string? walletNumber;
        string? notificationSecret;
        string? accessToken;
        string? labelPrefix;
        int paymentTimeoutMinutes;
        bool allowBankCards;
        bool allowWallet;

        if (overrides is not null)
        {
            enabled = overrides.Enabled;
            walletNumber = overrides.WalletNumber;
            notificationSecret = overrides.NotificationSecret;
            accessToken = overrides.AccessToken;
            labelPrefix = overrides.LabelPrefix;
            paymentTimeoutMinutes = overrides.PaymentTimeoutMinutes ?? 30;
            allowBankCards = overrides.AllowBankCards;
            allowWallet = overrides.AllowWallet;
        }
        else
        {
            enabled = await GetBooleanSettingAsync(
                "payments_yoomoney_enabled",
                "Integrations:YooMoney:Enabled",
                fallback: false,
                cancellationToken);
            walletNumber = await GetSettingOrConfigAsync(
                "yoomoney_wallet_number",
                "Integrations:YooMoney:WalletNumber",
                cancellationToken);
            notificationSecret = await GetSettingOrConfigAsync(
                "yoomoney_notification_secret",
                "Integrations:YooMoney:NotificationSecret",
                cancellationToken);
            accessToken = await GetSettingOrConfigAsync(
                "yoomoney_access_token",
                "Integrations:YooMoney:AccessToken",
                cancellationToken);
            labelPrefix = await GetSettingOrConfigAsync(
                "yoomoney_label_prefix",
                "Integrations:YooMoney:LabelPrefix",
                cancellationToken);
            paymentTimeoutMinutes = await GetIntSettingAsync(
                "yoomoney_payment_timeout_minutes",
                "Integrations:YooMoney:PaymentTimeoutMinutes",
                fallback: 30,
                cancellationToken);
            allowBankCards = await GetBooleanSettingAsync(
                "yoomoney_allow_bank_cards",
                "Integrations:YooMoney:AllowBankCards",
                fallback: true,
                cancellationToken);
            allowWallet = await GetBooleanSettingAsync(
                "yoomoney_allow_wallet",
                "Integrations:YooMoney:AllowWallet",
                fallback: false,
                cancellationToken);
        }

        return new YooMoneySettings(
            Enabled: enabled,
            WalletNumber: NormalizeWalletNumber(walletNumber),
            NotificationSecret: NormalizeOptionalText(notificationSecret),
            AccessToken: NormalizeOptionalText(accessToken),
            LabelPrefix: NormalizeLabelPrefix(labelPrefix),
            PaymentTimeoutMinutes: Math.Clamp(paymentTimeoutMinutes, 5, 1440),
            AllowBankCards: allowBankCards,
            AllowWallet: allowWallet);
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
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedValue)
            ? parsedValue
            : fallback;
    }

    private async Task<OperationHistoryResponse> GetOperationHistoryAsync(
        string accessToken,
        string? label,
        int records,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, OperationHistoryUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var requestData = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["records"] = Math.Clamp(records, 1, 100).ToString(CultureInfo.InvariantCulture)
        };
        var normalizedLabel = NormalizeOptionalText(label);
        if (!string.IsNullOrWhiteSpace(normalizedLabel))
            requestData["label"] = normalizedLabel!;

        request.Content = new FormUrlEncodedContent(requestData);

        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        linkedCts.CancelAfter(RequestTimeout);

        using var response = await client.SendAsync(request, linkedCts.Token);
        if (!response.IsSuccessStatusCode)
        {
            var responseText = await response.Content.ReadAsStringAsync(linkedCts.Token);
            throw new HttpRequestException(BuildHistoryApiErrorMessage(response.StatusCode, responseText));
        }

        await using var responseStream = await response.Content.ReadAsStreamAsync(linkedCts.Token);
        var payload = await JsonSerializer.DeserializeAsync<OperationHistoryResponse>(responseStream, JsonOptions, linkedCts.Token);
        return payload ?? new OperationHistoryResponse(null, null, []);
    }

    private static bool VerifyNotificationHash(YooMoneyNotificationPayload payload, string secret)
    {
        var source = string.Join('&',
            payload.NotificationType?.Trim() ?? string.Empty,
            payload.OperationId?.Trim() ?? string.Empty,
            payload.Amount?.Trim() ?? string.Empty,
            payload.Currency?.Trim() ?? string.Empty,
            payload.DateTime?.Trim() ?? string.Empty,
            payload.Sender?.Trim() ?? string.Empty,
            payload.Codepro?.Trim() ?? string.Empty,
            secret.Trim(),
            payload.Label?.Trim() ?? string.Empty);

        var computedHash = Convert.ToHexStringLower(SHA1.HashData(Encoding.UTF8.GetBytes(source)));
        var receivedHash = payload.Sha1Hash?.Trim().ToLowerInvariant() ?? string.Empty;
        if (receivedHash.Length != computedHash.Length)
            return false;

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(computedHash),
            Encoding.UTF8.GetBytes(receivedHash));
    }

    private static bool TryParseNotificationAmounts(
        YooMoneyNotificationPayload payload,
        out decimal receivedAmount,
        out decimal? withdrawAmount)
    {
        receivedAmount = 0m;
        withdrawAmount = null;

        var parsedAmount = ParseAmount(payload.Amount);
        if (!parsedAmount.HasValue)
            return false;

        receivedAmount = parsedAmount.Value;
        var parsedWithdrawAmount = ParseAmount(payload.WithdrawAmount);
        if (parsedWithdrawAmount.HasValue)
            withdrawAmount = parsedWithdrawAmount.Value;

        return true;
    }

    private static string SerializeNotificationPayload(YooMoneyNotificationPayload payload)
        => JsonSerializer.Serialize(payload);

    private static void EnsurePaymentsEnabled(YooMoneySettings settings)
    {
        if (!settings.Enabled)
            throw new InvalidOperationException("Онлайн-оплата ЮMoney отключена в интеграциях.");

        if (string.IsNullOrWhiteSpace(settings.WalletNumber))
            throw new InvalidOperationException("В интеграциях не указан номер кошелька ЮMoney.");

        if (string.IsNullOrWhiteSpace(settings.NotificationSecret))
            throw new InvalidOperationException("В интеграциях не задан секрет уведомлений ЮMoney.");

        if (!settings.AllowBankCards && !settings.AllowWallet)
            throw new InvalidOperationException("Для ЮMoney не выбран ни один доступный способ оплаты.");
    }

    private static YooMoneyPaymentDescriptor ResolvePaymentDescriptor(string paymentMethod, YooMoneySettings settings)
    {
        var normalizedMethod = NormalizePaymentMethod(paymentMethod);
        return normalizedMethod switch
        {
            "yoomoney_card" when settings.AllowBankCards => new YooMoneyPaymentDescriptor("yoomoney_card", "AC"),
            "yoomoney_wallet" when settings.AllowWallet => new YooMoneyPaymentDescriptor("yoomoney_wallet", "PC"),
            "yoomoney" when settings.AllowBankCards => new YooMoneyPaymentDescriptor("yoomoney_card", "AC"),
            "yoomoney" when settings.AllowWallet => new YooMoneyPaymentDescriptor("yoomoney_wallet", "PC"),
            "yoomoney_card" => throw new InvalidOperationException("Оплата банковской картой через ЮMoney отключена в интеграциях."),
            "yoomoney_wallet" => throw new InvalidOperationException("Оплата кошельком ЮMoney отключена в интеграциях."),
            "yoomoney" => throw new InvalidOperationException("Для ЮMoney не настроен ни один доступный способ оплаты."),
            _ => throw new InvalidOperationException("Указан неподдерживаемый способ оплаты ЮMoney.")
        };
    }

    private static string BuildPaymentLabel(string prefix)
    {
        var paymentId = Guid.NewGuid().ToString("N");
        var normalizedPrefix = string.IsNullOrWhiteSpace(prefix) ? "store" : prefix.Trim();
        var label = $"{normalizedPrefix}.{paymentId}";
        return label.Length <= 64 ? label : label[..64];
    }

    private static string? BuildSuccessUrl(string? returnUrl, Order order, OrderPayment payment)
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

    private static decimal CalculateChargeAmount(decimal requestedAmount, string paymentType)
    {
        var rawAmount = paymentType switch
        {
            "PC" => requestedAmount * 1.01m,
            _ => requestedAmount / 0.97m
        };

        return RoundMoneyUp(rawAmount);
    }

    private static decimal CalculateExpectedReceivedAmount(decimal chargeAmount, string paymentType)
    {
        var receivedAmount = paymentType switch
        {
            "PC" => chargeAmount / 1.01m,
            _ => chargeAmount * 0.97m
        };

        return NormalizeMoney(receivedAmount);
    }

    private static decimal RoundMoneyUp(decimal value)
        => Math.Ceiling(value * 100m) / 100m;

    private static decimal NormalizeMoney(double value)
        => NormalizeMoney((decimal)value);

    private static decimal NormalizeMoney(decimal value)
    {
        if (value < 0m)
            value = 0m;

        return Math.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private static bool AmountsMatch(decimal expected, decimal actual)
        => Math.Abs(expected - actual) <= 0.01m;

    private static decimal? ParseAmount(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
            return null;

        var normalizedValue = rawValue.Trim().Replace(',', '.');
        return decimal.TryParse(normalizedValue, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsedValue)
            ? NormalizeMoney(parsedValue)
            : null;
    }

    private static long? ParseDateTimeToUnixMilliseconds(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
            return null;

        return DateTimeOffset.TryParse(rawValue.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsedValue)
            ? parsedValue.ToUnixTimeMilliseconds()
            : null;
    }

    private static string BuildHistoryApiErrorMessage(System.Net.HttpStatusCode statusCode, string? responseBody)
    {
        var compactBody = LimitText(NormalizeOptionalText(responseBody), 300);
        return string.IsNullOrWhiteSpace(compactBody)
            ? $"ЮMoney вернул ошибку {(int)statusCode} при проверке истории операций."
            : $"ЮMoney вернул ошибку {(int)statusCode} при проверке истории операций: {compactBody}";
    }

    private static string NormalizePaymentMethod(string? paymentMethod)
    {
        var normalized = paymentMethod?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "cod" : normalized;
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

    private static string NormalizeWalletNumber(string? value)
        => new string((value ?? string.Empty).Where(char.IsDigit).ToArray());

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

    private static string GetExpectedNotificationType(string paymentType)
        => string.Equals(paymentType, "PC", StringComparison.OrdinalIgnoreCase)
            ? "p2p-incoming"
            : "card-incoming";

    private static List<Dictionary<string, object?>> ParseOrderHistory(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<Dictionary<string, object?>>>(raw) ?? [];
        }
        catch
        {
            return [];
        }
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

    private sealed record YooMoneySettings(
        bool Enabled,
        string WalletNumber,
        string? NotificationSecret,
        string? AccessToken,
        string LabelPrefix,
        int PaymentTimeoutMinutes,
        bool AllowBankCards,
        bool AllowWallet);

    private sealed record YooMoneyPaymentDescriptor(string Method, string PaymentType);

    private sealed record OperationHistoryResponse(
        string? Error,
        string? NextRecord,
        List<OperationHistoryItem>? Operations);

    private sealed record OperationHistoryItem(
        string? OperationId,
        string? Status,
        string? DateTime,
        string? Direction,
        string? Amount,
        string? Label,
        string? Type);
}
