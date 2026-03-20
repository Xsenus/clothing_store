using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;

namespace Store.Api.Services;

public interface IYandexDeliveryQuoteService
{
    Task<YandexDeliveryWidgetConfigResult> GetWidgetConfigAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<YandexPickupPointSummary>> ListPickupPointsAsync(YandexDeliveryPickupPointsPayload payload, CancellationToken cancellationToken = default);
    Task<YandexDeliveryQuoteResult> CalculateAsync(YandexDeliveryCalculatePayload payload, CancellationToken cancellationToken = default);
}

public sealed record YandexDeliveryWidgetConfigResult(
    string ScriptUrl,
    bool TestEnvironment,
    string SourcePlatformStationId);

public sealed record YandexDeliveryQuoteResult(
    string Provider,
    string Currency,
    string DestinationAddress,
    YandexDeliveryQuoteOptionResult HomeDelivery,
    YandexDeliveryPickupQuoteOptionResult NearestPickupPointDelivery,
    YandexDeliveryQuoteDetails Details);

public sealed record YandexDeliveryQuoteOptionResult(
    bool Available,
    decimal? EstimatedCost,
    int? DeliveryDays,
    string Tariff,
    string? Error = null);

public sealed record YandexDeliveryPickupQuoteOptionResult(
    bool Available,
    decimal? EstimatedCost,
    int? DeliveryDays,
    string Tariff,
    YandexPickupPointSummary? Point,
    string? Error = null);

