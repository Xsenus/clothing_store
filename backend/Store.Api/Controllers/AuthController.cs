using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

/// <summary>
/// Контроллер сценариев аутентификации.
/// </summary>
[ApiController]
[Route("auth")]
public class AuthController : ControllerBase
{
    private readonly StoreDbContext _db;
    private readonly AuthService _authService;
    private readonly IConfiguration _configuration;
    private readonly TransactionalEmailService _emailService;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="AuthController"/>.
    /// </summary>
    public AuthController(StoreDbContext db, AuthService authService, IConfiguration configuration, TransactionalEmailService emailService)
    {
        _db = db;
        _authService = authService;
        _configuration = configuration;
        _emailService = emailService;
    }

    /// <summary>
    /// Создаёт новый аккаунт и отправляет код подтверждения.
    /// </summary>
    [HttpPost("signup")]
    public async Task<IResult> SignUp([FromBody] AuthPayload payload)
    {
        var email = payload.Email.Trim().ToLowerInvariant();
        if (!IsValidEmail(email)) return Results.BadRequest(new { detail = "Invalid email" });

        var strictPasswordPolicy = await IsStrictPasswordPolicyEnabledAsync();
        if (strictPasswordPolicy && !IsStrongPassword(payload.Password))
            return Results.BadRequest(new { detail = "Password is too weak" });

        var existingUser = await _db.Users.FirstOrDefaultAsync(x => x.Email == email);
        if (existingUser is not null && existingUser.Verified)
            return Results.BadRequest(new { detail = "Email already in use" });

        var iterations = _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000;
        var (hash, salt) = AuthService.HashPassword(payload.Password, iterations);

        if (existingUser is null)
        {
            var user = new User
            {
                Id = Guid.NewGuid().ToString("N"),
                Email = email,
                PasswordHash = hash,
                Salt = salt,
                CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Verified = false
            };
            _db.Users.Add(user);
            _db.Profiles.Add(new Profile
            {
                UserId = user.Id,
                Email = email,
                Name = email.Split('@')[0]
            });
        }
        else
        {
            existingUser.PasswordHash = hash;
            existingUser.Salt = salt;
            existingUser.Verified = false;
        }

        await UpsertCodeAsync(email, "signup");
        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    /// <summary>
    /// Повторно отправляет код подтверждения.
    /// </summary>
    [HttpPost("resend")]
    public async Task<IResult> Resend([FromBody] ResetRequestPayload payload)
    {
        await UpsertCodeAsync(payload.Email.Trim().ToLowerInvariant(), "signup");
        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    /// <summary>
    /// Подтверждает код регистрации.
    /// </summary>
    [HttpPost("verify")]
    public async Task<IResult> Verify([FromBody] VerifyPayload payload)
    {
        var email = payload.Email.Trim().ToLowerInvariant();
        var code = await _db.VerificationCodes.FirstOrDefaultAsync(x => x.Email == email && x.Kind == "signup");
        if (code is null || code.Code != payload.Code || code.ExpiresAt < DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) return Results.BadRequest(new { detail = "Invalid code" });
        var user = await _db.Users.FirstAsync(x => x.Email == email);
        user.Verified = true;
        _db.VerificationCodes.Remove(code);
        var (token, refreshToken) = await CreateSessionPairAsync(user.Id);
        return Results.Ok(new
        {
            token,
            refreshToken,
            user = new
            {
                id = user.Id,
                email = user.Email
            }
        });
    }

    /// <summary>
    /// Аутентифицирует пользователя и возвращает bearer-токен.
    /// </summary>
    [HttpPost("login")]
    public async Task<IResult> Login([FromBody] AuthPayload payload)
    {
        var email = payload.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Email == email);
        var iterations = _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000;
        if (user is null || !AuthService.VerifyPassword(payload.Password, user.PasswordHash, user.Salt, iterations)) return Results.BadRequest(new { detail = "Invalid credentials" });
        if (user.IsBlocked) return Results.BadRequest(new { detail = "User is blocked" });
        if (!user.Verified) return Results.BadRequest(new { detail = "Email is not verified" });
        var (token, refreshToken) = await CreateSessionPairAsync(user.Id);
        return Results.Ok(new { token, refreshToken });
    }


    [HttpPost("telegram/login")]
    public async Task<IResult> TelegramLogin([FromBody] TelegramAuthPayload payload)
    {
        var botToken = await GetSettingOrConfigAsync("telegram_bot_token", "Integrations:Telegram:BotToken");
        if (string.IsNullOrWhiteSpace(botToken))
            return Results.BadRequest(new { detail = "Telegram bot token is not configured" });

        if (!ValidateTelegramPayload(payload, botToken))
            return Results.BadRequest(new { detail = "Invalid telegram auth payload" });

        var email = $"telegram_{payload.Id}@telegram.local";
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Email == email);
        var isNewTelegramUser = user is null;

        if (user is null)
        {
            user = new User
            {
                Id = Guid.NewGuid().ToString("N"),
                Email = email,
                PasswordHash = string.Empty,
                Salt = string.Empty,
                CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Verified = true
            };
            _db.Users.Add(user);
            _db.Profiles.Add(new Profile
            {
                UserId = user.Id,
                Email = email,
                Name = string.Join(" ", new[] { payload.FirstName, payload.LastName }.Where(x => !string.IsNullOrWhiteSpace(x))).Trim(),
                Nickname = payload.Username
            });
        }
        else if (!user.Verified)
        {
            user.Verified = true;
        }

        var (token, refreshToken) = await CreateSessionPairAsync(user.Id);
        await _db.SaveChangesAsync();

        if (isNewTelegramUser)
            await _emailService.TrySendTelegramConnectedEmailAsync(user.Id, payload.Id, payload.Username);

        return Results.Ok(new
        {
            token,
            refreshToken,
            user = new { id = user.Id, email = user.Email }
        });
    }

