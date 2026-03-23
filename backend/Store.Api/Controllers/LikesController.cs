using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

/// <summary>
/// Контроллер операций с лайками товаров.
/// </summary>
[ApiController]
[Route("likes")]
public class LikesController : ControllerBase
{
    private readonly StoreDbContext _db;
    private readonly AuthService _auth;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="LikesController"/>.
    /// </summary>
    public LikesController(StoreDbContext db, AuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    /// <summary>
    /// Возвращает лайки текущего пользователя.
    /// </summary>
    [HttpGet]
    public async Task<IResult> List()
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        var likes = await _db.Likes
            .Where(x => x.UserId == user.Id)
            .ToListAsync();
        var productPayloads = await BuildProductPayloadMapAsync(likes.Select(x => x.ProductId));

        return Results.Json(likes.Select(like => new
        {
            id = like.Id,
            userId = like.UserId,
            productId = like.ProductId,
            product = productPayloads.GetValueOrDefault(like.ProductId)
        }));
    }

    /// <summary>
    /// Переключает состояние лайка для товара.
    /// </summary>
    [HttpPost("toggle")]
    public async Task<IResult> Toggle([FromBody] LikeTogglePayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        var existing = await _db.Likes.FirstOrDefaultAsync(x => x.UserId == user.Id && x.ProductId == payload.ProductId);
        var product = await _db.Products.FirstOrDefaultAsync(x => x.Id == payload.ProductId);
        if (product is null) return Results.BadRequest(new { detail = "Product not found" });
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (existing is null)
        {
            if (product.IsHidden)
                return Results.BadRequest(new { detail = "Товар больше недоступен" });

            _db.Likes.Add(new Like { Id = Guid.NewGuid().ToString("N"), UserId = user.Id, ProductId = payload.ProductId });
            _db.FavoriteEvents.Add(new FavoriteEvent
            {
                Id = Guid.NewGuid().ToString("N"),
                UserId = user.Id,
                ProductId = payload.ProductId,
                EventType = "added",
                CreatedAt = now
            });
            product.LikesCount += 1;
        }
        else
        {
            _db.Likes.Remove(existing);
            _db.FavoriteEvents.Add(new FavoriteEvent
            {
                Id = Guid.NewGuid().ToString("N"),
                UserId = user.Id,
                ProductId = payload.ProductId,
                EventType = "removed",
                CreatedAt = now
            });
            product.LikesCount = Math.Max(0, product.LikesCount - 1);
        }

        var json = ProductJsonService.Parse(product);
        json["likesCount"] = product.LikesCount;
        product.Data = json.ToJsonString();
        await _db.SaveChangesAsync();
        return Results.Json(new
        {
            liked = existing is null,
            likesCount = product.LikesCount
        });
    }

    private async Task<Dictionary<string, JsonObject>> BuildProductPayloadMapAsync(IEnumerable<string> productIds)
    {
        var ids = productIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (ids.Count == 0)
            return [];

        var products = await _db.Products
            .AsNoTracking()
            .Where(x => ids.Contains(x.Id))
            .ToListAsync();
        if (products.Count == 0)
            return [];

        var sizeMap = await _db.SizeDictionaries
            .AsNoTracking()
            .Select(x => new { x.Id, x.Name })
            .ToDictionaryAsync(x => x.Id, x => x.Name, StringComparer.Ordinal);
        var stockRows = await _db.ProductSizeStocks
            .AsNoTracking()
            .Where(x => ids.Contains(x.ProductId))
            .ToListAsync();
        var stockByProduct = stockRows
            .GroupBy(x => x.ProductId, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group.ToDictionary(
                    row => sizeMap.GetValueOrDefault(row.SizeId, row.SizeId),
                    row => row.Stock,
                    StringComparer.OrdinalIgnoreCase),
                StringComparer.Ordinal);

        return products.ToDictionary(product => product.Id, product =>
        {
            var json = ProductJsonService.Parse(product);
            if (stockByProduct.TryGetValue(product.Id, out var stockPayload))
            {
                json["sizes"] = new JsonArray(stockPayload.Keys.Select(sizeName => JsonValue.Create(sizeName)).ToArray());
                var stockObject = new JsonObject();
                foreach (var (sizeName, quantity) in stockPayload)
                    stockObject[sizeName] = quantity;
                json["sizeStock"] = stockObject;
            }

            json["isHidden"] = product.IsHidden;
            json["hiddenAt"] = product.HiddenAt.HasValue ? JsonValue.Create(product.HiddenAt.Value) : null;
            return json;
        }, StringComparer.Ordinal);
    }
}
