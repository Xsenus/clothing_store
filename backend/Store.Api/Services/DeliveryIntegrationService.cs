using Store.Api.Contracts;

namespace Store.Api.Services;

public sealed record DeliveryQuoteOptionSummary(
    bool Available,
    decimal? EstimatedCost,
    int? DeliveryDays,
    string Tariff,
    string? Error = null);

public sealed record DeliveryPickupPointSummary(
    string Id,
    string Name,
    string Address,
    string? Instruction,
    double? Latitude,
    double? Longitude,
    double? DistanceKm,
    IReadOnlyList<string>? PaymentMethods = null,
    bool Available = false,
    decimal? EstimatedCost = null,
    int? DeliveryDays = null,
    string? Error = null);

public sealed record DeliveryPickupQuoteSummary(
    bool Available,
    decimal? EstimatedCost,
    int? DeliveryDays,
    string Tariff,
    DeliveryPickupPointSummary? Point,
    string? Error = null);

public sealed record DeliveryProviderQuoteResult(
    string Provider,
    string Label,
    string Currency,
    DeliveryQuoteOptionSummary HomeDelivery,
    DeliveryPickupQuoteSummary PickupPointDelivery,
    IReadOnlyDictionary<string, string>? Details = null);

public sealed record DeliveryProvidersQuoteResult(
    string DestinationAddress,
    IReadOnlyList<DeliveryProviderQuoteResult> Providers);

public interface IDeliveryIntegrationService
{
    Task<DeliveryProvidersQuoteResult> CalculateAsync(DeliveryCalculatePayload payload, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsAsync(DeliveryPickupPointsPayload payload, CancellationToken cancellationToken = default);
}

public sealed class DeliveryIntegrationService : IDeliveryIntegrationService
{
    private readonly IYandexDeliveryQuoteService _yandexDeliveryQuoteService;
    private readonly ICdekDeliveryService _cdekDeliveryService;
    private readonly IRussianPostDeliveryService _russianPostDeliveryService;
    private readonly IAvitoDeliveryService _avitoDeliveryService;

    public DeliveryIntegrationService(
        IYandexDeliveryQuoteService yandexDeliveryQuoteService,
        ICdekDeliveryService cdekDeliveryService,
        IRussianPostDeliveryService russianPostDeliveryService,
        IAvitoDeliveryService avitoDeliveryService)
    {
        _yandexDeliveryQuoteService = yandexDeliveryQuoteService;
        _cdekDeliveryService = cdekDeliveryService;
        _russianPostDeliveryService = russianPostDeliveryService;
        _avitoDeliveryService = avitoDeliveryService;
    }

    public async Task<DeliveryProvidersQuoteResult> CalculateAsync(
        DeliveryCalculatePayload payload,
        CancellationToken cancellationToken = default)
    {
        var destinationAddress = payload.ToAddress?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(destinationAddress))
            throw new InvalidOperationException("Укажите адрес доставки.");

        // Delivery services use the same scoped EF DbContext to resolve integration settings.
        // Parallel execution here can trigger concurrent DbContext operations and make
        // providers disappear from storefront calculations even though they work individually.
        var providers = new List<DeliveryProviderQuoteResult?>(4)
        {
            await TryGetYandexQuoteAsync(payload, cancellationToken),
            await TryGetCdekQuoteAsync(payload, cancellationToken),
            await TryGetRussianPostQuoteAsync(payload, cancellationToken),
            await TryGetAvitoQuoteAsync(payload, cancellationToken)
        };

        var availableProviders = providers
            .Where(static item => item is not null)
            .Select(static item => item!)
            .OrderBy(static item => item.Label, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new DeliveryProvidersQuoteResult(destinationAddress, availableProviders);
    }

    public async Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsAsync(
        DeliveryPickupPointsPayload payload,
        CancellationToken cancellationToken = default)
    {
        var provider = Normalize(payload.Provider);
        return provider switch
        {
            "yandex_delivery" or "yandex" => await MapYandexPickupPointsAsync(payload, cancellationToken),
            "cdek" => await _cdekDeliveryService.ListPickupPointsAsync(payload, cancellationToken),
            "russian_post" => await _russianPostDeliveryService.ListPickupPointsAsync(payload, cancellationToken),
            "avito" or "avito_delivery" => await _avitoDeliveryService.ListPickupPointsAsync(payload, cancellationToken),
            _ => throw new InvalidOperationException("Выбран неподдерживаемый провайдер доставки.")
        };
    }

