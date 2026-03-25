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
    private readonly IYooMoneyPaymentService _yooMoneyPaymentService;
    private readonly IYooKassaPaymentService _yooKassaPaymentService;
    private readonly IRoboKassaPaymentService _roboKassaPaymentService;
    private readonly IYandexDeliveryQuoteService _yandexDeliveryQuoteService;
    private readonly IDeliveryIntegrationService _deliveryIntegrationService;

    public IntegrationsController(
        ITelegramBotManager telegramBotManager,
        IDaDataAddressSuggestService daDataAddressSuggestService,
        IYooMoneyPaymentService yooMoneyPaymentService,
        IYooKassaPaymentService yooKassaPaymentService,
        IRoboKassaPaymentService roboKassaPaymentService,
        IYandexDeliveryQuoteService yandexDeliveryQuoteService,
        IDeliveryIntegrationService deliveryIntegrationService)
    {
        _telegramBotManager = telegramBotManager;
        _daDataAddressSuggestService = daDataAddressSuggestService;
        _yooMoneyPaymentService = yooMoneyPaymentService;
        _yooKassaPaymentService = yooKassaPaymentService;
        _roboKassaPaymentService = roboKassaPaymentService;
        _yandexDeliveryQuoteService = yandexDeliveryQuoteService;
        _deliveryIntegrationService = deliveryIntegrationService;
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

    [HttpPost("yoomoney/notifications")]
    [Consumes("application/x-www-form-urlencoded")]
    public async Task<IResult> YooMoneyNotifications([FromForm] YooMoneyNotificationPayload payload, CancellationToken cancellationToken)
    {
        var result = await _yooMoneyPaymentService.HandleNotificationAsync(payload, cancellationToken);
        if (!result.Accepted)
            return Results.BadRequest(new { detail = result.Detail });

        return Results.Ok(new
        {
            ok = true,
            ignored = result.Ignored,
            detail = result.Detail
        });
    }

    [HttpPost("yookassa/notifications")]
    public async Task<IResult> YooKassaNotifications([FromBody] YooKassaNotificationPayload payload, CancellationToken cancellationToken)
    {
        try
        {
            var result = await _yooKassaPaymentService.HandleNotificationAsync(payload, cancellationToken);
            if (!result.Accepted)
                return Results.BadRequest(new { detail = result.Detail });

            return Results.Ok(new
            {
                ok = true,
                ignored = result.Ignored,
                detail = result.Detail
            });
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPost("robokassa/result")]
    [Consumes("application/x-www-form-urlencoded")]
    public async Task<IResult> RoboKassaResult([FromForm] RoboKassaCallbackPayload payload, CancellationToken cancellationToken)
        => await HandleRoboKassaResultAsync(payload, cancellationToken);

    [HttpGet("robokassa/result")]
    public async Task<IResult> RoboKassaResultGet([FromQuery] RoboKassaCallbackPayload payload, CancellationToken cancellationToken)
        => await HandleRoboKassaResultAsync(payload, cancellationToken);

    private async Task<IResult> HandleRoboKassaResultAsync(RoboKassaCallbackPayload payload, CancellationToken cancellationToken)
    {
        var result = await _roboKassaPaymentService.HandleResultAsync(payload, cancellationToken);
        if (!result.Accepted)
            return Results.Text(result.ResponseText, "text/plain", statusCode: StatusCodes.Status400BadRequest);

        return Results.Text(result.ResponseText, "text/plain");
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

    [HttpPost("delivery/calculate")]
    public async Task<IResult> CalculateDelivery([FromBody] DeliveryCalculatePayload payload, CancellationToken cancellationToken)
    {
        try
        {
            var result = await _deliveryIntegrationService.CalculateAsync(payload, cancellationToken);
            return Results.Ok(new
            {
                toAddress = result.DestinationAddress,
                providers = result.Providers.Select(provider => new
                {
                    provider = provider.Provider,
                    label = provider.Label,
                    currency = provider.Currency,
                    homeDelivery = new
                    {
                        available = provider.HomeDelivery.Available,
                        estimatedCost = provider.HomeDelivery.EstimatedCost,
                        deliveryDays = provider.HomeDelivery.DeliveryDays,
                        tariff = provider.HomeDelivery.Tariff,
                        error = provider.HomeDelivery.Error
                    },
                    pickupPointDelivery = new
                    {
                        available = provider.PickupPointDelivery.Available,
                        estimatedCost = provider.PickupPointDelivery.EstimatedCost,
                        deliveryDays = provider.PickupPointDelivery.DeliveryDays,
                        tariff = provider.PickupPointDelivery.Tariff,
                        error = provider.PickupPointDelivery.Error
                    },
                    details = provider.Details
                })
            });
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPost("delivery/pickup-points")]
    public async Task<IResult> GetDeliveryPickupPoints([FromBody] DeliveryPickupPointsPayload payload, CancellationToken cancellationToken)
    {
        try
        {
            var points = await _deliveryIntegrationService.ListPickupPointsAsync(payload, cancellationToken);
            return Results.Ok(new
            {
                provider = payload.Provider,
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

}
