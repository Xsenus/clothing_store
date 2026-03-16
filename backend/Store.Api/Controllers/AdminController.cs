using System.Text.Json;
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
    [HttpPost("telegram-bots/check")]
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



    [HttpGet("dictionaries")]
    public async Task<IResult> GetDictionaries()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        return Results.Ok(new
        {
            sizes = await _db.SizeDictionaries.OrderBy(x => x.Name).ToListAsync(),
            materials = await _db.MaterialDictionaries.OrderBy(x => x.Name).ToListAsync(),
            colors = await _db.ColorDictionaries.OrderBy(x => x.Name).ToListAsync(),
            categories = await _db.CategoryDictionaries.OrderBy(x => x.Name).ToListAsync()
        });
    }

    [HttpPost("dictionaries/{kind}")]
    public async Task<IResult> CreateDictionaryItem(string kind, [FromBody] DictionaryItemPayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var name = payload.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name))
            return Results.BadRequest(new { detail = "Название обязательно" });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var description = NormalizeOptionalText(payload.Description);
        var color = NormalizeOptionalColor(payload.Color);
        var isActive = payload.IsActive ?? true;

        switch (kind.ToLowerInvariant())
        {
            case "sizes":
                if (await _db.SizeDictionaries.AnyAsync(x => x.Name.ToLower() == name.ToLower())) return Results.BadRequest(new { detail = "Размер уже существует" });
                var size = new SizeDictionary { Name = name, Description = description, Color = color, IsActive = isActive, CreatedAt = now };
                _db.SizeDictionaries.Add(size);
                await _db.SaveChangesAsync();
                return Results.Ok(size);
            case "materials":
                if (await _db.MaterialDictionaries.AnyAsync(x => x.Name.ToLower() == name.ToLower())) return Results.BadRequest(new { detail = "Материал уже существует" });
                var material = new MaterialDictionary { Name = name, Description = description, Color = color, IsActive = isActive, CreatedAt = now };
                _db.MaterialDictionaries.Add(material);
                await _db.SaveChangesAsync();
                return Results.Ok(material);
            case "colors":
                if (await _db.ColorDictionaries.AnyAsync(x => x.Name.ToLower() == name.ToLower())) return Results.BadRequest(new { detail = "Цвет уже существует" });
                var colorDictionary = new ColorDictionary { Name = name, Description = description, Color = color, IsActive = isActive, CreatedAt = now };
                _db.ColorDictionaries.Add(colorDictionary);
                await _db.SaveChangesAsync();
                return Results.Ok(colorDictionary);
            case "categories":
                if (await _db.CategoryDictionaries.AnyAsync(x => x.Name.ToLower() == name.ToLower())) return Results.BadRequest(new { detail = "Категория уже существует" });
                var category = new CategoryDictionary { Name = name, Description = description, Color = color, IsActive = isActive, CreatedAt = now };
                _db.CategoryDictionaries.Add(category);
                await _db.SaveChangesAsync();
                return Results.Ok(category);
            default:
                return Results.BadRequest(new { detail = "Неизвестный словарь" });
        }
    }



    [HttpPatch("dictionaries/{kind}/{id}")]
    public async Task<IResult> UpdateDictionaryItem(string kind, string id, [FromBody] DictionaryItemPatchPayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var name = payload.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name))
            return Results.BadRequest(new { detail = "Название обязательно" });

        var description = NormalizeOptionalText(payload.Description);
        var colorValue = NormalizeOptionalColor(payload.Color);
        var isActive = payload.IsActive ?? true;

        switch (kind.ToLowerInvariant())
        {
            case "sizes":
                var size = await _db.SizeDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (size is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                if (await _db.SizeDictionaries.AnyAsync(x => x.Id != id && x.Name.ToLower() == name.ToLower()))
                    return Results.BadRequest(new { detail = "Размер уже существует" });
                if (await _db.ProductSizeStocks.AnyAsync(x => x.SizeId == id))
                    return Results.BadRequest(new { detail = "Размер используется в товарах, редактирование запрещено" });
                size.Name = name;
                size.Description = description;
                size.Color = colorValue;
                size.IsActive = isActive;
                break;
            case "materials":
                var material = await _db.MaterialDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (material is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                if (await _db.MaterialDictionaries.AnyAsync(x => x.Id != id && x.Name.ToLower() == name.ToLower()))
                    return Results.BadRequest(new { detail = "Материал уже существует" });
                if (await IsProductDataValueInUseAsync("material", material.Name))
                    return Results.BadRequest(new { detail = "Материал используется в товарах, редактирование запрещено" });
                material.Name = name;
                material.Description = description;
                material.Color = colorValue;
                material.IsActive = isActive;
                break;
            case "colors":
                var color = await _db.ColorDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (color is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                if (await _db.ColorDictionaries.AnyAsync(x => x.Id != id && x.Name.ToLower() == name.ToLower()))
                    return Results.BadRequest(new { detail = "Цвет уже существует" });
                if (await IsProductDataValueInUseAsync("color", color.Name))
                    return Results.BadRequest(new { detail = "Цвет используется в товарах, редактирование запрещено" });
                color.Name = name;
                color.Description = description;
                color.Color = colorValue;
                color.IsActive = isActive;
                break;
            case "categories":
                var category = await _db.CategoryDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (category is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                if (await _db.CategoryDictionaries.AnyAsync(x => x.Id != id && x.Name.ToLower() == name.ToLower()))
                    return Results.BadRequest(new { detail = "Категория уже существует" });
                if (await _db.Products.AnyAsync(x => x.Category == category.Name))
                    return Results.BadRequest(new { detail = "Категория используется в товарах, редактирование запрещено" });
                category.Name = name;
                category.Description = description;
                category.Color = colorValue;
                category.IsActive = isActive;
                break;
            default:
                return Results.BadRequest(new { detail = "Неизвестный словарь" });
        }

        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    [HttpDelete("dictionaries/{kind}/{id}")]
    public async Task<IResult> DeleteDictionaryItem(string kind, string id)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        switch (kind.ToLowerInvariant())
        {
            case "sizes":
                if (await _db.ProductSizeStocks.AnyAsync(x => x.SizeId == id))
                    return Results.BadRequest(new { detail = "Размер используется в товарах, удаление запрещено" });
                var size = await _db.SizeDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (size is not null) _db.SizeDictionaries.Remove(size);
                break;
            case "materials":
                var material = await _db.MaterialDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (material is not null)
                {
                    var used = await IsProductDataValueInUseAsync("material", material.Name);
                    if (used) return Results.BadRequest(new { detail = "Материал используется в товарах, удаление запрещено" });
                    _db.MaterialDictionaries.Remove(material);
                }
                break;
            case "colors":
                var color = await _db.ColorDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (color is not null)
                {
                    var used = await IsProductDataValueInUseAsync("color", color.Name);
                    if (used) return Results.BadRequest(new { detail = "Цвет используется в товарах, удаление запрещено" });
                    _db.ColorDictionaries.Remove(color);
                }
                break;
            case "categories":
                var category = await _db.CategoryDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (category is not null)
                {
                    var used = await _db.Products.AnyAsync(x => x.Category == category.Name);
                    if (used) return Results.BadRequest(new { detail = "Категория используется в товарах, удаление запрещено" });
                    _db.CategoryDictionaries.Remove(category);
                }
                break;
            default:
                return Results.BadRequest(new { detail = "Неизвестный словарь" });
        }

        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    [HttpGet("history/stocks")]
    public async Task<IResult> GetStockHistory()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var users = await _db.Users.ToDictionaryAsync(x => x.Id, x => x.Email);
        var products = await _db.Products.ToDictionaryAsync(x => x.Id, x => x.Slug);
        var sizes = await _db.SizeDictionaries.ToDictionaryAsync(x => x.Id, x => x.Name);
        var history = await _db.StockChangeHistories.OrderByDescending(x => x.ChangedAt).Take(500).ToListAsync();
        return Results.Ok(history.Select(x =>
        {
            var isPurchase = x.ChangedByUserId.StartsWith("purchase:", StringComparison.OrdinalIgnoreCase);
            var changedById = isPurchase ? x.ChangedByUserId["purchase:".Length..] : x.ChangedByUserId;
            return new
            {
                x.Id,
                x.ProductId,
                product = products.GetValueOrDefault(x.ProductId),
                x.SizeId,
                size = sizes.GetValueOrDefault(x.SizeId),
                x.OldValue,
                x.NewValue,
                x.ChangedAt,
                changedByUserId = changedById,
                changedBy = users.GetValueOrDefault(changedById),
                reason = isPurchase ? "purchase" : "admin_manual"
            };
        }));
    }

    [HttpGet("history/prices")]
    public async Task<IResult> GetPriceHistory()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var users = await _db.Users.ToDictionaryAsync(x => x.Id, x => x.Email);
        var products = await _db.Products.ToDictionaryAsync(x => x.Id, x => x.Slug);
        var history = await _db.PriceChangeHistories.OrderByDescending(x => x.ChangedAt).Take(500).ToListAsync();
        return Results.Ok(history.Select(x => new
        {
            x.Id,
            x.ProductId,
            product = products.GetValueOrDefault(x.ProductId),
            x.FieldName,
            x.OldValue,
            x.NewValue,
            x.ChangedAt,
            x.ChangedByUserId,
            changedBy = users.GetValueOrDefault(x.ChangedByUserId)
        }));
    }




    private async Task<bool> IsProductDataValueInUseAsync(string field, string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var productsData = await _db.Products.AsNoTracking().Select(x => x.Data).ToListAsync();
        foreach (var data in productsData)
        {
            if (TryGetStringFromProductData(data, field, out var current)
                && string.Equals(current, value, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static bool TryGetStringFromProductData(string data, string field, out string? value)
    {
        value = null;
        if (string.IsNullOrWhiteSpace(data))
            return false;

        try
        {
            using var document = JsonDocument.Parse(data);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
                return false;

            if (!document.RootElement.TryGetProperty(field, out var property))
                return false;

            if (property.ValueKind != JsonValueKind.String)
                return false;

            value = property.GetString();
            return !string.IsNullOrWhiteSpace(value);
        }
        catch (JsonException)
        {
            return false;
        }
    }
    private static string? NormalizeOptionalText(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static string? NormalizeOptionalColor(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return null;

        if (trimmed.StartsWith("#") && trimmed.Length is 7 or 4)
            return trimmed.ToLowerInvariant();

        return null;
    }

    private Task<User?> RequireAdminUserAsync() => _auth.RequireAdminUserAsync(Request);
}

public class AdminUserPatchPayload
{
    public bool? IsAdmin { get; set; }
    public bool? IsBlocked { get; set; }
}