    [HttpPost("telegram/start")]
    public async Task<IResult> StartTelegramAuth([FromBody] TelegramStartAuthPayload? payload)
    {
        var bot = await _db.TelegramBots
            .Where(x => x.Enabled && x.UseForLogin && !string.IsNullOrWhiteSpace(x.Token) && !string.IsNullOrWhiteSpace(x.Username))
            .OrderByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync();

        if (bot is null)
            return Results.BadRequest(new { detail = "Telegram bot is not configured for login" });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var state = AuthService.GenerateToken()[..24].ToLowerInvariant();
        var request = new TelegramAuthRequest
        {
            Id = Guid.NewGuid().ToString("N"),
            State = state,
            BotId = bot.Id,
            Status = "pending",
            CreatedAt = now,
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeMilliseconds()
        };

        _db.TelegramAuthRequests.Add(request);
        await _db.SaveChangesAsync();

        var safeReturnUrl = string.IsNullOrWhiteSpace(payload?.ReturnUrl) ? "/profile" : payload!.ReturnUrl!.Trim();
        return Results.Ok(new
        {
            state,
            authUrl = $"https://t.me/{bot.Username}?start=login_{state}",
            returnUrl = safeReturnUrl,
            expiresAt = request.ExpiresAt,
            pollIntervalMs = 2000
        });
    }