    private async Task<DeliveryProviderQuoteResult?> TryGetYandexQuoteAsync(
        DeliveryCalculatePayload payload,
        CancellationToken cancellationToken)
    {
        try
        {
            var quote = await _yandexDeliveryQuoteService.CalculateAsync(
                new YandexDeliveryCalculatePayload(
                    payload.ToAddress,
                    payload.WeightKg,
                    payload.DeclaredCost,
                    payload.PaymentMethod,
                    PickupPointId: null),
                cancellationToken);
            var pickupSummary = await BuildYandexPickupSummaryAsync(payload, cancellationToken);

            return new DeliveryProviderQuoteResult(
                Provider: "yandex_delivery",
                Label: "Яндекс Доставка",
                Currency: quote.Currency,
                HomeDelivery: new DeliveryQuoteOptionSummary(
                    quote.HomeDelivery.Available,
                    quote.HomeDelivery.EstimatedCost,
                    quote.HomeDelivery.DeliveryDays,
                    quote.HomeDelivery.Tariff,
                    quote.HomeDelivery.Error),
                PickupPointDelivery: pickupSummary,
                Details: new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    ["testEnvironment"] = quote.Details.TestEnvironment ? "true" : "false",
                    ["sourceStationId"] = quote.Details.SourceStationId,
                    ["requestedWeightKg"] = quote.Details.RequestedWeightKg.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    ["declaredCost"] = quote.Details.DeclaredCost.ToString(System.Globalization.CultureInfo.InvariantCulture)
                });
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return null;
        }
    }

    private async Task<DeliveryPickupQuoteSummary> BuildYandexPickupSummaryAsync(
        DeliveryCalculatePayload payload,
        CancellationToken cancellationToken)
    {
        try
        {
            var points = await _yandexDeliveryQuoteService.ListPickupPointsAsync(
                new YandexDeliveryPickupPointsPayload(
                    payload.ToAddress,
                    payload.PaymentMethod,
                    Limit: 8,
                    payload.WeightKg,
                    payload.DeclaredCost),
                cancellationToken);

            var nearestPoint = points.FirstOrDefault(point => point.Available) ?? points.FirstOrDefault();
            if (nearestPoint is null)
            {
                return new DeliveryPickupQuoteSummary(
                    Available: false,
                    EstimatedCost: null,
                    DeliveryDays: null,
                    Tariff: "self_pickup",
                    Point: null,
                    Error: null);
            }

            return new DeliveryPickupQuoteSummary(
                Available: nearestPoint.Available,
                EstimatedCost: nearestPoint.EstimatedCost,
                DeliveryDays: nearestPoint.DeliveryDays,
                Tariff: "self_pickup",
                Point: new DeliveryPickupPointSummary(
                    nearestPoint.Id,
                    nearestPoint.Name,
                    nearestPoint.Address,
                    nearestPoint.Instruction,
                    nearestPoint.Latitude,
                    nearestPoint.Longitude,
                    nearestPoint.DistanceKm,
                    nearestPoint.PaymentMethods,
                    nearestPoint.Available,
                    nearestPoint.EstimatedCost,
                    nearestPoint.DeliveryDays,
                    nearestPoint.Error),
                Error: nearestPoint.Error);
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return new DeliveryPickupQuoteSummary(
                Available: false,
                EstimatedCost: null,
                DeliveryDays: null,
                Tariff: "self_pickup",
                Point: null,
                Error: ex.Message);
        }
    }

    private Task<DeliveryProviderQuoteResult?> TryGetCdekQuoteAsync(
        DeliveryCalculatePayload payload,
        CancellationToken cancellationToken)
        => _cdekDeliveryService.TryCalculateAsync(payload, cancellationToken);

    private Task<DeliveryProviderQuoteResult?> TryGetRussianPostQuoteAsync(
        DeliveryCalculatePayload payload,
        CancellationToken cancellationToken)
        => _russianPostDeliveryService.TryCalculateAsync(payload, cancellationToken);

    private Task<DeliveryProviderQuoteResult?> TryGetAvitoQuoteAsync(
        DeliveryCalculatePayload payload,
        CancellationToken cancellationToken)
        => _avitoDeliveryService.TryCalculateAsync(payload, cancellationToken);

    private async Task<IReadOnlyList<DeliveryPickupPointSummary>> MapYandexPickupPointsAsync(
        DeliveryPickupPointsPayload payload,
        CancellationToken cancellationToken)
    {
        var points = await _yandexDeliveryQuoteService.ListPickupPointsAsync(
            new YandexDeliveryPickupPointsPayload(
                payload.ToAddress,
                payload.PaymentMethod,
                payload.Limit,
                payload.WeightKg,
                payload.DeclaredCost),
            cancellationToken);

        return points.Select(point => new DeliveryPickupPointSummary(
            point.Id,
            point.Name,
            point.Address,
            point.Instruction,
            point.Latitude,
            point.Longitude,
            point.DistanceKm,
            point.PaymentMethods,
            point.Available,
            point.EstimatedCost,
            point.DeliveryDays,
            point.Error)).ToList();
    }

    private static string Normalize(string? value)
    {
        var normalized = value?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? string.Empty : normalized;
    }
}
