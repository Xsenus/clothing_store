using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Net.Mail;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

/// <summary>
/// Контроллер операций профиля.
/// </summary>
[ApiController]
[Route("profile")]
public class ProfileController : ControllerBase
{
    private const int VerificationCodeTtlMinutes = 5;
    private const int VerificationResendCooldownSeconds = 60;
    private const int VerificationMaxResendsPerHour = 3;

    private readonly StoreDbContext _db;
    private readonly AuthService _auth;
    private readonly IConfiguration _configuration;
    private readonly TransactionalEmailService _emailService;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="ProfileController"/>.
    /// </summary>
    public ProfileController(StoreDbContext db, AuthService auth, IConfiguration configuration, TransactionalEmailService emailService)
    {
        _db = db;
        _auth = auth;
        _configuration = configuration;
        _emailService = emailService;
    }

    /// <summary>
    /// Возвращает профиль текущего пользователя.
    /// </summary>
    [HttpGet]
    public async Task<IResult> Get()
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id);
        var rawEmail = string.IsNullOrWhiteSpace(profile?.Email) ? user.Email : profile!.Email;
        var telegramTechnicalEmail = IsTelegramTechnicalEmail(rawEmail);

        return profile is not null
            ? Results.Ok(new
            {
                name = profile.Name,
                phone = profile.Phone,
                shippingAddress = profile.ShippingAddress,
                email = telegramTechnicalEmail ? string.Empty : rawEmail,
                nickname = profile.Nickname,
                phoneVerified = profile.PhoneVerified,
                emailVerified = !telegramTechnicalEmail && user.Verified,
                isAdmin = user.IsAdmin,
                isBlocked = user.IsBlocked
            })
            : Results.Ok(new
            {
                name = "",
                phone = "",
                shippingAddress = "",
                email = telegramTechnicalEmail ? string.Empty : rawEmail,
                nickname = $"user{user.Id[..6]}",
                phoneVerified = false,
                emailVerified = !telegramTechnicalEmail && user.Verified,
                isAdmin = user.IsAdmin,
                isBlocked = user.IsBlocked
            });
    }

    [HttpPost("email/verify/start")]
    public async Task<IResult> StartEmailVerification([FromBody] ContactChangeStartPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var nextEmail = (payload.Value ?? string.Empty).Trim().ToLowerInvariant();
        if (!IsValidEmail(nextEmail))
            return Results.BadRequest(new { detail = "Invalid email" });

        if (await _db.Users.AnyAsync(x => x.Email == nextEmail && x.Id != user.Id))
            return Results.BadRequest(new { detail = "Email already in use" });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var activeRequest = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "email" && x.Status == "pending")
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync();

        var request = activeRequest ?? new ContactChangeRequest
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = user.Id,
            Kind = "email",
            CreatedAt = now,
            ResendWindowStartedAt = now,
            ResendCount = 0,
            Status = "pending"
        };

        var resendWindowStart = request.ResendWindowStartedAt ?? now;
        if (now - resendWindowStart >= TimeSpan.FromHours(1).TotalMilliseconds)
        {
            resendWindowStart = now;
            request.ResendCount = 0;
        }

        if (request.LastSentAt.HasValue && now - request.LastSentAt.Value < TimeSpan.FromSeconds(VerificationResendCooldownSeconds).TotalMilliseconds)
            return Results.BadRequest(new { detail = "Resend is available once per minute" });

        if (request.ResendCount >= VerificationMaxResendsPerHour)
            return Results.BadRequest(new { detail = "Too many attempts. Try again in one hour" });

        request.TargetValue = nextEmail;
        request.Code = Random.Shared.Next(100000, 999999).ToString();
        request.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(VerificationCodeTtlMinutes).ToUnixTimeMilliseconds();
        request.Status = "pending";
        request.VerifiedAt = null;
        request.ConsumedAt = null;
        request.LastSentAt = now;
        request.ResendCount += 1;
        request.ResendWindowStartedAt = resendWindowStart;

        if (activeRequest is null)
            _db.ContactChangeRequests.Add(request);

        await _emailService.TrySendEmailConfirmationEmailAsync(nextEmail, request.Code, VerificationCodeTtlMinutes);
        await _db.SaveChangesAsync();

        return Results.Ok(new
        {
            ok = true,
            ttlSeconds = VerificationCodeTtlMinutes * 60,
            resendInSeconds = VerificationResendCooldownSeconds,
            attemptsLeft = Math.Max(0, VerificationMaxResendsPerHour - request.ResendCount)
        });
    }

    [HttpPost("email/verify/confirm")]
    public async Task<IResult> ConfirmEmailVerification([FromBody] ContactChangeConfirmPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var nextEmail = (payload.Value ?? string.Empty).Trim().ToLowerInvariant();
        var code = (payload.Code ?? string.Empty).Trim();
        if (!IsValidEmail(nextEmail) || string.IsNullOrWhiteSpace(code))
            return Results.BadRequest(new { detail = "Invalid verification payload" });

        var request = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "email" && x.TargetValue == nextEmail)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync();

        if (request is null || request.Status != "pending")
            return Results.BadRequest(new { detail = "Verification request not found" });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (request.ExpiresAt < now)
        {
            request.Status = "expired";
            await _db.SaveChangesAsync();
            return Results.BadRequest(new { detail = "Verification code expired" });
        }

        if (!string.Equals(request.Code, code, StringComparison.Ordinal))
            return Results.BadRequest(new { detail = "Invalid verification code" });

        if (await _db.Users.AnyAsync(x => x.Email == nextEmail && x.Id != user.Id))
            return Results.BadRequest(new { detail = "Email already in use" });

        user.Email = nextEmail;
        user.Verified = true;

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id);
        if (profile is null)
        {
            profile = new Profile { UserId = user.Id, Email = nextEmail };
            _db.Profiles.Add(profile);
        }
        profile.Email = nextEmail;

        request.Status = "consumed";
        request.VerifiedAt = now;
        request.ConsumedAt = now;

        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true, email = nextEmail, emailVerified = true });
    }

    [HttpPost("phone/verify/start")]
    public async Task<IResult> StartPhoneVerification([FromBody] ContactChangeStartPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var normalizedPhone = NormalizePhone(payload.Value);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
            return Results.BadRequest(new { detail = "Invalid phone" });

        var bot = await _db.TelegramBots
            .Where(x => x.Enabled && x.UseForLogin && !string.IsNullOrWhiteSpace(x.Username))
            .OrderByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync();
        if (bot is null)
            return Results.BadRequest(new { detail = "Telegram bot is not configured for phone verification" });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var state = AuthService.GenerateToken()[..24].ToLowerInvariant();

        _db.ContactChangeRequests.Add(new ContactChangeRequest
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = user.Id,
            Kind = "phone",
            TargetValue = normalizedPhone,
            State = state,
            Status = "pending",
            CreatedAt = now,
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(VerificationCodeTtlMinutes).ToUnixTimeMilliseconds()
        });

        await _db.SaveChangesAsync();

        return Results.Ok(new
        {
            ok = true,
            state,
            authUrl = $"https://t.me/{bot.Username}?start=verify_phone_{state}",
            ttlSeconds = VerificationCodeTtlMinutes * 60
        });
    }

    [HttpGet("phone/verify/status/{state}")]
    public async Task<IResult> GetPhoneVerificationStatus([FromRoute] string state)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var normalizedState = state?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedState))
            return Results.BadRequest(new { detail = "Invalid state" });

        var request = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "phone" && x.State == normalizedState)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync();
        if (request is null)
            return Results.NotFound(new { detail = "Verification request not found" });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (request.ExpiresAt < now && request.Status != "completed" && request.Status != "consumed")
        {
            request.Status = "expired";
            await _db.SaveChangesAsync();
        }

        if (request.Status != "completed")
            return Results.Ok(new { status = request.Status, completed = false });

        if (request.ConsumedAt.HasValue)
            return Results.Ok(new { status = "consumed", completed = false });

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id);
        if (profile is null)
        {
            profile = new Profile { UserId = user.Id, Email = user.Email };
            _db.Profiles.Add(profile);
        }

        profile.Phone = request.TargetValue;
        profile.PhoneVerified = true;

        request.Status = "consumed";
        request.VerifiedAt ??= now;
        request.ConsumedAt = now;

        await _db.SaveChangesAsync();

        return Results.Ok(new { status = "completed", completed = true, phone = profile.Phone, phoneVerified = true });
    }

    /// <summary>
    /// Обновляет профиль текущего пользователя.
    /// </summary>
    [HttpPost]
    public async Task<IResult> Upsert([FromBody] ProfilePayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var nickname = payload.Nickname?.Trim();
        if (!string.IsNullOrWhiteSpace(nickname) && await _db.Profiles.AnyAsync(x => x.Nickname == nickname && x.UserId != user.Id))
            return Results.BadRequest(new { detail = "Nickname already taken" });

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id);
        if (profile is null)
        {
            profile = new Profile { UserId = user.Id, Email = user.Email };
            _db.Profiles.Add(profile);
        }

        var requestedEmail = (payload.Email ?? string.Empty).Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(requestedEmail) && !string.Equals(requestedEmail, user.Email, StringComparison.OrdinalIgnoreCase))
        {
            return Results.BadRequest(new { detail = "Email must be verified before saving" });
        }

        var requestedPhone = NormalizePhone(payload.Phone);
        var currentPhone = NormalizePhone(profile.Phone);
        if (!string.Equals(requestedPhone, currentPhone, StringComparison.Ordinal))
            return Results.BadRequest(new { detail = "Phone must be verified before saving" });

        profile.Name = payload.Name;
        profile.ShippingAddress = payload.ShippingAddress;
        profile.Nickname = nickname;

        await _db.SaveChangesAsync();
        return Results.Ok(profile);
    }

    private async Task TrySendVerificationEmailAsync(string email, string code)
    {
        var smtpEnabled = await GetAppSettingAsync("smtp_enabled")
            ?? _configuration["Email:SmtpEnabled"]
            ?? "false";

        var isEnabled = string.Equals(smtpEnabled, "true", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(smtpEnabled, "1", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(smtpEnabled, "on", StringComparison.OrdinalIgnoreCase);

        if (!isEnabled)
        {
            Console.WriteLine($"[Profile] SMTP disabled. Verification code for {email} = {code}");
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
            Console.WriteLine($"[Profile] SMTP enabled but host/fromEmail is missing. Verification code for {email} = {code}");
            return;
        }

        var port = int.TryParse(portRaw, out var parsedPort) ? parsedPort : 587;
        var useSsl = string.Equals(sslRaw, "true", StringComparison.OrdinalIgnoreCase)
                     || string.Equals(sslRaw, "1", StringComparison.OrdinalIgnoreCase)
                     || string.Equals(sslRaw, "on", StringComparison.OrdinalIgnoreCase);

        try
        {
            using var message = new MailMessage();
            message.From = new MailAddress(fromEmail, fromName);
            message.To.Add(email);
            message.Subject = "Код подтверждения email";
            message.Body = $"Ваш код подтверждения email: {code}. Срок действия — {VerificationCodeTtlMinutes} минут.";

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
            Console.WriteLine($"[Profile] Failed to send verification email to {email}: {ex.Message}. Code = {code}");
        }
    }

    private async Task<string?> GetAppSettingAsync(string key)
    {
        var row = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == key);
        return row?.Value;
    }

    private static bool IsValidEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email) || email.Length > 320) return false;
        try
        {
            _ = new MailAddress(email);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool IsTelegramTechnicalEmail(string? email)
    {
        return !string.IsNullOrWhiteSpace(email)
               && email.EndsWith("@telegram.local", StringComparison.OrdinalIgnoreCase)
               && email.StartsWith("telegram_", StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizePhone(string? phone)
    {
        var trimmed = (phone ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return string.Empty;

        var chars = trimmed.Where(c => char.IsDigit(c) || c == '+').ToArray();
        var normalized = new string(chars);
        if (string.IsNullOrWhiteSpace(normalized))
            return string.Empty;

        if (!normalized.StartsWith('+') && normalized.All(char.IsDigit))
            normalized = $"+{normalized}";

        return normalized;
    }
}
