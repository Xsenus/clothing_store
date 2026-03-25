using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;

namespace Store.Api.Services;

public interface IRussianPostDeliveryService
{
    Task<DeliveryProviderQuoteResult?> TryCalculateAsync(DeliveryCalculatePayload payload, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsAsync(DeliveryPickupPointsPayload payload, CancellationToken cancellationToken = default);
    Task<RussianPostAdminTestResult> TestIntegrationAsync(RussianPostDeliveryAdminTestPayload payload, CancellationToken cancellationToken = default);
}

public sealed record RussianPostAdminTestResult(
    string FromPostalCode,
    string? DestinationPostalCode,
    DeliveryProviderQuoteResult? Quote,
    IReadOnlyList<DeliveryPickupPointSummary> PickupPoints,
    string Note);

public sealed record RussianPostIntegrationOverrides(
    bool Enabled,
    string? AccessToken,
    string? AuthorizationKey,
    string? FromPostalCode,
    string? MailType,
    string? MailCategory,
    string? DimensionType,
    int? PackageLengthCm,
    int? PackageHeightCm,
    int? PackageWidthCm);

public sealed class RussianPostDeliveryService : IRussianPostDeliveryService
{
    private const string ProviderCode = "russian_post";
    private const string BaseUrl = "https://otpravka-api.pochta.ru";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly IDaDataAddressSuggestService _daDataAddressSuggestService;

    public RussianPostDeliveryService(
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

    public async Task<RussianPostAdminTestResult> TestIntegrationAsync(
        RussianPostDeliveryAdminTestPayload payload,
        CancellationToken cancellationToken = default)
    {
        var settings = NormalizeOverrides(new RussianPostIntegrationOverrides(
            payload.Enabled,
            payload.AccessToken,
            payload.AuthorizationKey,
            payload.FromPostalCode,
            payload.MailType,
            payload.MailCategory,
            payload.DimensionType,
            payload.PackageLengthCm,
            payload.PackageHeightCm,
            payload.PackageWidthCm));

        var resolvedAddress = await TryResolveAddressAsync(payload.ToAddress, cancellationToken);
        var destinationPostalCode = ExtractPostalCode(payload.ToAddress) ?? ExtractPostalCode(resolvedAddress?.Value);
        var quote = await CalculateWithSettingsAsync(
            new DeliveryCalculatePayload(payload.ToAddress, payload.WeightKg, payload.DeclaredCost),
            settings,
            cancellationToken);
        var points = await ListPickupPointsInternalAsync(
            new DeliveryPickupPointsPayload(
                "russian_post",
                payload.ToAddress,
                Limit: 5,
                WeightKg: payload.WeightKg,
                DeclaredCost: payload.DeclaredCost),
            settings,
            cancellationToken);

        return new RussianPostAdminTestResult(
            settings.FromPostalCode!,
            destinationPostalCode,
            quote,
            points,
            "Использован официальный API Почты России otpravka-api.pochta.ru. Для боевого сценария создания отправления можно дополнительно подключить backlog.");
    }

    private async Task<IReadOnlyList<DeliveryPickupPointSummary>> ListPickupPointsInternalAsync(
        DeliveryPickupPointsPayload payload,
        RussianPostIntegrationOverrides settings,
        CancellationToken cancellationToken)
    {
        var resolvedAddress = await TryResolveAddressAsync(payload.ToAddress, cancellationToken)
            ?? throw new InvalidOperationException("Почта России не смогла распознать адрес для поиска отделений.");

        if (!double.TryParse(resolvedAddress.GeoLat, NumberStyles.Any, CultureInfo.InvariantCulture, out var latitude)
            || !double.TryParse(resolvedAddress.GeoLon, NumberStyles.Any, CultureInfo.InvariantCulture, out var longitude))
        {
            throw new InvalidOperationException("Для поиска отделений Почты России нужны координаты адреса.");
        }

        var quote = await CalculateWithSettingsAsync(
            new DeliveryCalculatePayload(payload.ToAddress, payload.WeightKg, payload.DeclaredCost, payload.PaymentMethod),
            settings,
            cancellationToken);

        var uri = new UriBuilder(new Uri(new Uri(BaseUrl), "/postoffice/1.0/nearby.details"))
        {
            Query = $"latitude={Uri.EscapeDataString(latitude.ToString(CultureInfo.InvariantCulture))}&longitude={Uri.EscapeDataString(longitude.ToString(CultureInfo.InvariantCulture))}&top={Math.Clamp(payload.Limit ?? 10, 1, 20).ToString(CultureInfo.InvariantCulture)}"
        };

        using var request = new HttpRequestMessage(HttpMethod.Get, uri.Uri);
        ApplyHeaders(request, settings);

        var client = _httpClientFactory.CreateClient();
        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(BuildHttpError("Почта России не вернула список отделений", response.StatusCode, body));

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "[]" : body);
        var points = new List<DeliveryPickupPointSummary>();
        foreach (var item in document.RootElement.EnumerateArray())
        {
            var postalCode = GetString(item, "postal-code") ?? GetString(item, "index");
            var address = GetString(item, "address-source") ?? GetString(item, "address-str");
            if (string.IsNullOrWhiteSpace(postalCode) || string.IsNullOrWhiteSpace(address))
                continue;

            points.Add(new DeliveryPickupPointSummary(
                Id: postalCode,
                Name: GetString(item, "postal-code") ?? "Отделение Почты России",
                Address: address,
                Instruction: GetString(item, "working-hours-text"),
                Latitude: GetDouble(item, "latitude"),
                Longitude: GetDouble(item, "longitude"),
                DistanceKm: null,
                PaymentMethods: ["cod", "card"],
                Available: true,
                EstimatedCost: quote.PickupPointDelivery.EstimatedCost,
                DeliveryDays: quote.PickupPointDelivery.DeliveryDays,
                Error: null));
        }

        return points;
    }

