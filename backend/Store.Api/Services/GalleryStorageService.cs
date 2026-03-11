using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

public class GalleryStorageService
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg"
    };

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly string _uploadsDir;

    public GalleryStorageService(IServiceScopeFactory scopeFactory, IConfiguration configuration, IWebHostEnvironment env)
    {
        _scopeFactory = scopeFactory;
        _uploadsDir = Environment.GetEnvironmentVariable("STORE_UPLOADS_DIR")
            ?? configuration["Storage:UploadsDir"]
            ?? Path.Combine(env.ContentRootPath, "..", "uploads");
    }

    public string BuildRelativePath(string imageId, string extension) => $"gallery/{imageId}{extension.ToLowerInvariant()}";

    public string BuildPublicUrl(string relativePath) => $"/uploads/{relativePath.Replace('\\', '/')}";

    public string BuildAbsolutePath(string relativePath)
    {
        var normalized = relativePath.Replace('/', Path.DirectorySeparatorChar);
        return Path.GetFullPath(Path.Combine(_uploadsDir, normalized));
    }

    public static string EnsureAllowedExtension(string? fileName)
    {
        var ext = Path.GetExtension(fileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(ext) || !AllowedExtensions.Contains(ext))
            throw new InvalidOperationException("Недопустимый формат изображения.");

        return ext.ToLowerInvariant();
    }

    public async Task<int> RestoreMissingImagesAsync(CancellationToken cancellationToken = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();
        var images = await db.GalleryImages.AsNoTracking().ToListAsync(cancellationToken);
        var restored = 0;

        foreach (var image in images)
        {
            var path = BuildAbsolutePath(image.DiskPath);
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrWhiteSpace(dir))
                Directory.CreateDirectory(dir);

            if (File.Exists(path))
                continue;

            await File.WriteAllBytesAsync(path, image.BinaryData, cancellationToken);
            restored++;
        }

        return restored;
    }

    public async Task WriteImageToDiskAsync(GalleryImage image, CancellationToken cancellationToken = default)
    {
        var absolutePath = BuildAbsolutePath(image.DiskPath);
        var dir = Path.GetDirectoryName(absolutePath);
        if (!string.IsNullOrWhiteSpace(dir))
            Directory.CreateDirectory(dir);

        await File.WriteAllBytesAsync(absolutePath, image.BinaryData, cancellationToken);
    }
}
