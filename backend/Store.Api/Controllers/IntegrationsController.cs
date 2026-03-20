using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Store.Api.Contracts;
using Store.Api.Services;

namespace Store.Api.Controllers;

[ApiController]
[Route("integrations")]
public class IntegrationsController : ControllerBase
{
    private readonly ITelegramBotManager _telegramBotManager;
    private readonly IDaDataAddressSuggestService _daDataAddressSuggestService;
    private readonly IYandexDeliveryQuoteService _yandexDeliveryQuoteService;

    public IntegrationsController(
        ITelegramBotManager telegramBotManager,
        IDaDataAddressSuggestService daDataAddressSuggestService,
        IYandexDeliveryQuoteService yandexDeliveryQuoteService)
    {
        _telegramBotManager = telegramBotManager;
        _daDataAddressSuggestService = daDataAddressSuggestService;
        _yandexDeliveryQuoteService = yandexDeliveryQuoteService;
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

    [HttpGet("yandex/delivery/widget-config")]
    public async Task<IResult> GetYandexDeliveryWidgetConfig(CancellationToken cancellationToken)
    {
        try
        {
            var config = await _yandexDeliveryQuoteService.GetWidgetConfigAsync(cancellationToken);
            return Results.Ok(new
            {
                scriptUrl = config.ScriptUrl,
                testEnvironment = config.TestEnvironment,
                sourcePlatformStationId = config.SourcePlatformStationId
            });
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPost("yandex/delivery/pickup-points")]
    public async Task<IResult> GetYandexDeliveryPickupPoints([FromBody] YandexDeliveryPickupPointsPayload payload, CancellationToken cancellationToken)
    {
        try
        {
            var points = await _yandexDeliveryQuoteService.ListPickupPointsAsync(payload, cancellationToken);
            return Results.Ok(new
            {
                points = points.Select(point => new
                {
                    id = point.Id,
                    name = point.Name,
                    address = point.Address,
                    instruction = point.Instruction,
                    latitude = point.Latitude,
                    longitude = point.Longitude,
                    distanceKm = point.DistanceKm,
                    paymentMethods = point.PaymentMethods,
                    available = point.Available,
                    estimatedCost = point.EstimatedCost,
                    deliveryDays = point.DeliveryDays,
                    error = point.Error
                })
            });
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPost("yandex/delivery/calculate")]
    public async Task<IResult> CalculateYandexDelivery([FromBody] YandexDeliveryCalculatePayload payload, CancellationToken cancellationToken)
    {
        try
        {
            var quote = await _yandexDeliveryQuoteService.CalculateAsync(payload, cancellationToken);
            return Results.Ok(new
            {
                provider = quote.Provider,
                currency = quote.Currency,
                toAddress = quote.DestinationAddress,
                homeDelivery = new
                {
                    available = quote.HomeDelivery.Available,
                    estimatedCost = quote.HomeDelivery.EstimatedCost,
                    deliveryDays = quote.HomeDelivery.DeliveryDays,
                    tariff = quote.HomeDelivery.Tariff,
                    error = quote.HomeDelivery.Error
                },
                pickupPointDelivery = new
                {
                    available = quote.NearestPickupPointDelivery.Available,
                    estimatedCost = quote.NearestPickupPointDelivery.EstimatedCost,
                    deliveryDays = quote.NearestPickupPointDelivery.DeliveryDays,
                    tariff = quote.NearestPickupPointDelivery.Tariff,
                    error = quote.NearestPickupPointDelivery.Error,
                    point = quote.NearestPickupPointDelivery.Point is null
                        ? null
                        : new
                        {
                            id = quote.NearestPickupPointDelivery.Point.Id,
                            name = quote.NearestPickupPointDelivery.Point.Name,
                            address = quote.NearestPickupPointDelivery.Point.Address,
                            instruction = quote.NearestPickupPointDelivery.Point.Instruction,
                            latitude = quote.NearestPickupPointDelivery.Point.Latitude,
                            longitude = quote.NearestPickupPointDelivery.Point.Longitude,
                            distanceKm = quote.NearestPickupPointDelivery.Point.DistanceKm
                        }
                },
                nearestPickupPointDelivery = new
                {
                    available = quote.NearestPickupPointDelivery.Available,
                    estimatedCost = quote.NearestPickupPointDelivery.EstimatedCost,
                    deliveryDays = quote.NearestPickupPointDelivery.DeliveryDays,
                    tariff = quote.NearestPickupPointDelivery.Tariff,
                    error = quote.NearestPickupPointDelivery.Error,
                    point = quote.NearestPickupPointDelivery.Point is null
                        ? null
                        : new
                        {
                            id = quote.NearestPickupPointDelivery.Point.Id,
                            name = quote.NearestPickupPointDelivery.Point.Name,
                            address = quote.NearestPickupPointDelivery.Point.Address,
                            instruction = quote.NearestPickupPointDelivery.Point.Instruction,
                            latitude = quote.NearestPickupPointDelivery.Point.Latitude,
                            longitude = quote.NearestPickupPointDelivery.Point.Longitude,
                            distanceKm = quote.NearestPickupPointDelivery.Point.DistanceKm
                        }
                },
                details = new
                {
                    testEnvironment = quote.Details.TestEnvironment,
                    sourceStationId = quote.Details.SourceStationId,
                    requestedWeightKg = quote.Details.RequestedWeightKg,
                    declaredCost = quote.Details.DeclaredCost
                }
            });
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

}
