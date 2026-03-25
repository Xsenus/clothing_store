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
    int? PackageLengthCm,
    int? PackageHeightCm,
    int? PackageWidthCm);

public sealed class CdekDeliveryService : ICdekDeliveryService
{
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
        return await ListPickupPointsInternalAsync(payload, settings, cancellationToken);
    }

    private async Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsInternalAsync(
        DeliveryPickupPointsPayload payload,
        CdekDeliveryIntegrationOverrides settings,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        var token = await GetAccessTokenAsync(client, settings, cancellationToken);
        var resolvedAddress = await TryResolveAddressAsync(payload.ToAddress, cancellationToken);
        var cityCode = await ResolveCityCodeAsync(client, settings, token, resolvedAddress, payload.ToAddress, cancellationToken);
        if (string.IsNullOrWhiteSpace(cityCode))
            throw new InvalidOperationException("СДЭК не смог определить город получателя для поиска ПВЗ.");

        var pickupQuote = await CalculateWithSettingsAsync(
            new DeliveryCalculatePayload(payload.ToAddress, payload.WeightKg, payload.DeclaredCost, payload.PaymentMethod),
            settings,
            cancellationToken);

        var requestUri = BuildUri(
            settings,
            "/v2/deliverypoints",
            new Dictionary<string, string?>
            {
                ["city_code"] = cityCode,
                ["type"] = "PVZ",
                ["size"] = Math.Clamp(payload.Limit ?? 12, 1, 30).ToString(CultureInfo.InvariantCulture)
            });

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
            var name = GetString(item, "name") ?? code ?? "ПВЗ СДЭК";
            var address = GetString(location, "address") ?? GetString(location, "address_full") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(address))
                continue;

            points.Add(new DeliveryPickupPointSummary(
                Id: code,
                Name: name,
                Address: address,
                Instruction: GetString(item, "work_time"),
                Latitude: GetDouble(location, "latitude"),
                Longitude: GetDouble(location, "longitude"),
                DistanceKm: null,
                PaymentMethods: ["cod", "card"],
                Available: true,
                EstimatedCost: pickupQuote?.PickupPointDelivery?.EstimatedCost,
                DeliveryDays: pickupQuote?.PickupPointDelivery?.DeliveryDays,
                Error: null));
        }

        return points;
    }

    public async Task<CdekAdminTestResult> TestIntegrationAsync(
        CdekDeliveryAdminTestPayload payload,
        CancellationToken cancellationToken = default)
    {
        var settings = new CdekDeliveryIntegrationOverrides(
            payload.Enabled,
            payload.UseTestEnvironment,
            payload.Account,
            payload.Password,
            payload.FromPostalCode,
            payload.PackageLengthCm,
            payload.PackageHeightCm,
            payload.PackageWidthCm);

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
            Details: new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["environment"] = settings.UseTestEnvironment ? "test" : "production",
                ["cityCode"] = cityCode
            });
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
        CancellationToken cancellationToken)
    {
        if (overrides is not null)
            return NormalizeOverrides(overrides);

        var enabled = await GetBooleanSettingAsync("delivery_cdek_enabled", "Integrations:Cdek:Enabled", false, cancellationToken);
        var useTestEnvironment = await GetBooleanSettingAsync("delivery_cdek_use_test_environment", "Integrations:Cdek:UseTestEnvironment", true, cancellationToken);
        var account = await GetSettingOrConfigAsync("delivery_cdek_account", "Integrations:Cdek:Account", cancellationToken);
        var password = await GetSettingOrConfigAsync("delivery_cdek_password", "Integrations:Cdek:Password", cancellationToken);
        var fromPostalCode = await GetSettingOrConfigAsync("delivery_cdek_from_postal_code", "Integrations:Cdek:FromPostalCode", cancellationToken);
        var length = await GetIntSettingAsync("delivery_cdek_package_length_cm", "Integrations:Cdek:PackageLengthCm", 30, cancellationToken);
        var height = await GetIntSettingAsync("delivery_cdek_package_height_cm", "Integrations:Cdek:PackageHeightCm", 20, cancellationToken);
        var width = await GetIntSettingAsync("delivery_cdek_package_width_cm", "Integrations:Cdek:PackageWidthCm", 10, cancellationToken);

        return NormalizeOverrides(new CdekDeliveryIntegrationOverrides(
            enabled,
            useTestEnvironment,
            account,
            password,
            fromPostalCode,
            length,
            height,
            width));
    }

    private static CdekDeliveryIntegrationOverrides NormalizeOverrides(CdekDeliveryIntegrationOverrides overrides)
    {
        if (!overrides.Enabled)
            throw new InvalidOperationException("СДЭК отключен в интеграциях.");

        var account = NormalizeOptionalText(overrides.Account);
        var password = NormalizeOptionalText(overrides.Password);
        var fromPostalCode = NormalizeOptionalText(overrides.FromPostalCode);
        if (string.IsNullOrWhiteSpace(account) || string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("Для СДЭК укажите account и secure password.");
        if (string.IsNullOrWhiteSpace(fromPostalCode))
            throw new InvalidOperationException("Для СДЭК укажите индекс отправителя.");

        return overrides with
        {
            Account = account,
            Password = password,
            FromPostalCode = fromPostalCode
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

        var uri = BuildUri(
            settings,
            "/v2/location/cities",
            new Dictionary<string, string?>
            {
                ["country_codes"] = "RU",
                ["city"] = query,
                ["size"] = "1"
            });

        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(BuildHttpError("СДЭК не вернул справочник городов", response.StatusCode, body));

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "[]" : body);
        if (document.RootElement.ValueKind != JsonValueKind.Array || document.RootElement.GetArrayLength() == 0)
            return null;

        return GetString(document.RootElement[0], "code");
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
        => value.GetValueOrDefault(fallback) <= 0 ? fallback : value!.Value;

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

    private sealed record CdekTariffQuote(string TariffCode, int Mode, decimal? Price, int? DeliveryDays);
}
