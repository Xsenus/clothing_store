using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

/// <summary>
/// Контроллер операций с заказами.
/// </summary>
[ApiController]
[Route("orders")]
public class OrdersController : ControllerBase
{
    private readonly StoreDbContext _db;
    private readonly AuthService _auth;
    private readonly IOrderEmailQueue _orderEmailQueue;
    private readonly IYandexDeliveryTrackingService _yandexDeliveryTrackingService;

    private sealed record NormalizedOrderItem(string ProductId, string Size, string LookupSize, int Quantity);

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="OrdersController"/>.
    /// </summary>
    public OrdersController(
        StoreDbContext db,
        AuthService auth,
        IOrderEmailQueue orderEmailQueue,
        IYandexDeliveryTrackingService yandexDeliveryTrackingService)
    {
        _db = db;
        _auth = auth;
        _orderEmailQueue = orderEmailQueue;
        _yandexDeliveryTrackingService = yandexDeliveryTrackingService;
    }

    /// <summary>
    /// Р’РѕР·РІСЂР°С‰Р°РµС‚ Р·Р°РєР°Р·С‹ С‚РµРєСѓС‰РµРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.
    /// </summary>
    [HttpGet]
    public async Task<IResult> List()
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        var orders = await _db.Orders
            .Where(x => x.UserId == user.Id)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();
        await _yandexDeliveryTrackingService.SyncOrderStatusesAsync(
            orders.Select(order => order.Id),
            HttpContext.RequestAborted);

        var parsedItemsByOrderId = orders.ToDictionary(
            x => x.Id,
            x => OrderPresentation.ParseStoredOrderItems(x.ItemsJson),
            StringComparer.Ordinal);
        var missingProductSnapshotIds = parsedItemsByOrderId.Values
            .SelectMany(x => x)
            .Where(x => string.IsNullOrWhiteSpace(x.ProductName) || string.IsNullOrWhiteSpace(x.ProductImageUrl) || !x.UnitPrice.HasValue)
            .Select(x => x.ProductId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct()
            .ToList();
        var productSnapshots = missingProductSnapshotIds.Count == 0
            ? new Dictionary<string, ProductOrderSnapshot>(StringComparer.Ordinal)
            : (await _db.Products
                .AsNoTracking()
                .Where(x => missingProductSnapshotIds.Contains(x.Id))
                .ToListAsync())
                .Select(OrderPresentation.BuildProductSnapshot)
                .ToDictionary(x => x.ProductId, StringComparer.Ordinal);

        return Results.Json(orders.Select(order =>
        {
            var items = parsedItemsByOrderId.GetValueOrDefault(order.Id) ?? [];
            return new
            {
                order.Id,
                order.OrderNumber,
                displayOrderNumber = OrderPresentation.FormatOrderNumber(order.OrderNumber),
                items = items.Select(item =>
                {
                    var productSnapshot = productSnapshots.GetValueOrDefault(item.ProductId);
                    var unitPrice = Math.Round(item.UnitPrice ?? productSnapshot?.UnitPrice ?? 0d, 2, MidpointRounding.AwayFromZero);
                    return new
                    {
                        item.ProductId,
                        productName = item.ProductName ?? productSnapshot?.Name ?? item.ProductId,
                        productImageUrl = item.ProductImageUrl ?? productSnapshot?.ImageUrl,
                        item.Size,
                        item.Quantity,
                        unitPrice,
                        lineTotal = Math.Round(unitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero)
                    };
                }),
                order.TotalAmount,
                order.ShippingAmount,
                order.Status,
                order.PaymentMethod,
                order.ShippingMethod,
                order.PickupPointId,
                order.YandexRequestId,
                order.YandexDeliveryStatus,
                order.YandexDeliveryStatusDescription,
                order.YandexDeliveryStatusReason,
                order.YandexDeliveryStatusUpdatedAt,
                order.YandexDeliveryStatusSyncedAt,
                order.YandexDeliveryTrackingUrl,
                order.YandexPickupCode,
                order.YandexDeliveryLastSyncError,
                order.ShippingAddress,
                order.CreatedAt
            };
        }).ToList());
    }

