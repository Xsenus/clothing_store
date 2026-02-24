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
    private const int SaltSize = 16;
    private const int HashSize = 32;
    private const int DefaultPbkdf2Iterations = 100_000;

    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="AuthService"/>.
    /// </summary>
    public AuthService(StoreDbContext db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
    }

    /// <summary>
    /// Возвращает пользователя по bearer-токену.
    /// </summary>
    public async Task<User?> RequireUserAsync(HttpRequest request)
    {
        var token = ExtractBearer(request);
        if (string.IsNullOrWhiteSpace(token)) return null;

        var ttlHours = _configuration.GetValue<int?>("Security:SessionTtlHours") ?? 24 * 30;
        var minCreatedAt = DateTimeOffset.UtcNow.AddHours(-ttlHours).ToUnixTimeMilliseconds();

        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Token == token);
        if (session is null || session.CreatedAt < minCreatedAt)
            return null;

        return await _db.Users.FirstOrDefaultAsync(u => u.Id == session.UserId);
    }

    /// <summary>
    /// Возвращает признак валидности токена администратора.
    /// </summary>
    public async Task<bool> RequireAdminAsync(HttpRequest request)
    {
        var token = request.Headers["X-Admin-Token"].ToString().Trim();
        if (string.IsNullOrWhiteSpace(token)) return false;

        var ttlHours = _configuration.GetValue<int?>("Security:AdminSessionTtlHours") ?? 24 * 7;
        var minCreatedAt = DateTimeOffset.UtcNow.AddHours(-ttlHours).ToUnixTimeMilliseconds();

        var session = await _db.AdminSessions.FirstOrDefaultAsync(x => x.Token == token);
        return session is not null && session.CreatedAt >= minCreatedAt;
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
    public static (string hash, string salt) HashPassword(string password, int iterations = DefaultPbkdf2Iterations)
    {
        var saltBytes = RandomNumberGenerator.GetBytes(SaltSize);
        var hashBytes = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password), saltBytes, iterations, HashAlgorithmName.SHA256, HashSize);
        return (Convert.ToHexString(hashBytes), Convert.ToHexString(saltBytes));
    }

    /// <summary>
    /// Проверяет пароль по хэшу и соли.
    /// </summary>
    public static bool VerifyPassword(string password, string hash, string salt, int iterations = DefaultPbkdf2Iterations)
    {
        try
        {
            var hashBytes = Convert.FromHexString(hash);
            var saltBytes = Convert.FromHexString(salt);
            var computed = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password), saltBytes, iterations, HashAlgorithmName.SHA256, hashBytes.Length);
            if (CryptographicOperations.FixedTimeEquals(computed, hashBytes))
                return true;
        }
        catch (FormatException)
        {
            // noop, fallback to legacy format comparison below.
        }

        using var sha = SHA256.Create();
        var legacyComputed = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(password + salt)));
        return string.Equals(legacyComputed, hash, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Создаёт криптографически стойкий токен.
    /// </summary>
    public static string GenerateToken(int sizeBytes = 32) => Convert.ToHexString(RandomNumberGenerator.GetBytes(sizeBytes)).ToLowerInvariant();
}
