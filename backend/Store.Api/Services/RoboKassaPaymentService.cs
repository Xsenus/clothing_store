using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

public interface IRoboKassaPaymentService
{
    Task<bool> IsManualRefreshAvailableAsync(CancellationToken cancellationToken = default);
    Task<RoboKassaAdminTestResult> TestIntegrationAsync(
        RoboKassaIntegrationOverrides overrides,
        decimal? amount,
        string? returnUrl,
        CancellationToken cancellationToken = default);
    Task<RoboKassaCheckoutResult> CreatePaymentAsync(Order order, string paymentMethod, string? returnUrl, CancellationToken cancellationToken = default);
    Task<RoboKassaCheckoutResult> GetCheckoutAsync(Order order, string? returnUrl, CancellationToken cancellationToken = default);
    Task<OrderPayment?> RefreshOrderPaymentAsync(Order order, CancellationToken cancellationToken = default);
    Task CancelPendingPaymentsForOrderAsync(string orderId, string reason, CancellationToken cancellationToken = default);
    Task<RoboKassaNotificationHandleResult> HandleResultAsync(RoboKassaCallbackPayload payload, CancellationToken cancellationToken = default);
    Task<int> ProcessPendingPaymentsAsync(CancellationToken cancellationToken = default);
}

public sealed record RoboKassaCheckoutResult(
    OrderPayment Payment,
    string Action,
    string Method,
    IReadOnlyDictionary<string, string> Fields);

public sealed record RoboKassaNotificationHandleResult(
    bool Accepted,
    bool Ignored,
    string Detail,
    string ResponseText,
    OrderPayment? Payment = null);

public sealed record RoboKassaAdminTestResult(
    string MerchantLogin,
    bool TestMode,
    decimal RequestedAmount,
    string CheckoutAction,
    string CheckoutMethod,
    IReadOnlyDictionary<string, string> CheckoutFields,
    string ResultUrlNote,
    string Note);

public sealed record RoboKassaIntegrationOverrides(
    bool Enabled,
    string? MerchantLogin,
    string? Password1,
    string? Password2,
    string? TestPassword1,
    string? TestPassword2,
    bool TestMode,
    string? LabelPrefix,
    int? PaymentTimeoutMinutes,
    string? CurrencyLabel,
    string? PaymentMethods,
    bool ReceiptEnabled,
    string? ReceiptTax,
    string? TaxSystem);

public sealed class RoboKassaCallbackPayload
{
    public string? OutSum { get; set; }
    public string? InvId { get; set; }
    public string? SignatureValue { get; set; }
    public string? IsTest { get; set; }
    public string? Shp_orderId { get; set; }
    public string? Shp_paymentId { get; set; }
}

public sealed class RoboKassaPaymentService : IRoboKassaPaymentService
{
    private const string ProviderName = "robokassa";
    private const string CurrencyCode = "RUB";
    private const string CheckoutUrl = "https://auth.robokassa.ru/Merchant/Index.aspx";

    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly IOrderEmailQueue _orderEmailQueue;

    public RoboKassaPaymentService(
        StoreDbContext db,
        IConfiguration configuration,
        IOrderEmailQueue orderEmailQueue)
    {
        _db = db;
        _configuration = configuration;
        _orderEmailQueue = orderEmailQueue;
    }

    public Task<bool> IsManualRefreshAvailableAsync(CancellationToken cancellationToken = default)
        => Task.FromResult(false);

