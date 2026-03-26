using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;

namespace Store.Api.Services;

public sealed record TelegramGatewayConfiguration(
    bool Enabled,
    string? ApiToken,
    string? SenderUsername,
    int CodeLength,
    int TtlSeconds);

public sealed record TelegramGatewayAvailability(
    bool Available,
    string? Reason,
    TelegramGatewayConfiguration Configuration);

public sealed record TelegramGatewayDeliveryStatus(
    string? Status,
    long? UpdatedAt);

public sealed record TelegramGatewayVerificationStatus(
    string? Status,
    long? UpdatedAt,
    string? CodeEntered);

public sealed record TelegramGatewayRequestStatus(
    string RequestId,
    string? PhoneNumber,
    double? RequestCost,
    bool? IsRefunded,
    double? RemainingBalance,
    TelegramGatewayDeliveryStatus? DeliveryStatus,
    TelegramGatewayVerificationStatus? VerificationStatus,
    string? Payload);

public sealed class TelegramGatewayException : InvalidOperationException
{
    public TelegramGatewayException(string code, string message)
        : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}

public class TelegramGatewayService
{
    private const string BaseUrl = "https://gatewayapi.telegram.org/";
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<TelegramGatewayService> _logger;

    public TelegramGatewayService(
        StoreDbContext db,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        ILogger<TelegramGatewayService> logger)
    {
        _db = db;
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<TelegramGatewayConfiguration> GetConfigurationAsync(CancellationToken cancellationToken = default)
    {
        var enabled = await GetBooleanSettingAsync(
            "telegram_gateway_enabled",
            "Integrations:TelegramGateway:Enabled",
            fallback: false,
            cancellationToken);
        var apiToken = await GetSettingOrConfigAsync(
            "telegram_gateway_api_token",
            "Integrations:TelegramGateway:ApiToken",
            cancellationToken);
        var senderUsername = NormalizeSenderUsername(await GetSettingOrConfigAsync(
            "telegram_gateway_sender_username",
            "Integrations:TelegramGateway:SenderUsername",
            cancellationToken));
        var codeLength = await GetIntSettingAsync(
            "telegram_gateway_code_length",
            "Integrations:TelegramGateway:CodeLength",
            fallback: 6,
            min: 4,
            max: 8,
            cancellationToken);
        var ttlSeconds = await GetIntSettingAsync(
            "telegram_gateway_ttl_seconds",
            "Integrations:TelegramGateway:TtlSeconds",
            fallback: 300,
            min: 30,
            max: 3600,
            cancellationToken);

        return new TelegramGatewayConfiguration(
            Enabled: enabled,
            ApiToken: apiToken,
            SenderUsername: senderUsername,
            CodeLength: codeLength,
            TtlSeconds: ttlSeconds);
    }

    public async Task<TelegramGatewayAvailability> GetAvailabilityAsync(CancellationToken cancellationToken = default)
    {
        var configuration = await GetConfigurationAsync(cancellationToken);
        if (!configuration.Enabled)
        {
            return new TelegramGatewayAvailability(
                Available: false,
                Reason: "Telegram Gateway отключен в настройках.",
                Configuration: configuration);
        }

        if (string.IsNullOrWhiteSpace(configuration.ApiToken))
        {
            return new TelegramGatewayAvailability(
                Available: false,
                Reason: "В настройках не указан API token Telegram Gateway.",
                Configuration: configuration);
        }

        return new TelegramGatewayAvailability(
            Available: true,
            Reason: null,
            Configuration: configuration);
    }

    public async Task<TelegramGatewayRequestStatus> SendVerificationMessageAsync(
        string phoneNumber,
        string? payload = null,
        CancellationToken cancellationToken = default)
    {
        var configuration = await RequireConfigurationAsync(cancellationToken);
        var requestBody = new Dictionary<string, object?>
        {
            ["phone_number"] = phoneNumber,
            ["code_length"] = configuration.CodeLength,
            ["ttl"] = configuration.TtlSeconds
        };

        var normalizedPayload = NormalizePayload(payload);
        if (!string.IsNullOrWhiteSpace(normalizedPayload))
            requestBody["payload"] = normalizedPayload;

        if (!string.IsNullOrWhiteSpace(configuration.SenderUsername))
            requestBody["sender_username"] = configuration.SenderUsername;

        return await SendAsync("sendVerificationMessage", requestBody, configuration.ApiToken!, cancellationToken);
    }

    public async Task<TelegramGatewayRequestStatus> CheckVerificationStatusAsync(
        string requestId,
        string? code = null,
        CancellationToken cancellationToken = default)
    {
        var configuration = await RequireConfigurationAsync(cancellationToken);
        var requestBody = new Dictionary<string, object?>
        {
            ["request_id"] = requestId
        };

        var normalizedCode = NormalizeCode(code);
        if (!string.IsNullOrWhiteSpace(normalizedCode))
            requestBody["code"] = normalizedCode;

        return await SendAsync("checkVerificationStatus", requestBody, configuration.ApiToken!, cancellationToken);
    }

    public async Task<bool> RevokeVerificationMessageAsync(
        string requestId,
        CancellationToken cancellationToken = default)
    {
        var configuration = await RequireConfigurationAsync(cancellationToken);
        var client = CreateClient(configuration.ApiToken!);
        using var response = await client.PostAsJsonAsync(
            "revokeVerificationMessage",
            new Dictionary<string, object?> { ["request_id"] = requestId },
            cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        var envelope = DeserializeEnvelope<bool>(body);
        if (response.IsSuccessStatusCode && envelope?.Ok == true)
            return envelope.Result == true;

        var errorCode = envelope?.Error ?? $"HTTP_{(int)response.StatusCode}";
        _logger.LogWarning(
            "Telegram Gateway revokeVerificationMessage failed. Code={Code}, StatusCode={StatusCode}, Body={Body}",
            errorCode,
            (int)response.StatusCode,
            body);
        throw new TelegramGatewayException(errorCode, MapError(errorCode));
    }

    private async Task<TelegramGatewayConfiguration> RequireConfigurationAsync(CancellationToken cancellationToken)
    {
        var availability = await GetAvailabilityAsync(cancellationToken);
        if (!availability.Available || string.IsNullOrWhiteSpace(availability.Configuration.ApiToken))
            throw new TelegramGatewayException("GATEWAY_NOT_READY", availability.Reason ?? "Telegram Gateway еще не настроен.");

        return availability.Configuration;
    }

    private async Task<TelegramGatewayRequestStatus> SendAsync(
        string method,
        Dictionary<string, object?> requestBody,
        string apiToken,
        CancellationToken cancellationToken)
    {
        var client = CreateClient(apiToken);
        using var response = await client.PostAsJsonAsync(method, requestBody, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        var envelope = DeserializeEnvelope<GatewayRequestStatusDto>(body);

        if (response.IsSuccessStatusCode && envelope?.Ok == true && envelope.Result is not null)
            return MapStatus(envelope.Result);

        var errorCode = envelope?.Error ?? $"HTTP_{(int)response.StatusCode}";
        _logger.LogWarning(
            "Telegram Gateway {Method} failed. Code={Code}, StatusCode={StatusCode}, Body={Body}",
            method,
            errorCode,
            (int)response.StatusCode,
            body);
        throw new TelegramGatewayException(errorCode, MapError(errorCode));
    }

    private HttpClient CreateClient(string apiToken)
    {
        var client = _httpClientFactory.CreateClient(nameof(TelegramGatewayService));
        client.BaseAddress = new Uri(BaseUrl);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiToken);
        return client;
    }

    private static GatewayEnvelope<T>? DeserializeEnvelope<T>(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
            return null;

        try
        {
            return JsonSerializer.Deserialize<GatewayEnvelope<T>>(body, JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    private static TelegramGatewayRequestStatus MapStatus(GatewayRequestStatusDto dto)
    {
        return new TelegramGatewayRequestStatus(
            RequestId: dto.RequestId ?? string.Empty,
            PhoneNumber: dto.PhoneNumber,
            RequestCost: dto.RequestCost,
            IsRefunded: dto.IsRefunded,
            RemainingBalance: dto.RemainingBalance,
            DeliveryStatus: dto.DeliveryStatus is null
                ? null
                : new TelegramGatewayDeliveryStatus(dto.DeliveryStatus.Status, dto.DeliveryStatus.UpdatedAt),
            VerificationStatus: dto.VerificationStatus is null
                ? null
                : new TelegramGatewayVerificationStatus(
                    dto.VerificationStatus.Status,
                    dto.VerificationStatus.UpdatedAt,
                    dto.VerificationStatus.CodeEntered),
            Payload: dto.Payload);
    }

    private async Task<string?> GetSettingOrConfigAsync(
        string key,
        string configPath,
        CancellationToken cancellationToken)
    {
        var row = await _db.AppSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Key == key, cancellationToken);
        if (row is not null && !string.IsNullOrWhiteSpace(row.Value))
            return row.Value.Trim();

        var configValue = _configuration[configPath];
        return string.IsNullOrWhiteSpace(configValue) ? null : configValue.Trim();
    }

    private async Task<bool> GetBooleanSettingAsync(
        string key,
        string configPath,
        bool fallback,
        CancellationToken cancellationToken)
    {
        var raw = await GetSettingOrConfigAsync(key, configPath, cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
            return fallback;

        return raw.Trim().ToLowerInvariant() switch
        {
            "1" or "true" or "yes" or "on" => true,
            "0" or "false" or "no" or "off" => false,
            _ => fallback
        };
    }

    private async Task<int> GetIntSettingAsync(
        string key,
        string configPath,
        int fallback,
        int min,
        int max,
        CancellationToken cancellationToken)
    {
        var raw = await GetSettingOrConfigAsync(key, configPath, cancellationToken);
        if (!int.TryParse(raw, out var parsed))
            return fallback;

        return Math.Clamp(parsed, min, max);
    }

    private static string? NormalizeSenderUsername(string? username)
    {
        var trimmed = (username ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return null;

        return trimmed.TrimStart('@');
    }

    private static string? NormalizePayload(string? payload)
    {
        var trimmed = (payload ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return null;

        return trimmed.Length <= 128 ? trimmed : trimmed[..128];
    }

    private static string? NormalizeCode(string? code)
    {
        var trimmed = (code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return null;

        return trimmed;
    }

    private static string MapError(string code)
    {
        return code switch
        {
            "GATEWAY_NOT_READY" => "Telegram Gateway еще не настроен.",
            "ACCESS_TOKEN_INVALID" => "Указан неверный API token Telegram Gateway.",
            "ACCESS_DENIED" => "Telegram Gateway отклонил запрос. Проверьте ограничения по IP и права токена.",
            "PHONE_NUMBER_INVALID" => "Введите корректный номер телефона в международном формате.",
            "REQUEST_ID_INVALID" => "Сессия подтверждения устарела. Запросите новый код.",
            "NOT_ENOUGH_BALANCE" => "На балансе Telegram Gateway недостаточно средств для отправки кода.",
            "TOO_MANY_REQUESTS" => "Слишком много запросов к Telegram Gateway. Повторите чуть позже.",
            _ => "Не удалось выполнить подтверждение через Telegram Gateway."
        };
    }

    private sealed class GatewayEnvelope<T>
    {
        public bool Ok { get; set; }

        public T? Result { get; set; }

        public string? Error { get; set; }
    }

    private sealed class GatewayRequestStatusDto
    {
        [JsonPropertyName("request_id")]
        public string? RequestId { get; set; }

        [JsonPropertyName("phone_number")]
        public string? PhoneNumber { get; set; }

        [JsonPropertyName("request_cost")]
        public double? RequestCost { get; set; }

        [JsonPropertyName("is_refunded")]
        public bool? IsRefunded { get; set; }

        [JsonPropertyName("remaining_balance")]
        public double? RemainingBalance { get; set; }

        [JsonPropertyName("delivery_status")]
        public GatewayDeliveryStatusDto? DeliveryStatus { get; set; }

        [JsonPropertyName("verification_status")]
        public GatewayVerificationStatusDto? VerificationStatus { get; set; }

        public string? Payload { get; set; }
    }

    private sealed class GatewayDeliveryStatusDto
    {
        public string? Status { get; set; }

        [JsonPropertyName("updated_at")]
        public long? UpdatedAt { get; set; }
    }

    private sealed class GatewayVerificationStatusDto
    {
        public string? Status { get; set; }

        [JsonPropertyName("updated_at")]
        public long? UpdatedAt { get; set; }

        [JsonPropertyName("code_entered")]
        public string? CodeEntered { get; set; }
    }
}

