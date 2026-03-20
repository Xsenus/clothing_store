using Microsoft.Extensions.Configuration;

namespace Store.Api.Configuration;

public sealed class StoreRuntimePaths
{
    public string RepositoryRoot { get; }
    public string SeedProductsPath { get; }
    public string UploadsDir { get; }
    public string DatabaseBackupsDir { get; }

    private StoreRuntimePaths(string repositoryRoot, string seedProductsPath, string uploadsDir, string databaseBackupsDir)
    {
        RepositoryRoot = repositoryRoot;
        SeedProductsPath = seedProductsPath;
        UploadsDir = uploadsDir;
        DatabaseBackupsDir = databaseBackupsDir;
    }

    public static StoreRuntimePaths Resolve(
        IConfiguration configuration,
        string contentRootPath,
        string appBaseDirectory)
    {
        var repositoryRoot = ResolveRepositoryRoot(contentRootPath, appBaseDirectory);
        var seedProductsPath = ResolveAbsolutePath(
            configuration["Seed:ProductsPath"],
            repositoryRoot,
            Path.Combine("seed", "products.jsonl"));
        var uploadsDir = ResolveAbsolutePath(
            configuration["Storage:UploadsDir"],
            repositoryRoot,
            Path.Combine("backend", "uploads"));
        var databaseBackupsDir = ResolveAbsolutePath(
            configuration["DatabaseBackup:Directory"],
            repositoryRoot,
            Path.Combine("backend", "backups", "database"));

        return new StoreRuntimePaths(repositoryRoot, seedProductsPath, uploadsDir, databaseBackupsDir);
    }

    private static string ResolveRepositoryRoot(string contentRootPath, string appBaseDirectory)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var candidate in GetCandidates(contentRootPath, appBaseDirectory))
        {
            if (string.IsNullOrWhiteSpace(candidate))
            {
                continue;
            }

            var fullPath = Path.GetFullPath(candidate);
            if (!Directory.Exists(fullPath) || !seen.Add(fullPath))
            {
                continue;
            }

            var repositoryRoot = TryFindRepositoryRoot(fullPath);
            if (!string.IsNullOrWhiteSpace(repositoryRoot))
            {
                return repositoryRoot;
            }
        }

        return Path.GetFullPath(contentRootPath);
    }

    private static IEnumerable<string> GetCandidates(string contentRootPath, string appBaseDirectory)
    {
        yield return contentRootPath;
        yield return Path.Combine(contentRootPath, "..");
        yield return appBaseDirectory;
        yield return Path.Combine(appBaseDirectory, "..");
        yield return Path.Combine(appBaseDirectory, "..", "..");
        yield return Path.Combine(appBaseDirectory, "..", "..", "..");
        yield return Path.Combine(appBaseDirectory, "..", "..", "..", "..");
    }

    private static string? TryFindRepositoryRoot(string startDirectory)
    {
        var current = new DirectoryInfo(startDirectory);
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "package.json"))
                && Directory.Exists(Path.Combine(current.FullName, "seed"))
                && Directory.Exists(Path.Combine(current.FullName, "backend")))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return null;
    }

    private static string ResolveAbsolutePath(string? configuredPath, string repositoryRoot, string defaultRelativePath)
    {
        if (string.IsNullOrWhiteSpace(configuredPath))
        {
            return Path.GetFullPath(Path.Combine(repositoryRoot, defaultRelativePath));
        }

        return Path.IsPathRooted(configuredPath)
            ? Path.GetFullPath(configuredPath)
            : Path.GetFullPath(Path.Combine(repositoryRoot, configuredPath));
    }
}
