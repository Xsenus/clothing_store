using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="AuthController"/>.
    /// </summary>
    public AuthController(StoreDbContext db, AuthService authService, IConfiguration configuration)
    {
        _db = db;
        _authService = authService;
        _configuration = configuration;
    }

    /// <summary>
    /// Создаёт новый аккаунт и отправляет код подтверждения.
    /// </summary>
    [HttpPost("signup")]
    public async Task<IResult> SignUp([FromBody] AuthPayload payload)
    {
        var email = payload.Email.Trim().ToLowerInvariant();
        if (!IsValidEmail(email)) return Results.BadRequest(new { detail = "Invalid email" });
        if (!IsStrongPassword(payload.Password)) return Results.BadRequest(new { detail = "Password is too weak" });
        if (await _db.Users.AnyAsync(x => x.Email == email)) return Results.BadRequest(new { detail = "User already exists" });

        var iterations = _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000;
        var (hash, salt) = AuthService.HashPassword(payload.Password, iterations);
        var user = new User
        {
            Id = Guid.NewGuid().ToString("N"),
            Email = email,
            PasswordHash = hash,
            Salt = salt,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };
        _db.Users.Add(user);
        _db.Profiles.Add(new Profile
        {
            UserId = user.Id,
            Email = email,
            Name = email.Split('@')[0]
        });
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
        var token = AuthService.GenerateToken();
        _db.Sessions.Add(new Session { Token = token, UserId = user.Id, CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
        await _db.SaveChangesAsync();
        return Results.Ok(new
        {
            token,
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
        if (!user.Verified) return Results.BadRequest(new { detail = "Email is not verified" });
        var token = AuthService.GenerateToken();
        _db.Sessions.Add(new Session { Token = token, UserId = user.Id, CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
        await _db.SaveChangesAsync();
        return Results.Ok(new { token });
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
    public async Task<IResult> Logout()
    {
        var token = _authService.ExtractBearer(Request);
        var session = await _db.Sessions.FirstOrDefaultAsync(x => x.Token == token);
        if (session is not null)
        {
            _db.Sessions.Remove(session);
            await _db.SaveChangesAsync();
        }

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
        if (!IsStrongPassword(payload.NewPassword)) return Results.BadRequest(new { detail = "Password is too weak" });
        var iterations = _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000;
        var (hash, salt) = AuthService.HashPassword(payload.NewPassword, iterations);
        user.PasswordHash = hash;
        user.Salt = salt;
        _db.VerificationCodes.Remove(code);
        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
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
        var entity = await _db.VerificationCodes.FirstOrDefaultAsync(x => x.Email == email && x.Kind == kind);
        if (entity is null)
        {
            entity = new VerificationCode { Email = email, Kind = kind };
            _db.VerificationCodes.Add(entity);
        }

        entity.Code = Random.Shared.Next(100000, 999999).ToString();
        entity.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(15).ToUnixTimeMilliseconds();
    }
}
