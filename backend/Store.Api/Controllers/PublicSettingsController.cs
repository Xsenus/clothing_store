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
        "telegram_bot_username",
        "site_title",
        "site_favicon_url",
        "product_card_background_mode",
        "product_card_background_color",
        "product_card_image_fit_mode",
        "product_detail_background_mode",
        "product_detail_background_color",
        "product_detail_image_fit_mode",
        "product_detail_media_size_mode"
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

        var result = settings.ToDictionary(x => x.Key, x => x.Value);

        var loginBotUsername = await _db.TelegramBots
            .Where(x => x.Enabled && x.UseForLogin && !string.IsNullOrWhiteSpace(x.Username))
            .OrderByDescending(x => x.UpdatedAt)
            .Select(x => x.Username)
            .FirstOrDefaultAsync();

        if (!string.IsNullOrWhiteSpace(loginBotUsername))
            result["telegram_bot_username"] = loginBotUsername!;

        if (!result.TryGetValue("telegram_bot_username", out var configuredLoginBotUsername) || string.IsNullOrWhiteSpace(configuredLoginBotUsername))
        {
            var fallbackUsername = await _db.TelegramBots
                .Where(x => x.Enabled && !string.IsNullOrWhiteSpace(x.Username))
                .OrderByDescending(x => x.UseForLogin)
                .ThenByDescending(x => x.UpdatedAt)
                .Select(x => x.Username)
                .FirstOrDefaultAsync();

            if (!string.IsNullOrWhiteSpace(fallbackUsername))
                result["telegram_bot_username"] = fallbackUsername!;
        }

        return Results.Ok(result);
    }
}