    public async Task<RoboKassaAdminTestResult> TestIntegrationAsync(
        RoboKassaIntegrationOverrides overrides,
        decimal? amount,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(overrides, cancellationToken);
        var requestedAmount = NormalizeMoney(amount ?? 100m);
        if (requestedAmount <= 0m)
            throw new InvalidOperationException("Для теста RoboKassa укажите сумму больше 0 ₽.");

        var payment = new OrderPayment
        {
            Id = Guid.NewGuid().ToString("N"),
            OrderId = "integration-test",
            Provider = ProviderName,
            PaymentMethod = "robokassa",
            PaymentType = NormalizeOptionalText(settings.PaymentMethods) ?? "card",
            Currency = CurrencyCode,
            RequestedAmount = (double)requestedAmount,
            ChargeAmount = (double)requestedAmount,
            ExpectedReceivedAmount = (double)requestedAmount,
            ReceiverAccount = settings.MerchantLogin!,
            Label = BuildPaymentLabel(settings.LabelPrefix),
            OperationId = BuildInvoiceId(),
            ReturnUrl = NormalizeReturnUrl(returnUrl),
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(settings.PaymentTimeoutMinutes).ToUnixTimeMilliseconds()
        };

        var fakeOrder = new Order
        {
            Id = payment.OrderId,
            OrderNumber = 0,
            CustomerEmail = "integration-test@example.com",
            ItemsJson = JsonSerializer.Serialize(new[]
            {
                new { productName = "Integration test", quantity = 1, unitPrice = requestedAmount }
            }),
            TotalAmount = (double)requestedAmount
        };

        var checkout = BuildCheckoutResult(fakeOrder, payment, settings);
        return new RoboKassaAdminTestResult(
            settings.MerchantLogin!,
            settings.TestMode,
            requestedAmount,
            checkout.Action,
            checkout.Method,
            checkout.Fields,
            "Настройте Result URL в кабинете RoboKassa на /integrations/robokassa/result.",
            settings.TestMode
                ? "В форму будет отправлен IsTest=1 и применены тестовые пароли #1/#2."
                : "Используется боевой режим RoboKassa.");
    }

    public async Task<RoboKassaCheckoutResult> CreatePaymentAsync(
        Order order,
        string paymentMethod,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(null, cancellationToken);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var requestedAmount = NormalizeMoney((decimal)order.TotalAmount);
        if (requestedAmount <= 0m)
            throw new InvalidOperationException("Нельзя создать платеж RoboKassa с нулевой суммой.");

        var payment = new OrderPayment
        {
            Id = Guid.NewGuid().ToString("N"),
            OrderId = order.Id,
            Provider = ProviderName,
            PaymentMethod = "robokassa",
            PaymentType = NormalizeOptionalText(settings.PaymentMethods) ?? "card",
            Status = "pending",
            Currency = CurrencyCode,
            RequestedAmount = (double)requestedAmount,
            ChargeAmount = (double)requestedAmount,
            ExpectedReceivedAmount = (double)requestedAmount,
            ReceiverAccount = settings.MerchantLogin!,
            Label = BuildPaymentLabel(settings.LabelPrefix),
            OperationId = BuildInvoiceId(),
            ReturnUrl = NormalizeReturnUrl(returnUrl),
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(settings.PaymentTimeoutMinutes).ToUnixTimeMilliseconds(),
            CreatedAt = now,
            UpdatedAt = now
        };

        var checkout = BuildCheckoutResult(order, payment, settings);
        payment.LastPayloadJson = JsonSerializer.Serialize(checkout.Fields);
        _db.OrderPayments.Add(payment);
        await _db.SaveChangesAsync(cancellationToken);
        return checkout;
    }

    public async Task<RoboKassaCheckoutResult> GetCheckoutAsync(
        Order order,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        var payment = await _db.OrderPayments
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync(x => x.OrderId == order.Id && x.Provider == ProviderName, cancellationToken)
            ?? throw new InvalidOperationException("Платеж RoboKassa для заказа не найден.");

        if (!string.Equals(Normalize(payment.Status), "pending", StringComparison.Ordinal))
            throw new InvalidOperationException("Повторно открыть можно только активный платеж RoboKassa.");

        if (payment.ExpiresAt.HasValue && payment.ExpiresAt.Value <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())
            throw new InvalidOperationException("Срок действия платежа RoboKassa истек.");

        if (!string.IsNullOrWhiteSpace(returnUrl))
            payment.ReturnUrl = NormalizeReturnUrl(returnUrl);

        var settings = await ResolveSettingsAsync(null, cancellationToken);
        return BuildCheckoutResult(order, payment, settings);
    }

