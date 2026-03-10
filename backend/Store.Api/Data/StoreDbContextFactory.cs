using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Store.Api.Data;

public class StoreDbContextFactory : IDesignTimeDbContextFactory<StoreDbContext>
{
    public StoreDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<StoreDbContext>();

        var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
        if (!string.IsNullOrWhiteSpace(databaseUrl))
        {
            optionsBuilder.UseNpgsql(databaseUrl);
            return new StoreDbContext(optionsBuilder.Options);
        }

        var projectRoot = Environment.GetEnvironmentVariable("STORE_ROOT")
            ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var sqlitePath = Environment.GetEnvironmentVariable("STORE_SQLITE_PATH")
            ?? Path.Combine(projectRoot, "backend", "app.db");
        var sqliteDir = Path.GetDirectoryName(sqlitePath);
        if (!string.IsNullOrWhiteSpace(sqliteDir))
        {
            Directory.CreateDirectory(sqliteDir);
        }

        optionsBuilder.UseSqlite($"Data Source={sqlitePath}");
        return new StoreDbContext(optionsBuilder.Options);
    }
}
