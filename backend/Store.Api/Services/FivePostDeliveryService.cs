using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Store.Api.Contracts;
using Store.Api.Data;

namespace Store.Api.Services;

public interface IFivePostDeliveryService
{
    Task<DeliveryProviderQuoteResult?> TryCalculateAsync(DeliveryCalculatePayload payload, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsAsync(DeliveryPickupPointsPayload payload, CancellationToken cancellationToken = default);
    Task<FivePostAdminTestResult> TestIntegrationAsync(FivePostDeliveryAdminTestPayload payload, CancellationToken cancellationToken = default);
}

public sealed record FivePostAdminTestResult(
    string Provider,
    string Environment,
    string DestinationAddress,
    decimal PickupCost,
    int DeliveryDays,
    int MarkerCount,
    DeliveryProviderQuoteResult Quote,
    IReadOnlyList<DeliveryPickupPointSummary> PickupPoints,
    string Note);

public sealed record FivePostIntegrationOverrides(
    bool Enabled,
    decimal? PickupCost,
    int? DeliveryDays);

public sealed class FivePostDeliveryService : IFivePostDeliveryService
{
    private const string ProviderCode = "fivepost";
    private const string MarkerCacheKey = "fivepost:public-markers";
    private static readonly TimeSpan MarkerCacheTtl = TimeSpan.FromHours(6);
    private static readonly TimeSpan DetailsCacheTtl = TimeSpan.FromMinutes(20);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly IDaDataAddressSuggestService _daDataAddressSuggestService;
    private readonly IMemoryCache _cache;

    public FivePostDeliveryService(
        IHttpClientFactory httpClientFactory,
        StoreDbContext db,
        IConfiguration configuration,
        IDaDataAddressSuggestService daDataAddressSuggestService,
        IMemoryCache cache)
    {
        _httpClientFactory = httpClientFactory;
        _db = db;
        _configuration = configuration;
        _daDataAddressSuggestService = daDataAddressSuggestService;
        _cache = cache;
    }

    public async Task<DeliveryProviderQuoteResult?> TryCalculateAsync(
        DeliveryCalculatePayload payload,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await CalculateInternalAsync(payload, overrides: null, cancellationToken);
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return null;
        }
    }

    public async Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsAsync(
        DeliveryPickupPointsPayload payload,
        CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(null, cancellationToken);
        return await ListPickupPointsInternalAsync(payload, settings, cancellationToken);
    }

    public async Task<FivePostAdminTestResult> TestIntegrationAsync(
        FivePostDeliveryAdminTestPayload payload,
        CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(new FivePostIntegrationOverrides(
            payload.Enabled,
            payload.PickupCost,
            payload.DeliveryDays), cancellationToken);

        var quote = await CalculateWithSettingsAsync(
            new DeliveryCalculatePayload(
                payload.ToAddress,
                payload.WeightKg,
                payload.DeclaredCost,
                payload.PaymentMethod),
            settings,
            cancellationToken);

        var points = await ListPickupPointsInternalAsync(
            new DeliveryPickupPointsPayload(
                ProviderCode,
                payload.ToAddress,
                payload.PaymentMethod,
                payload.Limit,
                payload.WeightKg,
                payload.DeclaredCost),
            settings,
            cancellationToken);

        var markerCount = await GetMarkerCountAsync(cancellationToken);

        return new FivePostAdminTestResult(
            Provider: ProviderCode,
            Environment: "public_points_api",
            DestinationAddress: payload.ToAddress.Trim(),
            PickupCost: settings.PickupCost!.Value,
            DeliveryDays: settings.DeliveryDays!.Value,
            MarkerCount: markerCount,
            Quote: quote,
            PickupPoints: points,
            Note: "Используется публичная карта точек 5Post. Автосоздание отправлений и тестовый merchant-контур в этой интеграции пока не подключены.");
    }

    private async Task<DeliveryProviderQuoteResult> CalculateInternalAsync(
        DeliveryCalculatePayload payload,
        FivePostIntegrationOverrides? overrides,
        CancellationToken cancellationToken)
    {
        var settings = overrides ?? await ResolveSettingsAsync(null, cancellationToken);
        return await CalculateWithSettingsAsync(payload, settings, cancellationToken);
    }