    public async Task<OrderPayment?> RefreshOrderPaymentAsync(Order order, CancellationToken cancellationToken = default)
        => await _db.OrderPayments
            .AsNoTracking()
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync(x => x.OrderId == order.Id && x.Provider == ProviderName, cancellationToken);

    public async Task CancelPendingPaymentsForOrderAsync(
        string orderId,
        string reason,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var payments = await _db.OrderPayments
            .Where(x => x.OrderId == orderId && x.Provider == ProviderName && x.Status == "pending")
            .ToListAsync(cancellationToken);

        foreach (var payment in payments)
        {
            payment.Status = "canceled";
            payment.LastCheckedAt = now;
            payment.LastError = LimitText(reason, 500);
            payment.UpdatedAt = now;
        }

        if (payments.Count > 0)
            await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<RoboKassaNotificationHandleResult> HandleResultAsync(
        RoboKassaCallbackPayload payload,
        CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(null, cancellationToken);
        var invoiceId = NormalizeOptionalText(payload.InvId);
        if (string.IsNullOrWhiteSpace(invoiceId))
            return new RoboKassaNotificationHandleResult(false, false, "В ResultURL отсутствует InvId.", "ERR");

        if (!VerifyCallbackSignature(payload, settings))
            return new RoboKassaNotificationHandleResult(false, false, "Неверная подпись ResultURL RoboKassa.", "ERR");

        var payment = await FindPaymentAsync(payload, invoiceId, cancellationToken);
        if (payment is null)
            return new RoboKassaNotificationHandleResult(true, true, "Платеж RoboKassa не найден.", $"OK{invoiceId}");

        var order = await _db.Orders.FirstOrDefaultAsync(x => x.Id == payment.OrderId, cancellationToken);
        if (order is null)
            return new RoboKassaNotificationHandleResult(true, true, "Заказ для платежа RoboKassa не найден.", $"OK{invoiceId}", payment);

        if (!TryParseAmount(payload.OutSum, out var paidAmount))
        {
            payment.Status = "review_required";
            payment.LastError = "RoboKassa прислала некорректную сумму в ResultURL.";
            payment.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await _db.SaveChangesAsync(cancellationToken);
            return new RoboKassaNotificationHandleResult(true, false, "Сумма оплаты требует ручной проверки.", $"OK{invoiceId}", payment);
        }

        var previousOrderStatus = Normalize(order.Status);
        await ApplySuccessfulPaymentAsync(payment, order, paidAmount);
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.Equals(previousOrderStatus, "paid", StringComparison.Ordinal)
            && string.Equals(Normalize(order.Status), "paid", StringComparison.Ordinal))
        {
            _orderEmailQueue.QueueOrderStatusChangedEmail(order, previousOrderStatus, "Оплата RoboKassa подтверждена автоматически");
        }

        return new RoboKassaNotificationHandleResult(true, false, "Оплата подтверждена.", $"OK{invoiceId}", payment);
    }

    public async Task<int> ProcessPendingPaymentsAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var expiredPayments = await _db.OrderPayments
            .Where(x => x.Provider == ProviderName && x.Status == "pending" && x.ExpiresAt.HasValue && x.ExpiresAt.Value <= now)
            .ToListAsync(cancellationToken);

        foreach (var payment in expiredPayments)
        {
            payment.Status = "expired";
            payment.LastCheckedAt = now;
            payment.LastError ??= "Срок ожидания оплаты RoboKassa истек.";
            payment.UpdatedAt = now;
        }

        if (expiredPayments.Count > 0)
            await _db.SaveChangesAsync(cancellationToken);

