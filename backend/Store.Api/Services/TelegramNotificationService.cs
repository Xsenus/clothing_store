using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

public class TelegramNotificationService
{
    private static readonly IReadOnlyDictionary<string, string> OrderStatusLabels = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["processing"] = "В обработке",
        ["created"] = "Оформлен",
        ["paid"] = "Оплачен",
        ["pending_payment"] = "Ожидает оплаты",
        ["in_transit"] = "В пути",
        ["delivered"] = "Доставлен",
        ["completed"] = "Завершен",
        ["canceled"] = "Отменен",
        ["cancelled"] = "Отменен",
        ["returned"] = "Возврат"
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly StoreDbContext _db;
    private readonly UserIdentityService _userIdentityService;
    private readonly ILogger<TelegramNotificationService> _logger;

    public TelegramNotificationService(
        IHttpClientFactory httpClientFactory,
        StoreDbContext db,
        UserIdentityService userIdentityService,
        ILogger<TelegramNotificationService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _db = db;
        _userIdentityService = userIdentityService;
        _logger = logger;
    }

    public async Task TrySendOrderStatusChangedAsync(
        Order order,
        string previousStatus,
        string? managerComment,
        CancellationToken cancellationToken = default)
    {
        var formattedOrderNumber = ResolveOrderNumber(order);
        var text = new StringBuilder()
            .Append("Статус заказа ")
            .Append(formattedOrderNumber)
            .AppendLine(" обновлен.")
            .Append("Было: ")
            .AppendLine(ResolveOrderStatusLabel(previousStatus))
            .Append("Стало: ")
            .AppendLine(ResolveOrderStatusLabel(order.Status));

        if (!string.IsNullOrWhiteSpace(managerComment))
            text.Append("Комментарий: ").AppendLine(managerComment.Trim());

        var trackingUrl = ResolveTrackingUrl(order);
        if (!string.IsNullOrWhiteSpace(trackingUrl))
            text.Append("Отслеживание: ").AppendLine(trackingUrl);

        await TrySendToConfirmedTelegramAsync(order.UserId, text.ToString().Trim(), cancellationToken);
    }

    public async Task TrySendOrderDeliveryUpdatedAsync(
        Order order,
        string? previousDeliveryStatus,
        string? previousDeliveryDescription,
        CancellationToken cancellationToken = default)
    {
        var previousLabel = ResolveDeliveryStatusLabel(previousDeliveryStatus, previousDeliveryDescription);
        var nextLabel = ResolveDeliveryStatusLabel(
            string.IsNullOrWhiteSpace(order.ShippingStatus) ? order.YandexDeliveryStatus : order.ShippingStatus,
            string.IsNullOrWhiteSpace(order.ShippingStatusDescription) ? order.YandexDeliveryStatusDescription : order.ShippingStatusDescription);
        var formattedOrderNumber = ResolveOrderNumber(order);

        var text = new StringBuilder()
            .Append("Доставка заказа ")
            .Append(formattedOrderNumber)
            .AppendLine(" обновлена.")
            .Append("Было: ")
            .AppendLine(previousLabel)
            .Append("Стало: ")
            .AppendLine(nextLabel);

        if (!string.IsNullOrWhiteSpace(order.YandexPickupCode))
            text.Append("Код получения: ").AppendLine(order.YandexPickupCode.Trim());

        var trackingUrl = ResolveTrackingUrl(order);
        if (!string.IsNullOrWhiteSpace(trackingUrl))
            text.Append("Отслеживание: ").AppendLine(trackingUrl);

        await TrySendToConfirmedTelegramAsync(order.UserId, text.ToString().Trim(), cancellationToken);
    }

    private async Task TrySendToConfirmedTelegramAsync(string? userId, string message, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(message))
            return;

        var identity = await _userIdentityService.GetVerifiedTelegramIdentityAsync(userId, cancellationToken);
        if (identity is null || !identity.ChatId.HasValue || string.IsNullOrWhiteSpace(identity.BotId))
            return;

        var bot = await _db.TelegramBots
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.Id == identity.BotId && x.Enabled && !string.IsNullOrWhiteSpace(x.Token),
                cancellationToken);
        if (bot is null)
            return;

        try
        {
            var client = _httpClientFactory.CreateClient();
            using var request = new HttpRequestMessage(HttpMethod.Post, $"https://api.telegram.org/bot{bot.Token}/sendMessage")
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(new
                    {
                        chat_id = identity.ChatId.Value,
                        text = message,
                        disable_web_page_preview = true
                    }),
                    Encoding.UTF8,
                    "application/json")
            };

            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var detail = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning(
                    "Telegram notification for user {UserId} was not delivered: {StatusCode} {Detail}",
                    userId,
                    (int)response.StatusCode,
                    detail);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send telegram notification for user {UserId}", userId);
        }
    }

    private static string ResolveOrderNumber(Order order)
    {
        var formatted = OrderPresentation.FormatOrderNumber(order.OrderNumber);
        return string.IsNullOrWhiteSpace(formatted) ? order.Id : formatted;
    }

    private static string ResolveOrderStatusLabel(string? status)
    {
        var normalized = status?.Trim().ToLowerInvariant() ?? string.Empty;
        return OrderStatusLabels.TryGetValue(normalized, out var label)
            ? label
            : string.IsNullOrWhiteSpace(normalized)
                ? "Статус уточняется"
                : normalized;
    }

    private static string ResolveDeliveryStatusLabel(string? statusCode, string? description)
    {
        var normalizedDescription = description?.Trim();
        if (!string.IsNullOrWhiteSpace(normalizedDescription))
            return normalizedDescription;

        var normalizedCode = statusCode?.Trim();
        return string.IsNullOrWhiteSpace(normalizedCode) ? "Статус уточняется" : normalizedCode;
    }

    private static string? ResolveTrackingUrl(Order order)
    {
        var genericUrl = order.ShippingTrackingUrl?.Trim();
        if (!string.IsNullOrWhiteSpace(genericUrl))
            return genericUrl;

        var yandexUrl = order.YandexDeliveryTrackingUrl?.Trim();
        return string.IsNullOrWhiteSpace(yandexUrl) ? null : yandexUrl;
    }
}