    private async Task<DeliveryProviderQuoteResult> CalculateInternalAsync(
        DeliveryCalculatePayload payload,
        RussianPostIntegrationOverrides? overrides,
        CancellationToken cancellationToken)
    {
        var settings = overrides ?? await ResolveSettingsAsync(null, cancellationToken);
        return await CalculateWithSettingsAsync(payload, settings, cancellationToken);
    }

    private async Task<DeliveryProviderQuoteResult> CalculateWithSettingsAsync(
        DeliveryCalculatePayload payload,
        RussianPostIntegrationOverrides settings,
        CancellationToken cancellationToken)
    {
        var destinationAddress = payload.ToAddress?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(destinationAddress))
            throw new InvalidOperationException("Укажите адрес доставки для Почты России.");

        var resolvedAddress = await TryResolveAddressAsync(destinationAddress, cancellationToken);
        var destinationPostalCode = ExtractPostalCode(destinationAddress) ?? ExtractPostalCode(resolvedAddress?.Value);
        if (string.IsNullOrWhiteSpace(destinationPostalCode))
            throw new InvalidOperationException("Почта России требует почтовый индекс получателя в адресе.");

        var requestBody = new JsonObject
        {
            ["index-from"] = settings.FromPostalCode,
            ["index-to"] = destinationPostalCode,
            ["mail-category"] = settings.MailCategory,
            ["mail-type"] = settings.MailType,
            ["mass"] = ToGrams(payload.WeightKg),
            ["dimension-type"] = settings.DimensionType,
            ["dimension"] = new JsonObject
            {
                ["height"] = NormalizeDimension(settings.PackageHeightCm, 20),
                ["length"] = NormalizeDimension(settings.PackageLengthCm, 30),
                ["width"] = NormalizeDimension(settings.PackageWidthCm, 10)
            }
        };

