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
    private readonly AdminDataSeeder _adminDataSeeder;
    private readonly ITelegramBotManager _telegramBotManager;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="AdminController"/>.
    /// </summary>
    public AdminController(IConfiguration configuration, StoreDbContext db, AuthService auth, AdminDataSeeder adminDataSeeder, ITelegramBotManager telegramBotManager)
    {
        _configuration = configuration;
        _db = db;
        _auth = auth;
        _adminDataSeeder = adminDataSeeder;
        _telegramBotManager = telegramBotManager;
    }

    /// <summary>
    /// Аутентифицирует администратора.
    /// </summary>
    [HttpPost("login")]
    public async Task<IResult> Login([FromBody] AuthPayload payload)
    {
        var email = payload.Email.Trim().ToLowerInvariant();
        var admin = await _db.Users.FirstOrDefaultAsync(x => x.Email == email);
        var iterations = _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000;

        if (admin is null || !admin.IsAdmin || admin.IsBlocked || !AuthService.VerifyPassword(payload.Password, admin.PasswordHash, admin.Salt, iterations))
            return Results.BadRequest(new { detail = "Invalid credentials" });

        var token = AuthService.GenerateToken();
        _db.AdminSessions.Add(new AdminSession
        {
            Token = token,
            UserId = admin.Id,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
        await _db.SaveChangesAsync();
        return Results.Ok(new { token, user = new { id = admin.Id, email = admin.Email } });
    }

    /// <summary>
    /// Возвращает состояние текущей админской сессии.
    /// </summary>
    [HttpGet("me")]
    public async Task<IResult> Me()
    {
        var admin = await RequireAdminUserAsync();
        return admin is null ? Results.Unauthorized() : Results.Ok(new { ok = true, user = new { id = admin.Id, email = admin.Email } });
    }

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

    [HttpGet("orders")]
    public async Task<IResult> Orders()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var users = await _db.Users.ToDictionaryAsync(x => x.Id, x => x.Email);
        var orders = await _db.Orders.OrderByDescending(x => x.CreatedAt).ToListAsync();
        return Results.Ok(orders.Select(o => new
        {
            o.Id,
            o.UserId,
            userEmail = users.GetValueOrDefault(o.UserId),
            o.TotalAmount,
            o.Status,
            o.CreatedAt,
            o.ItemsJson
        }));
    }

    [HttpGet("users")]
    public async Task<IResult> Users()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var profiles = await _db.Profiles.ToDictionaryAsync(x => x.UserId, x => x);
        var users = await _db.Users.OrderBy(x => x.CreatedAt).ToListAsync();

        return Results.Ok(users.Select(u => new
        {
            u.Id,
            u.Email,
            u.Verified,
            u.IsAdmin,
            u.IsBlocked,
            u.IsSystem,
            u.CreatedAt,
            profile = profiles.TryGetValue(u.Id, out var p)
                ? new { p.Name, p.Phone, p.Nickname }
                : null
        }));
    }

    [HttpPatch("users/{userId}")]
    public async Task<IResult> UpdateUser(string userId, [FromBody] AdminUserPatchPayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return Results.NotFound(new { detail = "User not found" });
        if (user.IsSystem)
        {
            if (payload.IsAdmin.HasValue && payload.IsAdmin.Value != user.IsAdmin)
                return Results.BadRequest(new { detail = "System user role cannot be changed" });
        }

        if (payload.IsBlocked.HasValue)
            user.IsBlocked = payload.IsBlocked.Value;
        if (payload.IsAdmin.HasValue && !user.IsSystem)
            user.IsAdmin = payload.IsAdmin.Value;

        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    [HttpDelete("users/{userId}")]
    public async Task<IResult> DeleteUser(string userId)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return Results.Ok(new { ok = true });
        if (user.IsSystem)
            return Results.BadRequest(new { detail = "System user cannot be deleted" });

        _db.Sessions.RemoveRange(_db.Sessions.Where(x => x.UserId == userId));
        _db.AdminSessions.RemoveRange(_db.AdminSessions.Where(x => x.UserId == userId));
        _db.RefreshSessions.RemoveRange(_db.RefreshSessions.Where(x => x.UserId == userId));
        _db.CartItems.RemoveRange(_db.CartItems.Where(x => x.UserId == userId));
        _db.Likes.RemoveRange(_db.Likes.Where(x => x.UserId == userId));
        _db.Orders.RemoveRange(_db.Orders.Where(x => x.UserId == userId));
        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == userId);
        if (profile is not null)
            _db.Profiles.Remove(profile);
        _db.Users.Remove(user);

        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }


    [HttpPost("operations/seed-demo-data")]
    [HttpPost("seed-demo-data")]
    public async Task<IResult> SeedDemoData()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            var result = await _adminDataSeeder.SeedDemoDataAsync();
            return Results.Ok(new
            {
                ok = true,
                message = "Demo data seeded",
                products = result.Products,
                users = result.Users,
                cartItems = result.CartItems,
                orders = result.Orders,
                likes = result.Likes
            });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }


    [HttpPost("telegram-bots/validate")]
    public async Task<IResult> ValidateTelegramBot([FromBody] TelegramBotValidatePayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            var info = await _telegramBotManager.ValidateTokenAsync(payload.Token);
            return Results.Ok(info);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpGet("telegram-bots")]
    public async Task<IResult> TelegramBots()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        return Results.Ok(await _telegramBotManager.GetBotsAsync());
    }

    [HttpPost("telegram-bots")]
    public async Task<IResult> CreateTelegramBot([FromBody] TelegramBotPayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            return Results.Ok(await _telegramBotManager.CreateBotAsync(payload));
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPatch("telegram-bots/{id}")]
    public async Task<IResult> UpdateTelegramBot(string id, [FromBody] TelegramBotPatchPayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            var bot = await _telegramBotManager.UpdateBotAsync(id, payload);
            return bot is null ? Results.NotFound(new { detail = "Bot not found" }) : Results.Ok(bot);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpDelete("telegram-bots/{id}")]
    public async Task<IResult> DeleteTelegramBot(string id)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        await _telegramBotManager.DeleteBotAsync(id);
        return Results.Ok(new { ok = true });
    }

    [HttpPost("telegram-bots/{id}/check")]
    public async Task<IResult> CheckTelegramBot(string id)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            var bot = await _telegramBotManager.CheckBotAsync(id);
            return bot is null ? Results.NotFound(new { detail = "Bot not found" }) : Results.Ok(bot);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpGet("settings")]
    public async Task<IResult> Settings()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var all = await _db.AppSettings.ToListAsync();
        return Results.Ok(all.ToDictionary(x => x.Key, x => x.Value));
    }

    [HttpPost("settings")]
    public async Task<IResult> SaveSettings([FromBody] Dictionary<string, string> payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        foreach (var (key, value) in payload)
        {
            var row = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == key);
            if (row is null)
            {
                _db.AppSettings.Add(new AppSetting { Key = key, Value = value ?? string.Empty });
                continue;
            }

            row.Value = value ?? string.Empty;
        }

        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    private Task<User?> RequireAdminUserAsync() => _auth.RequireAdminUserAsync(Request);
}

public class AdminUserPatchPayload
{
    public bool? IsAdmin { get; set; }
    public bool? IsBlocked { get; set; }
}
