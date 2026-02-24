using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
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

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="DatabaseInitializer"/>.
    /// </summary>
    public DatabaseInitializer(IConfiguration configuration, IServiceProvider serviceProvider)
    {
        _configuration = configuration;
        _serviceProvider = serviceProvider;
    }

    /// <summary>
    /// Гарантирует создание базы данных и начальное заполнение.
    /// </summary>
    public async Task InitializeAsync(string seedProductsPath)
    {
        var connectionString = _configuration["DATABASE_URL"]
            ?? _configuration.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=clothing_store;Username=postgres;Password=postgres";

        await EnsureDatabaseExistsAsync(connectionString);

        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();
        await db.Database.EnsureCreatedAsync();

        await CleanupExpiredDataAsync(db);

        var seedMode = _configuration["DatabaseInitialization:SeedMode"] ?? "EnsureSeeded";
        if (!string.Equals(seedMode, "EnsureSeeded", StringComparison.OrdinalIgnoreCase))
            return;

        if (!db.Products.Any() && File.Exists(seedProductsPath))
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
    }


    private async Task CleanupExpiredDataAsync(StoreDbContext db)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var userSessionTtlHours = _configuration.GetValue<int?>("Security:SessionTtlHours") ?? 24 * 30;
        var adminSessionTtlHours = _configuration.GetValue<int?>("Security:AdminSessionTtlHours") ?? 24 * 7;

        var minUserSessionTime = DateTimeOffset.UtcNow.AddHours(-userSessionTtlHours).ToUnixTimeMilliseconds();
        var minAdminSessionTime = DateTimeOffset.UtcNow.AddHours(-adminSessionTtlHours).ToUnixTimeMilliseconds();

        db.Sessions.RemoveRange(await db.Sessions.Where(x => x.CreatedAt < minUserSessionTime).ToListAsync());
        db.AdminSessions.RemoveRange(await db.AdminSessions.Where(x => x.CreatedAt < minAdminSessionTime).ToListAsync());
        db.VerificationCodes.RemoveRange(await db.VerificationCodes.Where(x => x.ExpiresAt < now).ToListAsync());
        await db.SaveChangesAsync();
    }

    private static async Task EnsureDatabaseExistsAsync(string connectionString)
    {
        var builder = new NpgsqlConnectionStringBuilder(connectionString);
        var dbName = builder.Database;
        builder.Database = "postgres";

        await using var conn = new NpgsqlConnection(builder.ConnectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand($"SELECT 1 FROM pg_database WHERE datname = @db", conn);
        cmd.Parameters.AddWithValue("db", dbName);
        var exists = await cmd.ExecuteScalarAsync();

        if (exists is null)
        {
            await using var createCmd = new NpgsqlCommand($"CREATE DATABASE \"{dbName}\"", conn);
            await createCmd.ExecuteNonQueryAsync();
        }
    }
}
