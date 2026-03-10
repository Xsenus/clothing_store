using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Store.Api.Data;

public class StoreDbContextFactory : IDesignTimeDbContextFactory<StoreDbContext>
{
    public StoreDbContext CreateDbContext(string[] args)
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development";

        var projectRoot = Environment.GetEnvironmentVariable("STORE_ROOT")
            ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));

        var configuration = new ConfigurationBuilder()
            .SetBasePath(projectRoot)
            .AddJsonFile("backend/Store.Api/appsettings.json", optional: false)
            .AddJsonFile($"backend/Store.Api/appsettings.{environment}.json", optional: true)
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
}
