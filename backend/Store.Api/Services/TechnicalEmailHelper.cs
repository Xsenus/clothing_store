using System.Net.Mail;

namespace Store.Api.Services;

public static class TechnicalEmailHelper
{
    private static readonly HashSet<string> ExternalProviders = new(StringComparer.OrdinalIgnoreCase)
    {
        "telegram",
        "google",
        "yandex"
    };

    private static readonly HashSet<string> TechnicalDomains = new(StringComparer.OrdinalIgnoreCase)
    {
        "telegram.local",
        "auth.local"
    };

    public static string NormalizeProvider(string? provider)
    {
        var normalized = provider?.Trim().ToLowerInvariant() ?? string.Empty;
        return ExternalProviders.Contains(normalized) ? normalized : string.Empty;
    }

    public static string BuildTechnicalEmail(string provider, string providerUserId)
    {
        var normalizedProvider = NormalizeProvider(provider);
        var normalizedProviderUserId = (providerUserId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedProvider) || string.IsNullOrWhiteSpace(normalizedProviderUserId))
            throw new InvalidOperationException("Provider and provider user id are required for a technical email.");

        return normalizedProvider switch
        {
            "telegram" => $"telegram_{normalizedProviderUserId}@telegram.local",
            _ => $"{normalizedProvider}_{normalizedProviderUserId}@auth.local"
        };
    }

    public static string NormalizeRealEmail(string? email)
        => (email ?? string.Empty).Trim().ToLowerInvariant();

    public static bool IsTechnicalEmail(string? email)
    {
        var normalized = NormalizeRealEmail(email);
        if (string.IsNullOrWhiteSpace(normalized))
            return false;

        if (!TrySplitEmail(normalized, out var localPart, out var domain))
            return false;

        if (!TechnicalDomains.Contains(domain))
            return false;

        return localPart.StartsWith("telegram_", StringComparison.OrdinalIgnoreCase)
               || localPart.StartsWith("google_", StringComparison.OrdinalIgnoreCase)
               || localPart.StartsWith("yandex_", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsValidRealEmail(string? email)
    {
        var normalized = NormalizeRealEmail(email);
        if (string.IsNullOrWhiteSpace(normalized) || IsTechnicalEmail(normalized))
            return false;

        try
        {
            var address = new MailAddress(normalized);
            return string.Equals(address.Address, normalized, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    public static string HideIfTechnical(string? email)
        => IsTechnicalEmail(email) ? string.Empty : NormalizeRealEmail(email);

    private static bool TrySplitEmail(string email, out string localPart, out string domain)
    {
        localPart = string.Empty;
        domain = string.Empty;

        var parts = email.Split('@', 2, StringSplitOptions.TrimEntries);
        if (parts.Length != 2)
            return false;

        localPart = parts[0];
        domain = parts[1];
        return !string.IsNullOrWhiteSpace(localPart) && !string.IsNullOrWhiteSpace(domain);
    }
}