public sealed record YandexPickupPointSummary(
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

public sealed record YandexDeliveryQuoteDetails(
    bool TestEnvironment,
    string SourceStationId,
    decimal RequestedWeightKg,
    decimal DeclaredCost);

public sealed class YandexDeliveryQuoteService : IYandexDeliveryQuoteService
{
    private const string TestSourceStationId = "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924";
    private const string WidgetScriptUrl = "https://ndd-widget.landpro.site/widget.js";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly IDaDataAddressSuggestService _daDataAddressSuggestService;

    public YandexDeliveryQuoteService(
        IHttpClientFactory httpClientFactory,
        StoreDbContext db,
        IConfiguration configuration,
        IDaDataAddressSuggestService daDataAddressSuggestService)
    {
        _httpClientFactory = httpClientFactory;
        _db = db;
        _configuration = configuration;
        _daDataAddressSuggestService = daDataAddressSuggestService;
    }

    public async Task<YandexDeliveryWidgetConfigResult> GetWidgetConfigAsync(CancellationToken cancellationToken = default)
    {
        var (useTestEnvironment, sourceStationId, _) = await ResolveIntegrationOptionsAsync(cancellationToken);

        return new YandexDeliveryWidgetConfigResult(
            ScriptUrl: WidgetScriptUrl,
            TestEnvironment: useTestEnvironment,
            SourcePlatformStationId: sourceStationId);
    }

    public async Task<IReadOnlyList<YandexPickupPointSummary>> ListPickupPointsAsync(
        YandexDeliveryPickupPointsPayload payload,
        CancellationToken cancellationToken = default)
    {
        var destinationAddress = payload.ToAddress?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(destinationAddress))
            throw new InvalidOperationException("Адрес доставки не указан.");

        var (useTestEnvironment, _, apiToken) = await ResolveIntegrationOptionsAsync(cancellationToken);
        var paymentMethod = NormalizePaymentMethod(payload.PaymentMethod);
        var resolvedAddress = await TryResolveAddressAsync(destinationAddress, cancellationToken);
        var locationSearchText = resolvedAddress?.Settlement
            ?? resolvedAddress?.City
            ?? destinationAddress;
        var limit = Math.Clamp(payload.Limit ?? 12, 1, 30);

        var points = await GetPickupPointsAsync(
            locationSearchText,
            resolvedAddress,
            apiToken,
            useTestEnvironment,
            paymentMethod,
            cancellationToken);

        return points
            .Where(static point => !string.IsNullOrWhiteSpace(point.Id))
            .Select(point => MapPickupPointSummary(point, resolvedAddress))
            .OrderBy(point => point.DistanceKm ?? double.MaxValue)
            .ThenBy(point => point.Name, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .ToList();
    }

    public async Task<YandexDeliveryQuoteResult> CalculateAsync(YandexDeliveryCalculatePayload payload, CancellationToken cancellationToken = default)
    {
        var destinationAddress = payload.ToAddress?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(destinationAddress))
            throw new InvalidOperationException("Адрес доставки не указан.");

        var (useTestEnvironment, sourceStationId, apiToken) = await ResolveIntegrationOptionsAsync(cancellationToken);
        var requestedWeightKg = NormalizeWeight(payload.WeightKg);
        var declaredCost = NormalizeMoney(payload.DeclaredCost);
        var packageDimensions = await ResolvePackageDimensionsAsync(cancellationToken);
        var paymentMethod = NormalizePaymentMethod(payload.PaymentMethod);
        var totalWeightGrams = ToGrams(requestedWeightKg);
        var totalAssessedPrice = ToMinorUnits(declaredCost);
        var clientPrice = paymentMethod == "card_on_receipt" ? totalAssessedPrice : 0;
        var places = BuildPlaces(totalWeightGrams, packageDimensions);
        var pickupPointId = NormalizeOptionalText(payload.PickupPointId);
        var resolvedAddress = await TryResolveAddressAsync(destinationAddress, cancellationToken);
        var selectedPoint = string.IsNullOrWhiteSpace(pickupPointId)
            ? null
            : await TryGetPickupPointByIdAsync(pickupPointId, apiToken, useTestEnvironment, resolvedAddress, cancellationToken);

        var homeDelivery = await TryCalculateHomeDeliveryAsync(
            destinationAddress,
            sourceStationId,
            apiToken,
            useTestEnvironment,
            paymentMethod,
            totalWeightGrams,
            totalAssessedPrice,
            clientPrice,
            places,
            cancellationToken);

        var nearestPickupPointDelivery = string.IsNullOrWhiteSpace(pickupPointId)
            ? BuildUnselectedPickupPointResult()
            : await TryCalculateSelectedPickupPointDeliveryAsync(
                pickupPointId,
                selectedPoint,
                resolvedAddress,
                sourceStationId,
                apiToken,
                useTestEnvironment,
                paymentMethod,
                totalWeightGrams,
                totalAssessedPrice,
                clientPrice,
                places,
                cancellationToken);

        return new YandexDeliveryQuoteResult(
            Provider: "yandex_delivery",
            Currency: "RUB",
            DestinationAddress: destinationAddress,
            HomeDelivery: homeDelivery,
            NearestPickupPointDelivery: nearestPickupPointDelivery,
            Details: new YandexDeliveryQuoteDetails(
                TestEnvironment: useTestEnvironment,
                SourceStationId: sourceStationId,
                RequestedWeightKg: requestedWeightKg,
                DeclaredCost: declaredCost));
    }

    private async Task<(bool UseTestEnvironment, string SourceStationId, string ApiToken)> ResolveIntegrationOptionsAsync(CancellationToken cancellationToken)
    {
        var useTestEnvironment = await GetBooleanSettingAsync(
            "yandex_delivery_use_test_environment",
            "Integrations:YandexDelivery:UseTestEnvironment",
            fallback: false,
            cancellationToken);
        var apiToken = await GetSettingOrConfigAsync(
            "yandex_delivery_api_token",
            "Integrations:YandexDelivery:ApiToken",
            cancellationToken);
        var sourceStationId = await GetSettingOrConfigAsync(
            "yandex_delivery_source_station_id",
            "Integrations:YandexDelivery:SourceStationId",
            cancellationToken);

        if (useTestEnvironment)
        {
            sourceStationId = string.IsNullOrWhiteSpace(sourceStationId) ? TestSourceStationId : sourceStationId;
        }

        if (string.IsNullOrWhiteSpace(apiToken))
            throw new InvalidOperationException("Не настроен API token Яндекс.Доставки.");

        if (string.IsNullOrWhiteSpace(sourceStationId))
            throw new InvalidOperationException("Не настроен platform_station_id склада отправки для Яндекс.Доставки.");

        return (useTestEnvironment, sourceStationId, apiToken);
    }

    private async Task<DaDataAddressSuggestion?> TryResolveAddressAsync(string address, CancellationToken cancellationToken)
    {
        try
        {
            var suggestions = await _daDataAddressSuggestService.SuggestAsync(new AddressSuggestPayload(address, 1), cancellationToken);
            return suggestions.FirstOrDefault();
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return null;
        }
    }

    private async Task<IReadOnlyList<YandexPickupPointSummary>> DecoratePickupPointsWithQuotesAsync(
        IReadOnlyList<PickupPointDto> points,
        DaDataAddressSuggestion? resolvedAddress,
        string sourceStationId,
        string apiToken,
        bool useTestEnvironment,
        string paymentMethod,
        int totalWeightGrams,
        int totalAssessedPrice,
        int clientPrice,
        List<PricingPlace> places,
        CancellationToken cancellationToken)
    {
        using var semaphore = new SemaphoreSlim(4);

        var tasks = points.Select(async point =>
        {
            await semaphore.WaitAsync(cancellationToken);
            try
            {
                return await TryBuildPickupPointSummaryAsync(
                    point,
                    resolvedAddress,
                    sourceStationId,
                    apiToken,
                    useTestEnvironment,
                    paymentMethod,
                    totalWeightGrams,
                    totalAssessedPrice,
                    clientPrice,
                    places,
                    cancellationToken);
            }
            finally
            {
                semaphore.Release();
            }
        });

        var results = await Task.WhenAll(tasks);

        return results
            .OrderByDescending(static point => point.Available)
            .ThenBy(point => point.DistanceKm ?? double.MaxValue)
            .ThenBy(point => point.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private async Task<YandexPickupPointSummary> TryBuildPickupPointSummaryAsync(
        PickupPointDto point,
        DaDataAddressSuggestion? resolvedAddress,
        string sourceStationId,
        string apiToken,
        bool useTestEnvironment,
        string paymentMethod,
        int totalWeightGrams,
        int totalAssessedPrice,
        int clientPrice,
        List<PricingPlace> places,
        CancellationToken cancellationToken)
    {
        var summary = MapPickupPointSummary(point, resolvedAddress);
        if (string.IsNullOrWhiteSpace(summary.Id))
            return summary with { Error = "ПВЗ не содержит идентификатор." };

        var quote = await TryCalculateSelectedPickupPointDeliveryAsync(
            summary.Id,
            point,
            resolvedAddress,
            sourceStationId,
            apiToken,
            useTestEnvironment,
            paymentMethod,
            totalWeightGrams,
            totalAssessedPrice,
            clientPrice,
            places,
            cancellationToken);

        return ApplyQuote(summary, quote);
    }

    private async Task<PickupPointDto?> TryGetPickupPointByIdAsync(
        string pickupPointId,
        string apiToken,
        bool useTestEnvironment,
        DaDataAddressSuggestion? resolvedAddress,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await SendAsync<PickupPointsListResponse>(
                "/api/b2b/platform/pickup-points/list",
                new PickupPointsListRequest(
                    PickupPointIds: [pickupPointId],
                    GeoId: null,
                    Type: "pickup_point",
                    PaymentMethods: []),
                apiToken,
                useTestEnvironment,
                cancellationToken);

            return response.Points?
                .Where(point => string.Equals(point.Id, pickupPointId, StringComparison.OrdinalIgnoreCase))
                .OrderBy(point => CalculateDistanceKm(point.Position, resolvedAddress) ?? double.MaxValue)
                .FirstOrDefault();
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return null;
        }
    }

    private async Task<List<PickupPointDto>> GetPickupPointsAsync(
        string locationSearchText,
        DaDataAddressSuggestion? resolvedAddress,
        string apiToken,
        bool useTestEnvironment,
        string paymentMethod,
        CancellationToken cancellationToken)
    {
        var latitude = ParseCoordinate(resolvedAddress?.GeoLat);
        var longitude = ParseCoordinate(resolvedAddress?.GeoLon);

        if (latitude.HasValue && longitude.HasValue)
        {
            var response = await SendAsync<PickupPointsListResponse>(
                "/api/b2b/platform/pickup-points/list",
                new PickupPointsListRequest(
                    PickupPointIds: null,
                    GeoId: null,
                    Type: "pickup_point",
                    PaymentMethods: [paymentMethod],
                    Latitude: BuildCoordinateInterval(latitude.Value, 0.35d, -90d, 90d),
                    Longitude: BuildCoordinateInterval(longitude.Value, 0.35d, -180d, 180d)),
                apiToken,
                useTestEnvironment,
                cancellationToken);

            if (response.Points?.Count > 0)
                return response.Points;
        }

        var geoId = await ResolveGeoIdAsync(locationSearchText, apiToken, useTestEnvironment, cancellationToken);
        if (!geoId.HasValue)
            return [];

        var geoResponse = await SendAsync<PickupPointsListResponse>(
            "/api/b2b/platform/pickup-points/list",
            new PickupPointsListRequest(
                PickupPointIds: null,
                GeoId: geoId,
                Type: "pickup_point",
                PaymentMethods: [paymentMethod]),
            apiToken,
            useTestEnvironment,
            cancellationToken);

        return geoResponse.Points ?? [];
    }

    private async Task<int?> ResolveGeoIdAsync(
        string locationSearchText,
        string apiToken,
        bool useTestEnvironment,
        CancellationToken cancellationToken)
    {
        var normalizedLocation = locationSearchText?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedLocation))
            return null;

        var response = await SendAsync<LocationDetectResponse>(
            "/api/b2b/platform/location/detect",
            new LocationDetectRequest(normalizedLocation),
            apiToken,
            useTestEnvironment,
            cancellationToken);

        return response.Variants?
            .Select(static item => item.GeoId)
            .FirstOrDefault(id => id > 0);
    }

    private async Task<YandexDeliveryQuoteOptionResult> TryCalculateHomeDeliveryAsync(
        string destinationAddress,
        string sourceStationId,
        string apiToken,
        bool useTestEnvironment,
        string paymentMethod,
        int totalWeightGrams,
        int totalAssessedPrice,
        int clientPrice,
        List<PricingPlace> places,
        CancellationToken cancellationToken)
    {
        try
        {
            return await CalculateHomeDeliveryAsync(
                destinationAddress,
                sourceStationId,
                apiToken,
                useTestEnvironment,
                paymentMethod,
                totalWeightGrams,
                totalAssessedPrice,
                clientPrice,
                places,
                cancellationToken);
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            if (!string.Equals(paymentMethod, "already_paid", StringComparison.Ordinal))
            {
                try
                {
                    return await CalculateHomeDeliveryAsync(
                        destinationAddress,
                        sourceStationId,
                        apiToken,
                        useTestEnvironment,
                        "already_paid",
                        totalWeightGrams,
                        totalAssessedPrice,
                        0,
                        places,
                        cancellationToken);
                }
                catch (Exception fallbackEx) when (fallbackEx is InvalidOperationException or HttpRequestException)
                {
                    return new YandexDeliveryQuoteOptionResult(
                        Available: false,
                        EstimatedCost: null,
                        DeliveryDays: null,
                        Tariff: "time_interval",
                        Error: fallbackEx.Message);
                }
            }

            return new YandexDeliveryQuoteOptionResult(
                Available: false,
                EstimatedCost: null,
                DeliveryDays: null,
                Tariff: "time_interval",
                Error: ex.Message);
        }
    }

    private async Task<YandexDeliveryPickupQuoteOptionResult> TryCalculateSelectedPickupPointDeliveryAsync(
        string pickupPointId,
        PickupPointDto? selectedPoint,
        DaDataAddressSuggestion? resolvedAddress,
        string sourceStationId,
        string apiToken,
        bool useTestEnvironment,
        string paymentMethod,
        int totalWeightGrams,
        int totalAssessedPrice,
        int clientPrice,
        List<PricingPlace> places,
        CancellationToken cancellationToken)
    {
        try
        {
            return await CalculateSelectedPickupPointDeliveryAsync(
                pickupPointId,
                selectedPoint,
                resolvedAddress,
                sourceStationId,
                apiToken,
                useTestEnvironment,
                paymentMethod,
                totalWeightGrams,
                totalAssessedPrice,
                clientPrice,
                places,
                cancellationToken);
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            if (!string.Equals(paymentMethod, "already_paid", StringComparison.Ordinal))
            {
                try
                {
                    return await CalculateSelectedPickupPointDeliveryAsync(
                        pickupPointId,
                        selectedPoint,
                        resolvedAddress,
                        sourceStationId,
                        apiToken,
                        useTestEnvironment,
                        "already_paid",
                        totalWeightGrams,
                        totalAssessedPrice,
                        0,
                        places,
                        cancellationToken);
                }
                catch (Exception fallbackEx) when (fallbackEx is InvalidOperationException or HttpRequestException)
                {
                    return new YandexDeliveryPickupQuoteOptionResult(
                        Available: false,
                        EstimatedCost: null,
                        DeliveryDays: null,
                        Tariff: "self_pickup",
                        Point: selectedPoint is null ? null : ApplyQuote(
                            MapPickupPointSummary(selectedPoint, resolvedAddress),
                            new YandexDeliveryPickupQuoteOptionResult(
                                Available: false,
                                EstimatedCost: null,
                                DeliveryDays: null,
                                Tariff: "self_pickup",
                                Point: null,
                                Error: fallbackEx.Message)),
                        Error: fallbackEx.Message);
                }
            }

            return new YandexDeliveryPickupQuoteOptionResult(
                Available: false,
                EstimatedCost: null,
                DeliveryDays: null,
                Tariff: "self_pickup",
                Point: selectedPoint is null ? null : ApplyQuote(
                    MapPickupPointSummary(selectedPoint, resolvedAddress),
                    new YandexDeliveryPickupQuoteOptionResult(
                        Available: false,
                        EstimatedCost: null,
                        DeliveryDays: null,
                        Tariff: "self_pickup",
                        Point: null,
                        Error: ex.Message)),
                Error: ex.Message);
        }
    }

    private static YandexDeliveryPickupQuoteOptionResult BuildUnselectedPickupPointResult()
    {
        return new YandexDeliveryPickupQuoteOptionResult(
            Available: false,
            EstimatedCost: null,
            DeliveryDays: null,
            Tariff: "self_pickup",
            Point: null,
            Error: null);
    }

    private async Task<YandexDeliveryQuoteOptionResult> CalculateHomeDeliveryAsync(
        string destinationAddress,
        string sourceStationId,
        string apiToken,
        bool useTestEnvironment,
        string paymentMethod,
        int totalWeightGrams,
        int totalAssessedPrice,
        int clientPrice,
        List<PricingPlace> places,
        CancellationToken cancellationToken)
    {
        var response = await SendAsync<PricingResponse>(
            "/api/b2b/platform/pricing-calculator",
            new PricingRequest(
                Source: new PricingSource(sourceStationId),
                Destination: new PricingDestination(Address: destinationAddress, PlatformStationId: null),
                Tariff: "time_interval",
                TotalWeight: totalWeightGrams,
                TotalAssessedPrice: totalAssessedPrice,
                ClientPrice: clientPrice,
                PaymentMethod: paymentMethod,
                Places: places),
            apiToken,
            useTestEnvironment,
            cancellationToken);

        return new YandexDeliveryQuoteOptionResult(
            Available: true,
            EstimatedCost: ParsePricingTotal(response.PricingTotal),
            DeliveryDays: response.DeliveryDays,
            Tariff: "time_interval");
    }

    private async Task<YandexDeliveryPickupQuoteOptionResult> CalculateSelectedPickupPointDeliveryAsync(
        string pickupPointId,
        PickupPointDto? selectedPoint,
        DaDataAddressSuggestion? resolvedAddress,
        string sourceStationId,
        string apiToken,
        bool useTestEnvironment,
        string paymentMethod,
        int totalWeightGrams,
        int totalAssessedPrice,
        int clientPrice,
        List<PricingPlace> places,
        CancellationToken cancellationToken)
    {
        var response = await SendAsync<PricingResponse>(
            "/api/b2b/platform/pricing-calculator",
            new PricingRequest(
                Source: new PricingSource(sourceStationId),
                Destination: new PricingDestination(
                    Address: ResolvePickupPointAddress(selectedPoint),
                    PlatformStationId: pickupPointId),
                Tariff: "self_pickup",
                TotalWeight: totalWeightGrams,
                TotalAssessedPrice: totalAssessedPrice,
                ClientPrice: clientPrice,
                PaymentMethod: paymentMethod,
                Places: places),
            apiToken,
            useTestEnvironment,
            cancellationToken);

        var estimatedCost = ParsePricingTotal(response.PricingTotal);
        var deliveryDays = response.DeliveryDays;

        return new YandexDeliveryPickupQuoteOptionResult(
            Available: true,
            EstimatedCost: estimatedCost,
            DeliveryDays: deliveryDays,
            Tariff: "self_pickup",
            Point: selectedPoint is null ? null : ApplyQuote(
                MapPickupPointSummary(selectedPoint, resolvedAddress),
                new YandexDeliveryPickupQuoteOptionResult(
                    Available: true,
                    EstimatedCost: estimatedCost,
                    DeliveryDays: deliveryDays,
                    Tariff: "self_pickup",
                    Point: null)),
            Error: null);
    }

    private async Task<TResponse> SendAsync<TResponse>(
        string path,
        object payload,
        string apiToken,
        bool useTestEnvironment,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{GetBaseUrl(useTestEnvironment)}{path}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiToken);
        request.Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var responseText = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException(BuildApiErrorMessage(response.StatusCode, responseText));
        }

        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var parsedResponse = await JsonSerializer.DeserializeAsync<TResponse>(responseStream, JsonOptions, cancellationToken);
        return parsedResponse
            ?? throw new HttpRequestException("Яндекс.Доставка вернула пустой ответ.");
    }

    private async Task<(int Dx, int Dy, int Dz)> ResolvePackageDimensionsAsync(CancellationToken cancellationToken)
    {
        var dx = await GetIntSettingAsync(
            "yandex_delivery_package_length_cm",
            "Integrations:YandexDelivery:PackageLengthCm",
            30,
            cancellationToken);
        var dy = await GetIntSettingAsync(
            "yandex_delivery_package_height_cm",
            "Integrations:YandexDelivery:PackageHeightCm",
            20,
            cancellationToken);
        var dz = await GetIntSettingAsync(
            "yandex_delivery_package_width_cm",
            "Integrations:YandexDelivery:PackageWidthCm",
            10,
            cancellationToken);

        return (Math.Max(dx, 1), Math.Max(dy, 1), Math.Max(dz, 1));
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

    private async Task<bool> GetBooleanSettingAsync(string key, string configPath, bool fallback, CancellationToken cancellationToken)
    {
        var raw = await GetSettingOrConfigAsync(key, configPath, cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
            return fallback;

        return raw.Trim().ToLowerInvariant() switch
        {
            "1" => true,
            "true" => true,
            "yes" => true,
            "on" => true,
            "0" => false,
            "false" => false,
            "no" => false,
            "off" => false,
            _ => fallback
        };
    }

    private async Task<int> GetIntSettingAsync(string key, string configPath, int fallback, CancellationToken cancellationToken)
    {
        var raw = await GetSettingOrConfigAsync(key, configPath, cancellationToken);
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedValue) && parsedValue > 0
            ? parsedValue
            : fallback;
    }

    private static List<PricingPlace> BuildPlaces(int totalWeightGrams, (int Dx, int Dy, int Dz) dimensions)
    {
        return
        [
            new PricingPlace(
                PhysicalDims: new PricingPhysicalDimensions(
                    WeightGross: totalWeightGrams,
                    Dx: dimensions.Dx,
                    Dy: dimensions.Dy,
                    Dz: dimensions.Dz))
        ];
    }

    private static CoordinateInterval BuildCoordinateInterval(double center, double delta, double min, double max)
    {
        var from = Math.Max(min, center - delta);
        var to = Math.Min(max, center + delta);
        return new CoordinateInterval(from, to);
    }

    private static YandexPickupPointSummary MapPickupPointSummary(PickupPointDto point, DaDataAddressSuggestion? resolvedAddress)
    {
        return new YandexPickupPointSummary(
            Id: point.Id?.Trim() ?? string.Empty,
            Name: point.Name?.Trim() ?? "Пункт выдачи заказов",
            Address: ResolvePickupPointAddress(point),
            Instruction: NormalizeOptionalText(point.Instruction),
            Latitude: point.Position?.Latitude,
            Longitude: point.Position?.Longitude,
            DistanceKm: CalculateDistanceKm(point.Position, resolvedAddress),
            PaymentMethods: point.PaymentMethods?
                .Where(static method => !string.IsNullOrWhiteSpace(method))
                .Select(static method => method!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray());
    }

    private static YandexPickupPointSummary ApplyQuote(YandexPickupPointSummary point, YandexDeliveryPickupQuoteOptionResult quote)
    {
        return point with
        {
            Available = quote.Available,
            EstimatedCost = quote.EstimatedCost,
            DeliveryDays = quote.DeliveryDays,
            Error = quote.Error
        };
    }

    private static double? CalculateDistanceKm(PickupPointGeoPositionDto? pointPosition, DaDataAddressSuggestion? resolvedAddress)
    {
        if (pointPosition?.Latitude is null || pointPosition.Longitude is null)
            return null;

        var addressLatitude = ParseCoordinate(resolvedAddress?.GeoLat);
        var addressLongitude = ParseCoordinate(resolvedAddress?.GeoLon);
        if (!addressLatitude.HasValue || !addressLongitude.HasValue)
            return null;

        return Math.Round(
            CalculateDistanceKm(
                addressLatitude.Value,
                addressLongitude.Value,
                pointPosition.Latitude.Value,
                pointPosition.Longitude.Value),
            2,
            MidpointRounding.AwayFromZero);
    }

    private static double CalculateDistanceKm(double latitude1, double longitude1, double latitude2, double longitude2)
    {
        const double earthRadiusKm = 6371d;
        var dLatitude = DegreesToRadians(latitude2 - latitude1);
        var dLongitude = DegreesToRadians(longitude2 - longitude1);
        var latitude1Rad = DegreesToRadians(latitude1);
        var latitude2Rad = DegreesToRadians(latitude2);

        var haversine = Math.Sin(dLatitude / 2) * Math.Sin(dLatitude / 2)
                        + Math.Cos(latitude1Rad) * Math.Cos(latitude2Rad)
                        * Math.Sin(dLongitude / 2) * Math.Sin(dLongitude / 2);
        var arc = 2 * Math.Atan2(Math.Sqrt(haversine), Math.Sqrt(1 - haversine));
        return earthRadiusKm * arc;
    }

    private static double DegreesToRadians(double degrees) => degrees * Math.PI / 180d;

    private static string ResolvePickupPointAddress(PickupPointDto? point)
    {
        var fullAddress = point?.Address?.FullAddress?.Trim();
        if (!string.IsNullOrWhiteSpace(fullAddress))
            return fullAddress!;

        var parts = new[]
        {
            point?.Address?.Locality?.Trim(),
            point?.Address?.Street?.Trim(),
            point?.Address?.House?.Trim()
        }
        .Where(static item => !string.IsNullOrWhiteSpace(item));

        return string.Join(", ", parts);
    }

    private static string GetBaseUrl(bool useTestEnvironment)
        => useTestEnvironment
            ? "https://b2b.taxi.tst.yandex.net"
            : "https://b2b-authproxy.taxi.yandex.net";

    private static string NormalizePaymentMethod(string? paymentMethod)
    {
        var normalized = paymentMethod?.Trim().ToLowerInvariant();
        return normalized switch
        {
            "cod" => "card_on_receipt",
            "cash" => "card_on_receipt",
            "card_on_receipt" => "card_on_receipt",
            _ => "already_paid"
        };
    }

    private static decimal NormalizeWeight(decimal? requestedWeightKg)
    {
        var value = requestedWeightKg.GetValueOrDefault(0.3m);
        if (value <= 0m)
            value = 0.3m;

        return Math.Round(value, 3, MidpointRounding.AwayFromZero);
    }

    private static decimal NormalizeMoney(decimal? value)
    {
        var normalized = value.GetValueOrDefault();
        if (normalized < 0m)
            normalized = 0m;

        return Math.Round(normalized, 2, MidpointRounding.AwayFromZero);
    }

    private static int ToGrams(decimal weightKg)
        => Math.Max(1, (int)Math.Round(weightKg * 1000m, MidpointRounding.AwayFromZero));

    private static int ToMinorUnits(decimal amount)
        => Math.Max(0, (int)Math.Round(amount * 100m, MidpointRounding.AwayFromZero));

    private static decimal ParsePricingTotal(string? pricingTotal)
    {
        var raw = pricingTotal?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(raw))
            throw new InvalidOperationException("Яндекс.Доставка не вернула стоимость доставки.");

        var match = System.Text.RegularExpressions.Regex.Match(raw, @"-?\d+(?:[.,]\d+)?");
        if (!match.Success)
            throw new InvalidOperationException($"Не удалось разобрать стоимость доставки: {raw}");

        var numericPart = match.Value.Replace(',', '.');
        if (!decimal.TryParse(numericPart, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsedValue))
            throw new InvalidOperationException($"Не удалось разобрать стоимость доставки: {raw}");

        return Math.Round(parsedValue, 2, MidpointRounding.AwayFromZero);
    }

    private static string BuildApiErrorMessage(HttpStatusCode statusCode, string? responseBody)
    {
        var normalizedBody = NormalizeOptionalText(responseBody);
        if (string.IsNullOrWhiteSpace(normalizedBody))
            return $"Яндекс.Доставка вернула ошибку {(int)statusCode}.";

        var compactBody = normalizedBody.Length > 300
            ? normalizedBody[..300]
            : normalizedBody;

        return $"Яндекс.Доставка вернула ошибку {(int)statusCode}: {compactBody}";
    }

    private static string BuildFriendlyApiErrorMessage(HttpStatusCode statusCode, string? responseBody)
    {
        var normalizedBody = NormalizeOptionalText(responseBody);
        if (string.IsNullOrWhiteSpace(normalizedBody))
            return $"Яндекс.Доставка вернула ошибку {(int)statusCode}.";

        try
        {
            using var document = JsonDocument.Parse(normalizedBody);
            var root = document.RootElement;
            var code = root.TryGetProperty("code", out var codeElement)
                ? NormalizeOptionalText(codeElement.GetString())
                : null;
            var message = root.TryGetProperty("message", out var messageElement)
                ? NormalizeOptionalText(messageElement.GetString())
                : null;

            if (statusCode == HttpStatusCode.TooManyRequests
                || string.Equals(code, "429", StringComparison.OrdinalIgnoreCase)
                || string.Equals(message, "Too Many Requests", StringComparison.OrdinalIgnoreCase))
            {
                return "Яндекс.Доставка временно ограничила количество запросов. Попробуйте повторить через несколько секунд.";
            }

            if (string.Equals(code, "no_delivery_options", StringComparison.OrdinalIgnoreCase))
                return "Для этого адреса или ПВЗ Яндекс не вернул доступный тариф.";

            if (string.Equals(code, "validation_error", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(message))
                return $"Яндекс.Доставка отклонила запрос: {message}";
        }
        catch (JsonException)
        {
            // Fall back to a compact raw message below for non-JSON responses.
        }

        var compactBody = normalizedBody.Length > 300
            ? normalizedBody[..300]
            : normalizedBody;

        return $"Яндекс.Доставка вернула ошибку {(int)statusCode}: {compactBody}";
    }

    private static string? NormalizeOptionalText(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static double? ParseCoordinate(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
            return null;

        var normalized = rawValue.Trim().Replace(',', '.');
        return double.TryParse(normalized, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsedValue)
            ? parsedValue
            : null;
    }

    private sealed record LocationDetectRequest(string Location);

    private sealed record LocationDetectResponse(
        [property: JsonPropertyName("variants")]
        List<LocationDetectVariant>? Variants);

    private sealed record LocationDetectVariant(
        [property: JsonPropertyName("geo_id")]
        int GeoId,
        [property: JsonPropertyName("address")]
        string? Address);

    private sealed record PickupPointsListRequest(
        [property: JsonPropertyName("pickup_point_ids")]
        List<string>? PickupPointIds,
        [property: JsonPropertyName("geo_id")]
        int? GeoId,
        [property: JsonPropertyName("type")]
        string Type,
        [property: JsonPropertyName("payment_methods")]
        List<string> PaymentMethods,
        [property: JsonPropertyName("latitude")]
        CoordinateInterval? Latitude = null,
        [property: JsonPropertyName("longitude")]
        CoordinateInterval? Longitude = null);

    private sealed record CoordinateInterval(
        [property: JsonPropertyName("from")]
        double From,
        [property: JsonPropertyName("to")]
        double To);

    private sealed record PickupPointsListResponse(
        [property: JsonPropertyName("points")]
        List<PickupPointDto>? Points);

    private sealed record PickupPointDto(
        [property: JsonPropertyName("id")]
        string? Id,
        [property: JsonPropertyName("name")]
        string? Name,
        [property: JsonPropertyName("position")]
        PickupPointGeoPositionDto? Position,
        [property: JsonPropertyName("address")]
        PickupPointAddressDto? Address,
        [property: JsonPropertyName("instruction")]
        string? Instruction,
        [property: JsonPropertyName("payment_methods")]
        List<string?>? PaymentMethods);

    private sealed record PickupPointGeoPositionDto(
        [property: JsonPropertyName("latitude")]
        double? Latitude,
        [property: JsonPropertyName("longitude")]
        double? Longitude);

    private sealed record PickupPointAddressDto(
        [property: JsonPropertyName("full_address")]
        string? FullAddress,
        [property: JsonPropertyName("locality")]
        string? Locality,
        [property: JsonPropertyName("street")]
        string? Street,
        [property: JsonPropertyName("house")]
        string? House);

    private sealed record PricingRequest(
        [property: JsonPropertyName("source")]
        PricingSource Source,
        [property: JsonPropertyName("destination")]
        PricingDestination Destination,
        [property: JsonPropertyName("tariff")]
        string Tariff,
        [property: JsonPropertyName("total_weight")]
        int TotalWeight,
        [property: JsonPropertyName("total_assessed_price")]
        int TotalAssessedPrice,
        [property: JsonPropertyName("client_price")]
        int ClientPrice,
        [property: JsonPropertyName("payment_method")]
        string PaymentMethod,
        [property: JsonPropertyName("places")]
        List<PricingPlace> Places);

    private sealed record PricingSource(
        [property: JsonPropertyName("platform_station_id")]
        string PlatformStationId);

    private sealed record PricingDestination(
        [property: JsonPropertyName("address")]
        string? Address,
        [property: JsonPropertyName("platform_station_id")]
        string? PlatformStationId);

    private sealed record PricingPlace(
        [property: JsonPropertyName("physical_dims")]
        PricingPhysicalDimensions PhysicalDims);

    private sealed record PricingPhysicalDimensions(
        [property: JsonPropertyName("weight_gross")]
        int WeightGross,
        [property: JsonPropertyName("dx")]
        int Dx,
        [property: JsonPropertyName("dy")]
        int Dy,
        [property: JsonPropertyName("dz")]
        int Dz);

    private sealed record PricingResponse(
        [property: JsonPropertyName("pricing_total")]
        string? PricingTotal,
        [property: JsonPropertyName("delivery_days")]
        int? DeliveryDays);
}
