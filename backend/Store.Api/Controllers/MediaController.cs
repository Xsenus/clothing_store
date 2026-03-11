using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Services;

namespace Store.Api.Controllers;

[ApiController]
public class MediaController : ControllerBase
{
    private readonly StoreDbContext _db;
    private readonly GalleryStorageService _galleryStorage;

    public MediaController(StoreDbContext db, GalleryStorageService galleryStorage)
    {
        _db = db;
        _galleryStorage = galleryStorage;
    }

    [HttpGet("media/{id}")]
    public async Task<IResult> GetById(string id)
    {
        var image = await _db.GalleryImages.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (image is null) return Results.NotFound();

        return await TryServeFromDiskThenDbAsync(image);
    }

    [HttpGet("uploads/{**relativePath}")]
    public async Task<IResult> GetByUploadPath(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return Results.NotFound();

        var normalized = relativePath.Replace('\\', '/').TrimStart('/');
        var image = await _db.GalleryImages.AsNoTracking()
            .FirstOrDefaultAsync(x => x.DiskPath == normalized);

        if (image is null) return Results.NotFound();
        return await TryServeFromDiskThenDbAsync(image);
    }

    private async Task<IResult> TryServeFromDiskThenDbAsync(Models.GalleryImage image)
    {
        if (!string.IsNullOrWhiteSpace(image.DiskPath))
        {
            var diskPath = _galleryStorage.BuildAbsolutePath(image.DiskPath);
            if (System.IO.File.Exists(diskPath))
                return Results.File(diskPath, image.ContentType, image.FileName, enableRangeProcessing: true);

            await _galleryStorage.WriteImageToDiskAsync(image);
            if (System.IO.File.Exists(diskPath))
                return Results.File(diskPath, image.ContentType, image.FileName, enableRangeProcessing: true);
        }

        return Results.File(image.BinaryData, image.ContentType, image.FileName);
    }
}
