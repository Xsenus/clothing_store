using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Net;
using Store.Api.Data;

namespace Store.Api.Controllers;

[ApiController]
[Route("settings")]
public class PublicSettingsController : ControllerBase
{
    private static readonly string[] ShellPublicKeys =
    [
        "metrics_yandex_metrika_enabled",
        "metrics_yandex_metrika_code",
        "metrics_google_analytics_enabled",
        "metrics_google_analytics_code",
        "metrics_vk_pixel_enabled",
        "metrics_vk_pixel_code",
        "telegram_login_enabled",
        "telegram_widget_enabled",
        "telegram_bot_username",
        "google_login_enabled",
        "vk_login_enabled",
        "yandex_login_enabled",
        "payments_yoomoney_enabled",
        "yoomoney_allow_bank_cards",
        "yoomoney_allow_wallet",
        "payments_yookassa_enabled",
        "yookassa_allow_bank_cards",
        "yookassa_allow_sbp",
        "yookassa_allow_yoomoney",
        "payments_robokassa_enabled",
        "payments_robokassa_ready",
        "payment_cod_enabled",
        "checkout_self_pickup_title",
        "checkout_self_pickup_description",
        "yandex_delivery_enabled",
        "delivery_cdek_enabled",
        "delivery_cdek_ready",
        "delivery_fivepost_enabled",
        "delivery_fivepost_ready",
        "delivery_russian_post_enabled",
        "delivery_russian_post_ready",
        "delivery_avito_enabled",
        "delivery_avito_ready",
        "site_title",
        "site_favicon_url",
        "site_loading_animation_enabled",
        "social_links_config_json",
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

    private static readonly string[] LegalPublicKeys =
    [
        "privacy_policy",
        "user_agreement",
        "public_offer",
        "return_policy",
        "cookie_consent_text"
    ];

    private static readonly HashSet<string> LegalPublicKeySet = LegalPublicKeys
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    private static readonly string[] PublicKeys = ShellPublicKeys
        .Concat(LegalPublicKeys)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();

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
        var result = await BuildPublicSettingsAsync(PublicKeys);
        ApplyShortTermPublicCaching();
        return Results.Ok(result);
    }

    [HttpGet("public-shell")]
    public async Task<IResult> GetPublicShell()
    {
        var result = await BuildPublicSettingsAsync(ShellPublicKeys);
        ApplyShortTermPublicCaching();
        return Results.Ok(result);
    }

