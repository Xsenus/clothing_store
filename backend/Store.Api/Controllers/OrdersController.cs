using System.Text.Json;
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
            x.PaymentMethod,
            x.PurchaseChannel,
            x.ShippingAddress,
            x.CustomerName,
            x.CustomerEmail,
            x.CustomerPhone,
            x.StatusHistoryJson,
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
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var normalizedStatus = string.IsNullOrWhiteSpace(payload.Status) ? "created" : payload.Status.Trim().ToLowerInvariant();

        var statusHistory = new[]
        {
            new
            {
                status = normalizedStatus,
                changedAt = now,
                changedBy = "system",
                comment = "Заказ создан"
            }
        };

        var order = new Order
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = user.Id,
            ItemsJson = JsonSerializer.Serialize(payload.Items),
            TotalAmount = payload.TotalAmount,
            Status = normalizedStatus,
            PaymentMethod = string.IsNullOrWhiteSpace(payload.PaymentMethod) ? "cod" : payload.PaymentMethod.Trim(),
            PurchaseChannel = string.IsNullOrWhiteSpace(payload.PurchaseChannel) ? "web" : payload.PurchaseChannel.Trim(),
            ShippingAddress = payload.ShippingAddress?.Trim() ?? string.Empty,
            CustomerName = payload.CustomerName?.Trim() ?? string.Empty,
            CustomerEmail = payload.CustomerEmail?.Trim() ?? string.Empty,
            CustomerPhone = payload.CustomerPhone?.Trim() ?? string.Empty,
            StatusHistoryJson = JsonSerializer.Serialize(statusHistory),
            CreatedAt = now,
            UpdatedAt = now
        };
        _db.Orders.Add(order);
        await _db.SaveChangesAsync();
        return Results.Ok(new { id = order.Id });
    }
}
