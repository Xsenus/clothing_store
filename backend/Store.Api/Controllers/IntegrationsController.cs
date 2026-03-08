using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;

namespace Store.Api.Controllers;

[ApiController]
[Route("integrations")]
public class IntegrationsController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;

    public IntegrationsController(IHttpClientFactory httpClientFactory, StoreDbContext db, IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _db = db;
        _configuration = configuration;
    }

    [HttpPost("dadata/suggest")]
    public async Task<IResult> SuggestAddress([FromBody] AddressSuggestPayload payload)
    {
        var token = await GetSettingOrConfigAsync("dadata_api_key", "Integrations:DaData:ApiKey");
        if (string.IsNullOrWhiteSpace(token))
            return Results.BadRequest(new { detail = "DaData API key is not configured" });

        var query = payload.Query?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(query))
            return Results.Ok(new { suggestions = Array.Empty<object>() });

        var client = _httpClientFactory.CreateClient();
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address");
        req.Headers.Authorization = new AuthenticationHeaderValue("Token", token);
        req.Content = new StringContent(JsonSerializer.Serialize(new
        {
            query,
            count = Math.Clamp(payload.Count ?? 5, 1, 10)
        }), Encoding.UTF8, "application/json");

        using var res = await client.SendAsync(req);
        if (!res.IsSuccessStatusCode)
            return Results.BadRequest(new { detail = $"DaData request failed: {(int)res.StatusCode}" });

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var suggestions = doc.RootElement
            .GetProperty("suggestions")
            .EnumerateArray()
            .Select(item => new
            {
                value = item.GetProperty("value").GetString(),
                unrestrictedValue = item.TryGetProperty("unrestricted_value", out var uv) ? uv.GetString() : null
            })
            .ToList();

        return Results.Ok(new { suggestions });
    }

    [HttpPost("yandex/delivery/calculate")]
    public async Task<IResult> CalculateYandexDelivery([FromBody] YandexDeliveryCalculatePayload payload)
    {
        var baseCost = await GetDecimalSettingAsync("yandex_delivery_base_cost", 350m);
        var kgCost = await GetDecimalSettingAsync("yandex_delivery_cost_per_kg", 40m);
        var markupPercent = await GetDecimalSettingAsync("yandex_delivery_markup_percent", 0m);

        var safeWeight = payload.WeightKg.GetValueOrDefault(1m);
        if (safeWeight <= 0m)
            safeWeight = 1m;

        var estimated = baseCost + (safeWeight * kgCost);
        if (markupPercent > 0)
            estimated += estimated * (markupPercent / 100m);

        var rounded = Math.Round(estimated, 2, MidpointRounding.AwayFromZero);
        return Results.Ok(new
        {
            provider = "yandex_delivery",
            currency = "RUB",
            toAddress = payload.ToAddress,
            estimatedCost = rounded,
            details = new
            {
                baseCost,
                kgCost,
                markupPercent,
                weightKg = safeWeight,
                declaredCost = payload.DeclaredCost
            }
        });
    }

    private async Task<string?> GetSettingOrConfigAsync(string key, string configPath)
    {
        var row = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == key);
        if (row is not null && !string.IsNullOrWhiteSpace(row.Value))
            return row.Value;

        return _configuration[configPath];
    }

    private async Task<decimal> GetDecimalSettingAsync(string key, decimal fallback)
    {
        var row = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == key);
        if (row is not null && decimal.TryParse(row.Value, NumberStyles.Any, CultureInfo.InvariantCulture, out var value))
            return value;
        return fallback;
    }
}
