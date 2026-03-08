using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;

namespace Store.Api.Controllers;

[ApiController]
[Route("settings")]
public class PublicSettingsController : ControllerBase
{
    private static readonly string[] PublicKeys =
    [
        "privacy_policy",
        "user_agreement",
        "public_offer",
        "cookie_consent_text",
        "metrics_yandex_metrika_enabled",
        "metrics_yandex_metrika_code",
        "metrics_google_analytics_enabled",
        "metrics_google_analytics_code",
        "metrics_vk_pixel_enabled",
        "metrics_vk_pixel_code",
        "telegram_login_enabled",
        "telegram_bot_username"
    ];

    private readonly StoreDbContext _db;

    public PublicSettingsController(StoreDbContext db)
    {
        _db = db;
    }

    [HttpGet("public")]
    public async Task<IResult> GetPublic()
    {
        var settings = await _db.AppSettings
            .Where(x => PublicKeys.Contains(x.Key))
            .ToListAsync();

        return Results.Ok(settings.ToDictionary(x => x.Key, x => x.Value));
    }
}

