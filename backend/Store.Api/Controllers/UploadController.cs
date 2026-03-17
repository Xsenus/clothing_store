using Microsoft.AspNetCore.Mvc;
using Store.Api.Configuration;
using Store.Api.Services;

namespace Store.Api.Controllers;

/// <summary>
/// Контроллер загрузки медиафайлов.
/// </summary>
[ApiController]
public class UploadController : ControllerBase
{
    private const long DefaultMaxUploadFileSizeBytes = 20 * 1024 * 1024;
    private const long MultipartRequestLimitBytes = 50_000_000;
    private const string AllowedFileTypesLabel = "JPG, JPEG, PNG, WEBP, GIF, AVIF, JFIF, MP4, MOV, WEBM";

    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".jfif", ".mp4", ".mov", ".webm"
    };

    private readonly AuthService _auth;
    private readonly string _uploadsDir;
    private readonly long _maxFileSizeBytes;
    private readonly long _maxFaviconSizeBytes;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="UploadController"/>.
    /// </summary>
    public UploadController(AuthService auth, IConfiguration configuration, StoreRuntimePaths runtimePaths)
    {
        _auth = auth;
        _uploadsDir = runtimePaths.UploadsDir;
        _maxFileSizeBytes = configuration.GetValue<long?>("Storage:MaxUploadFileSizeBytes") ?? DefaultMaxUploadFileSizeBytes;
        _maxFaviconSizeBytes = configuration.GetValue<long?>("Storage:MaxFaviconUploadFileSizeBytes") ?? 2 * 1024 * 1024;
        Directory.CreateDirectory(_uploadsDir);
    }

    /// <summary>
    /// Загружает файлы от имени администратора.
    /// </summary>
    [HttpPost("admin/upload")]
    [RequestSizeLimit(MultipartRequestLimitBytes)]
    public async Task<IResult> AdminUpload()
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        return await SaveAndRespondAsync(Request.Form.Files);
    }

    /// <summary>
    /// Загружает файлы от имени авторизованного пользователя.
    /// </summary>
    [HttpPost("upload")]
    [RequestSizeLimit(MultipartRequestLimitBytes)]
    public async Task<IResult> Upload()
    {
        if (await _auth.RequireUserAsync(Request) is null) return Results.Unauthorized();
        return await SaveAndRespondAsync(Request.Form.Files);
    }

    /// <summary>
    /// Загружает favicon.ico от имени администратора.
    /// </summary>
    [HttpPost("admin/upload/favicon")]
    public async Task<IResult> UploadFavicon()
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        var files = Request.Form.Files;
        if (files.Count == 0) return Results.BadRequest(new { detail = "Файл не выбран." });

        var file = files[0];
        if (file.Length <= 0) return Results.BadRequest(new { detail = "Пустой файл загрузить нельзя." });
        if (file.Length > _maxFaviconSizeBytes)
            return Results.BadRequest(new { detail = $"Файл слишком большой. Максимум {FormatMegabytes(_maxFaviconSizeBytes)}." });

        var ext = Path.GetExtension(file.FileName);
        if (!string.Equals(ext, ".ico", StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest(new { detail = "Для favicon разрешен только формат .ico." });

        var faviconsDir = Path.Combine(_uploadsDir, "favicons");
        Directory.CreateDirectory(faviconsDir);

        var name = $"favicon-{Guid.NewGuid():N}.ico";
        var path = Path.Combine(faviconsDir, name);
        await using var stream = System.IO.File.Create(path);
        await file.CopyToAsync(stream);

        return Results.Ok(new { url = $"/uploads/favicons/{name}" });
    }

    private async Task<IResult> SaveAndRespondAsync(IFormFileCollection files)
    {
        if (files.Count == 0) return Results.BadRequest(new { detail = "Файлы не выбраны." });

        var result = new List<string>();
        foreach (var file in files)
        {
            if (file.Length <= 0) return Results.BadRequest(new { detail = "Пустой файл загрузить нельзя." });
            if (file.Length > _maxFileSizeBytes)
                return Results.BadRequest(new { detail = $"Файл слишком большой. Максимум {FormatMegabytes(_maxFileSizeBytes)}." });

            var ext = Path.GetExtension(file.FileName);
            if (string.IsNullOrWhiteSpace(ext) || !AllowedExtensions.Contains(ext))
                return Results.BadRequest(new { detail = $"Недопустимый формат файла. Разрешены: {AllowedFileTypesLabel}." });

            var name = $"{Guid.NewGuid():N}{ext.ToLowerInvariant()}";
            var path = Path.Combine(_uploadsDir, name);
            await using var stream = System.IO.File.Create(path);
            await file.CopyToAsync(stream);
            result.Add($"/uploads/{name}");
        }

        return Results.Ok(new { urls = result });
    }

    private static string FormatMegabytes(long bytes)
    {
        var megabytes = bytes / 1024d / 1024d;
        return $"{megabytes:0.#} МБ";
    }
}
