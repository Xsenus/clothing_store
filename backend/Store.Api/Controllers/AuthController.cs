using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.WebUtilities;
using System.Net;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
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
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly UserIdentityService _userIdentityService;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="AuthController"/>.
    /// </summary>
    public AuthController(
        StoreDbContext db,
        AuthService authService,
        IConfiguration configuration,
        TransactionalEmailService emailService,
        IHttpClientFactory httpClientFactory,
        UserIdentityService userIdentityService)
    {
        _db = db;
        _authService = authService;
        _configuration = configuration;
        _emailService = emailService;
        _httpClientFactory = httpClientFactory;
        _userIdentityService = userIdentityService;
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
                EmailVerified = false,
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
        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id);
        if (profile is not null)
        {
            profile.Email = email;
            profile.EmailVerified = true;
        }
        _db.VerificationCodes.Remove(code);
        var (token, refreshToken) = await CreateSessionPairAsync(user.Id);
        return Results.Ok(new
        {
            token,
            refreshToken,
            user = await BuildAuthUserPayloadAsync(user)
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
        return Results.Ok(new { token, refreshToken, user = await BuildAuthUserPayloadAsync(user) });
    }


    [HttpPost("telegram/login")]
    public async Task<IResult> TelegramLogin([FromBody] TelegramAuthPayload payload)
    {
        var loginBot = await _db.TelegramBots
            .Where(x => x.Enabled && x.UseForLogin && !string.IsNullOrWhiteSpace(x.Token))
            .OrderByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync();
        var botToken = await GetSettingOrConfigAsync("telegram_bot_token", "Integrations:Telegram:BotToken");
        if (string.IsNullOrWhiteSpace(botToken))
            return Results.BadRequest(new { detail = "Telegram bot token is not configured" });

        if (!ValidateTelegramPayload(payload, botToken))
            return Results.BadRequest(new { detail = "Invalid telegram auth payload" });

        var existingIdentity = await _userIdentityService.FindExternalIdentityAsync("telegram", payload.Id);
        var fullName = string.Join(" ", new[] { payload.FirstName, payload.LastName }.Where(x => !string.IsNullOrWhiteSpace(x))).Trim();
        var parsedChatId = long.TryParse(payload.Id, out var chatId) ? chatId : (long?)null;
        var user = await _userIdentityService.ResolveOrCreateExternalUserAsync(
            new ExternalIdentityProfile(
                Provider: "telegram",
                ProviderUserId: payload.Id,
                Email: null,
                EmailVerified: false,
                Username: payload.Username,
                DisplayName: fullName,
                AvatarUrl: payload.PhotoUrl,
                BotId: loginBot?.Id,
                ChatId: parsedChatId),
            HttpContext.RequestAborted);

        var (token, refreshToken) = await CreateSessionPairAsync(user.Id);

        if (existingIdentity is null)
            await _emailService.TrySendTelegramConnectedEmailAsync(user.Id, payload.Id, payload.Username);

        return Results.Ok(new
        {
            token,
            refreshToken,
            user = await BuildAuthUserPayloadAsync(user)
        });
    }

    [HttpPost("telegram/start")]
    public async Task<IResult> StartTelegramAuth([FromBody] TelegramStartAuthPayload? payload)
    {
        var intent = NormalizeExternalAuthIntent(payload?.Intent);
        User? currentUser = null;
        if (intent == "link")
        {
            currentUser = await _authService.RequireUserAsync(Request);
            if (currentUser is null)
                return Results.Unauthorized();
        }

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
            UserId = intent == "link" ? currentUser!.Id : null,
            Intent = intent,
            Status = "pending",
            CreatedAt = now,
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeMilliseconds()
        };

        _db.TelegramAuthRequests.Add(request);
        await _db.SaveChangesAsync();

        var safeReturnUrl = string.IsNullOrWhiteSpace(payload?.ReturnUrl)
            ? intent == "link" ? "/profile?tab=settings" : "/profile"
            : payload!.ReturnUrl!.Trim();
        return Results.Ok(new
        {
            state,
            authUrl = $"https://t.me/{bot.Username}?start=login_{state}",
            intent,
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

        if (string.Equals(request.Intent, "link", StringComparison.Ordinal))
        {
            request.ConsumedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            request.Status = "consumed";
            await _db.SaveChangesAsync();

            return Results.Ok(new
            {
                status = "completed",
                completed = true,
                linked = true,
                provider = "telegram"
            });
        }

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
            user = await BuildAuthUserPayloadAsync(user)
        });
    }

    [HttpPost("external/start")]
    public async Task<IResult> StartExternalAuth([FromBody] ExternalAuthStartPayload payload)
    {
        var provider = NormalizeExternalProvider(payload.Provider);
        if (string.IsNullOrWhiteSpace(provider))
            return Results.BadRequest(new { detail = "Unsupported external auth provider" });

        var intent = NormalizeExternalAuthIntent(payload.Intent);
        User? currentUser = null;
        if (intent == "link")
        {
            currentUser = await _authService.RequireUserAsync(Request);
            if (currentUser is null)
                return Results.Unauthorized();
        }

        var providerConfiguration = await ResolveExternalProviderConfigurationAsync(provider);
        if (providerConfiguration is null)
            return Results.BadRequest(new { detail = $"External auth provider '{provider}' is not configured" });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var state = AuthService.GenerateToken()[..24].ToLowerInvariant();
        var safeReturnUrl = string.IsNullOrWhiteSpace(payload.ReturnUrl)
            ? intent == "link" ? "/profile?tab=settings" : "/profile"
            : payload.ReturnUrl.Trim();
        var request = new ExternalAuthRequest
        {
            Id = Guid.NewGuid().ToString("N"),
            Provider = provider,
            State = state,
            ReturnUrl = safeReturnUrl,
            Intent = intent,
            UserId = intent == "link" ? currentUser!.Id : null,
            Status = "pending",
            CreatedAt = now,
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeMilliseconds()
        };

        _db.ExternalAuthRequests.Add(request);
        await _db.SaveChangesAsync();

        var redirectUri = BuildAbsoluteUrl($"/auth/external/callback/{provider}");
        var authUrl = BuildExternalAuthorizationUrl(providerConfiguration, state, redirectUri);

        return Results.Ok(new
        {
            provider,
            state,
            authUrl,
            intent,
            returnUrl = safeReturnUrl,
            expiresAt = request.ExpiresAt,
            pollIntervalMs = 2000
        });
    }

    [HttpGet("external/status/{state}")]
    public async Task<IResult> GetExternalAuthStatus([FromRoute] string state)
    {
        var normalizedState = state?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedState))
            return Results.BadRequest(new { detail = "Invalid state" });

        var request = await _db.ExternalAuthRequests
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(x => x.State == normalizedState);
        if (request is null)
            return Results.NotFound(new { detail = "Authorization request not found" });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (request.ExpiresAt <= now
            && request.Status != "completed"
            && request.Status != "consumed"
            && request.Status != "failed")
        {
            request.Status = "expired";
            await _db.SaveChangesAsync();
        }

        if (!string.Equals(request.Status, "completed", StringComparison.Ordinal))
        {
            return Results.Ok(new
            {
                status = request.Status,
                completed = false,
                detail = request.Error
            });
        }

        if (string.IsNullOrWhiteSpace(request.UserId))
            return Results.Ok(new { status = "pending", completed = false });

        if (request.ConsumedAt.HasValue)
            return Results.Ok(new { status = "consumed", completed = false });

        if (string.Equals(request.Intent, "link", StringComparison.Ordinal))
        {
            request.ConsumedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            request.Status = "consumed";
            await _db.SaveChangesAsync();

            return Results.Ok(new
            {
                status = "completed",
                completed = true,
                linked = true,
                provider = request.Provider,
                returnUrl = request.ReturnUrl
            });
        }

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == request.UserId);
        if (user is null || user.IsBlocked)
            return Results.BadRequest(new { detail = "User is not available for login" });

        var (token, refreshToken) = await CreateSessionPairAsync(user.Id);
        request.ConsumedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        request.Status = "consumed";
        await _db.SaveChangesAsync();

        return Results.Ok(new
        {
            status = "completed",
            completed = true,
            provider = request.Provider,
            token,
            refreshToken,
            returnUrl = request.ReturnUrl,
            user = await BuildAuthUserPayloadAsync(user)
        });
    }

    [HttpGet("external/callback/{provider}")]
    public async Task<IResult> HandleExternalAuthCallback(
        [FromRoute] string provider,
        [FromQuery] string? state,
        [FromQuery] string? code,
        [FromQuery] string? error,
        [FromQuery(Name = "error_description")] string? errorDescription)
    {
        var normalizedProvider = NormalizeExternalProvider(provider);
        if (string.IsNullOrWhiteSpace(normalizedProvider))
            return Results.Content(BuildExternalAuthPopupHtml(false, "Неизвестный провайдер авторизации."), "text/html", Encoding.UTF8);

        var providerConfiguration = await ResolveExternalProviderConfigurationAsync(normalizedProvider);
        if (providerConfiguration is null)
            return Results.Content(BuildExternalAuthPopupHtml(false, $"Провайдер '{normalizedProvider}' не настроен."), "text/html", Encoding.UTF8);

        var normalizedState = state?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedState))
            return Results.Content(BuildExternalAuthPopupHtml(false, "Не передан state внешней авторизации."), "text/html", Encoding.UTF8);

        var request = await _db.ExternalAuthRequests
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(x => x.Provider == normalizedProvider && x.State == normalizedState);
        if (request is null)
            return Results.Content(BuildExternalAuthPopupHtml(false, "Запрос внешней авторизации не найден."), "text/html", Encoding.UTF8);

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (request.ExpiresAt <= now)
        {
            request.Status = "expired";
            request.Error = "Срок действия запроса внешней авторизации истёк.";
            await _db.SaveChangesAsync();
            return Results.Content(BuildExternalAuthPopupHtml(false, request.Error), "text/html", Encoding.UTF8);
        }

        if (!string.IsNullOrWhiteSpace(error))
        {
            request.Status = "failed";
            request.Error = string.IsNullOrWhiteSpace(errorDescription) ? error.Trim() : errorDescription.Trim();
            request.CompletedAt = now;
            await _db.SaveChangesAsync();
            return Results.Content(BuildExternalAuthPopupHtml(false, request.Error), "text/html", Encoding.UTF8);
        }

        if (string.IsNullOrWhiteSpace(code))
        {
            request.Status = "failed";
            request.Error = "Провайдер не вернул код авторизации.";
            request.CompletedAt = now;
            await _db.SaveChangesAsync();
            return Results.Content(BuildExternalAuthPopupHtml(false, request.Error), "text/html", Encoding.UTF8);
        }

        try
        {
            var redirectUri = BuildAbsoluteUrl($"/auth/external/callback/{normalizedProvider}");
            var accessToken = await ExchangeExternalAccessTokenAsync(
                providerConfiguration,
                code.Trim(),
                redirectUri,
                HttpContext.RequestAborted);
            var externalProfile = normalizedProvider switch
            {
                "google" => await LoadGoogleProfileAsync(accessToken, HttpContext.RequestAborted),
                "yandex" => await LoadYandexProfileAsync(accessToken, HttpContext.RequestAborted),
                _ => throw new InvalidOperationException("Unsupported external auth provider")
            };

            if (string.Equals(request.Intent, "link", StringComparison.Ordinal))
            {
                if (string.IsNullOrWhiteSpace(request.UserId))
                    throw new InvalidOperationException("Пользователь для привязки аккаунта не найден.");

                var targetUser = await _db.Users.FirstOrDefaultAsync(x => x.Id == request.UserId, HttpContext.RequestAborted);
                if (targetUser is null || targetUser.IsBlocked)
                    throw new InvalidOperationException("Пользователь недоступен для привязки аккаунта.");

                await _userIdentityService.AttachExternalIdentityAsync(
                    request.UserId,
                    externalProfile,
                    HttpContext.RequestAborted);

                request.Status = "completed";
                request.Error = null;
                request.CompletedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                await _db.SaveChangesAsync();

                return Results.Content(
                    BuildExternalAuthPopupHtml(true, $"Аккаунт {providerConfiguration.DisplayName} привязан. Вернитесь на сайт."),
                    "text/html",
                    Encoding.UTF8);
            }

            var user = await _userIdentityService.ResolveOrCreateExternalUserAsync(
                externalProfile,
                HttpContext.RequestAborted);

            request.UserId = user.Id;
            request.Status = "completed";
            request.Error = null;
            request.CompletedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await _db.SaveChangesAsync();

            return Results.Content(
                BuildExternalAuthPopupHtml(true, $"Вход через {providerConfiguration.DisplayName} завершён. Вернитесь на сайт."),
                "text/html",
                Encoding.UTF8);
        }
        catch (Exception ex)
        {
            request.Status = "failed";
            request.Error = ex.Message;
            request.CompletedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await _db.SaveChangesAsync();
            return Results.Content(BuildExternalAuthPopupHtml(false, ex.Message), "text/html", Encoding.UTF8);
        }
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
        return Results.Ok(new
        {
            user = await BuildAuthUserPayloadAsync(user, profile),
            profile
        });
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



    private async Task<object> BuildAuthUserPayloadAsync(User user, Profile? profile = null)
    {
        profile ??= await _db.Profiles.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == user.Id);

        var visibleEmail = profile is not null
            && profile.EmailVerified
            && TechnicalEmailHelper.IsValidRealEmail(profile.Email)
                ? TechnicalEmailHelper.NormalizeRealEmail(profile.Email)
                : profile is null && TechnicalEmailHelper.IsValidRealEmail(user.Email)
                    ? TechnicalEmailHelper.NormalizeRealEmail(user.Email)
                    : string.Empty;

        return new
        {
            id = user.Id,
            email = visibleEmail
        };
    }

    private async Task<ExternalProviderConfiguration?> ResolveExternalProviderConfigurationAsync(string provider)
    {
        return NormalizeExternalProvider(provider) switch
        {
            "google" => await ResolveExternalProviderConfigurationAsync(
                provider: "google",
                displayName: "Google",
                enabledSettingKey: "google_login_enabled",
                enabledConfigPath: "Auth:Google:Enabled",
                clientIdSettingKey: "google_auth_client_id",
                clientIdConfigPath: "Auth:Google:ClientId",
                clientSecretSettingKey: "google_auth_client_secret",
                clientSecretConfigPath: "Auth:Google:ClientSecret",
                authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
                tokenEndpoint: "https://oauth2.googleapis.com/token",
                userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
                defaultScope: "openid email profile"),
            "yandex" => await ResolveExternalProviderConfigurationAsync(
                provider: "yandex",
                displayName: "Yandex",
                enabledSettingKey: "yandex_login_enabled",
                enabledConfigPath: "Auth:Yandex:Enabled",
                clientIdSettingKey: "yandex_auth_client_id",
                clientIdConfigPath: "Auth:Yandex:ClientId",
                clientSecretSettingKey: "yandex_auth_client_secret",
                clientSecretConfigPath: "Auth:Yandex:ClientSecret",
                authorizationEndpoint: "https://oauth.yandex.com/authorize",
                tokenEndpoint: "https://oauth.yandex.com/token",
                userInfoEndpoint: "https://login.yandex.ru/info?format=json",
                defaultScope: "login:info login:email login:avatar"),
            _ => null
        };
    }

    private async Task<ExternalProviderConfiguration?> ResolveExternalProviderConfigurationAsync(
        string provider,
        string displayName,
        string enabledSettingKey,
        string enabledConfigPath,
        string clientIdSettingKey,
        string clientIdConfigPath,
        string clientSecretSettingKey,
        string clientSecretConfigPath,
        string authorizationEndpoint,
        string tokenEndpoint,
        string userInfoEndpoint,
        string defaultScope)
    {
        var enabled = await GetBooleanSettingOrConfigAsync(enabledSettingKey, enabledConfigPath, false);
        if (!enabled)
            return null;

        var clientId = await GetSettingOrConfigAsync(clientIdSettingKey, clientIdConfigPath);
        var clientSecret = await GetSettingOrConfigAsync(clientSecretSettingKey, clientSecretConfigPath);
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            return null;

        return new ExternalProviderConfiguration(
            Provider: provider,
            DisplayName: displayName,
            ClientId: clientId.Trim(),
            ClientSecret: clientSecret.Trim(),
            AuthorizationEndpoint: authorizationEndpoint,
            TokenEndpoint: tokenEndpoint,
            UserInfoEndpoint: userInfoEndpoint,
            Scope: defaultScope);
    }

    private string BuildExternalAuthorizationUrl(
        ExternalProviderConfiguration configuration,
        string state,
        string redirectUri)
    {
        var query = new Dictionary<string, string?>
        {
            ["client_id"] = configuration.ClientId,
            ["redirect_uri"] = redirectUri,
            ["response_type"] = "code",
            ["state"] = state
        };

        if (!string.IsNullOrWhiteSpace(configuration.Scope))
            query["scope"] = configuration.Scope;

        if (string.Equals(configuration.Provider, "google", StringComparison.Ordinal))
        {
            query["access_type"] = "online";
            query["include_granted_scopes"] = "true";
            query["prompt"] = "select_account";
        }

        return QueryHelpers.AddQueryString(configuration.AuthorizationEndpoint, query!);
    }

    private string BuildAbsoluteUrl(string relativePath)
    {
        var normalizedPath = relativePath.StartsWith("/", StringComparison.Ordinal)
            ? relativePath
            : "/" + relativePath;

        return $"{Request.Scheme}://{Request.Host}{Request.PathBase}{normalizedPath}";
    }

    private async Task<string> ExchangeExternalAccessTokenAsync(
        ExternalProviderConfiguration configuration,
        string code,
        string redirectUri,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, configuration.TokenEndpoint)
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["client_id"] = configuration.ClientId,
                ["client_secret"] = configuration.ClientSecret,
                ["redirect_uri"] = redirectUri
            })
        };

        using var response = await client.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(GetExternalProviderErrorDetail(content, response.ReasonPhrase)
                ?? $"Не удалось получить токен {configuration.DisplayName}.");

        using var document = JsonDocument.Parse(content);
        var accessToken = document.RootElement.TryGetProperty("access_token", out var accessTokenEl)
            ? accessTokenEl.GetString()?.Trim()
            : null;
        if (string.IsNullOrWhiteSpace(accessToken))
            throw new InvalidOperationException($"{configuration.DisplayName} не вернул access token.");

        return accessToken!;
    }

    private async Task<ExternalIdentityProfile> LoadGoogleProfileAsync(string accessToken, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://openidconnect.googleapis.com/v1/userinfo");
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await client.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(GetExternalProviderErrorDetail(content, response.ReasonPhrase)
                ?? "Google не вернул данные профиля.");

        using var document = JsonDocument.Parse(content);
        var providerUserId = document.RootElement.TryGetProperty("sub", out var subEl) ? subEl.GetString()?.Trim() : null;
        if (string.IsNullOrWhiteSpace(providerUserId))
            throw new InvalidOperationException("Google не вернул идентификатор пользователя.");

        var email = document.RootElement.TryGetProperty("email", out var emailEl) ? emailEl.GetString() : null;
        var emailVerified = document.RootElement.TryGetProperty("email_verified", out var emailVerifiedEl)
            && emailVerifiedEl.ValueKind is JsonValueKind.True or JsonValueKind.False
            && emailVerifiedEl.GetBoolean();
        var displayName = document.RootElement.TryGetProperty("name", out var nameEl) ? nameEl.GetString() : null;
        var avatarUrl = document.RootElement.TryGetProperty("picture", out var pictureEl) ? pictureEl.GetString() : null;

        return new ExternalIdentityProfile(
            Provider: "google",
            ProviderUserId: providerUserId!,
            Email: email,
            EmailVerified: emailVerified,
            Username: null,
            DisplayName: displayName,
            AvatarUrl: avatarUrl);
    }

    private async Task<ExternalIdentityProfile> LoadYandexProfileAsync(string accessToken, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://login.yandex.ru/info?format=json");
        request.Headers.TryAddWithoutValidation("Authorization", $"OAuth {accessToken}");

        using var response = await client.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(GetExternalProviderErrorDetail(content, response.ReasonPhrase)
                ?? "Yandex не вернул данные профиля.");

        using var document = JsonDocument.Parse(content);
        var providerUserId = document.RootElement.TryGetProperty("id", out var idEl) ? idEl.GetString()?.Trim() : null;
        if (string.IsNullOrWhiteSpace(providerUserId))
            throw new InvalidOperationException("Yandex не вернул идентификатор пользователя.");

        var email = document.RootElement.TryGetProperty("default_email", out var emailEl) ? emailEl.GetString() : null;
        var username = document.RootElement.TryGetProperty("login", out var loginEl) ? loginEl.GetString() : null;
        var displayName = document.RootElement.TryGetProperty("real_name", out var realNameEl) ? realNameEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(displayName) && document.RootElement.TryGetProperty("display_name", out var displayNameEl))
            displayName = displayNameEl.GetString();

        string? avatarUrl = null;
        var isAvatarEmpty = document.RootElement.TryGetProperty("is_avatar_empty", out var avatarEmptyEl)
            && avatarEmptyEl.ValueKind is JsonValueKind.True or JsonValueKind.False
            && avatarEmptyEl.GetBoolean();
        if (!isAvatarEmpty
            && document.RootElement.TryGetProperty("default_avatar_id", out var avatarIdEl))
        {
            var avatarId = avatarIdEl.GetString()?.Trim();
            if (!string.IsNullOrWhiteSpace(avatarId))
                avatarUrl = $"https://avatars.yandex.net/get-yapic/{avatarId}/islands-200";
        }

        return new ExternalIdentityProfile(
            Provider: "yandex",
            ProviderUserId: providerUserId!,
            Email: email,
            EmailVerified: TechnicalEmailHelper.IsValidRealEmail(email),
            Username: username,
            DisplayName: displayName,
            AvatarUrl: avatarUrl);
    }

    private static string? GetExternalProviderErrorDetail(string? responseBody, string? fallback)
    {
        if (!string.IsNullOrWhiteSpace(responseBody))
        {
            try
            {
                using var document = JsonDocument.Parse(responseBody);
                if (document.RootElement.TryGetProperty("error_description", out var descriptionEl))
                    return descriptionEl.GetString();
                if (document.RootElement.TryGetProperty("error", out var errorEl))
                    return errorEl.GetString();
                if (document.RootElement.TryGetProperty("message", out var messageEl))
                    return messageEl.GetString();
            }
            catch (JsonException)
            {
            }
        }

        return string.IsNullOrWhiteSpace(fallback) ? null : fallback.Trim();
    }

    private static string NormalizeExternalProvider(string? provider)
    {
        return provider?.Trim().ToLowerInvariant() switch
        {
            "google" => "google",
            "yandex" => "yandex",
            _ => string.Empty
        };
    }

    private static string NormalizeExternalAuthIntent(string? intent)
    {
        return string.Equals(intent?.Trim(), "link", StringComparison.OrdinalIgnoreCase)
            ? "link"
            : "signin";
    }

    private static string BuildExternalAuthPopupHtml(bool success, string? message)
    {
        var title = success ? "Авторизация завершена" : "Ошибка авторизации";
        var safeTitle = WebUtility.HtmlEncode(title);
        var safeMessage = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(message) ? "Вернитесь на сайт." : message.Trim());

        return $$"""
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>{{safeTitle}}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111827; background: #f8fafc; }
    .card { max-width: 420px; margin: 10vh auto; background: white; border-radius: 16px; padding: 24px; box-shadow: 0 12px 32px rgba(15,23,42,.08); }
    h1 { font-size: 20px; margin: 0 0 12px; }
    p { margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>{{safeTitle}}</h1>
    <p>{{safeMessage}}</p>
  </div>
  <script>
    setTimeout(function () {
      if (window.opener && !window.opener.closed) {
        window.close();
      }
    }, 1200);
  </script>
</body>
</html>
""";
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

    private async Task<bool> GetBooleanSettingOrConfigAsync(string key, string configPath, bool fallback)
    {
        var raw = await GetSettingOrConfigAsync(key, configPath);
        if (string.IsNullOrWhiteSpace(raw))
            return fallback;

        return raw.Trim().ToLowerInvariant() switch
        {
            "1" or "true" or "yes" or "on" => true,
            "0" or "false" or "no" or "off" => false,
            _ => fallback
        };
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

    private sealed record ExternalProviderConfiguration(
        string Provider,
        string DisplayName,
        string ClientId,
        string ClientSecret,
        string AuthorizationEndpoint,
        string TokenEndpoint,
        string UserInfoEndpoint,
        string Scope);
}
