using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Store.Api.Contracts;
using Store.Api.Services;

namespace Store.Api.Controllers;

[ApiController]
[Route("admin/promo-codes")]
public class AdminPromoCodesController : ControllerBase
{
    private static readonly Regex PromoCodePattern = new("^[A-Z0-9_-]{3,32}$", RegexOptions.Compiled);

    private readonly AuthService _auth;
    private readonly PromoCodeService _promoCodeService;

    public AdminPromoCodesController(AuthService auth, PromoCodeService promoCodeService)
    {
        _auth = auth;
        _promoCodeService = promoCodeService;
    }

    [HttpGet]
    public async Task<IResult> List(CancellationToken cancellationToken)
    {
        if (await RequireAdminUserAsync() is null)
        {
            return Results.Unauthorized();
        }

        var promoCodes = await _promoCodeService.GetAllAsync(cancellationToken);
        return Results.Ok(promoCodes.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IResult> Create([FromBody] AdminPromoCodePayload payload, CancellationToken cancellationToken)
    {
        if (await RequireAdminUserAsync() is null)
        {
            return Results.Unauthorized();
        }

        var promoCodes = await _promoCodeService.GetAllAsync(cancellationToken);
        var promoCode = PromoCodeService.NormalizeDefinition(new PromoCodeService.PromoCodeDefinition
        {
            Id = Guid.NewGuid().ToString("N"),
            Code = payload.Code,
            Description = payload.Description ?? string.Empty,
            DiscountType = payload.DiscountType,
            DiscountValue = payload.DiscountValue,
            MinimumSubtotal = payload.MinimumSubtotal,
            MaximumDiscountAmount = payload.MaximumDiscountAmount,
            UsageLimit = payload.UsageLimit,
            UsedCount = 0,
            IsActive = payload.IsActive,
            StartsAt = payload.StartsAt,
            ExpiresAt = payload.ExpiresAt,
        });

        var validationError = ValidatePromoCodeDefinition(promoCode, promoCodes, null);
        if (!string.IsNullOrWhiteSpace(validationError))
        {
            return Results.BadRequest(new { detail = validationError });
        }

        await _promoCodeService.ReplaceAllAsync(promoCodes.Append(promoCode).ToList(), cancellationToken);
        return Results.Ok(ToResponse(promoCode));
    }

    [HttpPatch("{id}")]
    public async Task<IResult> Update(
        string id,
        [FromBody] AdminPromoCodePatchPayload payload,
        CancellationToken cancellationToken)
    {
        if (await RequireAdminUserAsync() is null)
        {
            return Results.Unauthorized();
        }

        var promoCodes = await _promoCodeService.GetAllAsync(cancellationToken);
        var existingPromoCode = promoCodes.FirstOrDefault(x => x.Id == id);
        if (existingPromoCode is null)
        {
            return Results.NotFound(new { detail = "Промокод не найден." });
        }

        var updatedPromoCode = PromoCodeService.NormalizeDefinition(new PromoCodeService.PromoCodeDefinition
        {
            Id = existingPromoCode.Id,
            Code = payload.Code ?? existingPromoCode.Code,
            Description = payload.Description ?? existingPromoCode.Description,
            DiscountType = payload.DiscountType ?? existingPromoCode.DiscountType,
            DiscountValue = payload.DiscountValue ?? existingPromoCode.DiscountValue,
            MinimumSubtotal = payload.MinimumSubtotal ?? existingPromoCode.MinimumSubtotal,
            MaximumDiscountAmount = payload.MaximumDiscountAmount ?? existingPromoCode.MaximumDiscountAmount,
            UsageLimit = payload.UsageLimit ?? existingPromoCode.UsageLimit,
            UsedCount = existingPromoCode.UsedCount,
            IsActive = payload.IsActive ?? existingPromoCode.IsActive,
            StartsAt = payload.StartsAt ?? existingPromoCode.StartsAt,
            ExpiresAt = payload.ExpiresAt ?? existingPromoCode.ExpiresAt,
        });

        var validationError = ValidatePromoCodeDefinition(updatedPromoCode, promoCodes, existingPromoCode.Id);
        if (!string.IsNullOrWhiteSpace(validationError))
        {
            return Results.BadRequest(new { detail = validationError });
        }

        var nextPromoCodes = promoCodes
            .Select(x => x.Id == existingPromoCode.Id ? updatedPromoCode : x)
            .ToList();

        await _promoCodeService.ReplaceAllAsync(nextPromoCodes, cancellationToken);
        return Results.Ok(ToResponse(updatedPromoCode));
    }

    [HttpDelete("{id}")]
    public async Task<IResult> Delete(string id, CancellationToken cancellationToken)
    {
        if (await RequireAdminUserAsync() is null)
        {
            return Results.Unauthorized();
        }

        var promoCodes = await _promoCodeService.GetAllAsync(cancellationToken);
        if (promoCodes.All(x => x.Id != id))
        {
            return Results.NotFound(new { detail = "Промокод не найден." });
        }

        await _promoCodeService.ReplaceAllAsync(promoCodes.Where(x => x.Id != id).ToList(), cancellationToken);
        return Results.Ok(new { ok = true });
    }

    private Task<Store.Api.Models.User?> RequireAdminUserAsync() => _auth.RequireAdminUserAsync(Request);

    private static string? ValidatePromoCodeDefinition(
        PromoCodeService.PromoCodeDefinition promoCode,
        IReadOnlyCollection<PromoCodeService.PromoCodeDefinition> existingPromoCodes,
        string? ignoreId)
    {
        if (!PromoCodePattern.IsMatch(promoCode.Code))
        {
            return "Код должен содержать 3-32 символа: латиницу, цифры, дефис или нижнее подчеркивание.";
        }

        if (existingPromoCodes.Any(x => x.Id != ignoreId && x.Code == promoCode.Code))
        {
            return "Промокод с таким кодом уже существует.";
        }

        if (promoCode.DiscountType != PromoCodeService.DiscountTypePercent
            && promoCode.DiscountType != PromoCodeService.DiscountTypeFixed)
        {
            return "Неизвестный тип скидки.";
        }

        if (promoCode.DiscountValue <= 0)
        {
            return "Значение скидки должно быть больше нуля.";
        }

        if (promoCode.DiscountType == PromoCodeService.DiscountTypePercent && promoCode.DiscountValue > 100)
        {
            return "Процент скидки не может быть больше 100.";
        }

        if (promoCode.MinimumSubtotal.HasValue && promoCode.MinimumSubtotal.Value < 0)
        {
            return "Минимальная сумма заказа не может быть отрицательной.";
        }

        if (promoCode.MaximumDiscountAmount.HasValue && promoCode.MaximumDiscountAmount.Value <= 0)
        {
            return "Максимальная скидка должна быть больше нуля.";
        }

        if (promoCode.UsageLimit.HasValue && promoCode.UsageLimit.Value <= 0)
        {
            return "Лимит использований должен быть больше нуля.";
        }

        if (promoCode.StartsAt.HasValue && promoCode.ExpiresAt.HasValue && promoCode.ExpiresAt.Value < promoCode.StartsAt.Value)
        {
            return "Дата окончания должна быть позже даты начала.";
        }

        return null;
    }

    private static object ToResponse(PromoCodeService.PromoCodeDefinition promoCode)
    {
        return new
        {
            id = promoCode.Id,
            code = promoCode.Code,
            description = promoCode.Description,
            discountType = promoCode.DiscountType,
            discountValue = promoCode.DiscountValue,
            minimumSubtotal = promoCode.MinimumSubtotal,
            maximumDiscountAmount = promoCode.MaximumDiscountAmount,
            usageLimit = promoCode.UsageLimit,
            usedCount = promoCode.UsedCount,
            remainingUses = promoCode.UsageLimit.HasValue
                ? (int?)Math.Max(promoCode.UsageLimit.Value - promoCode.UsedCount, 0)
                : null,
            isActive = promoCode.IsActive,
            startsAt = promoCode.StartsAt,
            expiresAt = promoCode.ExpiresAt,
        };
    }
}
