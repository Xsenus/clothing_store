using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

[ApiController]
[Route("admin/gallery")]
public class AdminGalleryController : ControllerBase
{
    private const long DefaultMaxGalleryFileSizeBytes = 20 * 1024 * 1024;
    private const long GalleryRequestLimitBytes = 25_000_000;
    private const int DefaultGalleryPageSize = 24;
    private const int MaxGalleryPageSize = 120;

    private readonly StoreDbContext _db;
    private readonly AuthService _auth;
    private readonly GalleryStorageService _galleryStorage;
    private readonly long _maxFileSizeBytes;

    public AdminGalleryController(StoreDbContext db, AuthService auth, GalleryStorageService galleryStorage, IConfiguration configuration)
    {
        _db = db;
        _auth = auth;
        _galleryStorage = galleryStorage;
        _maxFileSizeBytes = configuration.GetValue<long?>("Storage:MaxUploadFileSizeBytes") ?? DefaultMaxGalleryFileSizeBytes;
    }

    [HttpGet]
    public async Task<IResult> GetAll([FromQuery] int page = 1, [FromQuery] int pageSize = DefaultGalleryPageSize, [FromQuery] string? search = null)
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();

        var normalizedSearch = search?.Trim();
        var safePageSize = Math.Clamp(pageSize, 1, MaxGalleryPageSize);
        var query = _db.GalleryImages.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(normalizedSearch))
        {
            var pattern = $"%{normalizedSearch}%";
            query = query.Where(x =>
                EF.Functions.ILike(x.Name, pattern)
                || (x.Description != null && EF.Functions.ILike(x.Description, pattern)));
        }

        var totalItems = await query.CountAsync();
        var totalPages = Math.Max(1, (int)Math.Ceiling(totalItems / (double)safePageSize));
        var safePage = Math.Clamp(page, 1, totalPages);

        var images = await query
            .OrderByDescending(x => x.CreatedAt)
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .ToListAsync();

        return Results.Ok(new
        {
            items = images.Select(image => MapGalleryImage(image, Request.PathBase)),
            page = safePage,
            pageSize = safePageSize,
            totalItems,
            totalPages
        });
    }

    [HttpPost]
    [RequestSizeLimit(GalleryRequestLimitBytes)]
    public async Task<IResult> Upload([FromForm] IFormFile file, [FromForm] string? name, [FromForm] string? description)
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        if (file.Length <= 0) return Results.BadRequest(new { detail = "Файл пустой." });
        if (file.Length > _maxFileSizeBytes)
            return Results.BadRequest(new { detail = $"Файл слишком большой. Максимум {FormatMegabytes(_maxFileSizeBytes)}." });

        string extension;
        try
        {
            extension = GalleryStorageService.EnsureAllowedExtension(file.FileName);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }

        await using var memory = new MemoryStream();
        await file.CopyToAsync(memory);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var image = new GalleryImage
        {
            Id = Guid.NewGuid().ToString("N"),
            Name = string.IsNullOrWhiteSpace(name) ? Path.GetFileNameWithoutExtension(file.FileName) : name.Trim(),
            Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim(),
            ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            FileExtension = extension,
            FileName = $"{Guid.NewGuid():N}{extension}",
            FileSize = file.Length,
            BinaryData = memory.ToArray(),
            CreatedAt = now,
            UpdatedAt = now
        };

        image.DiskPath = _galleryStorage.BuildRelativePath(image.Id, image.FileExtension);
        await _galleryStorage.WriteImageToDiskAsync(image);

        _db.GalleryImages.Add(image);
        await _db.SaveChangesAsync();
        return Results.Ok(MapGalleryImage(image, Request.PathBase));
    }

    private static string FormatMegabytes(long bytes)
    {
        var megabytes = bytes / 1024d / 1024d;
        return $"{megabytes:0.#} МБ";
    }

    [HttpPatch("{id}")]
    public async Task<IResult> Update(string id, [FromBody] GalleryImagePatchPayload payload)
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        var image = await _db.GalleryImages.FirstOrDefaultAsync(x => x.Id == id);
        if (image is null) return Results.NotFound(new { detail = "Изображение не найдено." });

        if (payload.Name is not null)
            image.Name = payload.Name.Trim();
        if (payload.Description is not null)
            image.Description = string.IsNullOrWhiteSpace(payload.Description) ? null : payload.Description.Trim();

        image.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await _db.SaveChangesAsync();
        return Results.Ok(MapGalleryImage(image, Request.PathBase));
    }

    [HttpDelete("{id}")]
    public async Task<IResult> Delete(string id)
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        var image = await _db.GalleryImages.FirstOrDefaultAsync(x => x.Id == id);
        if (image is null) return Results.Ok(new { ok = true });

        var diskPath = _galleryStorage.BuildAbsolutePath(image.DiskPath);
        if (System.IO.File.Exists(diskPath))
            System.IO.File.Delete(diskPath);

        _db.GalleryImages.Remove(image);
        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    [HttpPost("{id}/copy-to-disk")]
    public async Task<IResult> CopyToDisk(string id)
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        var image = await _db.GalleryImages.FirstOrDefaultAsync(x => x.Id == id);
        if (image is null) return Results.NotFound(new { detail = "Изображение не найдено." });

        await _galleryStorage.WriteImageToDiskAsync(image);
        return Results.Ok(MapGalleryImage(image, Request.PathBase));
    }

    [HttpPost("restore-missing")]
    public async Task<IResult> RestoreMissing()
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        var restored = await _galleryStorage.RestoreMissingImagesAsync();
        return Results.Ok(new { restored });
    }

    private object MapGalleryImage(GalleryImage image, PathString pathBase)
    {
        var fullPath = _galleryStorage.BuildAbsolutePath(image.DiskPath);
        var relativeUrl = _galleryStorage.BuildPublicUrl(image.DiskPath);
        var url = string.IsNullOrWhiteSpace(pathBase.Value)
            ? relativeUrl
            : $"{pathBase.Value}{relativeUrl}";

        return new
        {
            image.Id,
            image.Name,
            image.Description,
            image.ContentType,
            image.FileExtension,
            image.FileName,
            image.FileSize,
            image.CreatedAt,
            image.UpdatedAt,
            diskPath = image.DiskPath,
            url,
            existsOnDisk = System.IO.File.Exists(fullPath)
        };
    }
}

public record GalleryImagePatchPayload(string? Name, string? Description);
