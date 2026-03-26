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

        var ttlHours = await GetIntSettingAsync("auth_session_ttl_hours", "Security:SessionTtlHours", 24 * 30);
        var minCreatedAt = DateTimeOffset.UtcNow.AddHours(-ttlHours).ToUnixTimeMilliseconds();

        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Token == token);
        if (session is null || session.CreatedAt < minCreatedAt)
            return null;

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == session.UserId);
        if (user is null || user.IsDeleted)
            return null;

        await TouchSessionIfNeededAsync(session);
        return user;
    }

    /// <summary>
    /// Возвращает администратора по админскому токену или обычной пользовательской сессии.
    /// </summary>
    public async Task<User?> RequireAdminUserAsync(HttpRequest request)
    {
        var adminToken = request.Headers["X-Admin-Token"].ToString().Trim();
        if (!string.IsNullOrWhiteSpace(adminToken))
        {
            var ttlHours = await GetIntSettingAsync("auth_admin_session_ttl_hours", "Security:AdminSessionTtlHours", 24 * 7);
            var minCreatedAt = DateTimeOffset.UtcNow.AddHours(-ttlHours).ToUnixTimeMilliseconds();

            var session = await _db.AdminSessions.FirstOrDefaultAsync(x => x.Token == adminToken);
            if (session is not null && session.CreatedAt >= minCreatedAt && !string.IsNullOrWhiteSpace(session.UserId))
            {
                var sessionUser = await _db.Users.FirstOrDefaultAsync(x => x.Id == session.UserId);
                if (sessionUser is not null && !sessionUser.IsDeleted && sessionUser.IsAdmin && !sessionUser.IsBlocked)
                    return sessionUser;
            }
        }

        var userToken = ExtractBearer(request);
        if (string.IsNullOrWhiteSpace(userToken)) return null;

        var adminTtlHoursForUserSession = await GetIntSettingAsync("auth_admin_session_ttl_hours", "Security:AdminSessionTtlHours", 24 * 7);
        var minUserSessionForAdmin = DateTimeOffset.UtcNow.AddHours(-adminTtlHoursForUserSession).ToUnixTimeMilliseconds();
        var userSession = await _db.Sessions.FirstOrDefaultAsync(x => x.Token == userToken);
        if (userSession is null || userSession.CreatedAt < minUserSessionForAdmin || string.IsNullOrWhiteSpace(userSession.UserId))
            return null;

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userSession.UserId);
        if (user is null || user.IsDeleted || !user.IsAdmin || user.IsBlocked)
            return null;

        await TouchSessionIfNeededAsync(userSession);
        return user;
    }

    /// <summary>
    /// Возвращает признак валидности токена администратора.
    /// </summary>
    public async Task<bool> RequireAdminAsync(HttpRequest request)
    {
        return await RequireAdminUserAsync(request) is not null;
    }

    private async Task TouchSessionIfNeededAsync(Session session)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var slidingWindowMinutes = await GetIntSettingAsync("auth_session_sliding_update_minutes", "Security:SessionSlidingUpdateMinutes", 5);
        var minDeltaMs = Math.Max(1, slidingWindowMinutes) * 60L * 1000L;
        if (now - session.CreatedAt < minDeltaMs)
            return;

        session.CreatedAt = now;
        await _db.SaveChangesAsync();
    }

    public async Task<int> GetIntSettingAsync(string appSettingKey, string configKey, int fallback)
    {
        var row = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == appSettingKey);
        if (row is not null && int.TryParse(row.Value, out var parsedFromDb) && parsedFromDb > 0)
            return parsedFromDb;

        var fromConfig = _configuration.GetValue<int?>(configKey);
        if (fromConfig.HasValue && fromConfig.Value > 0)
            return fromConfig.Value;

        return fallback;
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
