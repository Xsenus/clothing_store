using Microsoft.AspNetCore.Mvc;
using Store.Api.Contracts;
using Store.Api.Services;

namespace Store.Api.Controllers;

[ApiController]
[Route("promo-codes")]
public class PromoCodesController : ControllerBase
{
    private readonly AuthService _auth;
    private readonly PromoCodeService _promoCodeService;

    public PromoCodesController(AuthService auth, PromoCodeService promoCodeService)
    {
        _auth = auth;
        _promoCodeService = promoCodeService;
    }

    [HttpPost("validate")]
    public async Task<IResult> Validate(
        [FromBody] PromoCodeValidationPayload payload,
        CancellationToken cancellationToken)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null)
        {
            return Results.Unauthorized();
        }

        var validation = await _promoCodeService.ValidateAsync(
            payload.Code,
            payload.Subtotal,
            cancellationToken: cancellationToken);

        if (!validation.IsValid || validation.PromoCode is null)
        {
            return Results.BadRequest(new { detail = validation.Error ?? "Промокод недействителен." });
        }

        return Results.Ok(new
        {
            code = validation.PromoCode.Code,
            description = validation.PromoCode.Description,
            discountType = validation.PromoCode.DiscountType,
            discountValue = validation.PromoCode.DiscountValue,
            minimumSubtotal = validation.PromoCode.MinimumSubtotal,
            maximumDiscountAmount = validation.PromoCode.MaximumDiscountAmount,
            discountAmount = validation.DiscountAmount,
            discountedSubtotal = validation.DiscountedSubtotal,
        });
    }
}
