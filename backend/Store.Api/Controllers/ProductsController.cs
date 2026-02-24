using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

/// <summary>
/// Контроллер каталога товаров.
/// </summary>
[ApiController]
[Route("products")]
public class ProductsController : ControllerBase
{
    private readonly StoreDbContext _db;
    private readonly AuthService _auth;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="ProductsController"/>.
    /// </summary>
    public ProductsController(StoreDbContext db, AuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    /// <summary>
    /// Возвращает список товаров.
    /// </summary>
    [HttpGet]
    public async Task<IResult> List() => Results.Json((await _db.Products.Select(p => p.Data).ToListAsync()).Select(JsonNode.Parse));

    /// <summary>
    /// Возвращает новые товары.
    /// </summary>
    [HttpGet("new")]
    public async Task<IResult> ListNew() => Results.Json((await _db.Products.Where(p => p.IsNew).Select(p => p.Data).ToListAsync()).Select(JsonNode.Parse));

    /// <summary>
    /// Возвращает популярные товары.
    /// </summary>
    [HttpGet("popular")]
    public async Task<IResult> ListPopular() => Results.Json((await _db.Products.Where(p => p.IsPopular).OrderByDescending(p => p.LikesCount).Select(p => p.Data).ToListAsync()).Select(JsonNode.Parse));

    /// <summary>
    /// Возвращает новые товары по категории.
    /// </summary>
    [HttpGet("category/{category}/new")]
    public async Task<IResult> CategoryNew(string category) => Results.Json((await _db.Products.Where(p => p.Category == category && p.IsNew).Select(p => p.Data).ToListAsync()).Select(JsonNode.Parse));

    /// <summary>
    /// Возвращает популярные товары по категории.
    /// </summary>
    [HttpGet("category/{category}/popular")]
    public async Task<IResult> CategoryPopular(string category) => Results.Json((await _db.Products.Where(p => p.Category == category && p.IsPopular).OrderByDescending(p => p.LikesCount).Select(p => p.Data).ToListAsync()).Select(JsonNode.Parse));

    /// <summary>
    /// Возвращает товар по slug.
    /// </summary>
    [HttpGet("{slug}")]
    public async Task<IResult> GetBySlug(string slug)
    {
        var p = await _db.Products.FirstOrDefaultAsync(x => x.Slug == slug);
        return p is null ? Results.NotFound(new { detail = "Product not found" }) : Results.Json(JsonNode.Parse(p.Data));
    }

    /// <summary>
    /// Создаёт товар.
    /// </summary>
    [HttpPost]
    public async Task<IResult> Create([FromBody] JsonObject payload)
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        var id = payload["id"]?.ToString() ?? Guid.NewGuid().ToString("N");
        payload["id"] = id;
        var product = new Product
        {
            Id = id,
            Slug = payload["slug"]?.ToString() ?? id,
            Category = payload["category"]?.ToString(),
            IsNew = payload["isNew"]?.GetValue<bool>() ?? false,
            IsPopular = payload["isPopular"]?.GetValue<bool>() ?? false,
            LikesCount = payload["likesCount"]?.GetValue<int>() ?? 0,
            CreationTime = payload["creationTime"]?.GetValue<long>() ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Data = payload.ToJsonString()
        };
        _db.Products.Add(product);
        await _db.SaveChangesAsync();
        return Results.Json(payload);
    }

    /// <summary>
    /// Обновляет товар.
    /// </summary>
    [HttpPatch("{productId}")]
    public async Task<IResult> Update(string productId, [FromBody] JsonObject payload)
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        var product = await _db.Products.FirstOrDefaultAsync(x => x.Id == productId);
        if (product is null) return Results.NotFound(new { detail = "Product not found" });

        var json = ProductJsonService.Merge(ProductJsonService.Parse(product), payload);
        product.Slug = json["slug"]?.ToString() ?? product.Slug;
        product.Category = json["category"]?.ToString();
        product.IsNew = json["isNew"]?.GetValue<bool>() ?? false;
        product.IsPopular = json["isPopular"]?.GetValue<bool>() ?? false;
        product.LikesCount = json["likesCount"]?.GetValue<int>() ?? product.LikesCount;
        product.Data = json.ToJsonString();

        await _db.SaveChangesAsync();
        return Results.Json(json);
    }

    /// <summary>
    /// Удаляет товар.
    /// </summary>
    [HttpDelete("{productId}")]
    public async Task<IResult> Delete(string productId)
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        var product = await _db.Products.FirstOrDefaultAsync(x => x.Id == productId);
        if (product is not null)
        {
            _db.Products.Remove(product);
            await _db.SaveChangesAsync();
        }

        return Results.Ok(new { ok = true });
    }

    /// <summary>
    /// Добавляет отзыв к товару.
    /// </summary>
    [HttpPost("{productId}/reviews")]
    public async Task<IResult> AddReview(string productId, [FromBody] ReviewPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        var product = await _db.Products.FirstOrDefaultAsync(x => x.Id == productId);
        if (product is null) return Results.NotFound(new { detail = "Product not found" });
        var json = ProductJsonService.Parse(product);
        var reviews = json["reviews"] as JsonArray ?? new JsonArray();
        json["reviews"] = reviews;
        var review = new JsonObject
        {
            ["id"] = Guid.NewGuid().ToString("N"),
            ["userId"] = user.Id,
            ["text"] = payload.Text,
            ["media"] = new JsonArray((payload.Media ?? []).Select(x => JsonValue.Create(x)).ToArray()),
            ["createdAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };
        reviews.Add(review);
        product.Data = json.ToJsonString();
        await _db.SaveChangesAsync();
        return Results.Json(review);
    }

    /// <summary>
    /// Удаляет отзыв к товару.
    /// </summary>
    [HttpDelete("{productId}/reviews/{reviewId}")]
    public async Task<IResult> DeleteReview(string productId, string reviewId)
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        var product = await _db.Products.FirstOrDefaultAsync(x => x.Id == productId);
        if (product is null) return Results.NotFound(new { detail = "Product not found" });
        var json = ProductJsonService.Parse(product);
        var reviews = json["reviews"] as JsonArray;
        if (reviews is null) return Results.Ok(new { ok = true });
        for (var i = 0; i < reviews.Count; i++)
        {
            if (reviews[i]?["id"]?.ToString() == reviewId)
            {
                reviews.RemoveAt(i);
                break;
            }
        }

        product.Data = json.ToJsonString();
        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }
}
