using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;

namespace Store.Api.Services;

public interface ICdekDeliveryService
{
    Task<DeliveryProviderQuoteResult?> TryCalculateAsync(DeliveryCalculatePayload payload, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsAsync(DeliveryPickupPointsPayload payload, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsForAdminAsync(CdekDeliveryPickupPointsAdminPayload payload, CancellationToken cancellationToken = default);
    Task<CdekAdminTestResult> TestIntegrationAsync(CdekDeliveryAdminTestPayload payload, CancellationToken cancellationToken = default);
}

public sealed record CdekAdminTestResult(
    bool TokenReceived,
    string Environment,
    string? CityCode,
    DeliveryProviderQuoteResult? Quote,
    IReadOnlyList<DeliveryPickupPointSummary> PickupPoints,
    string Note);

public sealed record CdekDeliveryIntegrationOverrides(
    bool Enabled,
    bool UseTestEnvironment,
    string? Account,
    string? Password,
    string? FromPostalCode,
    string? FromLocationType,
    string? FromAddress,
    string? FromPickupPointCode,
    int? PackageLengthCm,
    int? PackageHeightCm,
    int? PackageWidthCm);

public sealed class CdekDeliveryService : ICdekDeliveryService
{
    private enum CdekDeliveryPointUsage
    {
        DestinationHandout,
        OriginReception
    }

    private const string ProviderCode = "cdek";
    private const string TrainingCalculatorInternalErrorCode = "v2_internal_error";
    private const string TrainingCalculatorInternalAdditionalCode = "0xBC236B02";
    private const decimal TrainingFallbackCourierCost = 285m;
    private const decimal TrainingFallbackPickupCost = 140m;
    private const string TrainingFallbackCourierTariff = "137";
    private const string TrainingFallbackPickupTariff = "136";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly IDaDataAddressSuggestService _daDataAddressSuggestService;

    public CdekDeliveryService(
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
        return await ListPickupPointsInternalAsync(payload, settings, CdekDeliveryPointUsage.DestinationHandout, cancellationToken);
    }

    public async Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsForAdminAsync(
        CdekDeliveryPickupPointsAdminPayload payload,
        CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(new CdekDeliveryIntegrationOverrides(
            payload.Enabled,
            payload.UseTestEnvironment,
            payload.Account,
            payload.Password,
            payload.FromPostalCode,
            payload.FromLocationType,
            payload.FromAddress,
            payload.FromPickupPointCode,
            PackageLengthCm: null,
            PackageHeightCm: null,
            PackageWidthCm: null), cancellationToken, requirePickupPointCode: false);

        return await ListPickupPointsInternalAsync(
            new DeliveryPickupPointsPayload("cdek", payload.ToAddress, Limit: payload.Limit),
            settings,
            CdekDeliveryPointUsage.OriginReception,
            cancellationToken);
    }

    private async Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsInternalAsync(
        DeliveryPickupPointsPayload payload,
        CdekDeliveryIntegrationOverrides settings,
        CdekDeliveryPointUsage usage,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        var token = await GetAccessTokenAsync(client, settings, cancellationToken);
        var resolvedAddress = await TryResolveAddressAsync(payload.ToAddress, cancellationToken);
        var postalCode = NormalizeOptionalText(resolvedAddress?.PostalCode);
        var cityCode = await ResolveCityCodeAsync(client, settings, token, resolvedAddress, payload.ToAddress, cancellationToken);
        if (string.IsNullOrWhiteSpace(cityCode) && string.IsNullOrWhiteSpace(postalCode))
            throw new InvalidOperationException("СДЭК не смог определить город получателя для поиска ПВЗ.");

        DeliveryProviderQuoteResult? pickupQuote = null;
        if (payload.WeightKg.HasValue || payload.DeclaredCost.HasValue)
        {
            pickupQuote = await CalculateWithSettingsAsync(
                new DeliveryCalculatePayload(payload.ToAddress, payload.WeightKg, payload.DeclaredCost, payload.PaymentMethod),
                settings,
                cancellationToken);
        }
        var requestedLimit = Math.Clamp(payload.Limit ?? 12, 1, 30);
        var requestLimit = Math.Clamp(Math.Max(requestedLimit * 5, 24), requestedLimit, 60);

        var requestUri = BuildUri(settings, "/v2/deliverypoints", BuildDeliveryPointsQuery(cityCode, postalCode, requestLimit, usage));

        using var request = new HttpRequestMessage(HttpMethod.Get, requestUri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(BuildHttpError("СДЭК не вернул список ПВЗ", response.StatusCode, body));

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "[]" : body);
        var points = new List<DeliveryPickupPointSummary>();
        foreach (var item in document.RootElement.EnumerateArray())
        {
            var location = TryGetProperty(item, "location");
            var code = GetString(item, "code") ?? GetString(item, "uuid");
            var officeName = BuildOfficeName(item, code);
            var name = GetString(item, "name") ?? code ?? "ПВЗ СДЭК";
            var address = GetString(location, "address_full") ?? GetString(location, "address") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(address))
                continue;
            var available = usage switch
            {
                CdekDeliveryPointUsage.OriginReception => GetBoolean(item, "is_reception") ?? true,
                _ => GetBoolean(item, "is_handout") ?? true
            };
            if (!available)
                continue;
            var latitude = GetDouble(location, "latitude");
            var longitude = GetDouble(location, "longitude");

            points.Add(new DeliveryPickupPointSummary(
                Id: code,
                Name: string.IsNullOrWhiteSpace(name) ? officeName : name,
                Address: address,
                Instruction: BuildOfficeInstruction(item),
                Latitude: latitude,
                Longitude: longitude,
                DistanceKm: CalculateDistanceKm(latitude, longitude, resolvedAddress),
                PaymentMethods: BuildOfficePaymentMethods(item),
                Available: available,
                EstimatedCost: pickupQuote?.PickupPointDelivery?.EstimatedCost,
                DeliveryDays: pickupQuote?.PickupPointDelivery?.DeliveryDays,
                Error: null));
        }

        return points
            .DistinctBy(static point => point.Id, StringComparer.OrdinalIgnoreCase)
            .OrderBy(static point => point.DistanceKm.HasValue ? 0 : 1)
            .ThenBy(static point => point.DistanceKm ?? double.MaxValue)
            .ThenBy(static point => point.Name, StringComparer.OrdinalIgnoreCase)
            .Take(requestedLimit)
            .ToList();
    }

    public async Task<CdekAdminTestResult> TestIntegrationAsync(
        CdekDeliveryAdminTestPayload payload,
        CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(new CdekDeliveryIntegrationOverrides(
            payload.Enabled,
            payload.UseTestEnvironment,
            payload.Account,
            payload.Password,
            payload.FromPostalCode,
            payload.FromLocationType,
            payload.FromAddress,
            payload.FromPickupPointCode,
            payload.PackageLengthCm,
            payload.PackageHeightCm,
            payload.PackageWidthCm), cancellationToken);

        var client = _httpClientFactory.CreateClient();
        var token = await GetAccessTokenAsync(client, settings, cancellationToken);
        var resolvedAddress = await TryResolveAddressAsync(payload.ToAddress, cancellationToken);
        var cityCode = await ResolveCityCodeAsync(client, settings, token, resolvedAddress, payload.ToAddress, cancellationToken);
        var quote = await CalculateWithSettingsAsync(
            new DeliveryCalculatePayload(payload.ToAddress, payload.WeightKg, payload.DeclaredCost, PaymentMethod: null),
            settings,
            cancellationToken);
        var points = await ListPickupPointsInternalAsync(
            new DeliveryPickupPointsPayload("cdek", payload.ToAddress, Limit: 5, WeightKg: payload.WeightKg, DeclaredCost: payload.DeclaredCost),
            settings,
            CdekDeliveryPointUsage.DestinationHandout,
            cancellationToken);

        return new CdekAdminTestResult(
            TokenReceived: true,
            Environment: settings.UseTestEnvironment ? "test" : "production",
            CityCode: cityCode,
            Quote: quote,
            PickupPoints: points,
            Note: BuildTestNote(settings, quote));
    }

    private async Task<DeliveryProviderQuoteResult> CalculateInternalAsync(
        DeliveryCalculatePayload payload,
        CdekDeliveryIntegrationOverrides? overrides,
        CancellationToken cancellationToken)
    {
        var settings = overrides ?? await ResolveSettingsAsync(null, cancellationToken);
        return await CalculateWithSettingsAsync(payload, settings, cancellationToken);
    }

    private async Task<DeliveryProviderQuoteResult> CalculateWithSettingsAsync(
        DeliveryCalculatePayload payload,
        CdekDeliveryIntegrationOverrides settings,
        CancellationToken cancellationToken)
    {
        var destinationAddress = payload.ToAddress?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(destinationAddress))
            throw new InvalidOperationException("Укажите адрес доставки для СДЭК.");

        var client = _httpClientFactory.CreateClient();
        var token = await GetAccessTokenAsync(client, settings, cancellationToken);
        var resolvedAddress = await TryResolveAddressAsync(destinationAddress, cancellationToken);
        var cityCode = await ResolveCityCodeAsync(client, settings, token, resolvedAddress, destinationAddress, cancellationToken);
        if (string.IsNullOrWhiteSpace(cityCode))
            throw new InvalidOperationException("СДЭК не смог определить город получателя.");

        var requestBody = new JsonObject
        {
            ["currency"] = 1,
            ["lang"] = "rus",
            ["from_location"] = new JsonObject
            {
                ["postal_code"] = settings.FromPostalCode,
                ["country_code"] = "RU"
            },
            ["to_location"] = new JsonObject
            {
                ["code"] = cityCode,
                ["country_code"] = "RU"
            },
            ["packages"] = new JsonArray
            {
                new JsonObject
                {
                    ["height"] = NormalizeDimension(settings.PackageHeightCm, 20),
                    ["length"] = NormalizeDimension(settings.PackageLengthCm, 30),
                    ["width"] = NormalizeDimension(settings.PackageWidthCm, 10),
                    ["weight"] = ToGrams(payload.WeightKg)
                }
            }
        };

        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            BuildUri(settings, "/v2/calculator/tarifflist"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Content = new StringContent(requestBody.ToJsonString(), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            if (settings.UseTestEnvironment && TryBuildTrainingFallbackQuote(response.StatusCode, body, cityCode, out var fallbackQuote))
                return fallbackQuote;

            throw new HttpRequestException(BuildHttpError("СДЭК не смог рассчитать тарифы", response.StatusCode, body));
        }

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
        var tariffs = ExtractTariffs(document.RootElement);
        var home = tariffs
            .Where(static item => item.Mode == 3)
            .OrderBy(static item => item.Price ?? decimal.MaxValue)
            .FirstOrDefault();
        var pickup = tariffs
            .Where(static item => item.Mode == 4)
            .OrderBy(static item => item.Price ?? decimal.MaxValue)
            .FirstOrDefault();

        var details = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["environment"] = settings.UseTestEnvironment ? "test" : "production",
            ["cityCode"] = cityCode,
            ["fromPostalCode"] = settings.FromPostalCode ?? string.Empty,
            ["fromLocationType"] = settings.FromLocationType ?? "warehouse"
        };
        if (!string.IsNullOrWhiteSpace(settings.FromAddress))
            details["fromAddress"] = settings.FromAddress!;
        if (!string.IsNullOrWhiteSpace(settings.FromPickupPointCode))
            details["fromPickupPointCode"] = settings.FromPickupPointCode!;

        return new DeliveryProviderQuoteResult(
            Provider: ProviderCode,
            Label: "СДЭК",
            Currency: "RUB",
            HomeDelivery: home is null
                ? new DeliveryQuoteOptionSummary(false, null, null, "cdek_courier", "СДЭК не вернул доступный курьерский тариф.")
                : new DeliveryQuoteOptionSummary(true, home.Price, home.DeliveryDays, home.TariffCode, null),
            PickupPointDelivery: pickup is null
                ? new DeliveryPickupQuoteSummary(false, null, null, "cdek_pickup", null, "СДЭК не вернул доступный тариф до ПВЗ.")
                : new DeliveryPickupQuoteSummary(true, pickup.Price, pickup.DeliveryDays, pickup.TariffCode, null, null),
            Details: details);
    }

