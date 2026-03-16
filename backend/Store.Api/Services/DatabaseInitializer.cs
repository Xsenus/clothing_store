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
        await EnsureDictionariesSeededAsync(db);
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


    private static async Task EnsureDictionariesSeededAsync(StoreDbContext db)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var knownCategoryLabels = GetKnownCategoryLabels();

        var defaultSizes = new[]
        {
            (Name: "XS", Slug: "xs"),
            (Name: "S", Slug: "s"),
            (Name: "M", Slug: "m"),
            (Name: "L", Slug: "l"),
            (Name: "XL", Slug: "xl"),
            (Name: "XXL", Slug: "xxl")
        };
        var defaultMaterials = new[]
        {
            (Name: "Хлопок", Slug: "cotton"),
            (Name: "Полиэстер", Slug: "polyester"),
            (Name: "Футер", Slug: "french-terry"),
            (Name: "Деним", Slug: "denim")
        };
        var defaultColors = new[]
        {
            (Name: "Черный", Slug: "black"),
            (Name: "Белый", Slug: "white"),
            (Name: "Серый", Slug: "gray"),
            (Name: "Бежевый", Slug: "beige")
        };
        var defaultCategories = knownCategoryLabels
            .Select(x => (Name: x.Value, Slug: x.Key))
            .ToArray();

        await SeedDictionaryAsync(db, db.SizeDictionaries, defaultSizes, now);
        await SeedDictionaryAsync(db, db.MaterialDictionaries, defaultMaterials, now);
        await SeedDictionaryAsync(db, db.ColorDictionaries, defaultColors, now);
        await SeedDictionaryAsync(db, db.CategoryDictionaries, defaultCategories, now);
        await SeedCategoriesFromProductsAsync(db, now);
        await SeedSizesFromProductsAsync(db, now);
        await BackfillDictionarySlugsAsync(db);

        await db.SaveChangesAsync();
    }

    private static async Task SeedCategoriesFromProductsAsync(StoreDbContext db, long createdAt)
    {
        var knownCategoryLabels = GetKnownCategoryLabels();
        var knownCategoryLabelToSlug = GetKnownCategoryLabelToSlug(knownCategoryLabels);
        var normalizedExistingNames = await GetNormalizedPropertyValuesAsync(db, db.CategoryDictionaries, "Name");
        var normalizedExistingSlugs = await GetNormalizedPropertyValuesAsync(db, db.CategoryDictionaries, "Slug");

        var categoriesFromProducts = await db.Products
            .Select(x => x.Category)
            .Where(x => x != null && x != string.Empty)
            .Distinct()
            .ToListAsync();

        foreach (var category in categoriesFromProducts)
        {
            if (string.IsNullOrWhiteSpace(category))
                continue;

            var trimmedCategory = category.Trim();
            var slug = ResolveCategorySlug(trimmedCategory, knownCategoryLabels, knownCategoryLabelToSlug);
            var displayName = knownCategoryLabels.TryGetValue(slug, out var label) ? label : trimmedCategory;
            var normalizedName = NormalizeDictionaryName(displayName);
            var normalizedSlug = NormalizeDictionaryName(slug);

            if (string.IsNullOrWhiteSpace(normalizedName)
                || string.IsNullOrWhiteSpace(normalizedSlug)
                || normalizedExistingNames.Contains(normalizedName)
                || normalizedExistingSlugs.Contains(normalizedSlug))
            {
                continue;
            }

            db.CategoryDictionaries.Add(new CategoryDictionary
            {
                Name = displayName,
                Slug = slug,
                IsActive = true,
                ShowInCatalogFilter = true,
                CreatedAt = createdAt
            });

            normalizedExistingNames.Add(normalizedName);
            normalizedExistingSlugs.Add(normalizedSlug);
        }
    }

    private static async Task SeedSizesFromProductsAsync(StoreDbContext db, long createdAt)
    {
        var normalizedExistingNames = await GetNormalizedPropertyValuesAsync(db, db.SizeDictionaries, "Name");
        var normalizedExistingSlugs = await GetNormalizedPropertyValuesAsync(db, db.SizeDictionaries, "Slug");

        var products = await db.Products
            .Select(x => x.Data)
            .ToListAsync();

        foreach (var data in products)
        {
            JsonArray? sizes;
            try
            {
                sizes = JsonNode.Parse(data)?["sizes"] as JsonArray;
            }
            catch
            {
                continue;
            }

            if (sizes is null)
                continue;

            foreach (var sizeNode in sizes)
            {
                var sizeName = sizeNode?.ToString()?.Trim();
                if (string.IsNullOrWhiteSpace(sizeName))
                    continue;

                var slug = Slugify(sizeName);
                var normalizedName = NormalizeDictionaryName(sizeName);
                var normalizedSlug = NormalizeDictionaryName(slug);

                if (normalizedExistingNames.Contains(normalizedName) || normalizedExistingSlugs.Contains(normalizedSlug))
                    continue;

                db.SizeDictionaries.Add(new SizeDictionary
                {
                    Name = sizeName,
                    Slug = slug,
                    IsActive = true,
                    ShowInCatalogFilter = true,
                    CreatedAt = createdAt
                });

                normalizedExistingNames.Add(normalizedName);
                normalizedExistingSlugs.Add(normalizedSlug);
            }
        }
    }

    private static async Task SeedDictionaryAsync<T>(
        DbContext db,
        DbSet<T> set,
        IEnumerable<(string Name, string Slug)> values,
        long createdAt) where T : class
    {
        var normalizedNames = await GetNormalizedPropertyValuesAsync(db, set, "Name");
        var normalizedSlugs = await GetNormalizedPropertyValuesAsync(db, set, "Slug");

        foreach (var (dictionaryName, dictionarySlug) in values)
        {
            var name = dictionaryName.Trim();
            var slug = NormalizeDictionaryName(dictionarySlug);
            var normalizedName = NormalizeDictionaryName(name);
            if (string.IsNullOrWhiteSpace(normalizedName) || string.IsNullOrWhiteSpace(slug))
                continue;
            if (normalizedNames.Contains(normalizedName) || normalizedSlugs.Contains(slug))
                continue;

            var item = Activator.CreateInstance<T>();
            if (item is null)
                continue;

            SetPropertyValue(item, "Name", name);
            SetPropertyValue(item, "Slug", slug);
            SetPropertyValue(item, "IsActive", true);
            SetPropertyValue(item, "ShowInCatalogFilter", true);
            SetPropertyValue(item, "CreatedAt", createdAt);
            set.Add(item);

            normalizedNames.Add(normalizedName);
            normalizedSlugs.Add(slug);
        }
    }

    private static async Task BackfillDictionarySlugsAsync(StoreDbContext db)
    {
        await BackfillDictionarySlugsAsync(db, db.SizeDictionaries);
        await BackfillDictionarySlugsAsync(db, db.MaterialDictionaries);
        await BackfillDictionarySlugsAsync(db, db.ColorDictionaries);
        await BackfillCategorySlugsAsync(db);
    }

    private static async Task BackfillDictionarySlugsAsync<T>(DbContext db, DbSet<T> set) where T : class
    {
        await set.LoadAsync();
        var rows = db.ChangeTracker.Entries<T>()
            .Where(x => x.State != EntityState.Deleted)
            .Select(x => x.Entity)
            .ToList();

        var usedSlugs = rows
            .Select(x => NormalizeDictionaryName(GetStringPropertyValue(x, "Slug") ?? string.Empty))
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToHashSet();

        foreach (var row in rows)
        {
            var name = GetStringPropertyValue(row, "Name")?.Trim() ?? string.Empty;
            var slug = NormalizeDictionaryName(GetStringPropertyValue(row, "Slug") ?? string.Empty);
            if (!string.IsNullOrWhiteSpace(slug))
                continue;

            var candidate = Slugify(name);
            var uniqueSlug = candidate;
            var suffix = 2;
            while (usedSlugs.Contains(uniqueSlug))
                uniqueSlug = $"{candidate}-{suffix++}";

            SetPropertyValue(row, "Slug", uniqueSlug);
            usedSlugs.Add(uniqueSlug);
        }
    }

    private static async Task BackfillCategorySlugsAsync(StoreDbContext db)
    {
        var knownCategoryLabels = GetKnownCategoryLabels();
        var knownCategoryLabelToSlug = GetKnownCategoryLabelToSlug(knownCategoryLabels);

        await db.CategoryDictionaries.LoadAsync();
        var categories = db.ChangeTracker.Entries<CategoryDictionary>()
            .Where(x => x.State != EntityState.Deleted)
            .Select(x => x.Entity)
            .ToList();

        var usedSlugs = categories
            .Select(x => NormalizeDictionaryName(x.Slug ?? string.Empty))
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToHashSet();

        foreach (var category in categories)
        {
            var currentName = category.Name?.Trim() ?? string.Empty;
            var currentSlug = NormalizeDictionaryName(category.Slug ?? string.Empty);
            if (string.IsNullOrWhiteSpace(currentSlug))
            {
                currentSlug = ResolveCategorySlug(currentName, knownCategoryLabels, knownCategoryLabelToSlug);
                var uniqueSlug = currentSlug;
                var suffix = 2;
                while (usedSlugs.Contains(uniqueSlug))
                    uniqueSlug = $"{currentSlug}-{suffix++}";

                currentSlug = uniqueSlug;
                category.Slug = currentSlug;
                usedSlugs.Add(currentSlug);
            }

            if (knownCategoryLabels.TryGetValue(currentSlug, out var displayName))
            {
                if (string.IsNullOrWhiteSpace(currentName) || string.Equals(currentName, currentSlug, StringComparison.OrdinalIgnoreCase))
                    category.Name = displayName;

                if (string.IsNullOrWhiteSpace(category.Description))
                    category.Description = displayName;
            }
        }
    }

    private static async Task<HashSet<string>> GetNormalizedPropertyValuesAsync<T>(
        DbContext db,
        DbSet<T> set,
        string propertyName) where T : class
    {
        var persistedValues = await set.AsQueryable()
            .Select(x => EF.Property<string>(x, propertyName))
            .ToListAsync();

        var trackedValues = db.ChangeTracker.Entries<T>()
            .Where(x => x.State != EntityState.Deleted)
            .Select(x => GetStringPropertyValue(x.Entity, propertyName))
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => NormalizeDictionaryName(x!));

        return persistedValues
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(NormalizeDictionaryName)
            .Concat(trackedValues)
            .ToHashSet();
    }

    private static Dictionary<string, string> GetKnownCategoryLabels()
        => new(StringComparer.OrdinalIgnoreCase)
        {
            ["outerwear"] = "Верхняя одежда",
            ["hoodie"] = "Толстовки (худи)",
            ["sweatshirt"] = "Кофты",
            ["shirt"] = "Рубашки",
            ["t-shirt"] = "Футболки",
            ["top"] = "Топы",
            ["suit"] = "Костюмы",
            ["pants"] = "Штаны",
            ["shorts"] = "Шорты",
            ["skirt"] = "Юбки",
            ["underwear"] = "Нижнее бельё",
            ["shoes"] = "Обувь",
            ["bags"] = "Сумки",
            ["accessories"] = "Аксессуары",
            ["mystery-box"] = "Мистери боксы"
        };

    private static Dictionary<string, string> GetKnownCategoryLabelToSlug(IReadOnlyDictionary<string, string> knownCategoryLabels)
        => knownCategoryLabels.ToDictionary(
            x => NormalizeDictionaryName(x.Value),
            x => x.Key,
            StringComparer.OrdinalIgnoreCase);

    private static string ResolveCategorySlug(
        string value,
        IReadOnlyDictionary<string, string> knownCategoryLabels,
        IReadOnlyDictionary<string, string> knownCategoryLabelToSlug)
    {
        var normalizedValue = NormalizeDictionaryName(value);
        if (knownCategoryLabels.ContainsKey(normalizedValue))
            return normalizedValue;

        if (knownCategoryLabelToSlug.TryGetValue(normalizedValue, out var knownSlug))
            return knownSlug;

        return Slugify(value);
    }

    private static string? GetStringPropertyValue(object instance, string propertyName)
        => instance.GetType().GetProperty(propertyName)?.GetValue(instance) as string;

    private static void SetPropertyValue(object instance, string propertyName, object? value)
        => instance.GetType().GetProperty(propertyName)?.SetValue(instance, value);

    private static string Slugify(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "item";

        var chars = value.Trim().ToLowerInvariant().Select(ch =>
            (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') ? ch : '-').ToArray();
        var slug = string.Join(string.Empty, chars).Trim('-');
        while (slug.Contains("--"))
            slug = slug.Replace("--", "-");
        return string.IsNullOrWhiteSpace(slug) ? "item" : slug;
    }

    private static string NormalizeDictionaryName(string value)
        => value.Trim().ToLowerInvariant();
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
        }

        if (title is not null && (string.IsNullOrWhiteSpace(title.Value) || string.Equals(title.Value, "Fashiondemon", StringComparison.Ordinal)))
        {
            title.Value = "fashiondemon";
        }

        await EnsureAppSettingExistsAsync(db, "catalog_filter_categories_enabled", "true");
        await EnsureAppSettingExistsAsync(db, "catalog_filter_sizes_enabled", "true");

        await db.SaveChangesAsync();
    }

    private static async Task EnsureAppSettingExistsAsync(StoreDbContext db, string key, string value)
    {
        var row = await db.AppSettings.FirstOrDefaultAsync(x => x.Key == key);
        if (row is not null)
            return;

        db.AppSettings.Add(new AppSetting { Key = key, Value = value });
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