    private async Task<DeliveryProviderQuoteResult> CalculateWithSettingsAsync(
        DeliveryCalculatePayload payload,
        FivePostIntegrationOverrides settings,
        CancellationToken cancellationToken)
    {
        var destinationAddress = payload.ToAddress?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(destinationAddress))
            throw new InvalidOperationException("Укажите адрес доставки для 5Post.");

        var nearestPoint = (await ListPickupPointsInternalAsync(
            new DeliveryPickupPointsPayload(
                ProviderCode,
                destinationAddress,
                payload.PaymentMethod,
                Limit: 1,
                payload.WeightKg,
                payload.DeclaredCost),
            settings,
            cancellationToken))
            .FirstOrDefault();

        var pickupAvailable = nearestPoint is not null;
        var pickupError = pickupAvailable
            ? null
            : "5Post не нашёл доступные пункты выдачи или постаматы для указанного адреса.";

        return new DeliveryProviderQuoteResult(
            Provider: ProviderCode,
            Label: "5Post",
            Currency: "RUB",
            HomeDelivery: new DeliveryQuoteOptionSummary(
                Available: false,
                EstimatedCost: null,
                DeliveryDays: null,
                Tariff: "fivepost_home",
                Error: "5Post в этом проекте подключён только для ПВЗ и постаматов."),
            PickupPointDelivery: new DeliveryPickupQuoteSummary(
                Available: pickupAvailable,
                EstimatedCost: pickupAvailable ? settings.PickupCost : null,
                DeliveryDays: pickupAvailable ? settings.DeliveryDays : null,
                Tariff: "fivepost_pickup",
                Point: nearestPoint,
                Error: pickupError),
            Details: new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["source"] = "fivepost_public_points_api",
                ["pickupCost"] = settings.PickupCost!.Value.ToString(CultureInfo.InvariantCulture),
                ["deliveryDays"] = settings.DeliveryDays!.Value.ToString(CultureInfo.InvariantCulture)
            });
    }

    private async Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsInternalAsync(
        DeliveryPickupPointsPayload payload,
        FivePostIntegrationOverrides settings,
        CancellationToken cancellationToken)
    {
        var destinationAddress = payload.ToAddress?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(destinationAddress))
            throw new InvalidOperationException("Укажите адрес доставки для поиска точек 5Post.");

        var requestedLimit = Math.Clamp(payload.Limit ?? 8, 1, 30);
        var detailLookupLimit = Math.Clamp(Math.Max(requestedLimit * 4, 16), requestedLimit, 48);

        var markers = await GetMarkersAsync(cancellationToken);
        if (markers.Count == 0)
            throw new HttpRequestException("5Post не вернул публичную карту пунктов выдачи.");

        var resolvedAddress = await TryResolveAddressAsync(destinationAddress, cancellationToken);
        var hasGeo = TryGetCoordinates(resolvedAddress, out var destinationLatitude, out var destinationLongitude);
        var searchContext = BuildSearchContext(resolvedAddress, destinationAddress);

        var candidates = markers
            .Select(marker =>
            {
                var distanceKm = hasGeo && marker.Latitude.HasValue && marker.Longitude.HasValue
                    ? Math.Round(
                        CalculateDistanceKm(
                            destinationLatitude,
                            destinationLongitude,
                            marker.Latitude.Value,
                            marker.Longitude.Value),
                        2,
                        MidpointRounding.AwayFromZero)
                    : (double?)null;

                return new FivePostCandidate(
                    marker,
                    distanceKm,
                    CalculateSearchScore(marker, searchContext));
            })
            .Where(candidate => hasGeo || candidate.SearchScore > 0)
            .OrderBy(candidate => hasGeo ? 0 : 1)
            .ThenBy(candidate => candidate.DistanceKm ?? double.MaxValue)
            .ThenByDescending(candidate => candidate.SearchScore)
            .ThenBy(candidate => candidate.Marker.Address, StringComparer.OrdinalIgnoreCase)
            .Take(detailLookupLimit)
            .ToList();

        if (candidates.Count == 0)
            throw new InvalidOperationException("5Post не смог подобрать точки по адресу. Уточните адрес доставки.");

        var candidateMap = candidates.ToDictionary(candidate => candidate.Marker.Id, StringComparer.OrdinalIgnoreCase);
        var details = await GetPickupPointDetailsAsync(candidates.Select(candidate => candidate.Marker.Id).ToArray(), cancellationToken);

        var points = details
            .Select(detail =>
            {
                if (!candidateMap.TryGetValue(detail.Id, out var candidate))
                    return null;

                return new DeliveryPickupPointSummary(
                    Id: detail.Id,
                    Name: BuildPointName(detail),
                    Address: NormalizeOptionalText(detail.FullAddress) ?? candidate.Marker.Address,
                    Instruction: BuildInstruction(detail),
                    Latitude: candidate.Marker.Latitude,
                    Longitude: candidate.Marker.Longitude,
                    DistanceKm: candidate.DistanceKm,
                    PaymentMethods: BuildPaymentMethods(detail),
                    Available: true,
                    EstimatedCost: settings.PickupCost,
                    DeliveryDays: settings.DeliveryDays,
                    Error: null);
            })
            .Where(static point => point is not null)
            .Select(static point => point!)
            .DistinctBy(static point => point.Id, StringComparer.OrdinalIgnoreCase)
            .OrderBy(static point => point.DistanceKm.HasValue ? 0 : 1)
            .ThenBy(static point => point.DistanceKm ?? double.MaxValue)
            .ThenBy(static point => point.Name, StringComparer.OrdinalIgnoreCase)
            .Take(requestedLimit)
            .ToList();

        if (points.Count == 0)
            throw new InvalidOperationException("5Post не вернул детали пунктов выдачи для выбранного адреса.");

        return points;
    }

    private async Task<FivePostIntegrationOverrides> ResolveSettingsAsync(
        FivePostIntegrationOverrides? overrides,
        CancellationToken cancellationToken)
    {
        if (overrides is not null)
            return ValidateSettings(overrides);

        var enabled = await GetBooleanSettingAsync(
            "delivery_fivepost_enabled",
            "Integrations:FivePost:Enabled",
            fallback: false,
            cancellationToken);
        var pickupCost = await GetDecimalSettingAsync(
            "delivery_fivepost_pickup_cost",
            "Integrations:FivePost:PickupCost",
            fallback: 0m,
            cancellationToken);
        var deliveryDays = await GetIntSettingAsync(
            "delivery_fivepost_delivery_days",
            "Integrations:FivePost:DeliveryDays",
            fallback: 0,
            cancellationToken);

        return ValidateSettings(new FivePostIntegrationOverrides(enabled, pickupCost, deliveryDays));
    }

    private static FivePostIntegrationOverrides ValidateSettings(FivePostIntegrationOverrides settings)
    {
        if (!settings.Enabled)
            throw new InvalidOperationException("5Post выключен в настройках.");

        var pickupCost = settings.PickupCost.GetValueOrDefault();
        if (pickupCost <= 0m)
            throw new InvalidOperationException("Для 5Post укажите стоимость доставки до ПВЗ/постамата.");

        var deliveryDays = settings.DeliveryDays.GetValueOrDefault();
        if (deliveryDays <= 0)
            throw new InvalidOperationException("Для 5Post укажите срок доставки в днях.");

        return new FivePostIntegrationOverrides(true, pickupCost, deliveryDays);
    }

    private async Task<IReadOnlyList<FivePostMarker>> GetMarkersAsync(CancellationToken cancellationToken)
    {
        if (_cache.TryGetValue(MarkerCacheKey, out IReadOnlyList<FivePostMarker>? cachedMarkers) && cachedMarkers is not null)
            return cachedMarkers;

        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://fivepost.ru/api/public/geo/markers/");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(BuildHttpError("5Post не вернул публичную карту пунктов выдачи", response.StatusCode, body));

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
        var markers = new List<FivePostMarker>();
        if (TryGetProperty(document.RootElement, "features") is not { ValueKind: JsonValueKind.Array } features)
            return Array.Empty<FivePostMarker>();

        foreach (var feature in features.EnumerateArray())
        {
            var options = TryGetProperty(feature, "options");
            var geometry = TryGetProperty(feature, "geometry");
            var id = NormalizeOptionalText(GetString(options, "id"));
            var address = NormalizeOptionalText(GetString(options, "address"));
            var preset = NormalizeOptionalText(GetString(options, "preset"));
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(address))
                continue;

            var (latitude, longitude) = ReadCoordinates(geometry);
            markers.Add(new FivePostMarker(
                id!,
                address!,
                preset,
                latitude,
                longitude,
                NormalizeSearchText(address)));
        }

        _cache.Set(MarkerCacheKey, markers, MarkerCacheTtl);
        return markers;
    }

    private async Task<int> GetMarkerCountAsync(CancellationToken cancellationToken)
        => (await GetMarkersAsync(cancellationToken)).Count;

    private async Task<IReadOnlyList<FivePostPointDetail>> GetPickupPointDetailsAsync(
        IReadOnlyList<string> ids,
        CancellationToken cancellationToken)
    {
        var normalizedIds = ids
            .Select(NormalizeOptionalText)
            .Where(static id => !string.IsNullOrWhiteSpace(id))
            .Select(static id => id!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (normalizedIds.Length == 0)
            return Array.Empty<FivePostPointDetail>();

        var cacheKey = $"fivepost:details:{string.Join(",", normalizedIds.OrderBy(static id => id, StringComparer.OrdinalIgnoreCase))}";
        if (_cache.TryGetValue(cacheKey, out IReadOnlyList<FivePostPointDetail>? cachedDetails) && cachedDetails is not null)
            return cachedDetails;

        var builder = new StringBuilder("https://fivepost.ru/api/public/pickpoints/?");
        for (var index = 0; index < normalizedIds.Length; index++)
        {
            if (index > 0)
                builder.Append('&');
            builder.Append("id=");
            builder.Append(Uri.EscapeDataString(normalizedIds[index]));
        }

        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, builder.ToString());
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(BuildHttpError("5Post не вернул детали пунктов выдачи", response.StatusCode, body));

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "[]" : body);
        var details = new List<FivePostPointDetail>();
        if (document.RootElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in document.RootElement.EnumerateArray())
                TryAddPointDetail(details, item);
        }
        else if (document.RootElement.ValueKind == JsonValueKind.Object)
        {
            TryAddPointDetail(details, document.RootElement);
        }

        _cache.Set(cacheKey, details, DetailsCacheTtl);
        return details;
    }

    private static void TryAddPointDetail(List<FivePostPointDetail> items, JsonElement item)
    {
        var id = NormalizeOptionalText(GetString(item, "id"));
        var data = TryGetProperty(item, "data");
        if (string.IsNullOrWhiteSpace(id) || data is not { ValueKind: JsonValueKind.Object })
            return;

        items.Add(new FivePostPointDetail(
            Id: id!,
            Type: NormalizeOptionalText(GetString(data, "type")),
            FullAddress: NormalizeOptionalText(GetString(data, "fullAddress")),
            Additional: NormalizeOptionalText(GetString(data, "additional")),
            PartnerBrand: NormalizeOptionalText(GetString(data, "partnerBrand")),
            PartnerName: NormalizeOptionalText(GetString(data, "partnerName")),
            CardAllowed: GetBoolean(data, "cardAllowed") ?? false,
            CashAllowed: GetBoolean(data, "cashAllowed") ?? false,
            ReturnAllowed: GetBoolean(data, "returnAllowed") ?? false,
            C2CAllowed: GetBoolean(data, "c2cAllowed") ?? false,
            WorkHours: ReadWorkHours(data.Value)));
    }

    private async Task<DaDataAddressSuggestion?> TryResolveAddressAsync(string address, CancellationToken cancellationToken)
    {
        try
        {
            return (await _daDataAddressSuggestService
                .SuggestAsync(new AddressSuggestPayload(address, 1), cancellationToken))
                .FirstOrDefault();
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return null;
        }
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
        var value = await GetSettingOrConfigAsync(key, configPath, cancellationToken);
        if (string.IsNullOrWhiteSpace(value))
            return fallback;

        return value.Trim().ToLowerInvariant() switch
        {
            "1" or "true" or "yes" or "on" => true,
            "0" or "false" or "no" or "off" => false,
            _ => fallback
        };
    }

    private async Task<int> GetIntSettingAsync(string key, string configPath, int fallback, CancellationToken cancellationToken)
    {
        var value = await GetSettingOrConfigAsync(key, configPath, cancellationToken);
        return int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : fallback;
    }

    private async Task<decimal> GetDecimalSettingAsync(string key, string configPath, decimal fallback, CancellationToken cancellationToken)
    {
        var value = await GetSettingOrConfigAsync(key, configPath, cancellationToken);
        return decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var invariantParsed)
            || decimal.TryParse(value, NumberStyles.Any, CultureInfo.GetCultureInfo("ru-RU"), out invariantParsed)
            ? invariantParsed
            : fallback;
    }

    private static FivePostSearchContext BuildSearchContext(DaDataAddressSuggestion? resolvedAddress, string rawAddress)
    {
        var tokens = new List<string>();
        AddSearchToken(tokens, resolvedAddress?.PostalCode);
        AddSearchToken(tokens, resolvedAddress?.City);
        AddSearchToken(tokens, resolvedAddress?.Settlement);
        AddSearchToken(tokens, resolvedAddress?.Region);

        foreach (var part in rawAddress.Split([',', ';', '.', ' '], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            if (part.Length >= 4 || part.All(char.IsDigit))
                AddSearchToken(tokens, part);
        }

        return new FivePostSearchContext(
            NormalizeSearchText(resolvedAddress?.City),
            NormalizeSearchText(resolvedAddress?.Settlement),
            NormalizeSearchText(resolvedAddress?.Region),
            NormalizeSearchText(resolvedAddress?.PostalCode),
            tokens
                .Where(static token => !string.IsNullOrWhiteSpace(token))
                .Distinct(StringComparer.Ordinal)
                .Take(12)
                .ToArray());
    }

    private static int CalculateSearchScore(FivePostMarker marker, FivePostSearchContext context)
    {
        var score = 0;
        if (!string.IsNullOrWhiteSpace(context.PostalCode) && marker.SearchText.Contains(context.PostalCode, StringComparison.Ordinal))
            score += 120;
        if (!string.IsNullOrWhiteSpace(context.City) && marker.SearchText.Contains(context.City, StringComparison.Ordinal))
            score += 80;
        if (!string.IsNullOrWhiteSpace(context.Settlement) && marker.SearchText.Contains(context.Settlement, StringComparison.Ordinal))
            score += 70;
        if (!string.IsNullOrWhiteSpace(context.Region) && marker.SearchText.Contains(context.Region, StringComparison.Ordinal))
            score += 30;

        foreach (var token in context.Tokens)
        {
            if (!marker.SearchText.Contains(token, StringComparison.Ordinal))
                continue;

            score += token.All(char.IsDigit)
                ? 20
                : token.Length >= 8
                    ? 16
                    : 10;
        }

        return score;
    }

    private static string BuildPointName(FivePostPointDetail detail)
    {
        var baseName = detail.Type?.Trim().ToUpperInvariant() switch
        {
            "POSTAMAT" => "5Post: постамат",
            "TOBACCO" => "5Post: касса в магазине",
            _ => "5Post: пункт выдачи"
        };

        var suffix = NormalizeOptionalText(detail.PartnerBrand)
            ?? NormalizeOptionalText(detail.PartnerName);
        if (string.IsNullOrWhiteSpace(suffix)
            || string.Equals(suffix, "5Post", StringComparison.OrdinalIgnoreCase)
            || string.Equals(suffix, "Tobacco", StringComparison.OrdinalIgnoreCase))
        {
            return baseName;
        }

        return $"{baseName} ({suffix})";
    }

    private static string? BuildInstruction(FivePostPointDetail detail)
    {
        var segments = new List<string>();
        if (!string.IsNullOrWhiteSpace(detail.Additional))
            segments.Add(detail.Additional);

        var workHours = NormalizeOptionalText(string.Join("; ", detail.WorkHours.Where(static item => !string.IsNullOrWhiteSpace(item))));
        if (!string.IsNullOrWhiteSpace(workHours))
            segments.Add($"Часы работы: {workHours}");

        return segments.Count == 0 ? null : string.Join(" ", segments);
    }

    private static IReadOnlyList<string>? BuildPaymentMethods(FivePostPointDetail detail)
    {
        var methods = new List<string>();
        if (detail.CardAllowed)
            methods.Add("картой");
        if (detail.CashAllowed)
            methods.Add("наличными");
        return methods.Count == 0 ? null : methods;
    }

    private static IReadOnlyList<string> ReadWorkHours(JsonElement data)
    {
        if (TryGetProperty(data, "workHours") is not { ValueKind: JsonValueKind.Array } workHours)
            return Array.Empty<string>();

        return workHours
            .EnumerateArray()
            .Select(item =>
            {
                var day = NormalizeOptionalText(GetString(item, "day"));
                var opensAt = NormalizeOptionalText(GetString(item, "opensAt"));
                var closesAt = NormalizeOptionalText(GetString(item, "closesAt"));
                if (string.IsNullOrWhiteSpace(day) || string.IsNullOrWhiteSpace(opensAt) || string.IsNullOrWhiteSpace(closesAt))
                    return null;

                return $"{day}: {TrimTime(opensAt)}-{TrimTime(closesAt)}";
            })
            .Where(static value => !string.IsNullOrWhiteSpace(value))
            .Select(static value => value!)
            .ToArray();
    }

    private static string TrimTime(string value)
        => value.Length >= 5 ? value[..5] : value;

    private static (double? Latitude, double? Longitude) ReadCoordinates(JsonElement? geometry)
    {
        if (geometry is not { ValueKind: JsonValueKind.Object })
            return (null, null);

        if (TryGetProperty(geometry.Value, "coordinates") is not { ValueKind: JsonValueKind.Array } coordinates
            || coordinates.GetArrayLength() < 2)
        {
            return (null, null);
        }

        var latitude = GetDouble(coordinates[0]);
        var longitude = GetDouble(coordinates[1]);
        return (latitude, longitude);
    }

    private static bool TryGetCoordinates(
        DaDataAddressSuggestion? resolvedAddress,
        out double latitude,
        out double longitude)
    {
        var parsedLatitude = ParseCoordinate(resolvedAddress?.GeoLat);
        var parsedLongitude = ParseCoordinate(resolvedAddress?.GeoLon);
        latitude = parsedLatitude ?? 0d;
        longitude = parsedLongitude ?? 0d;
        return parsedLatitude.HasValue && parsedLongitude.HasValue;
    }

    private static double? ParseCoordinate(string? value)
        => double.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;

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

    private static string NormalizeSearchText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        return new string(value
            .Trim()
            .ToLowerInvariant()
            .Replace('ё', 'е')
            .Select(character => char.IsLetterOrDigit(character) ? character : ' ')
            .ToArray());
    }

    private static void AddSearchToken(List<string> tokens, string? value)
    {
        var normalized = NormalizeSearchText(value);
        if (string.IsNullOrWhiteSpace(normalized))
            return;

        foreach (var token in normalized.Split(' ', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            if (token.Length >= 4 || token.All(char.IsDigit))
                tokens.Add(token);
        }
    }

    private static string? NormalizeOptionalText(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static string BuildHttpError(string prefix, System.Net.HttpStatusCode statusCode, string? body)
    {
        var compactBody = string.IsNullOrWhiteSpace(body)
            ? string.Empty
            : $" {body.Trim()}";
        return $"{prefix}: {(int)statusCode}.{compactBody}".Trim();
    }

    private static JsonElement? TryGetProperty(JsonElement element, string propertyName)
        => element.ValueKind == JsonValueKind.Object && element.TryGetProperty(propertyName, out var property)
            ? property
            : null;

    private static string? GetString(JsonElement? element, string propertyName)
        => element is { ValueKind: JsonValueKind.Object } value
           && value.TryGetProperty(propertyName, out var property)
           && property.ValueKind != JsonValueKind.Null
            ? property.ToString()
            : null;

    private static bool? GetBoolean(JsonElement? element, string propertyName)
    {
        var raw = GetString(element, propertyName);
        return raw?.Trim().ToLowerInvariant() switch
        {
            "1" or "true" or "yes" or "on" => true,
            "0" or "false" or "no" or "off" => false,
            _ => null
        };
    }

    private static double? GetDouble(JsonElement element)
        => element.ValueKind == JsonValueKind.Number
            ? element.GetDouble()
            : double.TryParse(element.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
                ? parsed
                : null;

    private sealed record FivePostMarker(
        string Id,
        string Address,
        string? Preset,
        double? Latitude,
        double? Longitude,
        string SearchText);

    private sealed record FivePostPointDetail(
        string Id,
        string? Type,
        string? FullAddress,
        string? Additional,
        string? PartnerBrand,
        string? PartnerName,
        bool CardAllowed,
        bool CashAllowed,
        bool ReturnAllowed,
        bool C2CAllowed,
        IReadOnlyList<string> WorkHours);

    private sealed record FivePostCandidate(
        FivePostMarker Marker,
        double? DistanceKm,
        int SearchScore);

    private sealed record FivePostSearchContext(
        string City,
        string Settlement,
        string Region,
        string PostalCode,
        IReadOnlyList<string> Tokens);
}
