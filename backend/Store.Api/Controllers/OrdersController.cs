using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="OrdersController"/>.
    /// </summary>
    public OrdersController(StoreDbContext db, AuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    /// <summary>
    /// Возвращает заказы текущего пользователя.
    /// </summary>
    [HttpGet]
    public async Task<IResult> List()
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        return Results.Json(await _db.Orders.Where(x => x.UserId == user.Id).OrderByDescending(x => x.CreatedAt).Select(x => new
        {
            x.Id,
            items = x.ItemsJson,
            x.TotalAmount,
            x.Status,
            x.CreatedAt
        }).ToListAsync());
    }

    /// <summary>
    /// Создаёт заказ.
    /// </summary>
    [HttpPost]
    public async Task<IResult> Create([FromBody] OrderPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var normalizedItems = NormalizeOrderItems(payload.Items);
        if (normalizedItems.Count == 0)
            return Results.BadRequest(new { detail = "Корзина пуста" });

        await using var tx = await _db.Database.BeginTransactionAsync();
        foreach (var item in normalizedItems)
        {
            var availableStock = await GetAvailableStockAsync(item.ProductId, item.Size);
            if (!availableStock.HasValue)
                continue;

            if (availableStock.Value < item.Quantity)
                return Results.BadRequest(new { detail = $"Недостаточно остатка для товара {item.ProductId}, размер {item.Size}. Доступно: {availableStock.Value}" });
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var orderId = Guid.NewGuid().ToString("N");
        foreach (var item in normalizedItems)
        {
            var sizeDictionary = await _db.SizeDictionaries.FirstOrDefaultAsync(x => x.Name.ToLower() == item.Size.Trim().ToLowerInvariant());
            if (sizeDictionary is null)
                continue;

            var row = await _db.ProductSizeStocks.FirstOrDefaultAsync(x => x.ProductId == item.ProductId && x.SizeId == sizeDictionary.Id);
            if (row is null)
                continue;

            var oldValue = row.Stock;
            row.Stock = Math.Max(0, row.Stock - item.Quantity);

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

        var order = new Order
        {
            Id = orderId,
            UserId = user.Id,
            ItemsJson = JsonSerializer.Serialize(payload.Items),
            TotalAmount = payload.TotalAmount,
            Status = payload.Status ?? "processing",
            CreatedAt = now
        };
        _db.Orders.Add(order);

        var cartItems = await _db.CartItems.Where(x => x.UserId == user.Id).ToListAsync();
        if (cartItems.Count > 0)
            _db.CartItems.RemoveRange(cartItems);

        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return Results.Ok(new { id = order.Id });
    }

    private static List<(string ProductId, string Size, int Quantity)> NormalizeOrderItems(List<Dictionary<string, object>> items)
    {
        var result = new List<(string ProductId, string Size, int Quantity)>();
        foreach (var item in items)
        {
            if (!item.TryGetValue("productId", out var productValue)
                || !item.TryGetValue("size", out var sizeValue)
                || !item.TryGetValue("quantity", out var quantityValue))
            {
                continue;
            }

            var productId = AsString(productValue);
            var size = AsString(sizeValue);
            var quantity = AsInt(quantityValue);
            if (string.IsNullOrWhiteSpace(productId) || string.IsNullOrWhiteSpace(size) || quantity <= 0)
                continue;

            result.Add((productId, size, quantity));
        }

        return result;
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

    private async Task<int?> GetAvailableStockAsync(string productId, string sizeName)
    {
        var normalizedSize = sizeName.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedSize)) return null;

        var sizeDictionary = await _db.SizeDictionaries.FirstOrDefaultAsync(x => x.Name.ToLower() == normalizedSize);
        if (sizeDictionary is null) return null;

        var stock = await _db.ProductSizeStocks.FirstOrDefaultAsync(x => x.ProductId == productId && x.SizeId == sizeDictionary.Id);
        return stock?.Stock;
    }
}
