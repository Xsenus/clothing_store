using System.Globalization;
using System.Text.Json;
using System.Net.Mail;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
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

    private sealed record NormalizedOrderItem(string ProductId, string Size, string LookupSize, int Quantity);

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
    public async Task<IResult> Orders(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? search = null,
        [FromQuery] string? status = null,
        [FromQuery] string? dateFrom = null,
        [FromQuery] string? dateTo = null,
        [FromQuery] string? userId = null)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        var resolvedPageSize = Math.Clamp(pageSize, 5, 100);
        IQueryable<Order> query = _db.Orders.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(userId))
        {
            var normalizedUserId = userId.Trim();
            query = query.Where(x => x.UserId == normalizedUserId);
        }

        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status.Trim(), "all", StringComparison.OrdinalIgnoreCase))
        {
            var normalizedStatus = NormalizeOrderStatus(status);
            if (normalizedStatus == "canceled")
            {
                query = query.Where(x => x.Status.ToLower() == "canceled" || x.Status.ToLower() == "cancelled");
            }
            else
            {
                query = query.Where(x => x.Status.ToLower() == normalizedStatus);
            }
        }

        if (TryParseOrderFilterDate(dateFrom, isEndOfDay: false, out var fromTimestamp))
        {
            query = query.Where(x => x.CreatedAt >= fromTimestamp);
        }

        if (TryParseOrderFilterDate(dateTo, isEndOfDay: true, out var toTimestamp))
        {
            query = query.Where(x => x.CreatedAt <= toTimestamp);
        }

        var trimmedSearch = search?.Trim();
        if (!string.IsNullOrWhiteSpace(trimmedSearch))
        {
            var pattern = $"%{trimmedSearch}%";
            var matchingUserIds = _db.Users
                .AsNoTracking()
                .Where(x => EF.Functions.ILike(x.Email, pattern))
                .Select(x => x.Id);
            var matchingProfileUserIds = _db.Profiles
                .AsNoTracking()
                .Where(x =>
                    EF.Functions.ILike(x.Email, pattern) ||
                    EF.Functions.ILike(x.Name ?? string.Empty, pattern) ||
                    EF.Functions.ILike(x.Phone ?? string.Empty, pattern) ||
                    EF.Functions.ILike(x.Nickname ?? string.Empty, pattern) ||
                    EF.Functions.ILike(x.ShippingAddress ?? string.Empty, pattern))
                .Select(x => x.UserId);

            query = query.Where(x =>
                EF.Functions.ILike(x.Id, pattern) ||
                EF.Functions.ILike(x.UserId, pattern) ||
                EF.Functions.ILike(x.CustomerName, pattern) ||
                EF.Functions.ILike(x.CustomerEmail, pattern) ||
                EF.Functions.ILike(x.CustomerPhone, pattern) ||
                EF.Functions.ILike(x.ShippingAddress, pattern) ||
                EF.Functions.ILike(x.Status, pattern) ||
                EF.Functions.ILike(x.PaymentMethod, pattern) ||
                EF.Functions.ILike(x.PurchaseChannel, pattern) ||
                EF.Functions.ILike(x.ItemsJson, pattern) ||
                matchingUserIds.Contains(x.UserId) ||
                matchingProfileUserIds.Contains(x.UserId));
        }

        var totalItems = await query.CountAsync();
        var totalPages = Math.Max(1, (int)Math.Ceiling(totalItems / (double)resolvedPageSize));
        var resolvedPage = Math.Clamp(page, 1, totalPages);

        var orders = await query
            .OrderByDescending(x => x.CreatedAt)
            .Skip((resolvedPage - 1) * resolvedPageSize)
            .Take(resolvedPageSize)
            .ToListAsync();

        var userIds = orders.Select(x => x.UserId).Distinct().ToList();
        var users = userIds.Count == 0
            ? new Dictionary<string, User>()
            : await _db.Users.AsNoTracking().Where(x => userIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
        var profiles = userIds.Count == 0
            ? new Dictionary<string, Profile>()
            : await _db.Profiles.AsNoTracking().Where(x => userIds.Contains(x.UserId)).ToDictionaryAsync(x => x.UserId);

        var normalizedItemsByOrderId = orders.ToDictionary(x => x.Id, x => ParseOrderItems(x.ItemsJson));
        var productIds = normalizedItemsByOrderId.Values
            .SelectMany(x => x)
            .Select(x => x.ProductId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct()
            .ToList();
        var productNames = productIds.Count == 0
            ? new Dictionary<string, string>()
            : (await _db.Products
                .AsNoTracking()
                .Where(x => productIds.Contains(x.Id))
                .ToListAsync())
                .ToDictionary(
                    x => x.Id,
                    x =>
                    {
                        try
                        {
                            using var json = JsonDocument.Parse(x.Data);
                            if (json.RootElement.TryGetProperty("name", out var nameElement))
                            {
                                var name = nameElement.GetString()?.Trim();
                                if (!string.IsNullOrWhiteSpace(name))
                                    return name;
                            }
                        }
                        catch (JsonException)
                        {
                        }

                        return x.Slug;
                    });

        return Results.Ok(new
        {
            items = orders.Select(o =>
            {
                var user = users.GetValueOrDefault(o.UserId);
                var profile = profiles.GetValueOrDefault(o.UserId);
                var normalizedItems = normalizedItemsByOrderId.GetValueOrDefault(o.Id) ?? [];
                return new
                {
                    o.Id,
                    o.UserId,
                    userEmail = user?.Email,
                    userProfile = profile is null
                        ? null
                        : new
                        {
                            profile.Name,
                            profile.Phone,
                            profile.Nickname,
                            profile.ShippingAddress,
                            profile.PhoneVerified
                        },
                    o.TotalAmount,
                    o.Status,
                    o.PaymentMethod,
                    o.PurchaseChannel,
                    o.ShippingAddress,
                    o.CustomerName,
                    o.CustomerEmail,
                    o.CustomerPhone,
                    o.StatusHistoryJson,
                    o.CreatedAt,
                    o.UpdatedAt,
                    o.ItemsJson,
                    items = normalizedItems.Select(item => new
                    {
                        item.ProductId,
                        productName = productNames.GetValueOrDefault(item.ProductId),
                        item.Size,
                        item.Quantity
                    })
                };
            }),
            page = resolvedPage,
            pageSize = resolvedPageSize,
            totalItems,
            totalPages
        });
    }

    [HttpPatch("orders/{orderId}")]
    public async Task<IResult> UpdateOrder(string orderId, [FromBody] AdminOrderPatchPayload payload)
    {
        var admin = await RequireAdminUserAsync();
        if (admin is null) return Results.Unauthorized();

        var order = await _db.Orders.FirstOrDefaultAsync(x => x.Id == orderId);
        if (order is null) return Results.NotFound(new { detail = "Order not found" });

        var currentStatus = NormalizeOrderStatus(order.Status);
        var nextStatus = string.IsNullOrWhiteSpace(payload.Status)
            ? currentStatus
            : NormalizeOrderStatus(payload.Status);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (IsInventoryReleasedStatus(currentStatus) && !IsInventoryReleasedStatus(nextStatus))
            return Results.BadRequest(new { detail = "Нельзя вернуть отмененный или возвращенный заказ в активный статус из этого интерфейса" });

        var nextShippingAddress = payload.ShippingAddress is null ? order.ShippingAddress : payload.ShippingAddress.Trim();
        var nextPaymentMethod = payload.PaymentMethod is null ? NormalizePaymentMethod(order.PaymentMethod) : NormalizePaymentMethod(payload.PaymentMethod);
        var nextCustomerName = payload.CustomerName is null ? order.CustomerName : payload.CustomerName.Trim();
        var nextCustomerEmail = payload.CustomerEmail is null ? order.CustomerEmail : payload.CustomerEmail.Trim();
        var nextCustomerPhone = payload.CustomerPhone is null ? order.CustomerPhone : payload.CustomerPhone.Trim();
        var fieldChanges = BuildOrderFieldChanges(order, nextStatus, nextShippingAddress, nextPaymentMethod, nextCustomerName, nextCustomerEmail, nextCustomerPhone);

        if (fieldChanges.Count == 0)
            return Results.Ok(new { ok = true, noChanges = true });

        await using var tx = await _db.Database.BeginTransactionAsync();

        if (!IsInventoryReleasedStatus(currentStatus) && IsInventoryReleasedStatus(nextStatus))
        {
            await ReleaseOrderStockAsync(order, admin.Id, now, nextStatus == "returned" ? "order_return" : "order_cancel");
        }

        order.Status = nextStatus;
        order.ShippingAddress = nextShippingAddress;
        order.PaymentMethod = nextPaymentMethod;
        order.CustomerName = nextCustomerName;
        order.CustomerEmail = nextCustomerEmail;
        order.CustomerPhone = nextCustomerPhone;
        order.UpdatedAt = now;

        var history = ParseOrderHistory(order.StatusHistoryJson);
        history.Add(new Dictionary<string, object?>
        {
            ["kind"] = IsInventoryReleasedStatus(nextStatus) && !IsInventoryReleasedStatus(currentStatus) ? "canceled" : "updated",
            ["status"] = nextStatus,
            ["changedAt"] = now,
            ["changedBy"] = admin.Email,
            ["comment"] = string.IsNullOrWhiteSpace(payload.ManagerComment)
                ? "Заказ обновлен администратором"
                : payload.ManagerComment.Trim(),
            ["fieldChanges"] = fieldChanges
        });
        order.StatusHistoryJson = JsonSerializer.Serialize(history);

        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Results.Ok(new { ok = true });
    }

    [HttpDelete("orders/{orderId}")]
    public async Task<IResult> DeleteOrder(string orderId)
    {
        var admin = await RequireAdminUserAsync();
        if (admin is null) return Results.Unauthorized();

        var order = await _db.Orders.FirstOrDefaultAsync(x => x.Id == orderId);
        if (order is null) return Results.NotFound(new { detail = "Order not found" });

        await using var tx = await _db.Database.BeginTransactionAsync();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (!IsInventoryReleasedStatus(order.Status))
        {
            await ReleaseOrderStockAsync(order, admin.Id, now, "order_delete");
        }

        _db.Orders.Remove(order);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Results.Ok(new { ok = true });
    }

    [HttpGet("users")]
    public async Task<IResult> Users()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var profiles = await _db.Profiles.ToDictionaryAsync(x => x.UserId, x => x);
        var orderCounts = await _db.Orders
            .AsNoTracking()
            .GroupBy(x => x.UserId)
            .Select(x => new { UserId = x.Key, Count = x.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count);
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
            ordersCount = orderCounts.GetValueOrDefault(u.Id),
            profile = profiles.TryGetValue(u.Id, out var p)
                ? new { p.Name, p.Phone, p.Nickname, p.ShippingAddress, p.PhoneVerified }
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

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == userId);
        if (profile is null)
        {
            profile = new Profile
            {
                UserId = userId,
                Email = user.Email
            };
            _db.Profiles.Add(profile);
        }

        if (!string.IsNullOrWhiteSpace(payload.Email))
        {
            var normalizedEmail = payload.Email.Trim().ToLowerInvariant();
            if (!IsValidEmail(normalizedEmail))
                return Results.BadRequest(new { detail = "Invalid email" });

            var currentEmail = (user.Email ?? string.Empty).Trim().ToLowerInvariant();
            if (!string.Equals(normalizedEmail, currentEmail, StringComparison.Ordinal))
            {
                if (await _db.Users.AnyAsync(x => x.Email == normalizedEmail && x.Id != userId))
                    return Results.BadRequest(new { detail = "Email already in use" });

                user.Email = normalizedEmail;
                user.Verified = true;
                profile.Email = normalizedEmail;
            }
        }

        if (payload.Name is not null)
            profile.Name = NormalizeOptionalText(payload.Name);

        if (payload.Nickname is not null)
            profile.Nickname = NormalizeOptionalText(payload.Nickname);

        if (payload.ShippingAddress is not null)
            profile.ShippingAddress = NormalizeOptionalText(payload.ShippingAddress);

        if (payload.Phone is not null)
        {
            var normalizedPhone = NormalizeOptionalText(payload.Phone);
            var currentPhone = NormalizeOptionalText(profile.Phone);
            if (!string.Equals(normalizedPhone, currentPhone, StringComparison.Ordinal))
            {
                profile.Phone = normalizedPhone;
                profile.PhoneVerified = false;
            }
        }

        if (!string.IsNullOrWhiteSpace(payload.Password))
        {
            var trimmedPassword = payload.Password.Trim();
            if (!IsStrongPassword(trimmedPassword))
                return Results.BadRequest(new { detail = "Password is too weak" });

            var iterations = _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000;
            var (hash, salt) = AuthService.HashPassword(trimmedPassword, iterations);
            user.PasswordHash = hash;
            user.Salt = salt;

            _db.Sessions.RemoveRange(_db.Sessions.Where(x => x.UserId == userId));
            _db.RefreshSessions.RemoveRange(_db.RefreshSessions.Where(x => x.UserId == userId));
        }

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
        var showInCatalogFilter = payload.ShowInCatalogFilter ?? true;
        object createdItem;
        string duplicateNameMessage;
        const string duplicateSlugMessage = "Slug уже существует";

        switch (kind.ToLowerInvariant())
        {
            case "sizes":
                duplicateNameMessage = "Размер уже существует";
                var sizeSlug = await ResolveDictionarySlugAsync(_db.SizeDictionaries, payload.Slug, name);
                if (string.IsNullOrWhiteSpace(sizeSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.SizeDictionaries, name))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.SizeDictionaries, sizeSlug))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                var size = new SizeDictionary { Name = name, Slug = sizeSlug, Description = description, Color = color, IsActive = isActive, ShowInCatalogFilter = showInCatalogFilter, CreatedAt = now };
                _db.SizeDictionaries.Add(size);
                createdItem = size;
                break;
            case "materials":
                duplicateNameMessage = "Материал уже существует";
                var materialSlug = await ResolveDictionarySlugAsync(_db.MaterialDictionaries, payload.Slug, name);
                if (string.IsNullOrWhiteSpace(materialSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.MaterialDictionaries, name))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.MaterialDictionaries, materialSlug))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                var material = new MaterialDictionary { Name = name, Slug = materialSlug, Description = description, Color = color, IsActive = isActive, ShowInCatalogFilter = showInCatalogFilter, CreatedAt = now };
                _db.MaterialDictionaries.Add(material);
                createdItem = material;
                break;
            case "colors":
                duplicateNameMessage = "Цвет уже существует";
                var colorSlug = await ResolveDictionarySlugAsync(_db.ColorDictionaries, payload.Slug, name);
                if (string.IsNullOrWhiteSpace(colorSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.ColorDictionaries, name))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.ColorDictionaries, colorSlug))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                var colorDictionary = new ColorDictionary { Name = name, Slug = colorSlug, Description = description, Color = color, IsActive = isActive, ShowInCatalogFilter = showInCatalogFilter, CreatedAt = now };
                _db.ColorDictionaries.Add(colorDictionary);
                createdItem = colorDictionary;
                break;
            case "categories":
                duplicateNameMessage = "Категория уже существует";
                var categorySlug = await ResolveDictionarySlugAsync(_db.CategoryDictionaries, payload.Slug, name);
                if (string.IsNullOrWhiteSpace(categorySlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.CategoryDictionaries, name))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.CategoryDictionaries, categorySlug))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                var category = new CategoryDictionary { Name = name, Slug = categorySlug, Description = description, Color = color, IsActive = isActive, ShowInCatalogFilter = showInCatalogFilter, CreatedAt = now };
                _db.CategoryDictionaries.Add(category);
                createdItem = category;
                break;
            default:
                return Results.BadRequest(new { detail = "Неизвестный словарь" });
        }

        var createSaveResult = await TrySaveDictionaryChangesAsync(duplicateNameMessage, duplicateSlugMessage);
        if (createSaveResult is not null)
            return createSaveResult;

        return Results.Ok(createdItem);
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
        var showInCatalogFilter = payload.ShowInCatalogFilter ?? true;
        string duplicateNameMessage;
        const string duplicateSlugMessage = "Slug уже существует";

        switch (kind.ToLowerInvariant())
        {
            case "sizes":
                duplicateNameMessage = "Размер уже существует";
                var size = await _db.SizeDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (size is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                var resolvedSizeSlug = await ResolveDictionarySlugAsync(_db.SizeDictionaries, payload.Slug ?? size.Slug, name, id);
                if (string.IsNullOrWhiteSpace(resolvedSizeSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.SizeDictionaries, name, id))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.SizeDictionaries, resolvedSizeSlug, id))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                if (await _db.ProductSizeStocks.AnyAsync(x => x.SizeId == id))
                    return Results.BadRequest(new { detail = "Размер используется в товарах, редактирование запрещено" });
                size.Name = name;
                size.Slug = resolvedSizeSlug;
                size.Description = description;
                size.Color = colorValue;
                size.IsActive = isActive;
                size.ShowInCatalogFilter = showInCatalogFilter;
                break;
            case "materials":
                duplicateNameMessage = "Материал уже существует";
                var material = await _db.MaterialDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (material is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                var resolvedMaterialSlug = await ResolveDictionarySlugAsync(_db.MaterialDictionaries, payload.Slug ?? material.Slug, name, id);
                if (string.IsNullOrWhiteSpace(resolvedMaterialSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.MaterialDictionaries, name, id))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.MaterialDictionaries, resolvedMaterialSlug, id))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                if (await IsProductDataValueInUseAsync("material", material.Name, material.Slug))
                    return Results.BadRequest(new { detail = "Материал используется в товарах, редактирование запрещено" });
                material.Name = name;
                material.Slug = resolvedMaterialSlug;
                material.Description = description;
                material.Color = colorValue;
                material.IsActive = isActive;
                material.ShowInCatalogFilter = showInCatalogFilter;
                break;
            case "colors":
                duplicateNameMessage = "Цвет уже существует";
                var color = await _db.ColorDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (color is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                var resolvedColorSlug = await ResolveDictionarySlugAsync(_db.ColorDictionaries, payload.Slug ?? color.Slug, name, id);
                if (string.IsNullOrWhiteSpace(resolvedColorSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.ColorDictionaries, name, id))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.ColorDictionaries, resolvedColorSlug, id))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                if (await IsProductDataValueInUseAsync("color", color.Name, color.Slug))
                    return Results.BadRequest(new { detail = "Цвет используется в товарах, редактирование запрещено" });
                color.Name = name;
                color.Slug = resolvedColorSlug;
                color.Description = description;
                color.Color = colorValue;
                color.IsActive = isActive;
                color.ShowInCatalogFilter = showInCatalogFilter;
                break;
            case "categories":
                duplicateNameMessage = "Категория уже существует";
                var category = await _db.CategoryDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (category is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                var resolvedCategorySlug = await ResolveDictionarySlugAsync(_db.CategoryDictionaries, payload.Slug ?? category.Slug, name, id);
                if (string.IsNullOrWhiteSpace(resolvedCategorySlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.CategoryDictionaries, name, id))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.CategoryDictionaries, resolvedCategorySlug, id))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                if (await IsProductCategoryInUseAsync(category.Name, category.Slug))
                    return Results.BadRequest(new { detail = "Категория используется в товарах, редактирование запрещено" });
                category.Name = name;
                category.Slug = resolvedCategorySlug;
                category.Description = description;
                category.Color = colorValue;
                category.IsActive = isActive;
                category.ShowInCatalogFilter = showInCatalogFilter;
                break;
            default:
                return Results.BadRequest(new { detail = "Неизвестный словарь" });
        }

        var updateSaveResult = await TrySaveDictionaryChangesAsync(duplicateNameMessage, duplicateSlugMessage);
        if (updateSaveResult is not null)
            return updateSaveResult;

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
                    var used = await IsProductDataValueInUseAsync("material", material.Name, material.Slug);
                    if (used) return Results.BadRequest(new { detail = "Материал используется в товарах, удаление запрещено" });
                    _db.MaterialDictionaries.Remove(material);
                }
                break;
            case "colors":
                var color = await _db.ColorDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (color is not null)
                {
                    var used = await IsProductDataValueInUseAsync("color", color.Name, color.Slug);
                    if (used) return Results.BadRequest(new { detail = "Цвет используется в товарах, удаление запрещено" });
                    _db.ColorDictionaries.Remove(color);
                }
                break;
            case "categories":
                var category = await _db.CategoryDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (category is not null)
                {
                    var used = await IsProductCategoryInUseAsync(category.Name, category.Slug);
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
            var reason = string.IsNullOrWhiteSpace(x.Reason) ? "admin_manual" : x.Reason;
            var changedById = x.ChangedByUserId;
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
                reason,
                x.OrderId
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




    private async Task<bool> IsProductDataValueInUseAsync(string field, params string?[] values)
    {
        var normalizedValues = values
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => NormalizeLookupValue(x!))
            .ToHashSet();

        if (normalizedValues.Count == 0)
            return false;

        var productsData = await _db.Products.AsNoTracking().Select(x => x.Data).ToListAsync();
        foreach (var data in productsData)
        {
            if (ProductDataContainsValue(data, GetProductDataAliases(field), normalizedValues))
            {
                return true;
            }
        }

        return false;
    }

    private async Task<bool> IsProductCategoryInUseAsync(params string?[] categoryValues)
    {
        var normalizedCategories = categoryValues
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => NormalizeLookupValue(x!))
            .ToHashSet();

        if (normalizedCategories.Count == 0)
            return false;

        var products = await _db.Products
            .AsNoTracking()
            .Select(x => new { x.Category, x.Data })
            .ToListAsync();

        return products.Any(product =>
            (!string.IsNullOrWhiteSpace(product.Category)
             && normalizedCategories.Contains(NormalizeLookupValue(product.Category!)))
            || ProductDataContainsValue(product.Data, GetProductDataAliases("category"), normalizedCategories));
    }

    private async Task<bool> DictionaryNameExistsAsync<T>(DbSet<T> set, string name, string? excludeId = null) where T : class
    {
        var normalizedName = NormalizeLookupValue(name);
        IQueryable<T> query = set.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(excludeId))
        {
            query = query.Where(x => EF.Property<string>(x, "Id") != excludeId);
        }

        return await query.AnyAsync(x => EF.Property<string>(x, "Name").Trim().ToLower() == normalizedName);
    }

    private async Task<bool> DictionarySlugExistsAsync<T>(DbSet<T> set, string slug, string? excludeId = null) where T : class
    {
        var normalizedSlug = NormalizeLookupValue(slug);
        IQueryable<T> query = set.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(excludeId))
        {
            query = query.Where(x => EF.Property<string>(x, "Id") != excludeId);
        }

        return await query.AnyAsync(x => EF.Property<string>(x, "Slug").Trim().ToLower() == normalizedSlug);
    }

    private async Task<string> ResolveDictionarySlugAsync<T>(DbSet<T> set, string? slugSource, string name, string? excludeId = null) where T : class
    {
        var baseSlug = string.IsNullOrWhiteSpace(slugSource)
            ? DictionarySlugService.Normalize(name)
            : NormalizeSlug(slugSource);

        if (string.IsNullOrWhiteSpace(baseSlug))
            return string.Empty;

        var slug = baseSlug;
        var suffix = 2;
        while (await DictionarySlugExistsAsync(set, slug, excludeId))
        {
            slug = $"{baseSlug}-{suffix}";
            suffix++;
        }

        return slug;
    }

    private async Task<IResult?> TrySaveDictionaryChangesAsync(string duplicateNameMessage, string duplicateSlugMessage)
    {
        try
        {
            await _db.SaveChangesAsync();
            return null;
        }
        catch (DbUpdateException ex) when (IsUniqueDictionaryNameViolation(ex))
        {
            return Results.BadRequest(new { detail = duplicateNameMessage });
        }
        catch (DbUpdateException ex) when (IsUniqueDictionarySlugViolation(ex))
        {
            return Results.BadRequest(new { detail = duplicateSlugMessage });
        }
    }

    private static List<Dictionary<string, object?>> ParseOrderHistory(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<Dictionary<string, object?>>>(raw) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static List<Dictionary<string, object?>> BuildOrderFieldChanges(
        Order order,
        string nextStatus,
        string nextShippingAddress,
        string nextPaymentMethod,
        string nextCustomerName,
        string nextCustomerEmail,
        string nextCustomerPhone)
    {
        var changes = new List<Dictionary<string, object?>>();

        AddOrderFieldChange(changes, "status", NormalizeOrderStatus(order.Status), nextStatus);
        AddOrderFieldChange(changes, "shippingAddress", order.ShippingAddress, nextShippingAddress);
        AddOrderFieldChange(changes, "paymentMethod", NormalizePaymentMethod(order.PaymentMethod), nextPaymentMethod);
        AddOrderFieldChange(changes, "customerName", order.CustomerName, nextCustomerName);
        AddOrderFieldChange(changes, "customerEmail", order.CustomerEmail, nextCustomerEmail);
        AddOrderFieldChange(changes, "customerPhone", order.CustomerPhone, nextCustomerPhone);

        return changes;
    }

    private static void AddOrderFieldChange(List<Dictionary<string, object?>> changes, string field, object? oldValue, object? newValue)
    {
        var oldText = oldValue?.ToString()?.Trim() ?? string.Empty;
        var newText = newValue?.ToString()?.Trim() ?? string.Empty;
        if (string.Equals(oldText, newText, StringComparison.Ordinal))
            return;

        changes.Add(new Dictionary<string, object?>
        {
            ["field"] = field,
            ["oldValue"] = string.IsNullOrWhiteSpace(oldText) ? null : oldText,
            ["newValue"] = string.IsNullOrWhiteSpace(newText) ? null : newText
        });
    }

    private async Task ReleaseOrderStockAsync(Order order, string changedByUserId, long changedAt, string reason)
    {
        var normalizedItems = ParseOrderItems(order.ItemsJson);
        if (normalizedItems.Count == 0)
            return;

        var sizeLookups = normalizedItems.Select(x => x.LookupSize).Distinct().ToList();
        var sizeDictionaries = await _db.SizeDictionaries
            .Where(x => sizeLookups.Contains(x.Name.ToLower()))
            .ToListAsync();
        var sizeMap = sizeDictionaries.ToDictionary(x => x.Name.Trim().ToLowerInvariant(), x => x, StringComparer.OrdinalIgnoreCase);
        if (sizeMap.Count == 0)
            return;

        var requestedSizeIds = sizeMap.Values.Select(x => x.Id).Distinct().ToList();
        var requestedProductIds = normalizedItems.Select(x => x.ProductId).Distinct().ToList();
        var stockRows = await _db.ProductSizeStocks
            .Where(x => requestedProductIds.Contains(x.ProductId) && requestedSizeIds.Contains(x.SizeId))
            .ToListAsync();
        var stockMap = stockRows.ToDictionary(x => $"{x.ProductId}:{x.SizeId}", x => x, StringComparer.Ordinal);

        foreach (var item in normalizedItems)
        {
            if (!sizeMap.TryGetValue(item.LookupSize, out var sizeDictionary))
                continue;

            var stockKey = $"{item.ProductId}:{sizeDictionary.Id}";
            if (!stockMap.TryGetValue(stockKey, out var row))
            {
                row = new ProductSizeStock
                {
                    ProductId = item.ProductId,
                    SizeId = sizeDictionary.Id,
                    Stock = 0
                };
                _db.ProductSizeStocks.Add(row);
                stockMap[stockKey] = row;
            }

            var oldValue = row.Stock;
            row.Stock += item.Quantity;

            _db.StockChangeHistories.Add(new StockChangeHistory
            {
                ProductId = item.ProductId,
                SizeId = sizeDictionary.Id,
                ChangedByUserId = changedByUserId,
                Reason = reason,
                OrderId = order.Id,
                OldValue = oldValue,
                NewValue = row.Stock,
                ChangedAt = changedAt
            });
        }
    }

    private static List<NormalizedOrderItem> ParseOrderItems(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return [];

        try
        {
            var items = JsonSerializer.Deserialize<List<Dictionary<string, object>>>(raw) ?? [];
            return items
                .Select(item =>
                {
                    var productId = AsString(item.TryGetValue("productId", out var productValue) ? productValue : null).Trim();
                    var size = AsString(item.TryGetValue("size", out var sizeValue) ? sizeValue : null).Trim();
                    var quantity = AsInt(item.TryGetValue("quantity", out var quantityValue) ? quantityValue : null);
                    return new NormalizedOrderItem(productId, size, size.ToLowerInvariant(), quantity);
                })
                .Where(item => !string.IsNullOrWhiteSpace(item.ProductId) && !string.IsNullOrWhiteSpace(item.Size) && item.Quantity > 0)
                .GroupBy(x => $"{x.ProductId}\u001f{x.LookupSize}", StringComparer.Ordinal)
                .Select(group =>
                {
                    var first = group.First();
                    return new NormalizedOrderItem(first.ProductId, first.Size, first.LookupSize, group.Sum(x => x.Quantity));
                })
                .ToList();
        }
        catch
        {
            return [];
        }
    }

    private static string AsString(object? value)
    {
        return value switch
        {
            null => string.Empty,
            JsonElement element when element.ValueKind == JsonValueKind.String => element.GetString() ?? string.Empty,
            JsonElement element => element.ToString(),
            _ => value.ToString() ?? string.Empty
        };
    }

    private static int AsInt(object? value)
    {
        return value switch
        {
            null => 0,
            JsonElement element when element.ValueKind == JsonValueKind.Number => element.GetInt32(),
            JsonElement element when element.ValueKind == JsonValueKind.String && int.TryParse(element.GetString(), out var parsed) => parsed,
            int intValue => intValue,
            long longValue => (int)longValue,
            double doubleValue => (int)doubleValue,
            decimal decimalValue => (int)decimalValue,
            _ when int.TryParse(value.ToString(), out var parsed) => parsed,
            _ => 0
        };
    }

    private static bool TryParseOrderFilterDate(string? value, bool isEndOfDay, out long timestamp)
    {
        timestamp = 0;
        if (string.IsNullOrWhiteSpace(value))
            return false;

        if (!DateOnly.TryParseExact(value.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
            return false;

        var parsedDateTime = parsedDate.ToDateTime(isEndOfDay ? TimeOnly.MaxValue : TimeOnly.MinValue, DateTimeKind.Utc);
        timestamp = new DateTimeOffset(parsedDateTime).ToUnixTimeMilliseconds();
        return true;
    }

    private static bool IsInventoryReleasedStatus(string? status)
    {
        var normalized = NormalizeOrderStatus(status);
        return normalized is "canceled" or "returned";
    }

    private static string NormalizeOrderStatus(string? status)
    {
        var normalized = status?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "processing" : normalized;
    }

    private static string NormalizePaymentMethod(string? paymentMethod)
    {
        var normalized = paymentMethod?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "cod" : normalized;
    }

    private static bool IsUniqueDictionaryNameViolation(DbUpdateException ex)
        => ex.InnerException is PostgresException
        {
            SqlState: "23505",
            ConstraintName: "IX_size_dictionaries_name" or
                            "IX_material_dictionaries_name" or
                            "IX_color_dictionaries_name" or
                            "IX_category_dictionaries_name"
        };

    private static bool IsUniqueDictionarySlugViolation(DbUpdateException ex)
        => ex.InnerException is PostgresException
        {
            SqlState: "23505",
            ConstraintName: "IX_size_dictionaries_slug" or
                            "IX_material_dictionaries_slug" or
                            "IX_color_dictionaries_slug" or
                            "IX_category_dictionaries_slug"
        };

    private static IReadOnlyList<string> GetProductDataAliases(string field) => field.ToLowerInvariant() switch
    {
        "category" => ["category", "categories"],
        "material" => ["material", "materials"],
        "color" => ["color", "colors"],
        _ => [field]
    };

    private static bool ProductDataContainsValue(string data, IReadOnlyList<string> fields, ISet<string> normalizedValues)
    {
        if (normalizedValues.Count == 0)
            return false;

        if (string.IsNullOrWhiteSpace(data))
            return false;

        try
        {
            using var document = JsonDocument.Parse(data);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
                return false;

            foreach (var field in fields)
            {
                if (!document.RootElement.TryGetProperty(field, out var property))
                    continue;

                if (property.ValueKind == JsonValueKind.String)
                {
                    var value = property.GetString();
                    if (!string.IsNullOrWhiteSpace(value)
                        && normalizedValues.Contains(NormalizeLookupValue(value)))
                    {
                        return true;
                    }
                }

                if (property.ValueKind != JsonValueKind.Array)
                    continue;

                foreach (var item in property.EnumerateArray())
                {
                    if (item.ValueKind != JsonValueKind.String)
                        continue;

                    var value = item.GetString();
                    if (!string.IsNullOrWhiteSpace(value)
                        && normalizedValues.Contains(NormalizeLookupValue(value)))
                    {
                        return true;
                    }
                }
            }

            return false;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string NormalizeLookupValue(string value)
        => value.Trim().ToLowerInvariant();

    private static string NormalizeSlug(string? value)
    {
        var trimmed = value?.Trim().ToLowerInvariant() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(trimmed))
            return string.Empty;

        return Regex.IsMatch(trimmed, "^[a-z0-9]+(?:-[a-z0-9]+)*$") ? trimmed : string.Empty;
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

    private static bool IsValidEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        try
        {
            var address = new MailAddress(email);
            return string.Equals(address.Address, email, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static bool IsStrongPassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 10) return false;
        return password.Any(char.IsUpper)
               && password.Any(char.IsLower)
               && password.Any(char.IsDigit);
    }

    private Task<User?> RequireAdminUserAsync() => _auth.RequireAdminUserAsync(Request);
}

public class AdminUserPatchPayload
{
    public bool? IsAdmin { get; set; }
    public bool? IsBlocked { get; set; }
    public string? Email { get; set; }
    public string? Name { get; set; }
    public string? Phone { get; set; }
    public string? Nickname { get; set; }
    public string? ShippingAddress { get; set; }
    public string? Password { get; set; }
}
