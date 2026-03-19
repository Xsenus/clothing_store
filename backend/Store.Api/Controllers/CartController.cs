using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

/// <summary>
/// Контроллер операций корзины.
/// </summary>
[ApiController]
[Route("cart")]
public class CartController : ControllerBase
{
    private readonly StoreDbContext _db;
    private readonly AuthService _auth;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="CartController"/>.
    /// </summary>
    public CartController(StoreDbContext db, AuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    /// <summary>
    /// Возвращает элементы корзины.
    /// </summary>
    [HttpGet]
    public async Task<IResult> List()
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        return Results.Json(await _db.CartItems.Where(x => x.UserId == user.Id).ToListAsync());
    }

    /// <summary>
    /// Добавляет позицию в корзину.
    /// </summary>
    [HttpPost]
    public async Task<IResult> Add([FromBody] CartItemPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        if (payload.Quantity <= 0) return Results.BadRequest(new { detail = "Количество должно быть больше нуля" });

        var existing = await _db.CartItems.FirstOrDefaultAsync(x => x.UserId == user.Id && x.ProductId == payload.ProductId && x.Size == payload.Size);
        var requestedQuantity = payload.Quantity + (existing?.Quantity ?? 0);
        var availableStock = await GetAvailableStockAsync(payload.ProductId, payload.Size);
        if (!availableStock.HasValue)
            return Results.BadRequest(new { detail = $"Размер {payload.Size} недоступен для товара" });
        if (availableStock.HasValue && requestedQuantity > availableStock.Value)
            return Results.BadRequest(new { detail = $"Недостаточно остатка для размера {payload.Size}. Доступно: {availableStock.Value}" });

        if (existing is null)
        {
            existing = new CartItem { UserId = user.Id, ProductId = payload.ProductId, Size = payload.Size, Quantity = payload.Quantity, Id = Guid.NewGuid().ToString("N") };
            _db.CartItems.Add(existing);
        }
        else
        {
            existing.Quantity += payload.Quantity;
        }

        await _db.SaveChangesAsync();
        return Results.Json(existing);
    }

    /// <summary>
    /// Обновляет количество позиции корзины.
    /// </summary>
    [HttpPatch("{itemId}")]
    public async Task<IResult> Update(string itemId, [FromBody] CartUpdatePayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        if (payload.Quantity <= 0) return Results.BadRequest(new { detail = "Количество должно быть больше нуля" });
        var item = await _db.CartItems.FirstOrDefaultAsync(x => x.Id == itemId && x.UserId == user.Id);
        if (item is null) return Results.NotFound(new { detail = "Item not found" });

        var availableStock = await GetAvailableStockAsync(item.ProductId, item.Size);
        if (!availableStock.HasValue)
            return Results.BadRequest(new { detail = $"Размер {item.Size} недоступен для товара" });
        if (availableStock.HasValue && payload.Quantity > availableStock.Value)
            return Results.BadRequest(new { detail = $"Недостаточно остатка для размера {item.Size}. Доступно: {availableStock.Value}" });

        item.Quantity = payload.Quantity;
        await _db.SaveChangesAsync();
        return Results.Json(item);
    }

    /// <summary>
    /// Удаляет позицию корзины.
    /// </summary>
    [HttpDelete("{itemId}")]
    public async Task<IResult> Delete(string itemId)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        var item = await _db.CartItems.FirstOrDefaultAsync(x => x.Id == itemId && x.UserId == user.Id);
        if (item is not null)
        {
            _db.CartItems.Remove(item);
            await _db.SaveChangesAsync();
        }

        return Results.Ok(new { ok = true });
    }

    /// <summary>
    /// Очищает текущую корзину.
    /// </summary>
    [HttpDelete]
    public async Task<IResult> Clear()
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        var items = await _db.CartItems.Where(x => x.UserId == user.Id).ToListAsync();
        _db.CartItems.RemoveRange(items);
        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    private async Task<int?> GetAvailableStockAsync(string productId, string sizeName)
    {
        var product = await _db.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == productId && !x.IsHidden);
        if (product is null)
            return null;

        var normalizedSize = sizeName.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedSize)) return null;

        var sizeDictionary = await _db.SizeDictionaries.FirstOrDefaultAsync(x => x.Name.ToLower() == normalizedSize);
        if (sizeDictionary is null) return null;

        var stock = await _db.ProductSizeStocks.FirstOrDefaultAsync(x => x.ProductId == productId && x.SizeId == sizeDictionary.Id);
        return stock?.Stock;
    }
}
