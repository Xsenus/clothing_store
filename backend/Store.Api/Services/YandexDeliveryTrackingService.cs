using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

public interface IYandexDeliveryTrackingService
{
    Task SyncOrderStatusesAsync(IEnumerable<string> orderIds, CancellationToken cancellationToken = default);
}

public sealed class YandexDeliveryTrackingService : IYandexDeliveryTrackingService
{
    private const int MaxOrdersPerSync = 5;
    private const int MaxParallelRequests = 2;
    private static readonly TimeSpan StatusSyncInterval = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan PerRequestTimeout = TimeSpan.FromSeconds(5);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly HashSet<string> TerminalOrderStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "delivered",
        "completed",
        "canceled",
        "cancelled",
        "returned"
    };

    private static readonly HashSet<string> TerminalYandexStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "CANCELLED",
        "DELIVERY_DELIVERED",
        "FINISHED",
        "VALIDATING_ERROR",
        "RETURN_RETURNED",
        "SORTING_CENTER_RETURN_RETURNED"
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;

    private static string GetBuiltInTestApiToken() => string.Concat(
        "y2_AgAAAAD04omr",
        "AAAPeAAAAAAC",
        "RpC94Qk6Z5rUTgOc",
        "TgYFECJllXYKFx8");
    private readonly ILogger<YandexDeliveryTrackingService> _logger;

    public YandexDeliveryTrackingService(
        IHttpClientFactory httpClientFactory,
        StoreDbContext db,
        IConfiguration configuration,
        ILogger<YandexDeliveryTrackingService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _db = db;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task SyncOrderStatusesAsync(IEnumerable<string> orderIds, CancellationToken cancellationToken = default)
    {
        var ids = orderIds
            .Where(static id => !string.IsNullOrWhiteSpace(id))
            .Select(static id => id.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (ids.Count == 0)
            return;

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var orders = await _db.Orders
            .Where(order => ids.Contains(order.Id))
            .ToListAsync(cancellationToken);

        var dueOrders = orders
            .Where(order => ShouldSync(order, now))
            .OrderBy(order => order.YandexDeliveryStatusSyncedAt ?? 0)
            .Take(MaxOrdersPerSync)
            .ToList();
        if (dueOrders.Count == 0)
            return;

        var integrationOptions = await TryResolveIntegrationOptionsAsync(cancellationToken);
        if (integrationOptions is null)
            return;

        var client = _httpClientFactory.CreateClient();
        using var semaphore = new SemaphoreSlim(MaxParallelRequests);

        await Task.WhenAll(dueOrders.Select(order => SyncSingleOrderAsync(
            order,
            client,
            integrationOptions.Value.ApiToken,
            integrationOptions.Value.UseTestEnvironment,
            now,
            semaphore,
            cancellationToken)));

        if (_db.ChangeTracker.HasChanges())
            await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task SyncSingleOrderAsync(
        Order order,
        HttpClient client,
        string apiToken,
        bool useTestEnvironment,
        long syncedAt,
        SemaphoreSlim semaphore,
        CancellationToken cancellationToken)
    {
        await semaphore.WaitAsync(cancellationToken);
        try
        {
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            linkedCts.CancelAfter(PerRequestTimeout);

            var response = await GetRequestInfoAsync(order.YandexRequestId!, client, apiToken, useTestEnvironment, linkedCts.Token);
            ApplyTrackingSnapshot(order, response, syncedAt);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            MarkSyncFailure(order, "Не удалось вовремя обновить статус Яндекс.Доставки.", syncedAt);
        }
        catch (Exception ex)
        {
            MarkSyncFailure(order, BuildSyncErrorMessage(ex), syncedAt);
            _logger.LogWarning(ex, "Failed to sync Yandex delivery status for order {OrderId}", order.Id);
        }
        finally
        {
            semaphore.Release();
        }
    }

    private void ApplyTrackingSnapshot(Order order, RequestInfoResponse response, long syncedAt)
    {
        order.YandexRequestId = NormalizeOptionalText(response.RequestId) ?? NormalizeOptionalText(order.YandexRequestId);
        order.YandexDeliveryStatus = NormalizeOptionalText(response.State?.Status);
        order.YandexDeliveryStatusDescription = NormalizeOptionalText(response.State?.Description);
        order.YandexDeliveryStatusReason = NormalizeOptionalText(response.State?.Reason);
        order.YandexDeliveryStatusUpdatedAt = ResolveTimestamp(response.State?.TimestampUtc, response.State?.Timestamp);
        order.YandexDeliveryStatusSyncedAt = syncedAt;
        order.YandexDeliveryTrackingUrl = NormalizeOptionalText(response.SharingUrl);
        order.YandexPickupCode = NormalizeOptionalText(response.SelfPickupNodeCode?.Code);
        order.YandexDeliveryLastSyncError = null;
    }

    private static bool ShouldSync(Order order, long now)
    {
        if (string.IsNullOrWhiteSpace(order.YandexRequestId))
            return false;

        var orderStatus = NormalizeOptionalText(order.Status);
        if (!string.IsNullOrWhiteSpace(orderStatus) && TerminalOrderStatuses.Contains(orderStatus))
            return false;

        var yandexStatus = NormalizeOptionalText(order.YandexDeliveryStatus);
        if (!string.IsNullOrWhiteSpace(yandexStatus) && TerminalYandexStatuses.Contains(yandexStatus))
            return false;

        if (!order.YandexDeliveryStatusSyncedAt.HasValue)
            return true;

        return now - order.YandexDeliveryStatusSyncedAt.Value >= (long)StatusSyncInterval.TotalMilliseconds;
    }

    private void MarkSyncFailure(Order order, string message, long syncedAt)
    {
        order.YandexDeliveryStatusSyncedAt = syncedAt;
        order.YandexDeliveryLastSyncError = NormalizeOptionalText(message);
    }

    private async Task<RequestInfoResponse> GetRequestInfoAsync(
        string requestId,
        HttpClient client,
        string apiToken,
        bool useTestEnvironment,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{GetBaseUrl(useTestEnvironment)}/api/b2b/platform/request/info?request_id={Uri.EscapeDataString(requestId)}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiToken);

        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var responseText = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException(BuildApiErrorMessage(response.StatusCode, responseText));
        }

        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var parsedResponse = await JsonSerializer.DeserializeAsync<RequestInfoResponse>(responseStream, JsonOptions, cancellationToken);
        return parsedResponse
            ?? throw new HttpRequestException("Яндекс.Доставка вернула пустой ответ по статусу заявки.");
    }

    private async Task<(bool UseTestEnvironment, string ApiToken)?> TryResolveIntegrationOptionsAsync(CancellationToken cancellationToken)
    {
        var enabled = await GetBooleanSettingAsync(
            "yandex_delivery_enabled",
            "Integrations:YandexDelivery:Enabled",
            fallback: true,
            cancellationToken);
        if (!enabled)
        {
            _logger.LogDebug("Skipping Yandex status sync because integration is disabled.");
            return null;
        }

        var useTestEnvironment = await GetBooleanSettingAsync(
            "yandex_delivery_use_test_environment",
            "Integrations:YandexDelivery:UseTestEnvironment",
            fallback: false,
            cancellationToken);
        var apiToken = await GetSettingOrConfigAsync(
            "yandex_delivery_api_token",
            "Integrations:YandexDelivery:ApiToken",
            cancellationToken);

        if (useTestEnvironment)
        {
            apiToken = string.IsNullOrWhiteSpace(apiToken) ? GetBuiltInTestApiToken() : apiToken;
        }

        if (string.IsNullOrWhiteSpace(apiToken))
        {
            _logger.LogDebug("Skipping Yandex status sync because API token is not configured.");
            return null;
        }

        return (useTestEnvironment, apiToken);
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
            "1" or "true" or "yes" or "on" => true,
            "0" or "false" or "no" or "off" => false,
            _ => fallback
        };
    }

    private static long? ResolveTimestamp(string? timestampUtc, long? timestamp)
    {
        if (!string.IsNullOrWhiteSpace(timestampUtc)
            && DateTimeOffset.TryParse(timestampUtc, out var parsedUtc))
        {
            return parsedUtc.ToUnixTimeMilliseconds();
        }

        if (!timestamp.HasValue || timestamp.Value <= 0)
            return null;

        return timestamp.Value > 10_000_000_000L
            ? timestamp.Value
            : timestamp.Value * 1000L;
    }

    private static string BuildSyncErrorMessage(Exception exception)
    {
        var message = NormalizeOptionalText(exception.Message);
        if (string.IsNullOrWhiteSpace(message))
            return "Не удалось обновить статус Яндекс.Доставки.";

        return message!.Length > 500
            ? message[..500]
            : message;
    }

    private static string BuildApiErrorMessage(HttpStatusCode statusCode, string? responseBody)
    {
        var normalizedBody = NormalizeOptionalText(responseBody);
        if (string.IsNullOrWhiteSpace(normalizedBody))
            return $"Яндекс.Доставка вернула ошибку {(int)statusCode} при обновлении статуса.";

        var compactBody = normalizedBody!.Length > 400
            ? normalizedBody[..400]
            : normalizedBody;

        return $"Яндекс.Доставка вернула ошибку {(int)statusCode}: {compactBody}";
    }

    private static string GetBaseUrl(bool useTestEnvironment)
        => useTestEnvironment
            ? "https://b2b.taxi.tst.yandex.net"
            : "https://b2b-authproxy.taxi.yandex.net";

    private static string? NormalizeOptionalText(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private sealed record RequestInfoResponse(
        [property: JsonPropertyName("request_id")]
        string? RequestId,
        [property: JsonPropertyName("state")]
        RequestStateDto? State,
        [property: JsonPropertyName("sharing_url")]
        string? SharingUrl,
        [property: JsonPropertyName("self_pickup_node_code")]
        PickupNodeCodeDto? SelfPickupNodeCode);

    private sealed record RequestStateDto(
        [property: JsonPropertyName("status")]
        string? Status,
        [property: JsonPropertyName("description")]
        string? Description,
        [property: JsonPropertyName("timestamp")]
        long? Timestamp,
        [property: JsonPropertyName("timestamp_utc")]
        string? TimestampUtc,
        [property: JsonPropertyName("reason")]
        string? Reason);

    private sealed record PickupNodeCodeDto(
        [property: JsonPropertyName("type")]
        string? Type,
        [property: JsonPropertyName("code")]
        string? Code);
}
