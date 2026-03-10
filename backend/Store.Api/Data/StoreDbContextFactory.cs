using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Store.Api.Data;

public class StoreDbContextFactory : IDesignTimeDbContextFactory<StoreDbContext>
{
    public StoreDbContext CreateDbContext(string[] args)
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development";
        var apiDirectory = ResolveApiDirectory();

        var configuration = new ConfigurationBuilder()
            .SetBasePath(apiDirectory)
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile($"appsettings.{environment}.json", optional: true)
            .Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection") ?? string.Empty;

        var optionsBuilder = new DbContextOptionsBuilder<StoreDbContext>();
        if (connectionString.StartsWith("Host=", StringComparison.OrdinalIgnoreCase)
            || connectionString.Contains(";Port=", StringComparison.OrdinalIgnoreCase))
        {
            optionsBuilder.UseNpgsql(connectionString);
        }
        else
        {
            var projectRoot = ResolveProjectRoot(apiDirectory);
            var sqlitePath = Environment.GetEnvironmentVariable("STORE_SQLITE_PATH")
                ?? Path.Combine(projectRoot, "backend", "app.db");
            var sqliteDir = Path.GetDirectoryName(sqlitePath);
            if (!string.IsNullOrWhiteSpace(sqliteDir))
            {
                Directory.CreateDirectory(sqliteDir);
            }

            optionsBuilder.UseSqlite($"Data Source={sqlitePath}");
        }

        return new StoreDbContext(optionsBuilder.Options);
    }

    private static string ResolveApiDirectory()
    {
        var explicitApiDir = Environment.GetEnvironmentVariable("STORE_API_DIR");
        if (!string.IsNullOrWhiteSpace(explicitApiDir) && Directory.Exists(explicitApiDir))
        {
            return explicitApiDir;
        }

        var candidates = new[]
        {
            Directory.GetCurrentDirectory(),
            AppContext.BaseDirectory,
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../")),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"))
        };

        foreach (var candidate in candidates)
        {
            var apiDir = TryResolveApiDirectoryFrom(candidate);
            if (apiDir is not null)
            {
                return apiDir;
            }
        }

        throw new InvalidOperationException(
            "Could not locate backend/Store.Api directory for design-time DbContext creation.");
    }

    private static string? TryResolveApiDirectoryFrom(string startDirectory)
    {
        var current = new DirectoryInfo(startDirectory);
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "appsettings.json"))
                && File.Exists(Path.Combine(current.FullName, "Store.Api.csproj")))
            {
                return current.FullName;
            }

            var nested = Path.Combine(current.FullName, "backend", "Store.Api");
            if (File.Exists(Path.Combine(nested, "appsettings.json"))
                && File.Exists(Path.Combine(nested, "Store.Api.csproj")))
            {
                return nested;
            }

            current = current.Parent;
        }

        return null;
    }

    private static string ResolveProjectRoot(string apiDirectory)
    {
        var explicitRoot = Environment.GetEnvironmentVariable("STORE_ROOT");
        if (!string.IsNullOrWhiteSpace(explicitRoot) && Directory.Exists(explicitRoot))
        {
            return explicitRoot;
        }

        var candidate = new DirectoryInfo(apiDirectory).Parent?.Parent;
        return candidate?.FullName ?? Path.GetFullPath(Path.Combine(apiDirectory, "../.."));
    }
}