    private static string BuildTestNote(CdekDeliveryIntegrationOverrides settings, DeliveryProviderQuoteResult quote)
    {
        if (!settings.UseTestEnvironment)
            return "Использован боевой контур api.cdek.ru. Для сквозного теста понадобятся реальные договорные учетные данные.";

        if (quote.Details is not null
            && quote.Details.TryGetValue("quoteSource", out var quoteSource)
            && string.Equals(quoteSource, "training_fallback", StringComparison.OrdinalIgnoreCase))
        {
            return "Учебный калькулятор api.edu.cdek.ru вернул internal error, поэтому показаны резервные demo-тарифы учебного контура. OAuth, определение города и список ПВЗ при этом получены с официального API.";
        }

        return "Использован официальный учебный контур api.edu.cdek.ru.";
    }

    private static bool TryBuildTrainingFallbackQuote(
        System.Net.HttpStatusCode statusCode,
        string? body,
        string cityCode,
        out DeliveryProviderQuoteResult quote)
    {
        quote = default!;
        if ((int)statusCode != 500 || !IsTrainingCalculatorInternalError(body))
            return false;

        quote = new DeliveryProviderQuoteResult(
            Provider: ProviderCode,
            Label: "СДЭК",
            Currency: "RUB",
            HomeDelivery: new DeliveryQuoteOptionSummary(
                true,
                TrainingFallbackCourierCost,
                0,
                TrainingFallbackCourierTariff,
                "Показан резервный demo-тариф из-за сбоя учебного калькулятора СДЭК."),
            PickupPointDelivery: new DeliveryPickupQuoteSummary(
                true,
                TrainingFallbackPickupCost,
                0,
                TrainingFallbackPickupTariff,
                null,
                "Показан резервный demo-тариф из-за сбоя учебного калькулятора СДЭК."),
            Details: new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["environment"] = "test",
                ["cityCode"] = cityCode,
                ["quoteSource"] = "training_fallback",
                ["calculatorErrorCode"] = TrainingCalculatorInternalErrorCode,
                ["calculatorErrorAdditionalCode"] = TrainingCalculatorInternalAdditionalCode,
                ["calculatorErrorBody"] = string.IsNullOrWhiteSpace(body) ? string.Empty : body.Trim()
            });
        return true;
    }

    private static bool IsTrainingCalculatorInternalError(string? body)
    {
        if (string.IsNullOrWhiteSpace(body))
            return false;

        try
        {
            using var document = JsonDocument.Parse(body);
            if (!document.RootElement.TryGetProperty("errors", out var errors) || errors.ValueKind != JsonValueKind.Array)
                return false;

            foreach (var error in errors.EnumerateArray())
            {
                var code = GetString(error, "code");
                var additionalCode = GetString(error, "additional_code");
                if (string.Equals(code, TrainingCalculatorInternalErrorCode, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(additionalCode, TrainingCalculatorInternalAdditionalCode, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
        }
        catch (JsonException)
        {
            return false;
        }

        return false;
    }

    private async Task<CdekDeliveryIntegrationOverrides> ResolveSettingsAsync(
        CdekDeliveryIntegrationOverrides? overrides,
        CancellationToken cancellationToken,
        bool requirePickupPointCode = true)
    {
        if (overrides is not null)
            return await NormalizeOverridesAsync(overrides, cancellationToken, requirePickupPointCode);

        var enabled = await GetBooleanSettingAsync("delivery_cdek_enabled", "Integrations:Cdek:Enabled", false, cancellationToken);
        var useTestEnvironment = await GetBooleanSettingAsync("delivery_cdek_use_test_environment", "Integrations:Cdek:UseTestEnvironment", true, cancellationToken);
        var account = await GetSettingOrConfigAsync("delivery_cdek_account", "Integrations:Cdek:Account", cancellationToken);
        var password = await GetSettingOrConfigAsync("delivery_cdek_password", "Integrations:Cdek:Password", cancellationToken);
        var fromPostalCode = await GetSettingOrConfigAsync("delivery_cdek_from_postal_code", "Integrations:Cdek:FromPostalCode", cancellationToken);
        var fromLocationType = await GetSettingOrConfigAsync("delivery_cdek_from_location_type", "Integrations:Cdek:FromLocationType", cancellationToken);
        var fromAddress = await GetSettingOrConfigAsync("delivery_cdek_from_address", "Integrations:Cdek:FromAddress", cancellationToken);
        var fromPickupPointCode = await GetSettingOrConfigAsync("delivery_cdek_from_pickup_point_code", "Integrations:Cdek:FromPickupPointCode", cancellationToken);
        var length = await GetIntSettingAsync("delivery_cdek_package_length_cm", "Integrations:Cdek:PackageLengthCm", 30, cancellationToken);
        var height = await GetIntSettingAsync("delivery_cdek_package_height_cm", "Integrations:Cdek:PackageHeightCm", 20, cancellationToken);
        var width = await GetIntSettingAsync("delivery_cdek_package_width_cm", "Integrations:Cdek:PackageWidthCm", 10, cancellationToken);

        return await NormalizeOverridesAsync(new CdekDeliveryIntegrationOverrides(
            enabled,
            useTestEnvironment,
            account,
            password,
            fromPostalCode,
            fromLocationType,
            fromAddress,
            fromPickupPointCode,
            length,
            height,
            width), cancellationToken, requirePickupPointCode);
    }

    private async Task<CdekDeliveryIntegrationOverrides> NormalizeOverridesAsync(
        CdekDeliveryIntegrationOverrides overrides,
        CancellationToken cancellationToken,
        bool requirePickupPointCode)
    {
        if (!overrides.Enabled)
            throw new InvalidOperationException("СДЭК отключен в интеграциях.");

        var account = NormalizeOptionalText(overrides.Account);
        var password = NormalizeOptionalText(overrides.Password);
        var fromPostalCode = NormalizeOptionalText(overrides.FromPostalCode);
        var fromLocationType = NormalizeFromLocationType(overrides.FromLocationType);
        var fromAddress = NormalizeOptionalText(overrides.FromAddress);
        var fromPickupPointCode = NormalizeOptionalText(overrides.FromPickupPointCode);
        if (string.IsNullOrWhiteSpace(account) || string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("Для СДЭК укажите account и secure password.");
        if (string.IsNullOrWhiteSpace(fromPostalCode) && !string.IsNullOrWhiteSpace(fromAddress))
        {
            var resolvedOrigin = await TryResolveAddressAsync(fromAddress, cancellationToken);
            fromPostalCode = NormalizeOptionalText(resolvedOrigin?.PostalCode);
        }
        if (string.IsNullOrWhiteSpace(fromPostalCode))
            throw new InvalidOperationException("Для СДЭК укажите индекс отправителя или адрес точки отправления.");
        if (requirePickupPointCode
            && string.Equals(fromLocationType, "pickup_point", StringComparison.Ordinal)
            && string.IsNullOrWhiteSpace(fromPickupPointCode))
            throw new InvalidOperationException("Для отправки через ПВЗ СДЭК укажите код пункта отправления.");

        return overrides with
        {
            Account = account,
            Password = password,
            FromPostalCode = fromPostalCode,
            FromLocationType = fromLocationType,
            FromAddress = fromAddress,
            FromPickupPointCode = fromPickupPointCode
        };
    }

    private async Task<string> GetAccessTokenAsync(HttpClient client, CdekDeliveryIntegrationOverrides settings, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            BuildUri(settings, "/v2/oauth/token"));
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = settings.Account!,
            ["client_secret"] = settings.Password!
        });

        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(BuildHttpError("Не удалось получить OAuth token СДЭК", response.StatusCode, body));

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
        var token = GetString(document.RootElement, "access_token");
        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("СДЭК не вернул access_token.");

        return token;
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

    private async Task<string?> ResolveCityCodeAsync(
        HttpClient client,
        CdekDeliveryIntegrationOverrides settings,
        string token,
        DaDataAddressSuggestion? resolvedAddress,
        string fallbackAddress,
        CancellationToken cancellationToken)
    {
        var query = resolvedAddress?.Settlement
            ?? resolvedAddress?.City
            ?? resolvedAddress?.Region
            ?? ExtractCityFromAddress(fallbackAddress);
        if (string.IsNullOrWhiteSpace(query))
            return null;

        var postalCode = NormalizeOptionalText(resolvedAddress?.PostalCode);

        var uri = BuildUri(
            settings,
            "/v2/location/cities",
            new Dictionary<string, string?>
            {
                ["country_codes"] = "RU",
                ["postal_code"] = postalCode,
                ["city"] = query,
                ["size"] = "10",
                ["lang"] = "rus"
            });

        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(BuildHttpError("СДЭК не вернул справочник городов", response.StatusCode, body));

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "[]" : body);
        var cities = document.RootElement.Clone();
        if ((cities.ValueKind != JsonValueKind.Array || cities.GetArrayLength() == 0)
            && !string.IsNullOrWhiteSpace(postalCode)
            && !string.IsNullOrWhiteSpace(query))
        {
            cities = await LoadCitiesAsync(client, settings, token, postalCode, cityQuery: null, cancellationToken);
        }

        if (cities.ValueKind != JsonValueKind.Array || cities.GetArrayLength() == 0)
            return null;

        JsonElement? matchedCity = null;
        if (!string.IsNullOrWhiteSpace(postalCode))
        {
            matchedCity = cities
                .EnumerateArray()
                .FirstOrDefault(city => CityMatchesPostalCode(city, postalCode));
        }

        if (matchedCity is not { ValueKind: JsonValueKind.Object })
        {
            matchedCity = cities
                .EnumerateArray()
                .FirstOrDefault(city => string.Equals(GetString(city, "city"), query, StringComparison.OrdinalIgnoreCase));
        }

        if (matchedCity is { ValueKind: JsonValueKind.Object } city)
            return GetString(city, "code");

        return GetString(cities[0], "code");
    }

    private async Task<JsonElement> LoadCitiesAsync(
        HttpClient client,
        CdekDeliveryIntegrationOverrides settings,
        string token,
        string? postalCode,
        string? cityQuery,
        CancellationToken cancellationToken)
    {
        var uri = BuildUri(
            settings,
            "/v2/location/cities",
            new Dictionary<string, string?>
            {
                ["country_codes"] = "RU",
                ["postal_code"] = postalCode,
                ["city"] = cityQuery,
                ["size"] = "10",
                ["lang"] = "rus"
            });

        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(BuildHttpError("СДЭК не вернул справочник городов", response.StatusCode, body));

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "[]" : body);
        return document.RootElement.Clone();
    }

    private static IReadOnlyList<CdekTariffQuote> ExtractTariffs(JsonElement root)
    {
        var items = new List<CdekTariffQuote>();
        if (root.ValueKind == JsonValueKind.Array)
        {
            foreach (var element in root.EnumerateArray())
                TryAddTariff(items, element);
            return items;
        }

        if (TryGetProperty(root, "tariff_codes") is { ValueKind: JsonValueKind.Array } tariffs)
        {
            foreach (var element in tariffs.EnumerateArray())
                TryAddTariff(items, element);
        }

        return items;
    }

    private static void TryAddTariff(List<CdekTariffQuote> items, JsonElement element)
    {
        var tariffCode = GetString(element, "tariff_code") ?? GetString(element, "tariff_name") ?? "cdek";
        var mode = GetInt(element, "delivery_mode") ?? GetInt(element, "mode") ?? 0;
        var deliveryDays = ResolveDeliveryDays(element);
        var price = GetDecimal(element, "delivery_sum") ?? GetDecimal(element, "total_sum");
        items.Add(new CdekTariffQuote(tariffCode, mode, price, deliveryDays));
    }

    private static int? ResolveDeliveryDays(JsonElement element)
    {
        var max = GetInt(element, "period_max");
        var min = GetInt(element, "period_min");
        return max ?? min;
    }

    private static Uri BuildUri(
        CdekDeliveryIntegrationOverrides settings,
        string relativePath,
        IReadOnlyDictionary<string, string?>? query = null)
    {
        var baseUrl = settings.UseTestEnvironment
            ? "https://api.edu.cdek.ru"
            : "https://api.cdek.ru";
        var builder = new UriBuilder(new Uri(new Uri(baseUrl), relativePath));
        if (query is not null && query.Count > 0)
        {
            builder.Query = string.Join("&", query
                .Where(static item => !string.IsNullOrWhiteSpace(item.Value))
                .Select(item => $"{Uri.EscapeDataString(item.Key)}={Uri.EscapeDataString(item.Value!)}"));
        }
        return builder.Uri;
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

    private static int NormalizeDimension(int? value, int fallback)
        => value is > 0 ? value.Value : fallback;

    private static int ToGrams(decimal? weightKg)
    {
        var value = weightKg.GetValueOrDefault(0.3m);
        if (value <= 0m)
            value = 0.3m;
        return (int)Math.Round(value * 1000m, MidpointRounding.AwayFromZero);
    }

    private static string BuildHttpError(string prefix, System.Net.HttpStatusCode statusCode, string? body)
    {
        var compactBody = string.IsNullOrWhiteSpace(body)
            ? string.Empty
            : $" {body.Trim()}";
        return $"{prefix}: {(int)statusCode}.{compactBody}".Trim();
    }

    private static string? ExtractCityFromAddress(string address)
    {
        var parts = address
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        return parts.Skip(1).FirstOrDefault();
    }

    private static string? NormalizeOptionalText(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static string NormalizeFromLocationType(string? value)
    {
        return value?.Trim().ToLowerInvariant() switch
        {
            "pickup_point" => "pickup_point",
            "other" => "other",
            _ => "warehouse"
        };
    }

    private static double? CalculateDistanceKm(
        double? pointLatitude,
        double? pointLongitude,
        DaDataAddressSuggestion? resolvedAddress)
    {
        if (!pointLatitude.HasValue || !pointLongitude.HasValue)
            return null;

        var addressLatitude = ParseCoordinate(resolvedAddress?.GeoLat);
        var addressLongitude = ParseCoordinate(resolvedAddress?.GeoLon);
        if (!addressLatitude.HasValue || !addressLongitude.HasValue)
            return null;

        return Math.Round(
            CalculateDistanceKm(
                addressLatitude.Value,
                addressLongitude.Value,
                pointLatitude.Value,
                pointLongitude.Value),
            2,
            MidpointRounding.AwayFromZero);
    }

    private static double? ParseCoordinate(string? value)
    {
        return double.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
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

    private static JsonElement? TryGetProperty(JsonElement element, string propertyName)
        => element.ValueKind == JsonValueKind.Object && element.TryGetProperty(propertyName, out var value)
            ? value
            : null;

    private static string? GetString(JsonElement? element, string propertyName)
        => element is { ValueKind: JsonValueKind.Object } value && value.TryGetProperty(propertyName, out var property) && property.ValueKind != JsonValueKind.Null
            ? property.ToString()
            : null;

    private static decimal? GetDecimal(JsonElement? element, string propertyName)
    {
        var raw = GetString(element, propertyName);
        return decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            || decimal.TryParse(raw, NumberStyles.Any, CultureInfo.GetCultureInfo("ru-RU"), out parsed)
            ? parsed
            : null;
    }

    private static int? GetInt(JsonElement? element, string propertyName)
    {
        var raw = GetString(element, propertyName);
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static double? GetDouble(JsonElement? element, string propertyName)
    {
        var raw = GetString(element, propertyName);
        return double.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static bool? GetBoolean(JsonElement? element, string propertyName)
    {
        var raw = NormalizeOptionalText(GetString(element, propertyName));
        return raw?.ToLowerInvariant() switch
        {
            "1" or "true" => true,
            "0" or "false" => false,
            _ => null
        };
    }

    private static IReadOnlyDictionary<string, string?> BuildDeliveryPointsQuery(
        string? cityCode,
        string? postalCode,
        int requestLimit,
        CdekDeliveryPointUsage usage)
    {
        var query = new Dictionary<string, string?>
        {
            ["country_code"] = "RU",
            ["city_code"] = cityCode,
            ["postal_code"] = postalCode,
            ["type"] = "ALL",
            ["size"] = requestLimit.ToString(CultureInfo.InvariantCulture),
            ["lang"] = "rus"
        };

        switch (usage)
        {
            case CdekDeliveryPointUsage.OriginReception:
                query["is_reception"] = "true";
                break;
            default:
                query["is_handout"] = "true";
                break;
        }

        return query;
    }

    private static string BuildOfficeName(JsonElement item, string? code)
    {
        var explicitName = NormalizeOptionalText(GetString(item, "name"));
        if (!string.IsNullOrWhiteSpace(explicitName))
            return explicitName;

        var type = NormalizeOptionalText(GetString(item, "type"));
        var station = NormalizeOptionalText(GetString(item, "nearest_metro_station"))
            ?? NormalizeOptionalText(GetString(item, "nearest_station"));
        var typeLabel = string.Equals(type, "POSTAMAT", StringComparison.OrdinalIgnoreCase)
            ? "Постамат"
            : "ПВЗ";

        if (!string.IsNullOrWhiteSpace(code) && !string.IsNullOrWhiteSpace(station))
            return $"{typeLabel} {code} ({station})";
        if (!string.IsNullOrWhiteSpace(code))
            return $"{typeLabel} {code}";

        return $"{typeLabel} СДЭК";
    }

    private static string? BuildOfficeInstruction(JsonElement item)
    {
        var parts = new List<string>();
        var workTime = NormalizeOptionalText(GetString(item, "work_time"));
        var note = NormalizeOptionalText(GetString(item, "note"));
        var addressComment = NormalizeOptionalText(GetString(item, "address_comment"));

        if (!string.IsNullOrWhiteSpace(workTime))
            parts.Add($"График: {workTime}");
        if (!string.IsNullOrWhiteSpace(note))
            parts.Add(note);
        if (!string.IsNullOrWhiteSpace(addressComment))
            parts.Add(addressComment);

        return parts.Count > 0 ? string.Join(" • ", parts) : null;
    }

    private static IReadOnlyList<string>? BuildOfficePaymentMethods(JsonElement item)
    {
        var methods = new List<string>();

        if ((GetBoolean(item, "allowed_cod") ?? false) || (GetBoolean(item, "have_cash") ?? false))
            methods.Add("cod");
        if ((GetBoolean(item, "have_cashless") ?? false) || (GetBoolean(item, "have_fast_payment_system") ?? false))
            methods.Add("card");

        return methods.Count > 0 ? methods : null;
    }

    private static bool CityMatchesPostalCode(JsonElement city, string postalCode)
    {
        if (TryGetProperty(city, "postal_codes") is not { ValueKind: JsonValueKind.Array } postalCodes)
            return false;

        foreach (var item in postalCodes.EnumerateArray())
        {
            if (string.Equals(item.ToString(), postalCode, StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }

    private sealed record CdekTariffQuote(string TariffCode, int Mode, decimal? Price, int? DeliveryDays);
}
