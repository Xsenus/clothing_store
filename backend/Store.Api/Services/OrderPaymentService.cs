using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

public interface IOrderPaymentService
{
    bool IsOnlinePaymentMethod(string? paymentMethod);
    Task<IReadOnlySet<string>> GetManualRefreshAvailableProvidersAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyDictionary<string, OrderPayment>> GetLatestPaymentsByOrderIdAsync(IEnumerable<string> orderIds, CancellationToken cancellationToken = default);
    Task<OrderPayment?> GetLatestPaymentAsync(string orderId, CancellationToken cancellationToken = default);
    Task<OrderPaymentCheckoutResult> CreatePaymentAsync(Order order, string paymentMethod, string? returnUrl, CancellationToken cancellationToken = default);
    Task<OrderPaymentCheckoutResult> GetCheckoutAsync(Order order, string? returnUrl, CancellationToken cancellationToken = default);
    Task<OrderPayment?> RefreshOrderPaymentAsync(Order order, CancellationToken cancellationToken = default);
    Task CancelPendingPaymentsForOrderAsync(string orderId, string reason, CancellationToken cancellationToken = default);
    Task<int> ProcessPendingPaymentsAsync(CancellationToken cancellationToken = default);
}

public sealed record OrderPaymentCheckoutResult(
    OrderPayment Payment,
    string Action,
    string Method,
    IReadOnlyDictionary<string, string> Fields);

public sealed class OrderPaymentService : IOrderPaymentService
{
    private const string PendingOrderStatus = "pending_payment";

