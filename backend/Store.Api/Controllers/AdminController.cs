using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

/// <summary>
/// Контроллер аутентификации администратора и загрузки файлов.
/// </summary>
[ApiController]
[Route("admin")]
public class AdminController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly StoreDbContext _db;
    private readonly AuthService _auth;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="AdminController"/>.
    /// </summary>
    public AdminController(IConfiguration configuration, StoreDbContext db, AuthService auth)
    {
        _configuration = configuration;
        _db = db;
        _auth = auth;
    }

    /// <summary>
    /// Аутентифицирует администратора.
    /// </summary>
    [HttpPost("login")]
    public async Task<IResult> Login([FromBody] AuthPayload payload)
    {
        var adminEmail = _configuration["ADMIN_EMAIL"]
            ?? _configuration["AdminUser:Email"]
            ?? "admin@local.dev";
        var adminPassword = _configuration["ADMIN_PASSWORD"]
            ?? _configuration["AdminUser:Password"]
            ?? "admin";
        if (!string.Equals(payload.Email, adminEmail, StringComparison.OrdinalIgnoreCase) || payload.Password != adminPassword)
            return Results.BadRequest(new { detail = "Invalid credentials" });

        var token = AuthService.GenerateToken();
        _db.AdminSessions.Add(new AdminSession { Token = token, CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
        await _db.SaveChangesAsync();
        return Results.Ok(new { token });
    }

    /// <summary>
    /// Возвращает состояние текущей админской сессии.
    /// </summary>
    [HttpGet("me")]
    public async Task<IResult> Me() => await _auth.RequireAdminAsync(Request) ? Results.Ok(new { ok = true }) : Results.Unauthorized();

    /// <summary>
    /// Выполняет выход администратора.
    /// </summary>
    [HttpPost("logout")]
    public async Task<IResult> Logout()
    {
        var token = Request.Headers["X-Admin-Token"].ToString().Trim();
        var session = await _db.AdminSessions.FirstOrDefaultAsync(x => x.Token == token);
        if (session is not null)
        {
            _db.AdminSessions.Remove(session);
            await _db.SaveChangesAsync();
        }

        return Results.Ok(new { ok = true });
    }
}
