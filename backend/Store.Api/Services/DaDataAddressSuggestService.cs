using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Store.Api.Contracts;
using Store.Api.Data;

namespace Store.Api.Services;

public interface IDaDataAddressSuggestService
{
    Task<IReadOnlyList<DaDataAddressSuggestion>> SuggestAsync(AddressSuggestPayload payload, CancellationToken cancellationToken = default);
}

public sealed record DaDataAddressSuggestion(string? Value, string? UnrestrictedValue);

public sealed class DaDataAddressSuggestService : IDaDataAddressSuggestService
{
    private static readonly TimeSpan SuggestCacheTtl = TimeSpan.FromMinutes(5);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly IMemoryCache _cache;

    public DaDataAddressSuggestService(
        IHttpClientFactory httpClientFactory,
        StoreDbContext db,
        IConfiguration configuration,
        IMemoryCache cache)
    {
        _httpClientFactory = httpClientFactory;
        _db = db;
        _configuration = configuration;
        _cache = cache;
    }

    public async Task<IReadOnlyList<DaDataAddressSuggestion>> SuggestAsync(AddressSuggestPayload payload, CancellationToken cancellationToken = default)
    {
        var token = await GetSettingOrConfigAsync("dadata_api_key", "Integrations:DaData:ApiKey", cancellationToken);
        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("DaData API key is not configured");

        var query = payload.Query?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(query))
            return Array.Empty<DaDataAddressSuggestion>();

        var count = Math.Clamp(payload.Count ?? 5, 1, 10);
        var cacheKey = BuildCacheKey(query, count);
        if (_cache.TryGetValue(cacheKey, out IReadOnlyList<DaDataAddressSuggestion>? cachedSuggestions) && cachedSuggestions is not null)
            return cachedSuggestions;

        var client = _httpClientFactory.CreateClient();
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address");
        req.Headers.Authorization = new AuthenticationHeaderValue("Token", token);
        req.Content = new StringContent(JsonSerializer.Serialize(new { query, count }), Encoding.UTF8, "application/json");

        using var res = await client.SendAsync(req, cancellationToken);
        if (!res.IsSuccessStatusCode)
            throw new HttpRequestException($"DaData request failed: {(int)res.StatusCode}");

        await using var responseStream = await res.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(responseStream, cancellationToken: cancellationToken);
        var suggestions = ReadSuggestions(doc.RootElement)
            .Select(MapSuggestion)
            .Where(static item =>
                !string.IsNullOrWhiteSpace(item.UnrestrictedValue)
                || !string.IsNullOrWhiteSpace(item.Value))
            .ToList();

        _cache.Set(cacheKey, suggestions, SuggestCacheTtl);
        return suggestions;
    }

    private async Task<string?> GetSettingOrConfigAsync(string key, string configPath, CancellationToken cancellationToken)
    {
        var row = await _db.AppSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Key == key, cancellationToken);

        if (row is not null && !string.IsNullOrWhiteSpace(row.Value))
            return row.Value;

        return _configuration[configPath];
    }

    private static string BuildCacheKey(string query, int count) =>
        $"dadata:suggest:{count}:{query.Trim().ToLowerInvariant()}";

    private static IEnumerable<JsonElement> ReadSuggestions(JsonElement root)
    {
        if (!root.TryGetProperty("suggestions", out var suggestions) || suggestions.ValueKind != JsonValueKind.Array)
            return Enumerable.Empty<JsonElement>();

        return suggestions.EnumerateArray();
    }

    private static DaDataAddressSuggestion MapSuggestion(JsonElement item) =>
        new(
            ReadString(item, "value"),
            ReadString(item, "unrestricted_value"));

    private static string? ReadString(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property))
            return null;

        return property.ValueKind switch
        {
            JsonValueKind.String => property.GetString(),
            JsonValueKind.Null => null,
            _ => property.ToString()
        };
    }
}