        var declaredCost = NormalizeMoney(payload.DeclaredCost);
        if (declaredCost > 0m)
            requestBody["declared-value"] = ToKopecks(declaredCost);

        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(BaseUrl), "/1.0/tariff"));
        ApplyHeaders(request, settings);
        request.Content = new StringContent(requestBody.ToJsonString(), Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(BuildHttpError("Почта России не смогла рассчитать тариф", response.StatusCode, body));

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
        var priceKopecks = GetDecimal(document.RootElement, "total-rate")
            ?? GetDecimal(document.RootElement, "total-rate-with-vat")
            ?? GetDecimal(document.RootElement, "total-rate-vat");
        var days = GetNestedInt(document.RootElement, "delivery-time", "max-days")
            ?? GetNestedInt(document.RootElement, "delivery-time", "min-days")
            ?? GetInt(document.RootElement, "delivery-time");
        var priceRub = priceKopecks.HasValue ? priceKopecks.Value / 100m : (decimal?)null;

        var supportsHome = string.Equals(settings.MailType, "EMS", StringComparison.OrdinalIgnoreCase)
            || string.Equals(settings.MailType, "ONLINE_COURIER", StringComparison.OrdinalIgnoreCase);

        return new DeliveryProviderQuoteResult(
            Provider: ProviderCode,
            Label: "Почта России",
            Currency: "RUB",
            HomeDelivery: supportsHome
                ? new DeliveryQuoteOptionSummary(true, priceRub, days, settings.MailType ?? "russian_post_home", null)
                : new DeliveryQuoteOptionSummary(false, null, null, "russian_post_home", "Текущий тип отправления настроен как доставка в отделение."),
            PickupPointDelivery: new DeliveryPickupQuoteSummary(
                true,
                priceRub,
                days,
                settings.MailType ?? "russian_post_pickup",
                null,
                null),
            Details: new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["fromPostalCode"] = settings.FromPostalCode!,
                ["destinationPostalCode"] = destinationPostalCode,
                ["mailType"] = settings.MailType!,
                ["mailCategory"] = settings.MailCategory!
            });
    }

    private async Task<RussianPostIntegrationOverrides> ResolveSettingsAsync(
        RussianPostIntegrationOverrides? overrides,
        CancellationToken cancellationToken)
    {
        if (overrides is not null)
            return NormalizeOverrides(overrides);

        var enabled = await GetBooleanSettingAsync("delivery_russian_post_enabled", "Integrations:RussianPost:Enabled", false, cancellationToken);
        var accessToken = await GetSettingOrConfigAsync("delivery_russian_post_access_token", "Integrations:RussianPost:AccessToken", cancellationToken);
        var authorizationKey = await GetSettingOrConfigAsync("delivery_russian_post_authorization_key", "Integrations:RussianPost:AuthorizationKey", cancellationToken);
        var fromPostalCode = await GetSettingOrConfigAsync("delivery_russian_post_from_postal_code", "Integrations:RussianPost:FromPostalCode", cancellationToken);
        var mailType = await GetSettingOrConfigAsync("delivery_russian_post_mail_type", "Integrations:RussianPost:MailType", cancellationToken);
        var mailCategory = await GetSettingOrConfigAsync("delivery_russian_post_mail_category", "Integrations:RussianPost:MailCategory", cancellationToken);
        var dimensionType = await GetSettingOrConfigAsync("delivery_russian_post_dimension_type", "Integrations:RussianPost:DimensionType", cancellationToken);
        var length = await GetIntSettingAsync("delivery_russian_post_package_length_cm", "Integrations:RussianPost:PackageLengthCm", 30, cancellationToken);
        var height = await GetIntSettingAsync("delivery_russian_post_package_height_cm", "Integrations:RussianPost:PackageHeightCm", 20, cancellationToken);
        var width = await GetIntSettingAsync("delivery_russian_post_package_width_cm", "Integrations:RussianPost:PackageWidthCm", 10, cancellationToken);

        return NormalizeOverrides(new RussianPostIntegrationOverrides(
            enabled,
            accessToken,
            authorizationKey,
            fromPostalCode,
            mailType,
            mailCategory,
            dimensionType,
            length,
            height,
            width));
    }

    private static RussianPostIntegrationOverrides NormalizeOverrides(RussianPostIntegrationOverrides overrides)
    {
        if (!overrides.Enabled)
            throw new InvalidOperationException("Почта России отключена в интеграциях.");

        var accessToken = NormalizeOptionalText(overrides.AccessToken);
        var authorizationKey = NormalizeOptionalText(overrides.AuthorizationKey);
        var fromPostalCode = NormalizeOptionalText(overrides.FromPostalCode);
        var mailType = NormalizeOptionalText(overrides.MailType) ?? "POSTAL_PARCEL";
        var mailCategory = NormalizeOptionalText(overrides.MailCategory) ?? "ORDINARY";
        var dimensionType = NormalizeOptionalText(overrides.DimensionType) ?? "PACK";

        if (string.IsNullOrWhiteSpace(accessToken) || string.IsNullOrWhiteSpace(authorizationKey))
            throw new InvalidOperationException("Для Почты России укажите AccessToken и X-User-Authorization key.");
        if (string.IsNullOrWhiteSpace(fromPostalCode))
            throw new InvalidOperationException("Для Почты России укажите индекс отправителя.");

        return overrides with
        {
            AccessToken = accessToken,
            AuthorizationKey = authorizationKey,
            FromPostalCode = fromPostalCode,
            MailType = mailType,
            MailCategory = mailCategory,
            DimensionType = dimensionType
        };
    }

    private void ApplyHeaders(HttpRequestMessage request, RussianPostIntegrationOverrides settings)
    {
        request.Headers.TryAddWithoutValidation("Authorization", $"AccessToken {settings.AccessToken}");
        request.Headers.TryAddWithoutValidation("X-User-Authorization", $"Basic {settings.AuthorizationKey}");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
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

    private static decimal NormalizeMoney(decimal? value)
    {
        var normalized = value.GetValueOrDefault(0m);
        return normalized < 0m ? 0m : decimal.Round(normalized, 2, MidpointRounding.AwayFromZero);
    }

    private static int ToGrams(decimal? weightKg)
    {
        var value = weightKg.GetValueOrDefault(0.3m);
        if (value <= 0m)
            value = 0.3m;
        return (int)Math.Round(value * 1000m, MidpointRounding.AwayFromZero);
    }

    private static int ToKopecks(decimal rubles)
        => (int)Math.Round(rubles * 100m, MidpointRounding.AwayFromZero);

    private static int NormalizeDimension(int? value, int fallback)
        => value.GetValueOrDefault(fallback) <= 0 ? fallback : value!.Value;

    private static string BuildHttpError(string prefix, System.Net.HttpStatusCode statusCode, string? body)
    {
        var compactBody = string.IsNullOrWhiteSpace(body)
            ? string.Empty
            : $" {body.Trim()}";
        return $"{prefix}: {(int)statusCode}.{compactBody}".Trim();
    }

    private static string? ExtractPostalCode(string? address)
    {
        if (string.IsNullOrWhiteSpace(address))
            return null;

        var match = System.Text.RegularExpressions.Regex.Match(address, @"\b(\d{6})\b");
        return match.Success ? match.Groups[1].Value : null;
    }

    private static string? NormalizeOptionalText(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static string? GetString(JsonElement element, string propertyName)
        => element.TryGetProperty(propertyName, out var property) && property.ValueKind != JsonValueKind.Null
            ? property.ToString()
            : null;

    private static decimal? GetDecimal(JsonElement element, string propertyName)
    {
        var raw = GetString(element, propertyName);
        return decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            || decimal.TryParse(raw, NumberStyles.Any, CultureInfo.GetCultureInfo("ru-RU"), out parsed)
            ? parsed
            : null;
    }

    private static int? GetInt(JsonElement element, string propertyName)
    {
        var raw = GetString(element, propertyName);
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static int? GetNestedInt(JsonElement element, string propertyName, string nestedPropertyName)
    {
        if (!element.TryGetProperty(propertyName, out var nested) || nested.ValueKind != JsonValueKind.Object)
            return null;

        return GetInt(nested, nestedPropertyName);
    }

    private static double? GetDouble(JsonElement element, string propertyName)
    {
        var raw = GetString(element, propertyName);
        return double.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }
}