        return expiredPayments.Count;
    }

    private async Task<OrderPayment?> FindPaymentAsync(
        RoboKassaCallbackPayload payload,
        string invoiceId,
        CancellationToken cancellationToken)
    {
        var paymentId = NormalizeOptionalText(payload.Shp_paymentId);
        if (!string.IsNullOrWhiteSpace(paymentId))
        {
            var byId = await _db.OrderPayments.FirstOrDefaultAsync(x => x.Id == paymentId, cancellationToken);
            if (byId is not null)
                return byId;
        }

        return await _db.OrderPayments.FirstOrDefaultAsync(
            x => x.Provider == ProviderName && x.OperationId == invoiceId,
            cancellationToken);
    }

    private Task ApplySuccessfulPaymentAsync(OrderPayment payment, Order order, decimal receivedAmount)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (!string.Equals(Normalize(payment.Status), "paid", StringComparison.Ordinal))
        {
            payment.Status = "paid";
            payment.ReceivedAmount = (double)receivedAmount;
            payment.ActualWithdrawAmount = (double)receivedAmount;
            payment.VerificationSource = "robokassa_result_url";
            payment.PaidAt = now;
        }

        payment.LastCheckedAt = now;
        payment.LastError = null;
        payment.UpdatedAt = now;

        if (!string.Equals(Normalize(order.Status), "paid", StringComparison.Ordinal))
        {
            order.Status = "paid";
            order.UpdatedAt = now;
            order.StatusHistoryJson = AppendOrderHistory(order.StatusHistoryJson, new Dictionary<string, object?>
            {
                ["kind"] = "payment_confirmed",
                ["status"] = "paid",
                ["changedAt"] = now,
                ["changedBy"] = ProviderName,
                ["comment"] = "Оплата RoboKassa подтверждена автоматически"
            });
        }

        return Task.CompletedTask;
    }

    private async Task<RoboKassaSettings> ResolveSettingsAsync(
        RoboKassaIntegrationOverrides? overrides,
        CancellationToken cancellationToken)
    {
        if (overrides is not null)
            return NormalizeSettings(new RoboKassaSettings(
                overrides.Enabled,
                overrides.MerchantLogin,
                overrides.Password1,
                overrides.Password2,
                overrides.TestPassword1,
                overrides.TestPassword2,
                overrides.TestMode,
                overrides.LabelPrefix,
                overrides.PaymentTimeoutMinutes ?? 60,
                overrides.CurrencyLabel,
                overrides.PaymentMethods,
                overrides.ReceiptEnabled,
                overrides.ReceiptTax,
                overrides.TaxSystem));

        var enabled = await GetBooleanSettingAsync("payments_robokassa_enabled", "Integrations:RoboKassa:Enabled", false, cancellationToken);
        var merchantLogin = await GetSettingOrConfigAsync("robokassa_merchant_login", "Integrations:RoboKassa:MerchantLogin", cancellationToken);
        var password1 = await GetSettingOrConfigAsync("robokassa_password1", "Integrations:RoboKassa:Password1", cancellationToken);
        var password2 = await GetSettingOrConfigAsync("robokassa_password2", "Integrations:RoboKassa:Password2", cancellationToken);
        var testPassword1 = await GetSettingOrConfigAsync("robokassa_test_password1", "Integrations:RoboKassa:TestPassword1", cancellationToken);
        var testPassword2 = await GetSettingOrConfigAsync("robokassa_test_password2", "Integrations:RoboKassa:TestPassword2", cancellationToken);
        var testMode = await GetBooleanSettingAsync("robokassa_test_mode", "Integrations:RoboKassa:TestMode", true, cancellationToken);
        var labelPrefix = await GetSettingOrConfigAsync("robokassa_label_prefix", "Integrations:RoboKassa:LabelPrefix", cancellationToken);
        var paymentTimeoutMinutes = await GetIntSettingAsync("robokassa_payment_timeout_minutes", "Integrations:RoboKassa:PaymentTimeoutMinutes", 60, cancellationToken);
        var currencyLabel = await GetSettingOrConfigAsync("robokassa_currency_label", "Integrations:RoboKassa:CurrencyLabel", cancellationToken);
        var paymentMethods = await GetSettingOrConfigAsync("robokassa_payment_methods", "Integrations:RoboKassa:PaymentMethods", cancellationToken);
        var receiptEnabled = await GetBooleanSettingAsync("robokassa_receipt_enabled", "Integrations:RoboKassa:ReceiptEnabled", false, cancellationToken);
        var receiptTax = await GetSettingOrConfigAsync("robokassa_receipt_tax", "Integrations:RoboKassa:ReceiptTax", cancellationToken);
        var taxSystem = await GetSettingOrConfigAsync("robokassa_tax_system", "Integrations:RoboKassa:TaxSystem", cancellationToken);

        return NormalizeSettings(new RoboKassaSettings(
            enabled,
            merchantLogin,
            password1,
            password2,
            testPassword1,
            testPassword2,
            testMode,
            labelPrefix,
            paymentTimeoutMinutes,
            currencyLabel,
            paymentMethods,
            receiptEnabled,
            receiptTax,
            taxSystem));
    }

    private static RoboKassaSettings NormalizeSettings(RoboKassaSettings settings)
    {
        if (!settings.Enabled)
            throw new InvalidOperationException("RoboKassa отключена в интеграциях.");
        if (string.IsNullOrWhiteSpace(settings.MerchantLogin))
            throw new InvalidOperationException("Укажите MerchantLogin RoboKassa.");
        if (string.IsNullOrWhiteSpace(settings.Password1) || string.IsNullOrWhiteSpace(settings.Password2))
            throw new InvalidOperationException("Укажите пароль #1 и пароль #2 RoboKassa.");
        if (settings.TestMode && (string.IsNullOrWhiteSpace(settings.TestPassword1) || string.IsNullOrWhiteSpace(settings.TestPassword2)))
            throw new InvalidOperationException("Для тестового режима RoboKassa добавьте тестовые пароли #1 и #2.");

        return settings with
        {
            MerchantLogin = settings.MerchantLogin.Trim(),
            Password1 = settings.Password1.Trim(),
            Password2 = settings.Password2.Trim(),
            TestPassword1 = NormalizeOptionalText(settings.TestPassword1),
            TestPassword2 = NormalizeOptionalText(settings.TestPassword2),
            LabelPrefix = NormalizeOptionalText(settings.LabelPrefix) ?? "RK",
            CurrencyLabel = NormalizeOptionalText(settings.CurrencyLabel),
            PaymentMethods = NormalizeOptionalText(settings.PaymentMethods),
            ReceiptTax = NormalizeOptionalText(settings.ReceiptTax) ?? "none",
            TaxSystem = NormalizeOptionalText(settings.TaxSystem)
        };
    }

    private RoboKassaCheckoutResult BuildCheckoutResult(Order order, OrderPayment payment, RoboKassaSettings settings)
    {
        var amount = payment.ChargeAmount.ToString("0.00", CultureInfo.InvariantCulture);
        var successUrl = BuildReturnUrl(payment.ReturnUrl, order.Id, "success");
        var failUrl = BuildReturnUrl(payment.ReturnUrl, order.Id, "fail");
        var receipt = settings.ReceiptEnabled ? BuildReceipt(order, settings) : null;

        var fields = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["MerchantLogin"] = settings.MerchantLogin!,
            ["OutSum"] = amount,
            ["InvId"] = payment.OperationId!,
            ["Description"] = BuildDescription(order),
            ["Culture"] = "ru",
            ["Encoding"] = "utf-8",
            ["Shp_orderId"] = order.Id,
            ["Shp_paymentId"] = payment.Id
        };

        if (!string.IsNullOrWhiteSpace(successUrl))
            fields["SuccessUrl"] = successUrl;
        if (!string.IsNullOrWhiteSpace(failUrl))
            fields["FailUrl"] = failUrl;
        if (!string.IsNullOrWhiteSpace(settings.CurrencyLabel))
            fields["IncCurrLabel"] = settings.CurrencyLabel!;
        if (!string.IsNullOrWhiteSpace(settings.PaymentMethods))
            fields["PaymentMethods"] = settings.PaymentMethods!;
        if (!string.IsNullOrWhiteSpace(order.CustomerEmail))
            fields["Email"] = order.CustomerEmail.Trim();
        if (!string.IsNullOrWhiteSpace(receipt))
            fields["Receipt"] = receipt!;
        if (settings.TestMode)
            fields["IsTest"] = "1";

        fields["SignatureValue"] = BuildCheckoutSignature(fields, settings);
        return new RoboKassaCheckoutResult(payment, CheckoutUrl, "POST", fields);
    }

    private static string BuildCheckoutSignature(IReadOnlyDictionary<string, string> fields, RoboKassaSettings settings)
    {
        var parts = new List<string> { fields["MerchantLogin"], fields["OutSum"], fields["InvId"] };
        if (fields.TryGetValue("Receipt", out var receipt) && !string.IsNullOrWhiteSpace(receipt))
            parts.Add(receipt);
        parts.Add(settings.TestMode ? settings.TestPassword1! : settings.Password1!);
        foreach (var shpEntry in fields.Where(static item => item.Key.StartsWith("Shp_", StringComparison.Ordinal)).OrderBy(static item => item.Key, StringComparer.Ordinal))
            parts.Add($"{shpEntry.Key}={shpEntry.Value}");
        return ComputeMd5(string.Join(':', parts));
    }

    private bool VerifyCallbackSignature(RoboKassaCallbackPayload payload, RoboKassaSettings settings)
    {
        var amount = NormalizeOptionalText(payload.OutSum);
        var invoiceId = NormalizeOptionalText(payload.InvId);
        var signature = NormalizeOptionalText(payload.SignatureValue);
        if (string.IsNullOrWhiteSpace(amount) || string.IsNullOrWhiteSpace(invoiceId) || string.IsNullOrWhiteSpace(signature))
            return false;

        var secret = settings.TestMode && string.Equals(payload.IsTest, "1", StringComparison.Ordinal)
            ? settings.TestPassword2
            : settings.Password2;
        var parts = new List<string> { amount, invoiceId, secret! };
        if (!string.IsNullOrWhiteSpace(payload.Shp_orderId))
            parts.Add($"Shp_orderId={payload.Shp_orderId!.Trim()}");
        if (!string.IsNullOrWhiteSpace(payload.Shp_paymentId))
            parts.Add($"Shp_paymentId={payload.Shp_paymentId!.Trim()}");
        return string.Equals(ComputeMd5(string.Join(':', parts)), signature, StringComparison.OrdinalIgnoreCase);
    }

    private static string? BuildReceipt(Order order, RoboKassaSettings settings)
    {
        try
        {
            var items = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(order.ItemsJson) ?? [];
            var receiptItems = new List<Dictionary<string, object?>>();
            foreach (var item in items)
            {
                var name = item.TryGetValue("productName", out var productName) ? productName.ToString()?.Trim() : null;
                var quantity = item.TryGetValue("quantity", out var quantityValue) && TryParseAmount(quantityValue.ToString(), out var parsedQuantity) ? parsedQuantity : 1m;
                var unitPrice = item.TryGetValue("unitPrice", out var unitPriceValue) && TryParseAmount(unitPriceValue.ToString(), out var parsedUnitPrice) ? parsedUnitPrice : 0m;
                if (string.IsNullOrWhiteSpace(name) || quantity <= 0m || unitPrice <= 0m)
                    continue;

                receiptItems.Add(new Dictionary<string, object?>
                {
                    ["name"] = LimitText(name, 64),
                    ["quantity"] = quantity,
                    ["sum"] = NormalizeMoney(unitPrice * quantity),
                    ["payment_method"] = "full_payment",
                    ["payment_object"] = "commodity",
                    ["tax"] = settings.ReceiptTax
                });
            }

            if (receiptItems.Count == 0)
                return null;

            var receipt = new Dictionary<string, object?> { ["items"] = receiptItems };
            if (!string.IsNullOrWhiteSpace(settings.TaxSystem))
                receipt["sno"] = settings.TaxSystem;
            return JsonSerializer.Serialize(receipt);
        }
        catch
        {
            return null;
        }
    }

    private async Task<string?> GetSettingOrConfigAsync(string key, string configPath, CancellationToken cancellationToken)
    {
        var row = await _db.AppSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Key == key, cancellationToken);
        if (row is not null && !string.IsNullOrWhiteSpace(row.Value))
            return row.Value.Trim();
        var configValue = _configuration[configPath];
        return string.IsNullOrWhiteSpace(configValue) ? null : configValue.Trim();
    }

    private async Task<bool> GetBooleanSettingAsync(string key, string configPath, bool fallback, CancellationToken cancellationToken)
    {
        var value = await GetSettingOrConfigAsync(key, configPath, cancellationToken);
        if (string.IsNullOrWhiteSpace(value))
            return fallback;
        return value.Trim().ToLowerInvariant() switch
        {
            "1" or "true" or "yes" or "on" => true,
            "0" or "false" or "no" or "off" => false,
            _ => fallback
        };
    }

    private async Task<int> GetIntSettingAsync(string key, string configPath, int fallback, CancellationToken cancellationToken)
    {
        var value = await GetSettingOrConfigAsync(key, configPath, cancellationToken);
        return int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : fallback;
    }

    private static string BuildInvoiceId() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture);
    private static string BuildPaymentLabel(string? prefix) => $"{prefix ?? "RK"}-{Guid.NewGuid().ToString("N")[..12]}".ToUpperInvariant();
    private static string BuildDescription(Order order) => order.OrderNumber > 0 ? $"Заказ #{order.OrderNumber:0000000}" : $"Заказ {order.Id[..Math.Min(order.Id.Length, 8)]}";
    private static string NormalizeReturnUrl(string? returnUrl) => NormalizeOptionalText(returnUrl) ?? string.Empty;
    private static string Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim().ToLowerInvariant();
    private static string? NormalizeOptionalText(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static decimal NormalizeMoney(decimal value) => decimal.Round(value < 0m ? 0m : value, 2, MidpointRounding.AwayFromZero);
    private static string BuildReturnUrl(string? returnUrl, string orderId, string status) => string.IsNullOrWhiteSpace(returnUrl) ? string.Empty : QueryHelpers.AddQueryString(returnUrl.Trim(), new Dictionary<string, string?> { ["orderId"] = orderId, ["paymentProvider"] = ProviderName, ["paymentStatus"] = status });
    private static bool TryParseAmount(string? value, out decimal amount) => decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out amount) || decimal.TryParse(value, NumberStyles.Any, CultureInfo.GetCultureInfo("ru-RU"), out amount);
    private static string AppendOrderHistory(string existingJson, Dictionary<string, object?> item) { List<Dictionary<string, object?>> history; try { history = JsonSerializer.Deserialize<List<Dictionary<string, object?>>>(existingJson) ?? []; } catch { history = []; } history.Add(item); return JsonSerializer.Serialize(history); }
    private static string LimitText(string? value, int maxLength) { var normalized = value?.Trim() ?? string.Empty; return normalized.Length <= maxLength ? normalized : normalized[..maxLength]; }
    private static string ComputeMd5(string input) { using var md5 = MD5.Create(); return Convert.ToHexString(md5.ComputeHash(Encoding.UTF8.GetBytes(input))); }

    private sealed record RoboKassaSettings(
        bool Enabled,
        string? MerchantLogin,
        string? Password1,
        string? Password2,
        string? TestPassword1,
        string? TestPassword2,
        bool TestMode,
        string? LabelPrefix,
        int PaymentTimeoutMinutes,
        string? CurrencyLabel,
        string? PaymentMethods,
        bool ReceiptEnabled,
        string? ReceiptTax,
        string? TaxSystem);
}
