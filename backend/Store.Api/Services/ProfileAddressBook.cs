using System.Text.Json;

namespace Store.Api.Services;

public sealed record ProfileAddressEntry(string Id, string Value, bool IsDefault);

public static class ProfileAddressBook
{
    public static List<ProfileAddressEntry> Parse(string? json, string? fallbackAddress = null)
    {
        try
        {
            if (!string.IsNullOrWhiteSpace(json))
            {
                var parsed = JsonSerializer.Deserialize<List<ProfileAddressEntry>>(json);
                return Normalize(parsed, fallbackAddress);
            }
        }
        catch
        {
            // Ignore malformed historical payloads and fall back to legacy single address.
        }

        return Normalize(null, fallbackAddress);
    }

    public static List<ProfileAddressEntry> Normalize(IEnumerable<ProfileAddressEntry>? addresses, string? fallbackAddress = null)
    {
        var normalized = (addresses ?? [])
            .Select(address => new ProfileAddressEntry(
                string.IsNullOrWhiteSpace(address.Id) ? Guid.NewGuid().ToString("N") : address.Id.Trim(),
                (address.Value ?? string.Empty).Trim(),
                address.IsDefault))
            .Where(address => !string.IsNullOrWhiteSpace(address.Value))
            .ToList();

        if (normalized.Count == 0)
        {
            var fallback = (fallbackAddress ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(fallback))
            {
                normalized.Add(new ProfileAddressEntry(Guid.NewGuid().ToString("N"), fallback, true));
            }
        }

        if (normalized.Count == 0)
        {
            return normalized;
        }

        var defaultIndex = normalized.FindIndex(address => address.IsDefault);
        if (defaultIndex < 0)
        {
            defaultIndex = 0;
        }

        return normalized
            .Select((address, index) => address with { IsDefault = index == defaultIndex })
            .ToList();
    }

    public static string Serialize(IEnumerable<ProfileAddressEntry>? addresses, string? fallbackAddress = null)
    {
        var normalized = Normalize(addresses, fallbackAddress);
        return JsonSerializer.Serialize(normalized);
    }

    public static string GetDefaultAddress(IEnumerable<ProfileAddressEntry>? addresses, string? fallbackAddress = null)
    {
        var normalized = Normalize(addresses, fallbackAddress);
        return normalized.FirstOrDefault(address => address.IsDefault)?.Value
            ?? normalized.FirstOrDefault()?.Value
            ?? string.Empty;
    }
}
