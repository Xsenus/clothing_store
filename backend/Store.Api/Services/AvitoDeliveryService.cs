using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;

namespace Store.Api.Services;

public interface IAvitoDeliveryService
{
    Task<DeliveryProviderQuoteResult?> TryCalculateAsync(DeliveryCalculatePayload payload, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsAsync(DeliveryPickupPointsPayload payload, CancellationToken cancellationToken = default);
    Task<AvitoAdminTestResult> TestIntegrationAsync(AvitoDeliveryAdminTestPayload payload, CancellationToken cancellationToken = default);
}

public sealed record AvitoAdminTestResult(
    bool TokenEndpointReachable,
    bool TokenIssued,
    string Scope,
    string Detail,
    string Note);

public sealed record AvitoIntegrationOverrides(
    bool Enabled,
    string? ClientId,
    string? ClientSecret,
    string? Scope,
    string? WarehouseAddress,
    string? Notes);

public sealed class AvitoDeliveryService : IAvitoDeliveryService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;

    public AvitoDeliveryService(
        IHttpClientFactory httpClientFactory,
        StoreDbContext db,
        IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _db = db;
        _configuration = configuration;
    }

    public Task<DeliveryProviderQuoteResult?> TryCalculateAsync(
        DeliveryCalculatePayload payload,
        CancellationToken cancellationToken = default)
        => Task.FromResult<DeliveryProviderQuoteResult?>(null);

    public Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsAsync(
        DeliveryPickupPointsPayload payload,
        CancellationToken cancellationToken = default)
        => Task.FromResult<IReadOnlyList<DeliveryPickupPointSummary>>(Array.Empty<DeliveryPickupPointSummary>());

    public async Task<AvitoAdminTestResult> TestIntegrationAsync(
        AvitoDeliveryAdminTestPayload payload,
        CancellationToken cancellationToken = default)
    {
        var settings = NormalizeOverrides(new AvitoIntegrationOverrides(
            payload.Enabled,
            payload.ClientId,
            payload.ClientSecret,
            payload.Scope,
            payload.WarehouseAddress,
            payload.Notes));

        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.avito.ru/token");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = settings.ClientId!,
            ["client_secret"] = settings.ClientSecret!
        });

        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new AvitoAdminTestResult(
                TokenEndpointReachable: true,
                TokenIssued: false,
                Scope: settings.Scope ?? string.Empty,
                Detail: string.IsNullOrWhiteSpace(body) ? $"HTTP {(int)response.StatusCode}" : body,
                Note: "Публичный OAuth endpoint Авито подтвержден, но в открытой документации портала разработчика не найден общедоступный delivery API для внешнего storefront. Поэтому боевой checkout-контур для Авито в коде не активирован без дополнительных партнерских спецификаций.");
        }

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
        var tokenIssued = document.RootElement.TryGetProperty("access_token", out _);
        return new AvitoAdminTestResult(
            TokenEndpointReachable: true,
            TokenIssued: tokenIssued,
            Scope: settings.Scope ?? string.Empty,
            Detail: tokenIssued ? "OAuth token получен." : body,
            Note: "OAuth контур Авито проверен. Для полноценной доставки нужен отдельный публичный delivery API или партнерская спецификация от Авито.");
    }

    private static AvitoIntegrationOverrides NormalizeOverrides(AvitoIntegrationOverrides overrides)
    {
        if (!overrides.Enabled)
            throw new InvalidOperationException("Авито интеграция отключена в настройках.");

        var clientId = NormalizeOptionalText(overrides.ClientId);
        var clientSecret = NormalizeOptionalText(overrides.ClientSecret);
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            throw new InvalidOperationException("Для проверки Авито укажите client_id и client_secret.");

        return overrides with
        {
            ClientId = clientId,
            ClientSecret = clientSecret,
            Scope = NormalizeOptionalText(overrides.Scope) ?? "items:info"
        };
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

    private static string? NormalizeOptionalText(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }
}