    /// <summary>
    /// РЎРѕР·РґР°С‘С‚ Р·Р°РєР°Р·.
    /// </summary>
    [HttpPost]
    public async Task<IResult> Create([FromBody] OrderPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var normalizedItems = NormalizeOrderItems(payload.Items);
        if (normalizedItems.Count == 0)
            return Results.BadRequest(new { detail = "Корзина пуста" });

        try
        {
            await using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);

            var sizeLookups = normalizedItems.Select(x => x.LookupSize).Distinct().ToList();
            var sizeDictionaries = await _db.SizeDictionaries
                .Where(x => sizeLookups.Contains(x.Name.ToLower()))
                .ToListAsync();
            var sizeMap = sizeDictionaries.ToDictionary(x => x.Name.Trim().ToLowerInvariant(), x => x, StringComparer.OrdinalIgnoreCase);

            foreach (var item in normalizedItems)
            {
                if (!sizeMap.ContainsKey(item.LookupSize))
                    return Results.BadRequest(new { detail = $"Размер {item.Size} недоступен для товара {item.ProductId}" });
            }

            var requestedSizeIds = sizeMap.Values.Select(x => x.Id).Distinct().ToList();
            var requestedProductIds = normalizedItems.Select(x => x.ProductId).Distinct().ToList();
            var requestedProducts = await _db.Products
                .AsNoTracking()
                .Where(x => requestedProductIds.Contains(x.Id) && !x.IsHidden)
                .ToListAsync();
            var productSnapshots = requestedProducts
                .Select(OrderPresentation.BuildProductSnapshot)
                .ToDictionary(x => x.ProductId, StringComparer.Ordinal);
            var unavailableProductId = requestedProductIds.FirstOrDefault(productId => !productSnapshots.ContainsKey(productId));
            if (!string.IsNullOrWhiteSpace(unavailableProductId))
                return Results.BadRequest(new { detail = $"Товар {unavailableProductId} больше недоступен" });

            var stockRows = await _db.ProductSizeStocks
                .Where(x => requestedProductIds.Contains(x.ProductId) && requestedSizeIds.Contains(x.SizeId))
                .ToListAsync();
            var stockMap = stockRows.ToDictionary(x => $"{x.ProductId}:{x.SizeId}", x => x, StringComparer.Ordinal);

            foreach (var item in normalizedItems)
            {
                var sizeDictionary = sizeMap[item.LookupSize];
                var stockKey = $"{item.ProductId}:{sizeDictionary.Id}";
                if (!stockMap.TryGetValue(stockKey, out var row))
                    return Results.BadRequest(new { detail = $"Размер {item.Size} недоступен для товара {item.ProductId}" });

                if (row.Stock < item.Quantity)
                    return Results.BadRequest(new { detail = $"Недостаточно остатка для товара {item.ProductId}, размер {item.Size}. Доступно: {row.Stock}" });
            }

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var orderId = Guid.NewGuid().ToString("N");
            foreach (var item in normalizedItems)
            {
                var sizeDictionary = sizeMap[item.LookupSize];
                var row = stockMap[$"{item.ProductId}:{sizeDictionary.Id}"];
                var oldValue = row.Stock;
                row.Stock -= item.Quantity;

                _db.StockChangeHistories.Add(new StockChangeHistory
                {
                    ProductId = item.ProductId,
                    SizeId = sizeDictionary.Id,
                    ChangedByUserId = user.Id,
                    Reason = "purchase",
                    OrderId = orderId,
                    OldValue = oldValue,
                    NewValue = row.Stock,
                    ChangedAt = now
                });
            }

            var serializedItems = normalizedItems
                .Select(item =>
                {
                    var productSnapshot = productSnapshots[item.ProductId];
                    var unitPrice = Math.Round(productSnapshot.UnitPrice, 2, MidpointRounding.AwayFromZero);
                    return new
                    {
                        productId = item.ProductId,
                        productName = productSnapshot.Name,
                        productImageUrl = productSnapshot.ImageUrl,
                        unitPrice,
                        size = item.Size,
                        quantity = item.Quantity
                    };
                })
                .ToList();
            var computedItemsAmount = Math.Round(serializedItems.Sum(item => item.unitPrice * item.quantity), 2, MidpointRounding.AwayFromZero);
            var resolvedShippingAmount = Math.Max(0d, Math.Round(payload.ShippingAmount ?? 0d, 2, MidpointRounding.AwayFromZero));
            var resolvedTotalAmount = Math.Round(computedItemsAmount + resolvedShippingAmount, 2, MidpointRounding.AwayFromZero);

            var resolvedStatus = string.IsNullOrWhiteSpace(payload.Status)
                ? "processing"
                : payload.Status.Trim().ToLowerInvariant();
            var resolvedPaymentMethod = string.IsNullOrWhiteSpace(payload.PaymentMethod)
                ? "cod"
                : payload.PaymentMethod.Trim().ToLowerInvariant();
            var resolvedPurchaseChannel = string.IsNullOrWhiteSpace(payload.PurchaseChannel)
                ? "web"
                : payload.PurchaseChannel.Trim().ToLowerInvariant();
            var resolvedShippingMethod = string.Equals(payload.ShippingMethod?.Trim(), "pickup", StringComparison.OrdinalIgnoreCase)
                ? "pickup"
                : "home";
            var resolvedPickupPointId = string.IsNullOrWhiteSpace(payload.PickupPointId)
                ? null
                : payload.PickupPointId.Trim();
            var resolvedCustomerName = payload.CustomerName?.Trim() ?? string.Empty;
            var resolvedCustomerEmail = string.IsNullOrWhiteSpace(payload.CustomerEmail)
                ? user.Email
                : payload.CustomerEmail.Trim();
            var resolvedCustomerPhone = payload.CustomerPhone?.Trim() ?? string.Empty;
            var resolvedShippingAddress = payload.ShippingAddress?.Trim() ?? string.Empty;
            var initialHistory = new[]
            {
                new Dictionary<string, object?>
                {
                    ["kind"] = "created",
                    ["changedAt"] = now,
                    ["changedBy"] = user.Email,
                    ["comment"] = "Заказ создан"
                }
            };

            var order = new Order
            {
                Id = orderId,
                UserId = user.Id,
                ItemsJson = JsonSerializer.Serialize(serializedItems),
                TotalAmount = resolvedTotalAmount,
                Status = resolvedStatus,
                PaymentMethod = resolvedPaymentMethod,
                PurchaseChannel = resolvedPurchaseChannel,
                ShippingMethod = resolvedShippingMethod,
                ShippingAmount = resolvedShippingAmount,
                PickupPointId = resolvedPickupPointId,
                ShippingAddress = resolvedShippingAddress,
                CustomerName = resolvedCustomerName,
                CustomerEmail = resolvedCustomerEmail,
                CustomerPhone = resolvedCustomerPhone,
                StatusHistoryJson = JsonSerializer.Serialize(initialHistory),
                CreatedAt = now,
                UpdatedAt = now
            };
            _db.Orders.Add(order);

            var cartItems = await _db.CartItems.Where(x => x.UserId == user.Id).ToListAsync();
            if (cartItems.Count > 0)
                _db.CartItems.RemoveRange(cartItems);

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            _orderEmailQueue.QueueOrderCreatedEmail(order);
            return Results.Ok(new
            {
                id = order.Id,
                orderNumber = order.OrderNumber,
                displayOrderNumber = OrderPresentation.FormatOrderNumber(order.OrderNumber)
            });
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.SerializationFailure)
        {
            return Results.Conflict(new { detail = "Остатки изменились во время оформления заказа. Обновите корзину и попробуйте снова." });
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.SerializationFailure })
        {
            return Results.Conflict(new { detail = "Остатки изменились во время оформления заказа. Обновите корзину и попробуйте снова." });
        }
    }

    private static List<NormalizedOrderItem> NormalizeOrderItems(List<Dictionary<string, object>> items)
    {
        var parsedItems = new List<NormalizedOrderItem>();
        foreach (var item in items)
        {
            if (!item.TryGetValue("productId", out var productValue)
                || !item.TryGetValue("size", out var sizeValue)
                || !item.TryGetValue("quantity", out var quantityValue))
            {
                continue;
            }

            var productId = AsString(productValue).Trim();
            var size = AsString(sizeValue).Trim();
            var quantity = AsInt(quantityValue);
            if (string.IsNullOrWhiteSpace(productId) || string.IsNullOrWhiteSpace(size) || quantity <= 0)
                continue;

            parsedItems.Add(new NormalizedOrderItem(productId, size, size.ToLowerInvariant(), quantity));
        }

        return parsedItems
            .GroupBy(x => $"{x.ProductId}\u001f{x.LookupSize}", StringComparer.Ordinal)
            .Select(group =>
            {
                var first = group.First();
                return new NormalizedOrderItem(first.ProductId, first.Size, first.LookupSize, group.Sum(x => x.Quantity));
            })
            .ToList();
    }

    private static string AsString(object value)
    {
        return value switch
        {
            null => string.Empty,
            JsonElement element when element.ValueKind == JsonValueKind.String => element.GetString() ?? string.Empty,
            JsonValue jsonValue => jsonValue.GetValue<string?>() ?? string.Empty,
            _ => value.ToString() ?? string.Empty
        };
    }

    private static int AsInt(object value)
    {
        return value switch
        {
            JsonElement element when element.ValueKind == JsonValueKind.Number => element.GetInt32(),
            JsonElement element when element.ValueKind == JsonValueKind.String && int.TryParse(element.GetString(), out var parsed) => parsed,
            JsonValue jsonValue when int.TryParse(jsonValue.ToString(), out var parsed) => parsed,
            int intValue => intValue,
            long longValue => (int)longValue,
            double doubleValue => (int)doubleValue,
            decimal decimalValue => (int)decimalValue,
            _ when int.TryParse(value?.ToString(), out var parsed) => parsed,
            _ => 0
        };
    }
}