    private static readonly HashSet<string> RetryablePaymentStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "canceled",
        "cancelled",
        "error"
    };

    private static readonly HashSet<string> NonRetryablePaymentStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "paid",
        "review_required"
    };

    private readonly StoreDbContext _db;
    private readonly IYooMoneyPaymentService _yooMoneyPaymentService;
    private readonly IYooKassaPaymentService _yooKassaPaymentService;
    private readonly IOrderInventoryService _orderInventoryService;
    public OrderPaymentService(
        StoreDbContext db,
        IYooMoneyPaymentService yooMoneyPaymentService,
        IYooKassaPaymentService yooKassaPaymentService,
        IOrderInventoryService orderInventoryService)
    {
        _db = db;
        _yooMoneyPaymentService = yooMoneyPaymentService;
        _yooKassaPaymentService = yooKassaPaymentService;
        _orderInventoryService = orderInventoryService;
    }

    public bool IsOnlinePaymentMethod(string? paymentMethod)
    {
        var normalized = NormalizePaymentMethod(paymentMethod);
        return normalized is "yoomoney"
            or "yoomoney_card"
            or "yoomoney_wallet"
            or "yookassa"
            or "yookassa_card"
            or "yookassa_sbp"
            or "yookassa_yoomoney";
    }

    public async Task<IReadOnlySet<string>> GetManualRefreshAvailableProvidersAsync(CancellationToken cancellationToken = default)
    {
        var providers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (await _yooMoneyPaymentService.IsManualRefreshAvailableAsync(cancellationToken))
            providers.Add("yoomoney");

        if (await _yooKassaPaymentService.IsManualRefreshAvailableAsync(cancellationToken))
            providers.Add("yookassa");

        return providers;
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

    public async Task<OrderPaymentCheckoutResult> CreatePaymentAsync(
        Order order,
        string paymentMethod,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        var normalizedMethod = NormalizePaymentMethod(paymentMethod);
        if (normalizedMethod.StartsWith("yoomoney", StringComparison.Ordinal))
        {
            return MapCheckout(await _yooMoneyPaymentService.CreatePaymentAsync(order, normalizedMethod, returnUrl, cancellationToken));
        }

        if (normalizedMethod.StartsWith("yookassa", StringComparison.Ordinal))
        {
            return await _yooKassaPaymentService.CreatePaymentAsync(order, normalizedMethod, returnUrl, cancellationToken);
        }

        throw new InvalidOperationException("Для заказа не выбран поддерживаемый онлайн-способ оплаты.");
    }

    public async Task<OrderPaymentCheckoutResult> GetCheckoutAsync(
        Order order,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        if (!IsOnlinePaymentMethod(order.PaymentMethod))
            throw new InvalidOperationException("Заказ не использует онлайн-оплату.");

        var latestPayment = await GetLatestPaymentAsync(order.Id, cancellationToken);
        if (latestPayment is null)
            return await CreatePaymentAsync(order, order.PaymentMethod, returnUrl, cancellationToken);

        if (string.Equals(NormalizePaymentStatus(latestPayment.Status), "pending", StringComparison.Ordinal))
        {
            try
            {
                return latestPayment.Provider.ToLowerInvariant() switch
                {
                    "yoomoney" => MapCheckout(await _yooMoneyPaymentService.GetCheckoutAsync(order, returnUrl, cancellationToken)),
                    "yookassa" => await _yooKassaPaymentService.GetCheckoutAsync(order, returnUrl, cancellationToken),
                    _ => throw new InvalidOperationException("Для заказа найден неподдерживаемый платежный провайдер.")
                };
            }
            catch (InvalidOperationException)
            {
                latestPayment = await GetLatestPaymentAsync(order.Id, cancellationToken);
            }
        }

        if (CanCreateReplacementPayment(order, latestPayment))
            return await CreatePaymentAsync(order, order.PaymentMethod, returnUrl, cancellationToken);

        throw new InvalidOperationException("Активный счет недоступен для повторного открытия.");
    }

    public async Task<OrderPayment?> RefreshOrderPaymentAsync(Order order, CancellationToken cancellationToken = default)
    {
        var payment = await GetLatestPaymentAsync(order.Id, cancellationToken);
        if (payment is null)
            return null;

        return payment.Provider.ToLowerInvariant() switch
        {
            "yoomoney" => await _yooMoneyPaymentService.RefreshOrderPaymentAsync(order, cancellationToken),
            "yookassa" => await _yooKassaPaymentService.RefreshOrderPaymentAsync(order, cancellationToken),
            _ => throw new InvalidOperationException("Для заказа найден неподдерживаемый платежный провайдер.")
        };
    }

    public async Task CancelPendingPaymentsForOrderAsync(
        string orderId,
        string reason,
        CancellationToken cancellationToken = default)
    {
        await _yooMoneyPaymentService.CancelPendingPaymentsForOrderAsync(orderId, reason, cancellationToken);
        await _yooKassaPaymentService.CancelPendingPaymentsForOrderAsync(orderId, reason, cancellationToken);
    }

    public async Task<int> ProcessPendingPaymentsAsync(CancellationToken cancellationToken = default)
    {
        var updatedCount = 0;
        updatedCount += await _yooMoneyPaymentService.ProcessPendingPaymentsAsync(cancellationToken);
        updatedCount += await _yooKassaPaymentService.ProcessPendingPaymentsAsync(cancellationToken);
        updatedCount += await ProcessExpiredReservationsAsync(cancellationToken);
        return updatedCount;
    }

    private async Task<int> ProcessExpiredReservationsAsync(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var candidatePayments = await _db.OrderPayments
            .Where(x =>
                x.ExpiresAt.HasValue
                && x.ExpiresAt.Value <= now
                && x.Status.ToLower() != "paid"
                && x.Status.ToLower() != "review_required")
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.UpdatedAt)
            .ToListAsync(cancellationToken);

        if (candidatePayments.Count == 0)
            return 0;

        var candidateOrderIds = candidatePayments.Select(x => x.OrderId).Distinct().ToList();
        var latestPayments = await _db.OrderPayments
            .Where(x => candidateOrderIds.Contains(x.OrderId))
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.UpdatedAt)
            .ToListAsync(cancellationToken);
        var latestPaymentsByOrderId = latestPayments
            .GroupBy(x => x.OrderId, StringComparer.Ordinal)
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);
        var orderIds = latestPaymentsByOrderId.Keys.ToList();
        var ordersById = await _db.Orders
            .Where(x => orderIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, StringComparer.Ordinal, cancellationToken);

        var updatedCount = 0;
        foreach (var (orderId, payment) in latestPaymentsByOrderId)
        {
            if (!ordersById.TryGetValue(orderId, out var order))
                continue;

            if (!string.Equals(NormalizeOrderStatus(order.Status), PendingOrderStatus, StringComparison.Ordinal))
                continue;

            if (payment.ExpiresAt is null || payment.ExpiresAt.Value > now)
                continue;

            if (string.Equals(NormalizePaymentStatus(payment.Status), "pending", StringComparison.Ordinal))
            {
                payment.Status = "expired";
                payment.LastError ??= "Срок ожидания онлайн-оплаты истек.";
            }

            payment.LastCheckedAt = now;
            payment.UpdatedAt = now;

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
                    ["changedBy"] = payment.Provider,
                    ["comment"] = "Срок ожидания онлайн-оплаты истек, резерв товара снят автоматически"
                });

            updatedCount++;
        }

        if (_db.ChangeTracker.HasChanges())
        {
            await _db.SaveChangesAsync(cancellationToken);
        }

        return updatedCount;
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

    private static OrderPaymentCheckoutResult MapCheckout(YooMoneyCheckoutResult result)
        => new(result.Payment, result.Action, result.Method, result.Fields);

    private static bool CanCreateReplacementPayment(Order order, OrderPayment? payment)
    {
        if (!string.Equals(NormalizeOrderStatus(order.Status), PendingOrderStatus, StringComparison.Ordinal))
            return false;

        if (payment is null)
            return true;

        var paymentStatus = NormalizePaymentStatus(payment.Status);
        if (string.Equals(paymentStatus, "pending", StringComparison.Ordinal))
            return false;

        if (NonRetryablePaymentStatuses.Contains(paymentStatus))
            return false;

        if (payment.ExpiresAt.HasValue && payment.ExpiresAt.Value <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())
            return false;

        return RetryablePaymentStatuses.Contains(paymentStatus);
    }

    private static string NormalizeOrderStatus(string? status)
    {
        var normalized = status?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "processing" : normalized;
    }

    private static string NormalizePaymentMethod(string? paymentMethod)
    {
        var normalized = paymentMethod?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "cod" : normalized;
    }

    private static string NormalizePaymentStatus(string? status)
    {
        var normalized = status?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "pending" : normalized;
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
}