    [HttpGet("public-legal/{key}")]
    public async Task<IResult> GetPublicLegal(string key)
    {
        var normalizedKey = key?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedKey) || !LegalPublicKeySet.Contains(normalizedKey))
            return Results.NotFound(new { detail = "Legal document not found" });

        var result = await BuildPublicSettingsAsync([normalizedKey]);
        ApplyShortTermPublicCaching();
        return Results.Ok(new
        {
            key = normalizedKey,
            value = result.GetValueOrDefault(normalizedKey, string.Empty)
        });
    }

    private async Task<Dictionary<string, string>> BuildPublicSettingsAsync(IEnumerable<string> keys)
    {
        var requestedKeys = keys
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (requestedKeys.Length == 0)
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        var settings = await _db.AppSettings
            .Where(x => requestedKeys.Contains(x.Key))
            .ToListAsync();

        var result = settings.ToDictionary(x => x.Key, x => x.Value, StringComparer.OrdinalIgnoreCase);
        await ApplyDynamicPublicSettingsAsync(result, requestedKeys);
        return result;
    }

    private async Task ApplyDynamicPublicSettingsAsync(
        Dictionary<string, string> result,
        IReadOnlyCollection<string> requestedKeys)
    {
        var requested = requestedKeys.ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (requested.Contains("telegram_bot_username"))
        {
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
        }

        if (requested.Contains("telegram_login_enabled"))
            result["telegram_login_enabled"] = await IsTelegramLoginReadyAsync() ? "true" : "false";

        if (requested.Contains("telegram_widget_enabled"))
            result["telegram_widget_enabled"] = await IsTelegramWidgetReadyAsync() ? "true" : "false";

        if (requested.Contains("google_login_enabled"))
        {
            result["google_login_enabled"] = await IsExternalProviderReadyAsync(
                "google_login_enabled",
                "Auth:Google:Enabled",
                "google_auth_client_id",
                "Auth:Google:ClientId",
                "google_auth_client_secret",
                "Auth:Google:ClientSecret") ? "true" : "false";
        }

        if (requested.Contains("vk_login_enabled"))
        {
            result["vk_login_enabled"] = await IsExternalProviderReadyAsync(
                "vk_login_enabled",
                "Auth:Vk:Enabled",
                "vk_auth_client_id",
                "Auth:Vk:ClientId",
                "vk_auth_client_secret",
                "Auth:Vk:ClientSecret") ? "true" : "false";
        }

        if (requested.Contains("yandex_login_enabled"))
        {
            result["yandex_login_enabled"] = await IsExternalProviderReadyAsync(
                "yandex_login_enabled",
                "Auth:Yandex:Enabled",
                "yandex_auth_client_id",
                "Auth:Yandex:ClientId",
                "yandex_auth_client_secret",
                "Auth:Yandex:ClientSecret") ? "true" : "false";
        }

        if (requested.Contains("payments_yoomoney_enabled"))
        {
            result["payments_yoomoney_enabled"] = await GetBooleanSettingAsync(
                "payments_yoomoney_enabled",
                "Integrations:YooMoney:Enabled",
                fallback: false) ? "true" : "false";
        }

        if (requested.Contains("yoomoney_allow_bank_cards"))
        {
            result["yoomoney_allow_bank_cards"] = await GetBooleanSettingAsync(
                "yoomoney_allow_bank_cards",
                "Integrations:YooMoney:AllowBankCards",
                fallback: true) ? "true" : "false";
        }

        if (requested.Contains("yoomoney_allow_wallet"))
        {
            result["yoomoney_allow_wallet"] = await GetBooleanSettingAsync(
                "yoomoney_allow_wallet",
                "Integrations:YooMoney:AllowWallet",
                fallback: false) ? "true" : "false";
        }

        if (requested.Contains("payments_yoomoney_ready"))
            result["payments_yoomoney_ready"] = await IsYooMoneyReadyAsync() ? "true" : "false";

        if (requested.Contains("payments_yookassa_enabled"))
        {
            result["payments_yookassa_enabled"] = await GetBooleanSettingAsync(
                "payments_yookassa_enabled",
                "Integrations:YooKassa:Enabled",
                fallback: false) ? "true" : "false";
        }

        if (requested.Contains("yookassa_allow_bank_cards"))
        {
            result["yookassa_allow_bank_cards"] = await GetBooleanSettingAsync(
                "yookassa_allow_bank_cards",
                "Integrations:YooKassa:AllowBankCards",
                fallback: true) ? "true" : "false";
        }

        if (requested.Contains("yookassa_allow_sbp"))
        {
            result["yookassa_allow_sbp"] = await GetBooleanSettingAsync(
                "yookassa_allow_sbp",
                "Integrations:YooKassa:AllowSbp",
                fallback: true) ? "true" : "false";
        }

        if (requested.Contains("yookassa_allow_yoomoney"))
        {
            result["yookassa_allow_yoomoney"] = await GetBooleanSettingAsync(
                "yookassa_allow_yoomoney",
                "Integrations:YooKassa:AllowYooMoney",
                fallback: true) ? "true" : "false";
        }

        if (requested.Contains("payments_yookassa_ready"))
            result["payments_yookassa_ready"] = await IsYooKassaReadyAsync() ? "true" : "false";

        if (requested.Contains("payments_robokassa_enabled"))
        {
            result["payments_robokassa_enabled"] = await GetBooleanSettingAsync(
                "payments_robokassa_enabled",
                "Integrations:RoboKassa:Enabled",
                fallback: false) ? "true" : "false";
        }

        if (requested.Contains("payments_robokassa_ready"))
            result["payments_robokassa_ready"] = await IsRoboKassaReadyAsync() ? "true" : "false";

        if (requested.Contains("payment_cod_enabled"))
        {
            result["payment_cod_enabled"] = await GetBooleanSettingAsync(
                "payment_cod_enabled",
                "Checkout:PaymentCodEnabled",
                fallback: true) ? "true" : "false";
        }

        if (requested.Contains("yandex_delivery_enabled"))
        {
            result["yandex_delivery_enabled"] = await GetBooleanSettingAsync(
                "yandex_delivery_enabled",
                "Integrations:YandexDelivery:Enabled",
                fallback: true) ? "true" : "false";
        }

        if (requested.Contains("delivery_cdek_enabled"))
        {
            result["delivery_cdek_enabled"] = await GetBooleanSettingAsync(
                "delivery_cdek_enabled",
                "Integrations:Cdek:Enabled",
                fallback: false) ? "true" : "false";
        }

        if (requested.Contains("delivery_cdek_ready"))
            result["delivery_cdek_ready"] = await IsCdekReadyAsync() ? "true" : "false";

        if (requested.Contains("delivery_fivepost_enabled"))
        {
            result["delivery_fivepost_enabled"] = await GetBooleanSettingAsync(
                "delivery_fivepost_enabled",
                "Integrations:FivePost:Enabled",
                fallback: false) ? "true" : "false";
        }

        if (requested.Contains("delivery_fivepost_ready"))
            result["delivery_fivepost_ready"] = await IsFivePostReadyAsync() ? "true" : "false";

        if (requested.Contains("delivery_russian_post_enabled"))
        {
            result["delivery_russian_post_enabled"] = await GetBooleanSettingAsync(
                "delivery_russian_post_enabled",
                "Integrations:RussianPost:Enabled",
                fallback: false) ? "true" : "false";
        }

        if (requested.Contains("delivery_russian_post_ready"))
            result["delivery_russian_post_ready"] = await IsRussianPostReadyAsync() ? "true" : "false";

        if (requested.Contains("delivery_avito_enabled"))
        {
            result["delivery_avito_enabled"] = await GetBooleanSettingAsync(
                "delivery_avito_enabled",
                "Integrations:Avito:Enabled",
                fallback: false) ? "true" : "false";
        }

        if (requested.Contains("delivery_avito_ready"))
            result["delivery_avito_ready"] = await IsAvitoReadyAsync() ? "true" : "false";
    }

    private void ApplyShortTermPublicCaching()
    {
        Response.Headers["Cache-Control"] = "public, max-age=300";
        Response.Headers["Vary"] = "Accept-Encoding";
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

    private async Task<bool> IsRoboKassaReadyAsync()
    {
        var enabled = await GetBooleanSettingAsync(
            "payments_robokassa_enabled",
            "Integrations:RoboKassa:Enabled",
            fallback: false);
        if (!enabled)
            return false;

        var merchantLogin = await GetSettingOrConfigAsync(
            "robokassa_merchant_login",
            "Integrations:RoboKassa:MerchantLogin");
        var password1 = await GetSettingOrConfigAsync(
            "robokassa_password1",
            "Integrations:RoboKassa:Password1");
        var password2 = await GetSettingOrConfigAsync(
            "robokassa_password2",
            "Integrations:RoboKassa:Password2");

        return !string.IsNullOrWhiteSpace(merchantLogin)
            && !string.IsNullOrWhiteSpace(password1)
            && !string.IsNullOrWhiteSpace(password2);
    }

    private async Task<bool> IsCdekReadyAsync()
    {
        var enabled = await GetBooleanSettingAsync(
            "delivery_cdek_enabled",
            "Integrations:Cdek:Enabled",
            fallback: false);
        if (!enabled)
            return false;

        var account = await GetSettingOrConfigAsync(
            "delivery_cdek_account",
            "Integrations:Cdek:Account");
        var password = await GetSettingOrConfigAsync(
            "delivery_cdek_password",
            "Integrations:Cdek:Password");
        var fromPostalCode = await GetSettingOrConfigAsync(
            "delivery_cdek_from_postal_code",
            "Integrations:Cdek:FromPostalCode");
        var fromAddress = await GetSettingOrConfigAsync(
            "delivery_cdek_from_address",
            "Integrations:Cdek:FromAddress");
        var dadataApiKey = await GetSettingOrConfigAsync(
            "dadata_api_key",
            "Integrations:DaData:ApiKey");

        var hasOrigin = !string.IsNullOrWhiteSpace(fromPostalCode)
            || (!string.IsNullOrWhiteSpace(fromAddress) && !string.IsNullOrWhiteSpace(dadataApiKey));

        return !string.IsNullOrWhiteSpace(account)
            && !string.IsNullOrWhiteSpace(password)
            && hasOrigin;
    }

    private async Task<bool> IsRussianPostReadyAsync()
    {
        var enabled = await GetBooleanSettingAsync(
            "delivery_russian_post_enabled",
            "Integrations:RussianPost:Enabled",
            fallback: false);
        if (!enabled)
            return false;

        var accessToken = await GetSettingOrConfigAsync(
            "delivery_russian_post_access_token",
            "Integrations:RussianPost:AccessToken");
        var authorizationKey = await GetSettingOrConfigAsync(
            "delivery_russian_post_authorization_key",
            "Integrations:RussianPost:AuthorizationKey");
        var fromPostalCode = await GetSettingOrConfigAsync(
            "delivery_russian_post_from_postal_code",
            "Integrations:RussianPost:FromPostalCode");

        return !string.IsNullOrWhiteSpace(accessToken)
            && !string.IsNullOrWhiteSpace(authorizationKey)
            && !string.IsNullOrWhiteSpace(fromPostalCode);
    }

    private async Task<bool> IsAvitoReadyAsync()
    {
        var enabled = await GetBooleanSettingAsync(
            "delivery_avito_enabled",
            "Integrations:Avito:Enabled",
            fallback: false);
        if (!enabled)
            return false;

        var clientId = await GetSettingOrConfigAsync(
            "delivery_avito_client_id",
            "Integrations:Avito:ClientId");
        var clientSecret = await GetSettingOrConfigAsync(
            "delivery_avito_client_secret",
            "Integrations:Avito:ClientSecret");

        return !string.IsNullOrWhiteSpace(clientId)
            && !string.IsNullOrWhiteSpace(clientSecret);
    }

    private async Task<bool> IsFivePostReadyAsync()
    {
        var enabled = await GetBooleanSettingAsync(
            "delivery_fivepost_enabled",
            "Integrations:FivePost:Enabled",
            fallback: false);
        if (!enabled)
            return false;

        var pickupCostRaw = await GetSettingOrConfigAsync(
            "delivery_fivepost_pickup_cost",
            "Integrations:FivePost:PickupCost");
        var deliveryDaysRaw = await GetSettingOrConfigAsync(
            "delivery_fivepost_delivery_days",
            "Integrations:FivePost:DeliveryDays");

        var hasPickupCost = decimal.TryParse(pickupCostRaw, NumberStyles.Any, CultureInfo.InvariantCulture, out var pickupCost)
            || decimal.TryParse(pickupCostRaw, NumberStyles.Any, CultureInfo.GetCultureInfo("ru-RU"), out pickupCost);
        var hasDeliveryDays = int.TryParse(deliveryDaysRaw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var deliveryDays);

        return hasPickupCost
            && pickupCost > 0m
            && hasDeliveryDays
            && deliveryDays > 0;
    }

    private async Task<bool> IsTelegramLoginReadyAsync()
    {
        var enabled = await GetBooleanSettingAsync(
            "telegram_login_enabled",
            "Auth:Telegram:Enabled",
            fallback: false);
        if (!enabled)
            return false;

        var username = await _db.TelegramBots
            .AsNoTracking()
            .Where(x =>
                x.Enabled
                && x.UseForLogin
                && !string.IsNullOrWhiteSpace(x.Username)
                && !string.IsNullOrWhiteSpace(x.Token))
            .OrderByDescending(x => x.UpdatedAt)
            .Select(x => x.Username)
            .FirstOrDefaultAsync();

        return !string.IsNullOrWhiteSpace(username);
    }

    private async Task<bool> IsTelegramWidgetReadyAsync()
    {
        var enabled = await GetBooleanSettingAsync(
            "telegram_widget_enabled",
            "Auth:Telegram:WidgetEnabled",
            fallback: false);

        return enabled
            && IsTelegramWidgetHostSupported()
            && await IsTelegramLoginReadyAsync();
    }

    private bool IsTelegramWidgetHostSupported()
    {
        var host = Request.Headers.TryGetValue("X-Forwarded-Host", out var forwardedHosts)
            ? forwardedHosts.ToString().Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()
            : null;
        host = string.IsNullOrWhiteSpace(host) ? Request.Host.Host : host;

        if (string.IsNullOrWhiteSpace(host))
            return false;

        var normalizedHost = host.Trim().ToLowerInvariant();
        if (normalizedHost == "localhost"
            || normalizedHost.EndsWith(".localhost", StringComparison.Ordinal)
            || normalizedHost.EndsWith(".local", StringComparison.Ordinal)
            || normalizedHost.EndsWith(".test", StringComparison.Ordinal)
            || normalizedHost.EndsWith(".invalid", StringComparison.Ordinal))
        {
            return false;
        }

        return !IPAddress.TryParse(normalizedHost, out _);
    }

    private async Task<bool> IsExternalProviderReadyAsync(
        string enabledSettingKey,
        string enabledConfigPath,
        string clientIdSettingKey,
        string clientIdConfigPath,
        string clientSecretSettingKey,
        string clientSecretConfigPath)
    {
        var enabled = await GetBooleanSettingAsync(enabledSettingKey, enabledConfigPath, fallback: false);
        if (!enabled)
            return false;

        var clientId = await GetSettingOrConfigAsync(clientIdSettingKey, clientIdConfigPath);
        var clientSecret = await GetSettingOrConfigAsync(clientSecretSettingKey, clientSecretConfigPath);

        return !string.IsNullOrWhiteSpace(clientId) && !string.IsNullOrWhiteSpace(clientSecret);
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

