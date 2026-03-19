using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Services;

namespace Store.Api.Controllers;

[ApiController]
[Route("integrations")]
public class IntegrationsController : ControllerBase
{
    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly ITelegramBotManager _telegramBotManager;
    private readonly IDaDataAddressSuggestService _daDataAddressSuggestService;

    public IntegrationsController(StoreDbContext db, IConfiguration configuration, ITelegramBotManager telegramBotManager, IDaDataAddressSuggestService daDataAddressSuggestService)
    {
        _db = db;
        _configuration = configuration;
        _telegramBotManager = telegramBotManager;
        _daDataAddressSuggestService = daDataAddressSuggestService;
    }

    [HttpPost("telegram/webhook/{id}")]
    public async Task<IResult> TelegramWebhook(string id, [FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        var secret = Request.Headers["X-Telegram-Bot-Api-Secret-Token"].FirstOrDefault();
        var handled = await _telegramBotManager.HandleWebhookUpdateAsync(id, secret, payload, cancellationToken);
        if (!handled)
            return Results.NotFound(new { detail = "Bot not found, disabled, or webhook is not configured" });

        return Results.Ok(new { ok = true });
    }

    [HttpPost("dadata/suggest")]
    public async Task<IResult> SuggestAddress([FromBody] AddressSuggestPayload payload, CancellationToken cancellationToken)
    {
        try
        {
            var suggestions = await _daDataAddressSuggestService.SuggestAsync(payload, cancellationToken);
            return Results.Ok(new { suggestions });
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
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
