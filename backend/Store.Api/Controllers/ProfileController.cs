using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

/// <summary>
/// Контроллер операций профиля.
/// </summary>
[ApiController]
[Route("profile")]
public class ProfileController : ControllerBase
{
    private readonly StoreDbContext _db;
    private readonly AuthService _auth;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="ProfileController"/>.
    /// </summary>
    public ProfileController(StoreDbContext db, AuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    /// <summary>
    /// Возвращает профиль текущего пользователя.
    /// </summary>
    [HttpGet]
    public async Task<IResult> Get()
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id);
        return profile is not null
            ? Results.Ok(profile)
            : Results.Ok(new { name = "", phone = "", shippingAddress = "", email = user.Email, nickname = $"user{user.Id[..6]}" });
    }

    /// <summary>
    /// Обновляет профиль текущего пользователя.
    /// </summary>
    [HttpPost]
    public async Task<IResult> Upsert([FromBody] ProfilePayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var nickname = payload.Nickname?.Trim();
        if (!string.IsNullOrWhiteSpace(nickname) && await _db.Profiles.AnyAsync(x => x.Nickname == nickname && x.UserId != user.Id))
            return Results.BadRequest(new { detail = "Nickname already taken" });

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id);
        if (profile is null)
        {
            profile = new Profile { UserId = user.Id, Email = user.Email };
            _db.Profiles.Add(profile);
        }

        profile.Name = payload.Name;
        profile.Phone = payload.Phone;
        profile.ShippingAddress = payload.ShippingAddress;
        profile.Nickname = nickname;

        await _db.SaveChangesAsync();
        return Results.Ok(profile);
    }
}
