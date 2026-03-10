using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

/// <summary>
/// Создаёт базу данных и заполняет начальными данными.
/// </summary>
public class DatabaseInitializer
{
    private readonly IConfiguration _configuration;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DatabaseInitializer> _logger;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="DatabaseInitializer"/>.
    /// </summary>
    public DatabaseInitializer(
        IConfiguration configuration,
        IServiceProvider serviceProvider,
        ILogger<DatabaseInitializer> logger)
    {
        _configuration = configuration;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    /// <summary>
    /// Гарантирует создание базы данных и начальное заполнение.
    /// </summary>
    public async Task InitializeAsync(string seedProductsPath)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();

        var knownMigrations = (await db.Database.GetMigrationsAsync()).ToArray();
        if (knownMigrations.Length == 0)
        {
            _logger.LogWarning(
                "No EF Core migrations found. Falling back to EnsureCreated for bootstrap schema creation.");
            await db.Database.EnsureCreatedAsync();
        }
        else
        {
            var pendingBefore = (await db.Database.GetPendingMigrationsAsync()).ToArray();
            var appliedBefore = (await db.Database.GetAppliedMigrationsAsync()).ToArray();
            _logger.LogInformation(
                "Migration check before startup: applied={AppliedCount}, pending={PendingCount}",
                appliedBefore.Length,
                pendingBefore.Length);

            if (pendingBefore.Length > 0)
            {
                _logger.LogInformation("Pending migrations: {Migrations}", string.Join(", ", pendingBefore));
            }

            await db.Database.MigrateAsync();

            var pendingAfter = (await db.Database.GetPendingMigrationsAsync()).ToArray();
            if (pendingAfter.Length > 0)
            {
                throw new InvalidOperationException(
                    $"Some migrations are still pending after startup migration: {string.Join(", ", pendingAfter)}");
            }

            _logger.LogInformation("All database migrations are applied.");
        }

        await CleanupExpiredDataAsync(db);

        var seedMode = _configuration["DatabaseInitialization:SeedMode"] ?? "EnsureSeeded";
        if (!string.Equals(seedMode, "EnsureSeeded", StringComparison.OrdinalIgnoreCase))
            return;

        if (!await db.Products.AnyAsync() && File.Exists(seedProductsPath))
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            foreach (var line in await File.ReadAllLinesAsync(seedProductsPath))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                var json = JsonNode.Parse(line)?.AsObject();
                if (json is null) continue;
                var id = json["id"]?.ToString();
                var slug = json["slug"]?.ToString();
                if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(slug)) continue;
                db.Products.Add(new Product
                {
                    Id = id,
                    Slug = slug,
                    Category = json["category"]?.ToString(),
                    IsNew = json["isNew"]?.GetValue<bool>() ?? false,
                    IsPopular = json["isPopular"]?.GetValue<bool>() ?? false,
                    LikesCount = json["likesCount"]?.GetValue<int>() ?? 0,
                    CreationTime = json["creationTime"]?.GetValue<long>() ?? now,
                    Data = json.ToJsonString()
                });
            }

            await db.SaveChangesAsync();
        }

        await EnsureDefaultUserAsync(db);
        await EnsureAdminUserAsync(db);
        await EnsureTestDataAsync(db);
    }

    private async Task EnsureAdminUserAsync(StoreDbContext db)
    {
        var adminEmail = (_configuration["ADMIN_EMAIL"]
            ?? _configuration["AdminUser:Email"]
            ?? "admin@clothingstore.local").Trim().ToLowerInvariant();
        var adminPassword = _configuration["ADMIN_PASSWORD"]
            ?? _configuration["AdminUser:Password"]
            ?? "admin12345";

        if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
            return;

        var adminName = _configuration["AdminUser:Name"] ?? "System Admin";
        var admin = await db.Users.FirstOrDefaultAsync(x => x.Email == adminEmail);
        var iterations = _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000;

        if (admin is null)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var (hash, salt) = AuthService.HashPassword(adminPassword, iterations);
            admin = new User
            {
                Email = adminEmail,
                PasswordHash = hash,
                Salt = salt,
                Verified = true,
                CreatedAt = now,
                IsAdmin = true,
                IsSystem = true,
                IsBlocked = false
            };
            db.Users.Add(admin);
            await db.SaveChangesAsync();
        }
        else
        {
            admin.IsAdmin = true;
            admin.IsSystem = true;
            admin.IsBlocked = false;
            admin.Verified = true;
            if (!AuthService.VerifyPassword(adminPassword, admin.PasswordHash, admin.Salt, iterations))
            {
                var (hash, salt) = AuthService.HashPassword(adminPassword, iterations);
                admin.PasswordHash = hash;
                admin.Salt = salt;
            }
        }

        var profile = await db.Profiles.FirstOrDefaultAsync(x => x.UserId == admin.Id);
        if (profile is null)
        {
            db.Profiles.Add(new Profile
            {
                UserId = admin.Id,
                Email = admin.Email,
                Name = adminName
            });
        }

        await db.SaveChangesAsync();
    }

    private async Task EnsureDefaultUserAsync(StoreDbContext db)
    {
        var defaultUserEmail = _configuration["DatabaseInitialization:DefaultUser:Email"];
        var defaultUserPassword = _configuration["DatabaseInitialization:DefaultUser:Password"];
        var defaultUserName = _configuration["DatabaseInitialization:DefaultUser:Name"];

        if (string.IsNullOrWhiteSpace(defaultUserEmail) || string.IsNullOrWhiteSpace(defaultUserPassword))
            return;

        var existingUser = await db.Users.FirstOrDefaultAsync(x => x.Email == defaultUserEmail);
        var iterations = _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000;

        if (existingUser is null)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var (hash, salt) = AuthService.HashPassword(defaultUserPassword, iterations);
            existingUser = new User
            {
                Email = defaultUserEmail,
                PasswordHash = hash,
                Salt = salt,
                Verified = true,
                CreatedAt = now
            };
            db.Users.Add(existingUser);

            db.Profiles.Add(new Profile
            {
                UserId = existingUser.Id,
                Email = defaultUserEmail,
                Name = string.IsNullOrWhiteSpace(defaultUserName) ? "Default User" : defaultUserName
            });

            await db.SaveChangesAsync();
            return;
        }

        if (!AuthService.VerifyPassword(defaultUserPassword, existingUser.PasswordHash, existingUser.Salt, iterations))
        {
            var (hash, salt) = AuthService.HashPassword(defaultUserPassword, iterations);
            existingUser.PasswordHash = hash;
            existingUser.Salt = salt;
            existingUser.Verified = true;
        }

        var profile = await db.Profiles.FirstOrDefaultAsync(x => x.UserId == existingUser.Id);
        if (profile is null)
        {
            db.Profiles.Add(new Profile
            {
                UserId = existingUser.Id,
                Email = existingUser.Email,
                Name = string.IsNullOrWhiteSpace(defaultUserName) ? "Default User" : defaultUserName
            });
        }
        else if (!string.IsNullOrWhiteSpace(defaultUserName) && string.IsNullOrWhiteSpace(profile.Name))
        {
            profile.Name = defaultUserName;
        }

        await db.SaveChangesAsync();
    }

    private async Task EnsureTestDataAsync(StoreDbContext db)
    {
        var seedTestData = _configuration.GetValue<bool?>("DatabaseInitialization:SeedTestData") ?? false;
        if (!seedTestData)
            return;

        var userEmail = _configuration["DatabaseInitialization:DefaultUser:Email"];
        if (string.IsNullOrWhiteSpace(userEmail))
            return;

        var user = await db.Users.FirstOrDefaultAsync(x => x.Email == userEmail);
        if (user is null)
            return;

        var firstProduct = await db.Products.OrderBy(x => x.CreationTime).FirstOrDefaultAsync();
        if (firstProduct is null)
            return;

        var hasCartItem = await db.CartItems.AnyAsync(x => x.UserId == user.Id);
        if (!hasCartItem)
        {
            db.CartItems.Add(new CartItem
            {
                UserId = user.Id,
                ProductId = firstProduct.Id,
                Size = "M",
                Quantity = 1
            });
        }

        var hasLike = await db.Likes.AnyAsync(x => x.UserId == user.Id && x.ProductId == firstProduct.Id);
        if (!hasLike)
        {
            db.Likes.Add(new Like
            {
                UserId = user.Id,
                ProductId = firstProduct.Id
            });
        }

        var hasOrder = await db.Orders.AnyAsync(x => x.UserId == user.Id);
        if (!hasOrder)
        {
            db.Orders.Add(new Order
            {
                UserId = user.Id,
                ItemsJson = $"[{{\"productId\":\"{firstProduct.Id}\",\"quantity\":1,\"size\":\"M\"}}]",
                TotalAmount = 0
            });
        }

        await db.SaveChangesAsync();
    }

    private async Task CleanupExpiredDataAsync(StoreDbContext db)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var userSessionTtlHours = _configuration.GetValue<int?>("Security:SessionTtlHours") ?? 24 * 30;
        var adminSessionTtlHours = _configuration.GetValue<int?>("Security:AdminSessionTtlHours") ?? 24 * 7;
        var refreshSessionTtlHours = _configuration.GetValue<int?>("Security:RefreshSessionTtlHours") ?? 24 * 30;

        var minUserSessionTime = DateTimeOffset.UtcNow.AddHours(-userSessionTtlHours).ToUnixTimeMilliseconds();
        var minAdminSessionTime = DateTimeOffset.UtcNow.AddHours(-adminSessionTtlHours).ToUnixTimeMilliseconds();
        var minRefreshSessionTime = DateTimeOffset.UtcNow.AddHours(-refreshSessionTtlHours).ToUnixTimeMilliseconds();

        db.Sessions.RemoveRange(await db.Sessions.Where(x => x.CreatedAt < minUserSessionTime).ToListAsync());
        db.AdminSessions.RemoveRange(await db.AdminSessions.Where(x => x.CreatedAt < minAdminSessionTime).ToListAsync());
        db.RefreshSessions.RemoveRange(await db.RefreshSessions.Where(x => x.CreatedAt < minRefreshSessionTime).ToListAsync());
        db.VerificationCodes.RemoveRange(await db.VerificationCodes.Where(x => x.ExpiresAt < now).ToListAsync());
        await db.SaveChangesAsync();
    }
}