    [HttpGet("telegram/status/{state}")]
    public async Task<IResult> GetTelegramAuthStatus([FromRoute] string state)
    {
        var normalizedState = state?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedState))
            return Results.BadRequest(new { detail = "Invalid state" });

        var request = await _db.TelegramAuthRequests
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(x => x.State == normalizedState);

        if (request is null)
            return Results.NotFound(new { detail = "Authorization request not found" });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (request.ExpiresAt <= now && request.Status != "completed" && request.Status != "consumed")
        {
            request.Status = "expired";
            await _db.SaveChangesAsync();
        }

        if (!string.Equals(request.Status, "completed", StringComparison.Ordinal))
            return Results.Ok(new { status = request.Status, completed = false });

        if (string.IsNullOrWhiteSpace(request.UserId))
            return Results.Ok(new { status = "pending", completed = false });

        if (request.ConsumedAt.HasValue)
            return Results.Ok(new { status = "consumed", completed = false });

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == request.UserId);
        if (user is null || user.IsBlocked)
            return Results.BadRequest(new { detail = "User is not available for login" });

        user.Verified = true;
        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id);
        if (profile is not null && !string.IsNullOrWhiteSpace(request.PhoneNumber))
        {
            if (string.IsNullOrWhiteSpace(profile.Phone))
                profile.Phone = request.PhoneNumber;
            profile.PhoneVerified = true;
        }

        var (token, refreshToken) = await CreateSessionPairAsync(user.Id);

        request.ConsumedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        request.Status = "consumed";
        await _db.SaveChangesAsync();

        return Results.Ok(new
        {
            status = "completed",
            completed = true,
            token,
            refreshToken,
            user = new { id = user.Id, email = user.Email }
        });
    }

    /// <summary>
    /// Обновляет пользовательскую сессию по refresh-токену.
    /// </summary>
    [HttpPost("refresh")]
    public async Task<IResult> Refresh([FromBody] RefreshPayload payload)
    {
        var refreshToken = payload.RefreshToken?.Trim();
        if (string.IsNullOrWhiteSpace(refreshToken))
            return Results.Unauthorized();

        var refreshTtlHours = await _authService.GetIntSettingAsync("auth_refresh_session_ttl_hours", "Security:RefreshSessionTtlHours", 24 * 30);
        var minRefreshCreatedAt = DateTimeOffset.UtcNow.AddHours(-refreshTtlHours).ToUnixTimeMilliseconds();

        var refreshSession = await _db.RefreshSessions.FirstOrDefaultAsync(x => x.Token == refreshToken);
        if (refreshSession is null)
            return Results.Unauthorized();

        if (refreshSession.CreatedAt < minRefreshCreatedAt || string.IsNullOrWhiteSpace(refreshSession.UserId))
        {
            _db.RefreshSessions.Remove(refreshSession);
            await _db.SaveChangesAsync();
            return Results.Unauthorized();
        }

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == refreshSession.UserId);
        if (user is null || user.IsBlocked || !user.Verified)
        {
            _db.RefreshSessions.Remove(refreshSession);
            await _db.SaveChangesAsync();
            return Results.Unauthorized();
        }

        _db.RefreshSessions.Remove(refreshSession);

        var currentAccessToken = _authService.ExtractBearer(Request);
        if (!string.IsNullOrWhiteSpace(currentAccessToken))
        {
            var currentSession = await _db.Sessions.FirstOrDefaultAsync(x => x.Token == currentAccessToken && x.UserId == user.Id);
            if (currentSession is not null)
                _db.Sessions.Remove(currentSession);
        }

        var (token, nextRefreshToken) = await CreateSessionPairAsync(user.Id);
        return Results.Ok(new { token, refreshToken = nextRefreshToken });
    }

    /// <summary>
    /// Возвращает профиль текущего пользователя.
    /// </summary>
    [HttpGet("me")]
    public async Task<IResult> Me()
    {
        var user = await _authService.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id);
        return Results.Ok(new { user = new { id = user.Id, email = user.Email }, profile });
    }

    /// <summary>
    /// Выполняет выход авторизованного пользователя.
    /// </summary>
    [HttpPost("logout")]
    public async Task<IResult> Logout([FromBody] RefreshPayload? payload)
    {
        var token = _authService.ExtractBearer(Request);
        var session = await _db.Sessions.FirstOrDefaultAsync(x => x.Token == token);
        var currentUserId = session?.UserId;
        if (session is not null)
            _db.Sessions.Remove(session);

        var refreshToken = payload?.RefreshToken?.Trim();
        if (!string.IsNullOrWhiteSpace(refreshToken))
        {
            var refreshSession = string.IsNullOrWhiteSpace(currentUserId)
                ? await _db.RefreshSessions.FirstOrDefaultAsync(x => x.Token == refreshToken)
                : await _db.RefreshSessions.FirstOrDefaultAsync(x => x.Token == refreshToken && x.UserId == currentUserId);
            if (refreshSession is not null)
                _db.RefreshSessions.Remove(refreshSession);
        }

        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    /// <summary>
    /// Отправляет код для сброса пароля.
    /// </summary>
    [HttpPost("reset/request")]
    public async Task<IResult> ResetRequest([FromBody] ResetRequestPayload payload)
    {
        await UpsertCodeAsync(payload.Email.Trim().ToLowerInvariant(), "reset");
        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    /// <summary>
    /// Подтверждает сброс пароля.
    /// </summary>
    [HttpPost("reset/confirm")]
    public async Task<IResult> ResetConfirm([FromBody] ResetConfirmPayload payload)
    {
        var email = payload.Email.Trim().ToLowerInvariant();
        var code = await _db.VerificationCodes.FirstOrDefaultAsync(x => x.Email == email && x.Kind == "reset");
        if (code is null || code.Code != payload.Code || code.ExpiresAt < DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) return Results.BadRequest(new { detail = "Invalid code" });
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Email == email);
        if (user is null) return Results.BadRequest(new { detail = "User not found" });

        var strictPasswordPolicy = await IsStrictPasswordPolicyEnabledAsync();
        if (strictPasswordPolicy && !IsStrongPassword(payload.NewPassword))
            return Results.BadRequest(new { detail = "Password is too weak" });

        var iterations = _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000;
        var (hash, salt) = AuthService.HashPassword(payload.NewPassword, iterations);
        user.PasswordHash = hash;
        user.Salt = salt;
        _db.VerificationCodes.Remove(code);
        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }



    private async Task<string?> GetSettingOrConfigAsync(string key, string configPath)
    {
        if (key == "telegram_bot_token")
        {
            var loginBotToken = await _db.TelegramBots
                .Where(x => x.Enabled && x.UseForLogin && !string.IsNullOrWhiteSpace(x.Token))
                .OrderByDescending(x => x.UpdatedAt)
                .Select(x => x.Token)
                .FirstOrDefaultAsync();
            if (!string.IsNullOrWhiteSpace(loginBotToken))
                return loginBotToken;
        }

        var row = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == key);
        if (row is not null && !string.IsNullOrWhiteSpace(row.Value))
            return row.Value;

        if (key == "telegram_bot_token")
        {
            var botToken = await _db.TelegramBots
                .Where(x => x.Enabled && !string.IsNullOrWhiteSpace(x.Token))
                .OrderByDescending(x => x.UseForLogin)
                .ThenByDescending(x => x.UpdatedAt)
                .Select(x => x.Token)
                .FirstOrDefaultAsync();
            if (!string.IsNullOrWhiteSpace(botToken))
                return botToken;
        }

        return _configuration[configPath];
    }

    private static bool ValidateTelegramPayload(TelegramAuthPayload payload, string botToken)
    {
        if (string.IsNullOrWhiteSpace(payload.Id) || string.IsNullOrWhiteSpace(payload.AuthDate) || string.IsNullOrWhiteSpace(payload.Hash))
            return false;

        var entries = new List<string>
        {
            $"auth_date={payload.AuthDate}",
            $"id={payload.Id}"
        };

        if (!string.IsNullOrWhiteSpace(payload.FirstName)) entries.Add($"first_name={payload.FirstName}");
        if (!string.IsNullOrWhiteSpace(payload.LastName)) entries.Add($"last_name={payload.LastName}");
        if (!string.IsNullOrWhiteSpace(payload.PhotoUrl)) entries.Add($"photo_url={payload.PhotoUrl}");
        if (!string.IsNullOrWhiteSpace(payload.Username)) entries.Add($"username={payload.Username}");

        entries.Sort(StringComparer.Ordinal);
        var dataCheckString = string.Join("\n", entries);

        var secretKey = SHA256.HashData(Encoding.UTF8.GetBytes(botToken));
        using var hmac = new HMACSHA256(secretKey);
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(dataCheckString));
        var expected = Convert.ToHexString(hash).ToLowerInvariant();

        return expected == payload.Hash.Trim().ToLowerInvariant();
    }

    private async Task<(string token, string refreshToken)> CreateSessionPairAsync(string userId)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var token = AuthService.GenerateToken();
        var refreshToken = AuthService.GenerateToken();

        _db.Sessions.Add(new Session
        {
            Token = token,
            UserId = userId,
            CreatedAt = now
        });

        _db.RefreshSessions.Add(new RefreshSession
        {
            Token = refreshToken,
            UserId = userId,
            CreatedAt = now
        });

        await _db.SaveChangesAsync();
        return (token, refreshToken);
    }

    private static bool IsValidEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email) || email.Length > 320) return false;
        try
        {
            _ = new System.Net.Mail.MailAddress(email);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool IsStrongPassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 10) return false;
        return password.Any(char.IsUpper)
               && password.Any(char.IsLower)
               && password.Any(char.IsDigit);
    }

    private async Task UpsertCodeAsync(string email, string kind)
    {
        if (!IsValidEmail(email))
            return;

        var entity = await _db.VerificationCodes.FirstOrDefaultAsync(x => x.Email == email && x.Kind == kind);
        if (entity is null)
        {
            entity = new VerificationCode { Email = email, Kind = kind };
            _db.VerificationCodes.Add(entity);
        }

        entity.Code = Random.Shared.Next(100000, 999999).ToString();
        entity.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(15).ToUnixTimeMilliseconds();

        if (string.Equals(kind, "reset", StringComparison.OrdinalIgnoreCase))
        {
            await _emailService.TrySendPasswordResetEmailAsync(email, entity.Code, 15);
            return;
        }

        await _emailService.TrySendEmailConfirmationEmailAsync(email, entity.Code, 15);
    }

    private async Task<bool> IsStrictPasswordPolicyEnabledAsync()
    {
        var setting = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == "auth_password_policy_enabled");
        if (setting is null || string.IsNullOrWhiteSpace(setting.Value))
            return true;

        return !string.Equals(setting.Value, "false", StringComparison.OrdinalIgnoreCase)
               && !string.Equals(setting.Value, "0", StringComparison.OrdinalIgnoreCase)
               && !string.Equals(setting.Value, "off", StringComparison.OrdinalIgnoreCase);
    }

    private async Task TrySendCodeEmailAsync(string email, string code, string kind)
    {
        var smtpEnabled = await GetAppSettingAsync("smtp_enabled")
            ?? _configuration["Email:SmtpEnabled"]
            ?? "false";

        var isEnabled = string.Equals(smtpEnabled, "true", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(smtpEnabled, "1", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(smtpEnabled, "on", StringComparison.OrdinalIgnoreCase);

        if (!isEnabled)
        {
            Console.WriteLine($"[Auth] SMTP disabled. Code for {email} ({kind}) = {code}");
            return;
        }

        var host = await GetAppSettingAsync("smtp_host") ?? _configuration["Email:SmtpHost"];
        var portRaw = await GetAppSettingAsync("smtp_port") ?? _configuration["Email:SmtpPort"];
        var username = await GetAppSettingAsync("smtp_username") ?? _configuration["Email:SmtpUsername"];
        var password = await GetAppSettingAsync("smtp_password") ?? _configuration["Email:SmtpPassword"];
        var fromEmail = await GetAppSettingAsync("smtp_from_email") ?? _configuration["Email:FromEmail"];
        var fromName = await GetAppSettingAsync("smtp_from_name") ?? _configuration["Email:FromName"] ?? "Fashion Demon";
        var sslRaw = await GetAppSettingAsync("smtp_use_ssl") ?? _configuration["Email:SmtpUseSsl"] ?? "true";

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(fromEmail))
        {
            Console.WriteLine($"[Auth] SMTP is enabled but host/fromEmail is missing. Code for {email} ({kind}) = {code}");
            return;
        }

        var port = int.TryParse(portRaw, out var parsedPort) ? parsedPort : 587;
        var useSsl = string.Equals(sslRaw, "true", StringComparison.OrdinalIgnoreCase)
                     || string.Equals(sslRaw, "1", StringComparison.OrdinalIgnoreCase)
                     || string.Equals(sslRaw, "on", StringComparison.OrdinalIgnoreCase);

        var subject = kind == "reset"
            ? "Код для сброса пароля"
            : "Код подтверждения регистрации";

        var body = $"Ваш код: {code}. Срок действия — 15 минут.";

        try
        {
            using var message = new MailMessage();
            message.From = new MailAddress(fromEmail, fromName);
            message.To.Add(email);
            message.Subject = subject;
            message.Body = body;

            using var client = new SmtpClient(host, port)
            {
                EnableSsl = useSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                UseDefaultCredentials = false
            };

            if (!string.IsNullOrWhiteSpace(username))
                client.Credentials = new NetworkCredential(username, password ?? string.Empty);

            await client.SendMailAsync(message);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Auth] Failed to send email to {email}: {ex.Message}. Code = {code}");
        }
    }

    private async Task<string?> GetAppSettingAsync(string key)
    {
        var row = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == key);
        return row?.Value;
    }
}
