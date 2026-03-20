using Store.Api.Models;

namespace Store.Api.Services;

public static class OrderPaymentPresentation
{
    public static object? BuildSummary(
        OrderPayment? payment,
        IReadOnlySet<string> manualRefreshProviders,
        long now,
        string? orderStatus = null)
    {
        if (payment is null)
            return null;

        var normalizedPaymentStatus = Normalize(payment.Status);
        var normalizedOrderStatus = Normalize(orderStatus);
        var isPending = string.Equals(normalizedPaymentStatus, "pending", StringComparison.Ordinal);
        var isExpired = payment.ExpiresAt.HasValue && payment.ExpiresAt.Value <= now;
        var canRetry = string.Equals(normalizedOrderStatus, "pending_payment", StringComparison.Ordinal)
            && !isExpired
            && normalizedPaymentStatus is "canceled" or "cancelled" or "error";
        var canRefresh = manualRefreshProviders.Contains(payment.Provider)
            && (isPending || canRetry);

        return new
        {
            payment.Id,
            payment.Provider,
            payment.PaymentMethod,
            payment.PaymentType,
            payment.Status,
            payment.Currency,
            payment.RequestedAmount,
            payment.ChargeAmount,
            payment.ExpectedReceivedAmount,
            payment.ReceivedAmount,
            payment.ActualWithdrawAmount,
            payment.Label,
            payment.OperationId,
            payment.NotificationType,
            payment.Sender,
            payment.ExpiresAt,
            payment.PaidAt,
            payment.LastCheckedAt,
            payment.LastError,
            receiverMasked = MaskReceiver(payment.ReceiverAccount),
            canPay = (isPending && !isExpired) || canRetry,
            canRefresh,
            needsAttention = string.Equals(normalizedPaymentStatus, "review_required", StringComparison.Ordinal),
            isExpired
        };
    }

    private static string? MaskReceiver(string? value)
    {
        var digits = value?.Trim();
        if (string.IsNullOrWhiteSpace(digits))
            return null;

        if (digits.Length <= 8)
            return digits;

        return $"{digits[..4]}...{digits[^4..]}";
    }

    private static string Normalize(string? value)
    {
        var normalized = value?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? string.Empty : normalized;
    }
}
