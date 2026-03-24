using Store.Api.Models;

namespace Store.Api.Controllers;

internal static class VisitorTrackingSupport
{
    internal static string? NormalizeVisitorId(string? visitorId)
    {
        var normalized = visitorId?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        return normalized.Length > 120
            ? normalized[..120]
            : normalized;
    }

    internal static string? ResolveViewerKey(User? user, string? visitorId)
    {
        var normalizedVisitorId = NormalizeVisitorId(visitorId);
        if (!string.IsNullOrWhiteSpace(normalizedVisitorId))
            return $"visitor:{normalizedVisitorId}";

        var normalizedUserId = user?.Id?.Trim();
        return string.IsNullOrWhiteSpace(normalizedUserId)
            ? null
            : $"user:{normalizedUserId}";
    }

    internal static string? NormalizePath(string? path)
    {
        var normalized = path?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        return normalized.Length > 512
            ? normalized[..512]
            : normalized;
    }
}
