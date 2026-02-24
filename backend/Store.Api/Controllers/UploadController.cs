using Microsoft.AspNetCore.Mvc;
using Store.Api.Services;

namespace Store.Api.Controllers;

/// <summary>
/// Контроллер загрузки медиафайлов.
/// </summary>
[ApiController]
public class UploadController : ControllerBase
{
    private readonly AuthService _auth;
    private readonly string _uploadsDir;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="UploadController"/>.
    /// </summary>
    public UploadController(AuthService auth, IWebHostEnvironment env)
    {
        _auth = auth;
        _uploadsDir = Path.Combine(env.ContentRootPath, "..", "uploads");
        Directory.CreateDirectory(_uploadsDir);
    }

    /// <summary>
    /// Загружает файлы от имени администратора.
    /// </summary>
    [HttpPost("admin/upload")]
    public async Task<IResult> AdminUpload()
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        return Results.Ok(new { urls = await SaveFilesAsync(Request.Form.Files) });
    }

    /// <summary>
    /// Загружает файлы от имени авторизованного пользователя.
    /// </summary>
    [HttpPost("upload")]
    public async Task<IResult> Upload()
    {
        if (await _auth.RequireUserAsync(Request) is null) return Results.Unauthorized();
        return Results.Ok(new { urls = await SaveFilesAsync(Request.Form.Files) });
    }

    private async Task<List<string>> SaveFilesAsync(IFormFileCollection files)
    {
        var result = new List<string>();
        foreach (var file in files)
        {
            var ext = Path.GetExtension(file.FileName);
            var name = $"{Guid.NewGuid():N}{ext}";
            var path = Path.Combine(_uploadsDir, name);
            await using var stream = System.IO.File.Create(path);
            await file.CopyToAsync(stream);
            result.Add($"/uploads/{name}");
        }

        return result;
    }
}
