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
    private readonly TelegramGatewayService _telegramGatewayService;
    private readonly UserIdentityService _userIdentityService;
    private readonly UserAccountLifecycleService _userAccountLifecycleService;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="ProfileController"/>.
    /// </summary>
    public ProfileController(
        StoreDbContext db,
        AuthService auth,
        IConfiguration configuration,
        TransactionalEmailService emailService,
        TelegramGatewayService telegramGatewayService,
        UserIdentityService userIdentityService,
        UserAccountLifecycleService userAccountLifecycleService)
    {
        _db = db;
        _auth = auth;
        _configuration = configuration;
        _emailService = emailService;
        _telegramGatewayService = telegramGatewayService;
        _userIdentityService = userIdentityService;
        _userAccountLifecycleService = userAccountLifecycleService;
    }

    /// <summary>
    /// Возвращает профиль текущего пользователя.
    /// </summary>
    [HttpGet]
    public async Task<IResult> Get()
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var cancellationToken = HttpContext.RequestAborted;
        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id);
        var rawEmail = string.IsNullOrWhiteSpace(profile?.Email) ? user.Email : profile!.Email;
        var technicalEmail = TechnicalEmailHelper.IsTechnicalEmail(rawEmail);
        var confirmedEmail = await _userIdentityService.GetConfirmedEmailAsync(user.Id, null, cancellationToken);
        var confirmedPhone = await _userIdentityService.GetConfirmedPhoneAsync(user.Id, null, cancellationToken);
        var emailVerified = !string.IsNullOrWhiteSpace(confirmedEmail);
        var phoneVerified = !string.IsNullOrWhiteSpace(confirmedPhone);
        var phoneVerificationAvailability = await GetPhoneVerificationAvailabilityAsync(user.Id, cancellationToken);
        var accountDeletionAvailability = await GetAccountDeletionAvailabilityAsync(
            user.Id,
            confirmedEmail,
            confirmedPhone,
            cancellationToken);
        var shippingAddresses = profile is not null
            ? ProfileAddressBook.Parse(profile.ShippingAddressesJson, profile.ShippingAddress)
            : [];
        var externalIdentities = await BuildExternalIdentityPayloadAsync(user.Id);

        return profile is not null
            ? Results.Ok(new
            {
                name = profile.Name,
                phone = profile.Phone,
                shippingAddress = profile.ShippingAddress,
                shippingAddresses = shippingAddresses.Select(address => new
                {
                    id = address.Id,
                    value = address.Value,
                    isDefault = address.IsDefault
                }),
                email = technicalEmail ? string.Empty : rawEmail,
                nickname = profile.Nickname,
                phoneVerified,
                emailVerified,
                hasConfirmedContact = emailVerified || phoneVerified,
                phoneVerification = BuildPhoneVerificationPayload(phoneVerificationAvailability),
                accountDeletion = BuildAccountDeletionPayload(accountDeletionAvailability),
                externalIdentities,
                hasPassword = HasPassword(user),
                isAdmin = user.IsAdmin,
                isBlocked = user.IsBlocked
            })
            : Results.Ok(new
            {
                name = "",
                phone = "",
                shippingAddress = "",
                shippingAddresses = Array.Empty<object>(),
                email = technicalEmail ? string.Empty : rawEmail,
                nickname = $"user{user.Id[..6]}",
                phoneVerified,
                emailVerified,
                hasConfirmedContact = emailVerified || phoneVerified,
                phoneVerification = BuildPhoneVerificationPayload(phoneVerificationAvailability),
                accountDeletion = BuildAccountDeletionPayload(accountDeletionAvailability),
                externalIdentities,
                hasPassword = HasPassword(user),
                isAdmin = user.IsAdmin,
                isBlocked = user.IsBlocked
            });
    }

    [HttpPost("email/verify/start")]
    public async Task<IResult> StartEmailVerification([FromBody] ContactChangeStartPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var cancellationToken = HttpContext.RequestAborted;
        var nextEmail = (payload.Value ?? string.Empty).Trim().ToLowerInvariant();
        if (!IsValidEmail(nextEmail))
            return Results.BadRequest(new { detail = "Введите корректный email." });

        if (await _db.Users.AnyAsync(x => x.Email == nextEmail && x.Id != user.Id, cancellationToken))
            return Results.BadRequest(new { detail = "Этот email уже используется." });
        if (await _userIdentityService.HasOtherUserWithConfirmedEmailAsync(nextEmail, user.Id, cancellationToken))
            return Results.BadRequest(new { detail = "Этот email уже используется." });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var activeRequest = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "email" && x.Status == "pending")
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

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
            return Results.BadRequest(new { detail = "Повторно отправить код можно через минуту." });

        if (request.ResendCount >= VerificationMaxResendsPerHour)
            return Results.BadRequest(new { detail = "Слишком много попыток. Попробуйте снова через час." });

        request.TargetValue = nextEmail;
        request.Code = Random.Shared.Next(100000, 999999).ToString();
        request.State = null;
        request.ChatId = null;
        request.TelegramUserId = null;
        request.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(VerificationCodeTtlMinutes).ToUnixTimeMilliseconds();
        request.Status = "pending";
        request.VerifiedAt = null;
        request.ConsumedAt = null;
        request.LastSentAt = now;
        request.ResendCount += 1;
        request.ResendWindowStartedAt = resendWindowStart;
        request.GatewayRequestId = null;
        request.GatewayDeliveryStatus = null;
        request.GatewayDeliveryUpdatedAt = null;
        request.GatewayVerificationStatus = null;
        request.GatewayVerificationUpdatedAt = null;
        request.GatewayIsRefunded = null;

        if (activeRequest is null)
            _db.ContactChangeRequests.Add(request);

        await _emailService.TrySendEmailConfirmationEmailAsync(nextEmail, request.Code, VerificationCodeTtlMinutes, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

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

        var cancellationToken = HttpContext.RequestAborted;
        var nextEmail = (payload.Value ?? string.Empty).Trim().ToLowerInvariant();
        var code = (payload.Code ?? string.Empty).Trim();
        if (!IsValidEmail(nextEmail) || string.IsNullOrWhiteSpace(code))
            return Results.BadRequest(new { detail = "Проверьте email и код подтверждения." });

        var request = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "email" && x.TargetValue == nextEmail)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (request is null || request.Status != "pending")
            return Results.BadRequest(new { detail = "Запрос подтверждения не найден." });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (request.ExpiresAt < now)
        {
            request.Status = "expired";
            await _db.SaveChangesAsync(cancellationToken);
            return Results.BadRequest(new { detail = "Срок действия кода истек. Запросите новый код." });
        }

        if (!string.Equals(request.Code, code, StringComparison.Ordinal))
            return Results.BadRequest(new { detail = "Неверный код подтверждения." });

        if (await _db.Users.AnyAsync(x => x.Email == nextEmail && x.Id != user.Id, cancellationToken))
            return Results.BadRequest(new { detail = "Этот email уже используется." });
        if (await _userIdentityService.HasOtherUserWithConfirmedEmailAsync(nextEmail, user.Id, cancellationToken))
            return Results.BadRequest(new { detail = "Этот email уже используется." });

        user.Email = nextEmail;
        user.Verified = true;

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id, cancellationToken);
        if (profile is null)
        {
            profile = new Profile { UserId = user.Id, Email = nextEmail, EmailVerified = true };
            _db.Profiles.Add(profile);
        }
        profile.Email = nextEmail;
        profile.EmailVerified = true;

        request.Status = "consumed";
        request.VerifiedAt = now;
        request.ConsumedAt = now;

        await _userIdentityService.ConsolidateUsersByConfirmedEmailAsync(user.Id, nextEmail, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { ok = true, email = nextEmail, emailVerified = true });
    }

    [HttpPost("phone/verify/start")]
    public async Task<IResult> StartPhoneVerification([FromBody] ContactChangeStartPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var normalizedPhone = NormalizePhone(payload.Value);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
            return Results.BadRequest(new { detail = "Введите корректный номер телефона." });

        var cancellationToken = HttpContext.RequestAborted;
        var availability = await GetPhoneVerificationAvailabilityAsync(user.Id, cancellationToken);
        if (!availability.Available)
            return Results.BadRequest(new { detail = availability.UnavailableReason ?? "Подтверждение телефона сейчас недоступно." });

        return availability.Method switch
        {
            "telegram_gateway" => await StartGatewayPhoneVerificationAsync(user, normalizedPhone, cancellationToken),
            "telegram_bot" => await StartBotPhoneVerificationAsync(user, normalizedPhone, cancellationToken),
            _ => Results.BadRequest(new { detail = "Подтверждение телефона сейчас недоступно." })
        };
    }

    [HttpPost("phone/verify/confirm")]
    public async Task<IResult> ConfirmPhoneVerification([FromBody] ContactChangeConfirmPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var cancellationToken = HttpContext.RequestAborted;
        var normalizedPhone = NormalizePhone(payload.Value);
        var code = (payload.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedPhone) || string.IsNullOrWhiteSpace(code))
            return Results.BadRequest(new { detail = "Проверьте номер телефона и код подтверждения." });

        var request = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "phone" && x.TargetValue == normalizedPhone)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (request is null || request.Status != "pending")
            return Results.BadRequest(new { detail = "Запрос подтверждения не найден." });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (request.ExpiresAt < now)
        {
            request.Status = "expired";
            await _db.SaveChangesAsync(cancellationToken);
            return Results.BadRequest(new { detail = "Срок действия кода истек. Запросите новый код." });
        }

        if (string.IsNullOrWhiteSpace(request.GatewayRequestId))
            return Results.BadRequest(new { detail = "Сессия подтверждения устарела. Запросите новый код." });

        TelegramGatewayRequestStatus status;
        try
        {
            status = await _telegramGatewayService.CheckVerificationStatusAsync(request.GatewayRequestId, code, cancellationToken);
        }
        catch (TelegramGatewayException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }

        ApplyGatewayStatus(request, status);
        var verificationResult = NormalizeGatewayVerificationStatus(status.VerificationStatus?.Status);
        switch (verificationResult)
        {
            case "success":
                break;
            case "invalid_code":
                await _db.SaveChangesAsync(cancellationToken);
                return Results.BadRequest(new { detail = "Неверный код подтверждения." });
            case "expired":
                request.Status = "expired";
                await _db.SaveChangesAsync(cancellationToken);
                return Results.BadRequest(new { detail = "Срок действия кода истек. Запросите новый код." });
            case "too_many_attempts":
                await _db.SaveChangesAsync(cancellationToken);
                return Results.BadRequest(new { detail = "Превышено количество попыток. Запросите новый код." });
            default:
                await _db.SaveChangesAsync(cancellationToken);
                return Results.BadRequest(new { detail = "Не удалось подтвердить код. Запросите новый код и попробуйте еще раз." });
        }

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id, cancellationToken);
        if (profile is null)
        {
            profile = new Profile
            {
                UserId = user.Id,
                Email = TechnicalEmailHelper.IsTechnicalEmail(user.Email) ? string.Empty : user.Email,
                EmailVerified = user.Verified && TechnicalEmailHelper.IsValidRealEmail(user.Email)
            };
            _db.Profiles.Add(profile);
        }

        profile.Phone = normalizedPhone;
        profile.PhoneVerified = true;

        request.Status = "consumed";
        request.VerifiedAt = now;
        request.ConsumedAt = now;

        await _db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { ok = true, phone = normalizedPhone, phoneVerified = true });
    }

    [HttpGet("phone/verify/status/{state}")]
    public async Task<IResult> GetPhoneVerificationStatus([FromRoute] string state)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var normalizedState = state?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedState))
            return Results.BadRequest(new { detail = "Некорректное состояние подтверждения." });

        var request = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "phone" && x.State == normalizedState)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(HttpContext.RequestAborted);
        if (request is null)
            return Results.NotFound(new { detail = "Запрос подтверждения не найден." });

        var cancellationToken = HttpContext.RequestAborted;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (request.ExpiresAt < now && request.Status != "completed" && request.Status != "consumed")
        {
            request.Status = "expired";
            await _db.SaveChangesAsync(cancellationToken);
        }

        if (!string.IsNullOrWhiteSpace(request.GatewayRequestId))
        {
            return Results.Ok(new
            {
                status = request.Status,
                completed = false,
                method = "telegram_gateway",
                codeRequired = request.Status == "pending",
                maskedDestination = MaskPhone(request.TargetValue),
                deliveryStatus = request.GatewayDeliveryStatus,
                verificationStatus = request.GatewayVerificationStatus
            });
        }

        if (request.Status != "completed")
            return Results.Ok(new { status = request.Status, completed = false, method = "telegram_bot" });

        if (request.ConsumedAt.HasValue)
            return Results.Ok(new { status = "consumed", completed = false, method = "telegram_bot" });

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id, cancellationToken);
        if (profile is null)
        {
            profile = new Profile
            {
                UserId = user.Id,
                Email = TechnicalEmailHelper.IsTechnicalEmail(user.Email) ? string.Empty : user.Email,
                EmailVerified = user.Verified && TechnicalEmailHelper.IsValidRealEmail(user.Email)
            };
            _db.Profiles.Add(profile);
        }

        profile.Phone = request.TargetValue;
        profile.PhoneVerified = true;

        request.Status = "consumed";
        request.VerifiedAt ??= now;
        request.ConsumedAt = now;

        await _db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new { status = "completed", completed = true, phone = profile.Phone, phoneVerified = true, method = "telegram_bot" });
    }

    [HttpPost("delete/start")]
    public async Task<IResult> StartProfileDeletion([FromBody] ProfileDeleteStartPayload? payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var cancellationToken = HttpContext.RequestAborted;
        var confirmedEmail = await _userIdentityService.GetConfirmedEmailAsync(user.Id, null, cancellationToken);
        var confirmedPhone = await _userIdentityService.GetConfirmedPhoneAsync(user.Id, null, cancellationToken);
        var availability = await GetAccountDeletionAvailabilityAsync(user.Id, confirmedEmail, confirmedPhone, cancellationToken);
        if (availability.AvailableChannels.Count == 0)
            return Results.BadRequest(new { detail = availability.UnavailableReason ?? "Для удаления нужен подтвержденный email или телефон." });

        var channel = NormalizeDeletionChannel(payload?.Channel);
        if (string.IsNullOrWhiteSpace(channel))
            channel = availability.PreferredChannel ?? availability.AvailableChannels.FirstOrDefault() ?? string.Empty;

        if (string.Equals(channel, "email", StringComparison.Ordinal))
        {
            if (!availability.EmailAvailable || string.IsNullOrWhiteSpace(confirmedEmail))
                return Results.BadRequest(new { detail = "Подтвержденный email недоступен для удаления профиля." });

            return await StartEmailProfileDeletionAsync(user, confirmedEmail, cancellationToken);
        }

        if (string.Equals(channel, "phone", StringComparison.Ordinal))
        {
            if (!availability.PhoneAvailable || string.IsNullOrWhiteSpace(confirmedPhone))
                return Results.BadRequest(new { detail = availability.UnavailableReason ?? "Подтверждение удаления по телефону сейчас недоступно." });

            return availability.PhoneMethod switch
            {
                "telegram_gateway" => await StartGatewayProfileDeletionAsync(user, confirmedPhone, cancellationToken),
                "telegram_bot" => await StartBotProfileDeletionAsync(user, confirmedPhone, cancellationToken),
                _ => Results.BadRequest(new { detail = "Подтверждение удаления по телефону сейчас недоступно." })
            };
        }

        return Results.BadRequest(new { detail = "Выберите доступный способ подтверждения удаления профиля." });
    }

    [HttpPost("delete/email/confirm")]
    public async Task<IResult> ConfirmProfileDeletionByEmail([FromBody] ProfileDeleteEmailConfirmPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var cancellationToken = HttpContext.RequestAborted;
        var code = (payload.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(code))
            return Results.BadRequest(new { detail = "Введите код из письма." });

        var request = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "account_delete_email")
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (request is null || request.Status != "pending")
            return Results.BadRequest(new { detail = "Запрос подтверждения не найден." });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (request.ExpiresAt < now)
        {
            request.Status = "expired";
            await _db.SaveChangesAsync(cancellationToken);
            return Results.BadRequest(new { detail = "Срок действия кода истек. Запросите новый код." });
        }

        if (!string.Equals(request.Code, code, StringComparison.Ordinal))
            return Results.BadRequest(new { detail = "Неверный код подтверждения." });

        request.Status = "consumed";
        request.VerifiedAt = now;
        request.ConsumedAt = now;

        await _userAccountLifecycleService.SoftDeleteUserAsync(user, user.Id, "user", cancellationToken);
        return Results.Ok(new { ok = true, deleted = true, channel = "email" });
    }

    [HttpPost("delete/phone/confirm")]
    public async Task<IResult> ConfirmProfileDeletionByPhone([FromBody] ProfileDeletePhoneConfirmPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var cancellationToken = HttpContext.RequestAborted;
        var code = (payload.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(code))
            return Results.BadRequest(new { detail = "Введите код из Telegram." });

        var request = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "account_delete_phone")
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (request is null || request.Status != "pending")
            return Results.BadRequest(new { detail = "Запрос подтверждения не найден." });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (request.ExpiresAt < now)
        {
            request.Status = "expired";
            await _db.SaveChangesAsync(cancellationToken);
            return Results.BadRequest(new { detail = "Срок действия кода истек. Запросите новый код." });
        }

        if (string.IsNullOrWhiteSpace(request.GatewayRequestId))
            return Results.BadRequest(new { detail = "Сессия подтверждения устарела. Запросите новый код." });

        TelegramGatewayRequestStatus status;
        try
        {
            status = await _telegramGatewayService.CheckVerificationStatusAsync(request.GatewayRequestId, code, cancellationToken);
        }
        catch (TelegramGatewayException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }

        ApplyGatewayStatus(request, status);
        var verificationResult = NormalizeGatewayVerificationStatus(status.VerificationStatus?.Status);
        switch (verificationResult)
        {
            case "success":
                break;
            case "invalid_code":
                await _db.SaveChangesAsync(cancellationToken);
                return Results.BadRequest(new { detail = "Неверный код подтверждения." });
            case "expired":
                request.Status = "expired";
                await _db.SaveChangesAsync(cancellationToken);
                return Results.BadRequest(new { detail = "Срок действия кода истек. Запросите новый код." });
            case "too_many_attempts":
                await _db.SaveChangesAsync(cancellationToken);
                return Results.BadRequest(new { detail = "Превышено количество попыток. Запросите новый код." });
            default:
                await _db.SaveChangesAsync(cancellationToken);
                return Results.BadRequest(new { detail = "Не удалось подтвердить код. Запросите новый код и попробуйте еще раз." });
        }

        request.Status = "consumed";
        request.VerifiedAt ??= now;
        request.ConsumedAt = now;

        await _userAccountLifecycleService.SoftDeleteUserAsync(user, user.Id, "user", cancellationToken);
        return Results.Ok(new { ok = true, deleted = true, channel = "phone", method = "telegram_gateway" });
    }

    [HttpGet("delete/phone/status/{state}")]
    public async Task<IResult> GetProfileDeletionPhoneStatus([FromRoute] string state)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var cancellationToken = HttpContext.RequestAborted;
        var normalizedState = state?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedState))
            return Results.BadRequest(new { detail = "Некорректное состояние подтверждения." });

        var request = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "account_delete_phone" && x.State == normalizedState)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (request is null)
            return Results.NotFound(new { detail = "Запрос подтверждения не найден." });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (request.ExpiresAt < now && request.Status != "completed" && request.Status != "consumed")
        {
            request.Status = "expired";
            await _db.SaveChangesAsync(cancellationToken);
        }

        if (!string.IsNullOrWhiteSpace(request.GatewayRequestId))
        {
            return Results.Ok(new
            {
                status = request.Status,
                completed = false,
                method = "telegram_gateway",
                codeRequired = request.Status == "pending",
                maskedDestination = MaskPhone(request.TargetValue),
                deliveryStatus = request.GatewayDeliveryStatus,
                verificationStatus = request.GatewayVerificationStatus
            });
        }

        if (request.Status != "completed")
            return Results.Ok(new { status = request.Status, completed = false, method = "telegram_bot" });

        await _userAccountLifecycleService.SoftDeleteUserAsync(user, user.Id, "user", cancellationToken);
        return Results.Ok(new { status = "deleted", completed = true, deleted = true, channel = "phone", method = "telegram_bot" });
    }

    /// <summary>
    /// Обновляет профиль текущего пользователя.
    /// </summary>
    [HttpDelete("external/{provider}")]
    public async Task<IResult> DetachExternalIdentity([FromRoute] string provider)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        try
        {
            var detached = await _userIdentityService.DetachExternalIdentityAsync(user.Id, provider, HttpContext.RequestAborted);
            if (!detached)
                return Results.NotFound(new { detail = "Внешний аккаунт не найден" });

            return Results.Ok(new
            {
                ok = true,
                externalIdentities = await BuildExternalIdentityPayloadAsync(user.Id)
            });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IResult> Upsert([FromBody] ProfilePayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var cancellationToken = HttpContext.RequestAborted;
        var nickname = payload.Nickname?.Trim();
        if (!string.IsNullOrWhiteSpace(nickname) && await _db.Profiles.AnyAsync(x => x.Nickname == nickname && x.UserId != user.Id, cancellationToken))
            return Results.BadRequest(new { detail = "Этот никнейм уже занят." });

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id, cancellationToken);
        if (profile is null)
        {
            profile = new Profile
            {
                UserId = user.Id,
                Email = TechnicalEmailHelper.IsTechnicalEmail(user.Email) ? string.Empty : user.Email,
                EmailVerified = user.Verified && TechnicalEmailHelper.IsValidRealEmail(user.Email)
            };
            _db.Profiles.Add(profile);
        }

        var requestedEmail = (payload.Email ?? string.Empty).Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(requestedEmail) && !string.Equals(requestedEmail, user.Email, StringComparison.OrdinalIgnoreCase))
        {
            return Results.BadRequest(new { detail = "Сначала подтвердите email, затем сохраните профиль." });
        }

        var requestedPhone = NormalizePhone(payload.Phone);
        var currentPhone = NormalizePhone(profile.Phone);
        if (!string.Equals(requestedPhone, currentPhone, StringComparison.Ordinal))
            return Results.BadRequest(new { detail = "Сначала подтвердите телефон, затем сохраните профиль." });

        List<ProfileAddressEntry> nextShippingAddresses;
        if (payload.ShippingAddresses is not null)
        {
            nextShippingAddresses = ProfileAddressBook.Normalize(
                payload.ShippingAddresses.Select(address => new ProfileAddressEntry(
                    address.Id ?? string.Empty,
                    address.Value ?? string.Empty,
                    address.IsDefault == true)),
                payload.ShippingAddress);
        }
        else if (payload.ShippingAddress is not null)
        {
            nextShippingAddresses = ProfileAddressBook.Normalize(null, payload.ShippingAddress);
        }
        else
        {
            nextShippingAddresses = ProfileAddressBook.Parse(profile.ShippingAddressesJson, profile.ShippingAddress);
        }

        profile.Name = payload.Name;
        profile.ShippingAddress = ProfileAddressBook.GetDefaultAddress(nextShippingAddresses);
        profile.ShippingAddressesJson = ProfileAddressBook.Serialize(nextShippingAddresses);
        profile.Nickname = nickname;

        await _db.SaveChangesAsync(cancellationToken);

        var confirmedEmail = await _userIdentityService.GetConfirmedEmailAsync(user.Id, null, cancellationToken);
        var confirmedPhone = await _userIdentityService.GetConfirmedPhoneAsync(user.Id, null, cancellationToken);
        var phoneVerificationAvailability = await GetPhoneVerificationAvailabilityAsync(user.Id, cancellationToken);
        var accountDeletionAvailability = await GetAccountDeletionAvailabilityAsync(
            user.Id,
            confirmedEmail,
            confirmedPhone,
            cancellationToken);

        return Results.Ok(new
        {
            name = profile.Name,
            phone = profile.Phone,
            shippingAddress = profile.ShippingAddress,
            shippingAddresses = nextShippingAddresses.Select(address => new
            {
                id = address.Id,
                value = address.Value,
                isDefault = address.IsDefault
            }),
            email = profile.Email,
            nickname = profile.Nickname,
            phoneVerified = !string.IsNullOrWhiteSpace(confirmedPhone),
            emailVerified = !string.IsNullOrWhiteSpace(confirmedEmail),
            hasConfirmedContact = !string.IsNullOrWhiteSpace(confirmedEmail) || !string.IsNullOrWhiteSpace(confirmedPhone),
            phoneVerification = BuildPhoneVerificationPayload(phoneVerificationAvailability),
            accountDeletion = BuildAccountDeletionPayload(accountDeletionAvailability),
            externalIdentities = await BuildExternalIdentityPayloadAsync(user.Id),
            hasPassword = HasPassword(user),
            isAdmin = user.IsAdmin,
            isBlocked = user.IsBlocked
        });
    }

    [HttpPost("password")]
    public async Task<IResult> UpdatePassword([FromBody] ProfilePasswordPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var newPassword = (payload.NewPassword ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < 6)
            return Results.BadRequest(new { detail = "Пароль должен содержать минимум 6 символов." });

        var strictPasswordPolicy = await IsStrictPasswordPolicyEnabledAsync();
        if (strictPasswordPolicy && !IsStrongPassword(newPassword))
            return Results.BadRequest(new { detail = "Password is too weak" });

        var iterations = _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000;
        var (hash, salt) = AuthService.HashPassword(newPassword, iterations);
        user.PasswordHash = hash;
        user.Salt = salt;

        await _db.SaveChangesAsync(HttpContext.RequestAborted);
        return Results.Ok(new { ok = true, hasPassword = true });
    }

    private async Task<IResult> StartGatewayPhoneVerificationAsync(
        User user,
        string normalizedPhone,
        CancellationToken cancellationToken)
    {
        var configuration = await _telegramGatewayService.GetConfigurationAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var activeRequest = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "phone" && x.TargetValue == normalizedPhone && x.Status == "pending")
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        var request = activeRequest ?? new ContactChangeRequest
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = user.Id,
            Kind = "phone",
            TargetValue = normalizedPhone,
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

        var allowCooldownBypass = string.IsNullOrWhiteSpace(request.GatewayRequestId);
        if (!allowCooldownBypass
            && request.LastSentAt.HasValue
            && now - request.LastSentAt.Value < TimeSpan.FromSeconds(VerificationResendCooldownSeconds).TotalMilliseconds)
        {
            return Results.BadRequest(new { detail = "Повторно отправить код можно через минуту." });
        }

        if (request.ResendCount >= VerificationMaxResendsPerHour)
            return Results.BadRequest(new { detail = "Слишком много попыток. Попробуйте снова через час." });

        request.TargetValue = normalizedPhone;
        request.State ??= AuthService.GenerateToken()[..24].ToLowerInvariant();
        request.Status = "pending";
        request.Code = null;
        request.ChatId = null;
        request.TelegramUserId = null;
        request.VerifiedAt = null;
        request.ConsumedAt = null;
        request.LastSentAt = now;
        request.ResendCount += 1;
        request.ResendWindowStartedAt = resendWindowStart;
        request.ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(configuration.TtlSeconds).ToUnixTimeMilliseconds();
        request.GatewayRequestId = null;
        request.GatewayDeliveryStatus = null;
        request.GatewayDeliveryUpdatedAt = null;
        request.GatewayVerificationStatus = null;
        request.GatewayVerificationUpdatedAt = null;
        request.GatewayIsRefunded = null;

        TelegramGatewayRequestStatus status;
        try
        {
            status = await _telegramGatewayService.SendVerificationMessageAsync(normalizedPhone, payload: $"profile_phone:{user.Id}", cancellationToken);
        }
        catch (TelegramGatewayException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }

        ApplyGatewayStatus(request, status);
        if (string.IsNullOrWhiteSpace(request.GatewayRequestId))
            return Results.BadRequest(new { detail = "Не удалось создать сессию подтверждения. Попробуйте еще раз." });

        if (activeRequest is null)
            _db.ContactChangeRequests.Add(request);

        await _db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new
        {
            ok = true,
            method = "telegram_gateway",
            state = request.State,
            maskedDestination = MaskPhone(normalizedPhone),
            codeLength = configuration.CodeLength,
            ttlSeconds = configuration.TtlSeconds
        });
    }

    private async Task<IResult> StartBotPhoneVerificationAsync(
        User user,
        string normalizedPhone,
        CancellationToken cancellationToken)
    {
        var bot = await _db.TelegramBots
            .Where(x =>
                x.Enabled
                && x.UseForLogin
                && !string.IsNullOrWhiteSpace(x.Username)
                && !string.IsNullOrWhiteSpace(x.Token))
            .OrderByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (bot is null)
            return Results.BadRequest(new { detail = "Telegram-бот для подтверждения телефона не настроен." });

        var identity = await _userIdentityService.GetVerifiedTelegramIdentityAsync(user.Id, cancellationToken);
        if (identity is null)
            return Results.BadRequest(new { detail = "Сначала привяжите Telegram к профилю, чтобы подтверждать телефон через бота." });

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

        await _db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new
        {
            ok = true,
            method = "telegram_bot",
            state,
            authUrl = $"https://t.me/{bot.Username}?start=verify_phone_{state}",
            ttlSeconds = VerificationCodeTtlMinutes * 60
        });
    }

    private async Task<IResult> StartEmailProfileDeletionAsync(
        User user,
        string confirmedEmail,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var activeRequest = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "account_delete_email" && x.Status == "pending")
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        var request = activeRequest ?? new ContactChangeRequest
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = user.Id,
            Kind = "account_delete_email",
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

        if (request.LastSentAt.HasValue
            && now - request.LastSentAt.Value < TimeSpan.FromSeconds(VerificationResendCooldownSeconds).TotalMilliseconds)
        {
            return Results.BadRequest(new { detail = "Повторно отправить код можно через минуту." });
        }

        if (request.ResendCount >= VerificationMaxResendsPerHour)
            return Results.BadRequest(new { detail = "Слишком много попыток. Попробуйте снова через час." });

        request.TargetValue = confirmedEmail;
        request.Code = Random.Shared.Next(100000, 999999).ToString();
        request.State = null;
        request.ChatId = null;
        request.TelegramUserId = null;
        request.Status = "pending";
        request.VerifiedAt = null;
        request.ConsumedAt = null;
        request.LastSentAt = now;
        request.ResendCount += 1;
        request.ResendWindowStartedAt = resendWindowStart;
        request.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(VerificationCodeTtlMinutes).ToUnixTimeMilliseconds();
        request.GatewayRequestId = null;
        request.GatewayDeliveryStatus = null;
        request.GatewayDeliveryUpdatedAt = null;
        request.GatewayVerificationStatus = null;
        request.GatewayVerificationUpdatedAt = null;
        request.GatewayIsRefunded = null;

        if (activeRequest is null)
            _db.ContactChangeRequests.Add(request);

        await _emailService.TrySendEmailConfirmationEmailAsync(confirmedEmail, request.Code, VerificationCodeTtlMinutes, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new
        {
            ok = true,
            channel = "email",
            method = "email",
            maskedDestination = MaskEmail(confirmedEmail),
            ttlSeconds = VerificationCodeTtlMinutes * 60,
            resendInSeconds = VerificationResendCooldownSeconds
        });
    }

    private async Task<IResult> StartGatewayProfileDeletionAsync(
        User user,
        string confirmedPhone,
        CancellationToken cancellationToken)
    {
        var configuration = await _telegramGatewayService.GetConfigurationAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var activeRequest = await _db.ContactChangeRequests
            .Where(x => x.UserId == user.Id && x.Kind == "account_delete_phone" && x.TargetValue == confirmedPhone && x.Status == "pending")
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        var request = activeRequest ?? new ContactChangeRequest
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = user.Id,
            Kind = "account_delete_phone",
            TargetValue = confirmedPhone,
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

        var allowCooldownBypass = string.IsNullOrWhiteSpace(request.GatewayRequestId);
        if (!allowCooldownBypass
            && request.LastSentAt.HasValue
            && now - request.LastSentAt.Value < TimeSpan.FromSeconds(VerificationResendCooldownSeconds).TotalMilliseconds)
        {
            return Results.BadRequest(new { detail = "Повторно отправить код можно через минуту." });
        }

        if (request.ResendCount >= VerificationMaxResendsPerHour)
            return Results.BadRequest(new { detail = "Слишком много попыток. Попробуйте снова через час." });

        request.TargetValue = confirmedPhone;
        request.State ??= AuthService.GenerateToken()[..24].ToLowerInvariant();
        request.Status = "pending";
        request.Code = null;
        request.ChatId = null;
        request.TelegramUserId = null;
        request.VerifiedAt = null;
        request.ConsumedAt = null;
        request.LastSentAt = now;
        request.ResendCount += 1;
        request.ResendWindowStartedAt = resendWindowStart;
        request.ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(configuration.TtlSeconds).ToUnixTimeMilliseconds();
        request.GatewayRequestId = null;
        request.GatewayDeliveryStatus = null;
        request.GatewayDeliveryUpdatedAt = null;
        request.GatewayVerificationStatus = null;
        request.GatewayVerificationUpdatedAt = null;
        request.GatewayIsRefunded = null;

        TelegramGatewayRequestStatus status;
        try
        {
            status = await _telegramGatewayService.SendVerificationMessageAsync(confirmedPhone, payload: $"account_delete:{user.Id}", cancellationToken);
        }
        catch (TelegramGatewayException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }

        ApplyGatewayStatus(request, status);
        if (string.IsNullOrWhiteSpace(request.GatewayRequestId))
            return Results.BadRequest(new { detail = "Не удалось создать сессию подтверждения. Попробуйте еще раз." });

        if (activeRequest is null)
            _db.ContactChangeRequests.Add(request);

        await _db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new
        {
            ok = true,
            channel = "phone",
            method = "telegram_gateway",
            state = request.State,
            maskedDestination = MaskPhone(confirmedPhone),
            codeLength = configuration.CodeLength,
            ttlSeconds = configuration.TtlSeconds
        });
    }

    private async Task<IResult> StartBotProfileDeletionAsync(
        User user,
        string confirmedPhone,
        CancellationToken cancellationToken)
    {
        var bot = await _db.TelegramBots
            .Where(x =>
                x.Enabled
                && x.UseForLogin
                && !string.IsNullOrWhiteSpace(x.Username)
                && !string.IsNullOrWhiteSpace(x.Token))
            .OrderByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (bot is null)
            return Results.BadRequest(new { detail = "Telegram-бот для подтверждения удаления не настроен." });

        var identity = await _userIdentityService.GetVerifiedTelegramIdentityAsync(user.Id, cancellationToken);
        if (identity is null)
            return Results.BadRequest(new { detail = "Сначала привяжите Telegram к профилю, чтобы подтверждать удаление через бота." });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var state = AuthService.GenerateToken()[..24].ToLowerInvariant();

        _db.ContactChangeRequests.Add(new ContactChangeRequest
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = user.Id,
            Kind = "account_delete_phone",
            TargetValue = confirmedPhone,
            State = state,
            Status = "pending",
            CreatedAt = now,
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(VerificationCodeTtlMinutes).ToUnixTimeMilliseconds()
        });

        await _db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new
        {
            ok = true,
            channel = "phone",
            method = "telegram_bot",
            state,
            authUrl = $"https://t.me/{bot.Username}?start=delete_account_{state}",
            ttlSeconds = VerificationCodeTtlMinutes * 60,
            maskedDestination = MaskPhone(confirmedPhone)
        });
    }

    private async Task<IReadOnlyList<object>> BuildExternalIdentityPayloadAsync(string userId)
    {
        var identities = await _db.UserExternalIdentities
            .AsNoTracking()
            .Where(x => x.UserId == userId)
            .ToListAsync();

        if (!identities.Any(x => x.Provider == "telegram"))
        {
            var fallbackTelegramIdentity = await _userIdentityService.GetVerifiedTelegramIdentityAsync(userId);
            if (fallbackTelegramIdentity is not null)
            {
                identities.Add(fallbackTelegramIdentity);
            }
        }

        return identities
            .Where(x => x.Provider == "telegram" || x.Provider == "google" || x.Provider == "vk" || x.Provider == "yandex")
            .GroupBy(x => x.Provider)
            .Select(group => group
                .OrderByDescending(x => x.VerifiedAt ?? x.LastUsedAt ?? x.UpdatedAt)
                .ThenByDescending(x => x.UpdatedAt)
                .First())
            .OrderBy(x => x.Provider == "telegram" ? 0 : x.Provider == "google" ? 1 : x.Provider == "vk" ? 2 : 3)
            .Select(identity => (object)new
            {
                provider = identity.Provider,
                providerEmail = identity.ProviderEmail,
                providerUsername = identity.ProviderUsername,
                displayName = identity.DisplayName,
                avatarUrl = identity.AvatarUrl,
                verified = identity.VerifiedAt.HasValue,
                linkedAt = identity.VerifiedAt ?? identity.CreatedAt,
                lastUsedAt = identity.LastUsedAt ?? identity.UpdatedAt,
                hasChat = identity.ChatId.HasValue,
                hasBot = !string.IsNullOrWhiteSpace(identity.BotId)
            })
            .ToList();
    }

    private async Task<AccountDeletionAvailability> GetAccountDeletionAvailabilityAsync(
        string userId,
        string? confirmedEmail = null,
        string? confirmedPhone = null,
        CancellationToken cancellationToken = default)
    {
        confirmedEmail ??= await _userIdentityService.GetConfirmedEmailAsync(userId, null, cancellationToken);
        confirmedPhone ??= await _userIdentityService.GetConfirmedPhoneAsync(userId, null, cancellationToken);

        var phoneVerificationAvailability = await GetPhoneVerificationAvailabilityAsync(userId, cancellationToken);

        var emailAvailable = !string.IsNullOrWhiteSpace(confirmedEmail);
        var phoneAvailable = !string.IsNullOrWhiteSpace(confirmedPhone) && phoneVerificationAvailability.Available;
        var phoneMethod = phoneAvailable ? phoneVerificationAvailability.Method : null;
        var preferredChannel = phoneAvailable ? "phone" : emailAvailable ? "email" : null;
        var availableChannels = new List<string>();
        if (emailAvailable)
            availableChannels.Add("email");
        if (phoneAvailable)
            availableChannels.Add("phone");

        var unavailableReason = availableChannels.Count > 0
            ? null
            : !string.IsNullOrWhiteSpace(confirmedPhone)
                ? "Для удаления по телефону нужен подтвержденный Telegram, привязанный к профилю."
                : "Подтвердите email или телефон, чтобы удалить профиль.";

        if (availableChannels.Count == 0
            && !string.IsNullOrWhiteSpace(confirmedPhone)
            && !string.IsNullOrWhiteSpace(phoneVerificationAvailability.UnavailableReason))
        {
            unavailableReason = phoneVerificationAvailability.UnavailableReason;
        }

        return new AccountDeletionAvailability(
            ConfirmedEmail: confirmedEmail,
            ConfirmedPhone: confirmedPhone,
            EmailAvailable: emailAvailable,
            PhoneAvailable: phoneAvailable,
            PhoneMethod: phoneMethod,
            PreferredChannel: preferredChannel,
            AvailableChannels: availableChannels,
            UnavailableReason: unavailableReason);
    }

    private async Task<PhoneVerificationAvailability> GetPhoneVerificationAvailabilityAsync(
        string userId,
        CancellationToken cancellationToken = default)
    {
        var gatewayAvailability = await _telegramGatewayService.GetAvailabilityAsync(cancellationToken);
        if (gatewayAvailability.Available)
        {
            return new PhoneVerificationAvailability(
                Available: true,
                Method: "telegram_gateway",
                UnavailableReason: null);
        }

        var hasTelegramIdentity = (await _userIdentityService.GetVerifiedTelegramIdentityAsync(userId, cancellationToken)) is not null;
        var hasLoginBot = await _db.TelegramBots
            .AsNoTracking()
            .AnyAsync(
                x =>
                    x.Enabled
                    && x.UseForLogin
                    && !string.IsNullOrWhiteSpace(x.Username)
                    && !string.IsNullOrWhiteSpace(x.Token),
                cancellationToken);

        if (hasTelegramIdentity && hasLoginBot)
        {
            return new PhoneVerificationAvailability(
                Available: true,
                Method: "telegram_bot",
                UnavailableReason: null);
        }

        var reasons = new List<string>();
        if (!string.IsNullOrWhiteSpace(gatewayAvailability.Reason))
            reasons.Add(gatewayAvailability.Reason);
        if (!hasTelegramIdentity)
            reasons.Add("Для резервного подтверждения через Telegram-бот сначала привяжите Telegram к профилю.");
        if (!hasLoginBot)
            reasons.Add("Резервный Telegram-бот для подтверждения телефона не настроен.");

        return new PhoneVerificationAvailability(
            Available: false,
            Method: null,
            UnavailableReason: reasons.FirstOrDefault() ?? "Подтверждение телефона сейчас недоступно.");
    }

    private static object BuildPhoneVerificationPayload(PhoneVerificationAvailability availability)
    {
        return new
        {
            available = availability.Available,
            method = availability.Method,
            unavailableReason = availability.UnavailableReason
        };
    }

    private static object BuildAccountDeletionPayload(AccountDeletionAvailability availability)
    {
        return new
        {
            canDelete = availability.AvailableChannels.Count > 0,
            availableChannels = availability.AvailableChannels,
            preferredChannel = availability.PreferredChannel,
            email = availability.EmailAvailable ? availability.ConfirmedEmail : null,
            phone = availability.PhoneAvailable ? availability.ConfirmedPhone : null,
            maskedEmail = availability.EmailAvailable ? MaskEmail(availability.ConfirmedEmail) : null,
            maskedPhone = availability.PhoneAvailable ? MaskPhone(availability.ConfirmedPhone) : null,
            phoneMethod = availability.PhoneMethod,
            unavailableReason = availability.UnavailableReason
        };
    }

    private static string NormalizeDeletionChannel(string? channel)
    {
        return channel?.Trim().ToLowerInvariant() switch
        {
            "email" => "email",
            "phone" => "phone",
            _ => string.Empty
        };
    }

    private static string? MaskEmail(string? email)
    {
        var normalized = (email ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        var parts = normalized.Split('@', 2, StringSplitOptions.TrimEntries);
        if (parts.Length != 2)
            return normalized;

        var localPart = parts[0];
        var domain = parts[1];
        var visibleLocalPart = localPart.Length <= 2 ? localPart[..1] : localPart[..2];
        var visibleDomain = domain.Length <= 2 ? domain[..1] : domain[..2];

        return $"{visibleLocalPart}***@{visibleDomain}***";
    }

    private static string? MaskPhone(string? phone)
    {
        var normalized = NormalizePhone(phone);
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        var digits = new string(normalized.Where(char.IsDigit).ToArray());
        if (digits.Length <= 4)
            return $"***{digits}";

        return $"+*** *** **{digits[^4]} {digits[^3..]}";
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

    private async Task<bool> IsStrictPasswordPolicyEnabledAsync()
    {
        var setting = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == "auth_password_policy_enabled");
        if (setting is null || string.IsNullOrWhiteSpace(setting.Value))
            return true;

        return !string.Equals(setting.Value, "false", StringComparison.OrdinalIgnoreCase)
               && !string.Equals(setting.Value, "0", StringComparison.OrdinalIgnoreCase)
               && !string.Equals(setting.Value, "off", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsStrongPassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 10) return false;
        return password.Any(char.IsUpper)
               && password.Any(char.IsLower)
               && password.Any(char.IsDigit);
    }

    private static bool HasPassword(User user)
    {
        return !string.IsNullOrWhiteSpace(user.PasswordHash)
               && !string.IsNullOrWhiteSpace(user.Salt);
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

    private static void ApplyGatewayStatus(ContactChangeRequest request, TelegramGatewayRequestStatus status)
    {
        request.GatewayRequestId = status.RequestId;
        request.GatewayDeliveryStatus = status.DeliveryStatus?.Status;
        request.GatewayDeliveryUpdatedAt = NormalizeGatewayTimestamp(status.DeliveryStatus?.UpdatedAt);
        request.GatewayVerificationStatus = status.VerificationStatus?.Status;
        request.GatewayVerificationUpdatedAt = NormalizeGatewayTimestamp(status.VerificationStatus?.UpdatedAt);
        request.GatewayIsRefunded = status.IsRefunded;
    }

    private static long? NormalizeGatewayTimestamp(long? value)
    {
        if (!value.HasValue)
            return null;

        return value.Value < 10_000_000_000 ? value.Value * 1000 : value.Value;
    }

    private static string NormalizeGatewayVerificationStatus(string? status)
    {
        return (status ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            "verified" => "success",
            "code_valid" => "success",
            "success" => "success",
            "invalid" => "invalid_code",
            "code_invalid" => "invalid_code",
            "expired" => "expired",
            "code_expired" => "expired",
            "max_attempts" => "too_many_attempts",
            "code_max_attempts_exceeded" => "too_many_attempts",
            _ => string.Empty
        };
    }

    private sealed record AccountDeletionAvailability(
        string? ConfirmedEmail,
        string? ConfirmedPhone,
        bool EmailAvailable,
        bool PhoneAvailable,
        string? PhoneMethod,
        string? PreferredChannel,
        IReadOnlyList<string> AvailableChannels,
        string? UnavailableReason);

    private sealed record PhoneVerificationAvailability(
        bool Available,
        string? Method,
        string? UnavailableReason);
}

