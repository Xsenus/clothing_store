using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

/// <summary>
/// Сервис вспомогательных методов аутентификации для контроллеров.
/// </summary>
public class AuthService
{
    private readonly StoreDbContext _db;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="AuthService"/>.
    /// </summary>
    public AuthService(StoreDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// Возвращает пользователя по bearer-токену.
    /// </summary>
    public async Task<User?> RequireUserAsync(HttpRequest request)
    {
        var token = ExtractBearer(request);
        if (string.IsNullOrWhiteSpace(token)) return null;
        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Token == token);
        return session is null ? null : await _db.Users.FirstOrDefaultAsync(u => u.Id == session.UserId);
    }

    /// <summary>
    /// Возвращает признак валидности токена администратора.
    /// </summary>
    public Task<bool> RequireAdminAsync(HttpRequest request)
    {
        var token = request.Headers["X-Admin-Token"].ToString().Trim();
        return _db.AdminSessions.AnyAsync(x => x.Token == token);
    }

    /// <summary>
    /// Извлекает bearer-токен из запроса.
    /// </summary>
    public string ExtractBearer(HttpRequest req)
    {
        var auth = req.Headers.Authorization.ToString();
        return auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? auth[7..].Trim() : string.Empty;
    }

    /// <summary>
    /// Создаёт хэш пароля и соль.
    /// </summary>
    public static (string hash, string salt) HashPassword(string password)
    {
        var saltBytes = RandomNumberGenerator.GetBytes(16);
        var salt = Convert.ToHexString(saltBytes);
        using var sha = SHA256.Create();
        var hash = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(password + salt)));
        return (hash, salt);
    }

    /// <summary>
    /// Проверяет пароль по хэшу и соли.
    /// </summary>
    public static bool VerifyPassword(string password, string hash, string salt)
    {
        using var sha = SHA256.Create();
        var computed = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(password + salt)));
        return string.Equals(computed, hash, StringComparison.OrdinalIgnoreCase);
    }
}
