using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
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

        var knownMigrations = db.Database.GetMigrations().ToArray();
        if (knownMigrations.Length == 0)
        {
            throw new InvalidOperationException(
                "No EF Core migrations found. Create and apply a baseline migration before starting the application.");
        }

        await EnsureDatabaseExistsAsync(db);

        var pendingBefore = db.Database.GetPendingMigrations().ToArray();
        var appliedBefore = db.Database.GetAppliedMigrations().ToArray();
        _logger.LogInformation(
            "Migration check before startup: applied={AppliedCount}, pending={PendingCount}",
            appliedBefore.Length,
            pendingBefore.Length);

        if (pendingBefore.Length > 0)
        {
            _logger.LogInformation("Pending migrations: {Migrations}", string.Join(", ", pendingBefore));
        }

        await db.Database.MigrateAsync();

        var pendingAfter = db.Database.GetPendingMigrations().ToArray();
        if (pendingAfter.Length > 0)
        {
            throw new InvalidOperationException(
                $"Some migrations are still pending after startup migration: {string.Join(", ", pendingAfter)}");
        }

        _logger.LogInformation("Database schema is ready (migrations applied).");

        await EnsureGalleryTableAsync(db);

        await CleanupExpiredDataAsync(db);

        var seedMode = _configuration["DatabaseInitialization:SeedMode"] ?? "EnsureSeeded";
        if (!string.Equals(seedMode, "EnsureSeeded", StringComparison.OrdinalIgnoreCase))
            return;

        await EnsurePreparedProductsSeededAsync(db, seedProductsPath);

        await EnsureDefaultUserAsync(db);
        await EnsureAdminUserAsync(db);
        await EnsureDefaultAppSettingsAsync(db);
        await EnsureLegacyTelegramBotMigratedAsync(db);
        await EnsureTestDataAsync(db);
    }

    private async Task EnsureDatabaseExistsAsync(StoreDbContext db)
    {
        var databaseCreator = db.GetService<IRelationalDatabaseCreator>();
        if (await databaseCreator.ExistsAsync())
        {
            return;
        }

        var connectionString = db.Database.GetConnectionString();
        var databaseName = GetConnectionStringValue(connectionString, builder => builder.Database) ?? "unknown";
        var username = GetConnectionStringValue(connectionString, builder => builder.Username) ?? "unknown";

        _logger.LogWarning(
            "Database {DatabaseName} does not exist yet. Creating it before applying migrations.",
            databaseName);

        try
        {
            await databaseCreator.CreateAsync();
            _logger.LogInformation("Created PostgreSQL database {DatabaseName}.", databaseName);
        }
        catch (PostgresException ex) when (ex.SqlState == "42P04")
        {
            _logger.LogInformation(
                "Database {DatabaseName} was created by another process during startup.",
                databaseName);
        }
        catch (PostgresException ex) when (ex.SqlState == "42501")
        {
            throw new InvalidOperationException(
                $"Database '{databaseName}' does not exist and PostgreSQL user '{username}' cannot create it. " +
                "Grant CREATEDB to that role or create the database manually before startup.",
                ex);
        }

        if (!await databaseCreator.ExistsAsync())
        {
            throw new InvalidOperationException(
                $"Database '{databaseName}' is still unavailable after the automatic creation attempt.");
        }
    }

    private static string? GetConnectionStringValue(
        string? connectionString,
        Func<NpgsqlConnectionStringBuilder, string?> selector)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return null;
        }

        try
        {
            return selector(new NpgsqlConnectionStringBuilder(connectionString));
        }
        catch (ArgumentException)
        {
            return null;
        }
    }

    private static async Task EnsureGalleryTableAsync(StoreDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS gallery_images (
                id text NOT NULL PRIMARY KEY,
                name text NOT NULL,
                description text NULL,
                content_type text NOT NULL,
                file_extension text NOT NULL,
                file_name text NOT NULL,
                disk_path text NOT NULL,
                file_size bigint NOT NULL,
                binary_data bytea NOT NULL,
                created_at bigint NOT NULL,
                updated_at bigint NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ""IX_gallery_images_name"" ON gallery_images (name);
        ");
    }

    private async Task EnsureAdminUserAsync(StoreDbContext db)
    {
        var adminEmail = (_configuration["AdminUser:Email"] ?? string.Empty).Trim().ToLowerInvariant();
        var adminPassword = _configuration["AdminUser:Password"] ?? string.Empty;

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


    private async Task EnsurePreparedProductsSeededAsync(StoreDbContext db, string seedProductsPath)
    {
        if (await db.Products.AnyAsync())
            return;

        if (!File.Exists(seedProductsPath))
        {
            _logger.LogWarning("Prepared product seed file was not found at {SeedProductsPath}.", seedProductsPath);
            return;
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var lines = await File.ReadAllLinesAsync(seedProductsPath);
        var products = new List<Product>();
        var slugSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var line in lines)
        {
            if (string.IsNullOrWhiteSpace(line))
                continue;

            var json = JsonNode.Parse(line)?.AsObject();
            if (json is null)
                continue;

            var slug = json["slug"]?.ToString()?.Trim();
            if (string.IsNullOrWhiteSpace(slug))
                continue;

            if (!slugSet.Add(slug))
                continue;

            var id = json["id"]?.ToString();
            if (string.IsNullOrWhiteSpace(id))
            {
                id = Guid.NewGuid().ToString("N");
                json["id"] = id;
            }

            var creationTime = json["creationTime"]?.GetValue<long?>() ?? now;
            json["creationTime"] = creationTime;
            json["slug"] = slug;

            products.Add(new Product
            {
                Id = id,
                Slug = slug,
                Category = json["category"]?.ToString(),
                IsNew = json["isNew"]?.GetValue<bool>() ?? false,
                IsPopular = json["isPopular"]?.GetValue<bool>() ?? false,
                LikesCount = json["likesCount"]?.GetValue<int>() ?? 0,
                CreationTime = creationTime,
                Data = json.ToJsonString()
            });
        }

        if (products.Count == 0)
        {
            _logger.LogWarning("Prepared product seed file {SeedProductsPath} did not contain valid products.", seedProductsPath);
            return;
        }

        db.Products.AddRange(products);
        await db.SaveChangesAsync();
        _logger.LogInformation("Seeded {Count} prepared products from {SeedProductsPath}.", products.Count, seedProductsPath);
    }


    private async Task EnsureDefaultAppSettingsAsync(StoreDbContext db)
    {
        var title = await db.AppSettings.FirstOrDefaultAsync(x => x.Key == "site_title");
        if (title is null)
        {
            db.AppSettings.Add(new AppSetting { Key = "site_title", Value = "fashiondemon" });
            await db.SaveChangesAsync();
            return;
        }

        if (string.IsNullOrWhiteSpace(title.Value) || string.Equals(title.Value, "Fashiondemon", StringComparison.Ordinal))
        {
            title.Value = "fashiondemon";
            await db.SaveChangesAsync();
        }
    }

    private async Task EnsureLegacyTelegramBotMigratedAsync(StoreDbContext db)
    {
        var hasBots = await db.TelegramBots.AnyAsync();
        if (hasBots)
            return;

        var token = await db.AppSettings.FirstOrDefaultAsync(x => x.Key == "telegram_bot_token");
        if (token is null || string.IsNullOrWhiteSpace(token.Value))
            return;

        var username = await db.AppSettings.FirstOrDefaultAsync(x => x.Key == "telegram_bot_username");
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        db.TelegramBots.Add(new TelegramBot
        {
            Name = "Default Telegram Bot",
            Description = "Migrated from legacy single-bot settings",
            Token = token.Value.Trim(),
            Username = username?.Value?.Trim().TrimStart('@'),
            Enabled = true,
            UseForLogin = true,
            AutoRepliesEnabled = true,
            CommandsJson = "[]",
            ReplyTemplatesJson = "[]",
            CreatedAt = now,
            UpdatedAt = now
        });
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
