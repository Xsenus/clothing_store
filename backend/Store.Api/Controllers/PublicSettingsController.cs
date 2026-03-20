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
        "payments_yoomoney_enabled",
        "yoomoney_allow_bank_cards",
        "yoomoney_allow_wallet",
        "payments_yookassa_enabled",
        "yookassa_allow_bank_cards",
        "yookassa_allow_sbp",
        "yookassa_allow_yoomoney",
        "yandex_delivery_enabled",
        "site_title",
        "site_favicon_url",
        "site_loading_animation_enabled",
        "product_card_background_mode",
        "product_card_background_color",
        "product_card_image_fit_mode",
        "product_detail_background_mode",
        "product_detail_background_color",
        "product_detail_image_fit_mode",
        "product_detail_media_size_mode",
        "image_upload_gallery_enabled",
        "image_upload_gallery_max_width",
        "image_upload_gallery_max_height",
        "image_upload_gallery_quality",
        "image_upload_product_media_enabled",
        "image_upload_product_media_max_width",
        "image_upload_product_media_max_height",
        "image_upload_product_media_quality",
        "image_upload_review_media_enabled",
        "image_upload_review_media_max_width",
        "image_upload_review_media_max_height",
        "image_upload_review_media_quality",
        "image_upload_telegram_bot_enabled",
        "image_upload_telegram_bot_max_width",
        "image_upload_telegram_bot_max_height",
        "image_upload_telegram_bot_quality"
    ];

    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;

    public PublicSettingsController(StoreDbContext db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
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

        result["payments_yoomoney_enabled"] = await GetBooleanSettingAsync(
            "payments_yoomoney_enabled",
            "Integrations:YooMoney:Enabled",
            fallback: false) ? "true" : "false";
        result["yoomoney_allow_bank_cards"] = await GetBooleanSettingAsync(
            "yoomoney_allow_bank_cards",
            "Integrations:YooMoney:AllowBankCards",
            fallback: true) ? "true" : "false";
        result["yoomoney_allow_wallet"] = await GetBooleanSettingAsync(
            "yoomoney_allow_wallet",
            "Integrations:YooMoney:AllowWallet",
            fallback: false) ? "true" : "false";
        result["payments_yoomoney_ready"] = await IsYooMoneyReadyAsync() ? "true" : "false";

        result["payments_yookassa_enabled"] = await GetBooleanSettingAsync(
            "payments_yookassa_enabled",
            "Integrations:YooKassa:Enabled",
            fallback: false) ? "true" : "false";
        result["yookassa_allow_bank_cards"] = await GetBooleanSettingAsync(
            "yookassa_allow_bank_cards",
            "Integrations:YooKassa:AllowBankCards",
            fallback: true) ? "true" : "false";
        result["yookassa_allow_sbp"] = await GetBooleanSettingAsync(
            "yookassa_allow_sbp",
            "Integrations:YooKassa:AllowSbp",
            fallback: true) ? "true" : "false";
        result["yookassa_allow_yoomoney"] = await GetBooleanSettingAsync(
            "yookassa_allow_yoomoney",
            "Integrations:YooKassa:AllowYooMoney",
            fallback: true) ? "true" : "false";
        result["payments_yookassa_ready"] = await IsYooKassaReadyAsync() ? "true" : "false";
        result["yandex_delivery_enabled"] = await GetBooleanSettingAsync(
            "yandex_delivery_enabled",
            "Integrations:YandexDelivery:Enabled",
            fallback: true) ? "true" : "false";

        return Results.Ok(result);
    }

    private async Task<bool> IsYooMoneyReadyAsync()
    {
        var enabled = await GetBooleanSettingAsync(
            "payments_yoomoney_enabled",
            "Integrations:YooMoney:Enabled",
            fallback: false);
        if (!enabled)
            return false;

        var walletNumber = await GetSettingOrConfigAsync(
            "yoomoney_wallet_number",
            "Integrations:YooMoney:WalletNumber");
        var notificationSecret = await GetSettingOrConfigAsync(
            "yoomoney_notification_secret",
            "Integrations:YooMoney:NotificationSecret");
        var accessToken = await GetSettingOrConfigAsync(
            "yoomoney_access_token",
            "Integrations:YooMoney:AccessToken");
        var allowBankCards = await GetBooleanSettingAsync(
            "yoomoney_allow_bank_cards",
            "Integrations:YooMoney:AllowBankCards",
            fallback: true);
        var allowWallet = await GetBooleanSettingAsync(
            "yoomoney_allow_wallet",
            "Integrations:YooMoney:AllowWallet",
            fallback: false);

        return !string.IsNullOrWhiteSpace(walletNumber)
            && !string.IsNullOrWhiteSpace(notificationSecret)
            && !string.IsNullOrWhiteSpace(accessToken)
            && (allowBankCards || allowWallet);
    }

    private async Task<bool> IsYooKassaReadyAsync()
    {
        var enabled = await GetBooleanSettingAsync(
            "payments_yookassa_enabled",
            "Integrations:YooKassa:Enabled",
            fallback: false);
        if (!enabled)
            return false;

        var shopId = await GetSettingOrConfigAsync(
            "yookassa_shop_id",
            "Integrations:YooKassa:ShopId");
        var secretKey = await GetSettingOrConfigAsync(
            "yookassa_secret_key",
            "Integrations:YooKassa:SecretKey");
        var allowBankCards = await GetBooleanSettingAsync(
            "yookassa_allow_bank_cards",
            "Integrations:YooKassa:AllowBankCards",
            fallback: true);
        var allowSbp = await GetBooleanSettingAsync(
            "yookassa_allow_sbp",
            "Integrations:YooKassa:AllowSbp",
            fallback: true);
        var allowYooMoney = await GetBooleanSettingAsync(
            "yookassa_allow_yoomoney",
            "Integrations:YooKassa:AllowYooMoney",
            fallback: true);

        return !string.IsNullOrWhiteSpace(shopId)
            && !string.IsNullOrWhiteSpace(secretKey)
            && (allowBankCards || allowSbp || allowYooMoney);
    }

    private async Task<string?> GetSettingOrConfigAsync(string key, string configPath)
    {
        var row = await _db.AppSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Key == key);
        if (row is not null && !string.IsNullOrWhiteSpace(row.Value))
            return row.Value.Trim();

        var configValue = _configuration[configPath];
        return string.IsNullOrWhiteSpace(configValue) ? null : configValue.Trim();
    }

    private async Task<bool> GetBooleanSettingAsync(string key, string configPath, bool fallback)
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
}

