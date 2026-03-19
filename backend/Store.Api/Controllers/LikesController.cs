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
        return Results.Json(await _db.Likes.Where(x => x.UserId == user.Id).ToListAsync());
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
        var product = await _db.Products.FirstOrDefaultAsync(x => x.Id == payload.ProductId && !x.IsHidden);
        if (product is null) return Results.BadRequest(new { detail = "Product not found" });
        if (existing is null)
        {
            _db.Likes.Add(new Like { Id = Guid.NewGuid().ToString("N"), UserId = user.Id, ProductId = payload.ProductId });
            product.LikesCount += 1;
        }
        else
        {
            _db.Likes.Remove(existing);
            product.LikesCount = Math.Max(0, product.LikesCount - 1);
        }

        var json = ProductJsonService.Parse(product);
        json["likesCount"] = product.LikesCount;
        product.Data = json.ToJsonString();
        await _db.SaveChangesAsync();
        return Results.Json(new { liked = existing is null });
    }
}
