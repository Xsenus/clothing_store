using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Store.Api.Models;

/// <summary>
/// Представляет учетную запись пользователя.
/// </summary>
[Table("users")]
public class User
{
    /// <summary>
    /// Получает или задаёт идентификатор пользователя.
    /// </summary>
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    /// <summary>
    /// Получает или задаёт email пользователя.
    /// </summary>
    [Column("email")]
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт хэш пароля.
    /// </summary>
    [Column("password_hash")]
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт соль пароля.
    /// </summary>
    [Column("salt")]
    public string Salt { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт признак подтверждения аккаунта.
    /// </summary>
    [Column("verified")]
    public bool Verified { get; set; }

    /// <summary>
    /// Получает или задаёт время создания в миллисекундах Unix.
    /// </summary>
    [Column("created_at")]
    public long CreatedAt { get; set; }

    [Column("is_admin")]
    public bool IsAdmin { get; set; }

    [Column("is_blocked")]
    public bool IsBlocked { get; set; }

    [Column("is_system")]
    public bool IsSystem { get; set; }
}

/// <summary>
/// Представляет пользовательскую сессию.
/// </summary>
[Table("sessions")]
public class Session
{
    /// <summary>
    /// Получает или задаёт токен сессии.
    /// </summary>
    [Key]
    [Column("token")]
    public string Token { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт идентификатор пользователя.
    /// </summary>
    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт время создания в миллисекундах Unix.
    /// </summary>
    [Column("created_at")]
    public long CreatedAt { get; set; }
}

/// <summary>
/// Представляет refresh-сессию пользователя.
/// </summary>
[Table("refresh_sessions")]
public class RefreshSession
{
    /// <summary>
    /// Получает или задаёт refresh-токен сессии.
    /// </summary>
    [Key]
    [Column("token")]
    public string Token { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт идентификатор пользователя.
    /// </summary>
    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт время создания в миллисекундах Unix.
    /// </summary>
    [Column("created_at")]
    public long CreatedAt { get; set; }
}

/// <summary>
/// Представляет админскую сессию.
/// </summary>
[Table("admin_sessions")]
public class AdminSession
{
    /// <summary>
    /// Получает или задаёт токен администратора.
    /// </summary>
    [Key]
    [Column("token")]
    public string Token { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт время создания в миллисекундах Unix.
    /// </summary>
    [Column("created_at")]
    public long CreatedAt { get; set; }

    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;
}

[Table("app_settings")]
public class AppSetting
{
    [Key]
    [Column("key")]
    public string Key { get; set; } = string.Empty;

    [Column("value")]
    public string Value { get; set; } = string.Empty;
}

[Table("telegram_bots")]
public class TelegramBot
{
    public const string UpdateModePolling = "polling";
    public const string UpdateModeWebhook = "webhook";

    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("description")]
    public string Description { get; set; } = string.Empty;

    [Column("short_description")]
    public string? ShortDescription { get; set; }

    [Column("image_url")]
    public string? ImageUrl { get; set; }

    [Column("token")]
    public string Token { get; set; } = string.Empty;

    [Column("username")]
    public string? Username { get; set; }

    [Column("commands_json")]
    public string CommandsJson { get; set; } = "[]";

    [Column("enabled")]
    public bool Enabled { get; set; } = true;

    [Column("update_mode")]
    public string UpdateMode { get; set; } = UpdateModePolling;

    [Column("webhook_secret")]
    public string? WebhookSecret { get; set; }

    [Column("use_for_login")]
    public bool UseForLogin { get; set; }

    [Column("auto_replies_enabled")]
    public bool AutoRepliesEnabled { get; set; } = true;

    [Column("reply_templates_json")]
    public string ReplyTemplatesJson { get; set; } = "[]";

    [Column("created_at")]
    public long CreatedAt { get; set; }

    [Column("updated_at")]
    public long UpdatedAt { get; set; }

    [Column("last_checked_at")]
    public long? LastCheckedAt { get; set; }

    [Column("last_bot_info_json")]
    public string? LastBotInfoJson { get; set; }
}

[Table("telegram_bot_subscribers")]
public class TelegramBotSubscriber
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("bot_id")]
    public string BotId { get; set; } = string.Empty;

    [Column("chat_id")]
    public long ChatId { get; set; }

    [Column("username")]
    public string? Username { get; set; }

    [Column("first_name")]
    public string? FirstName { get; set; }

    [Column("last_name")]
    public string? LastName { get; set; }

    [Column("created_at")]
    public long CreatedAt { get; set; }

    [Column("updated_at")]
    public long UpdatedAt { get; set; }
}

[Table("gallery_images")]
public class GalleryImage
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    [Column("content_type")]
    public string ContentType { get; set; } = "application/octet-stream";

    [Column("file_extension")]
    public string FileExtension { get; set; } = string.Empty;

    [Column("file_name")]
    public string FileName { get; set; } = string.Empty;

    [Column("disk_path")]
    public string DiskPath { get; set; } = string.Empty;

    [Column("file_size")]
    public long FileSize { get; set; }

    [Column("binary_data")]
    public byte[] BinaryData { get; set; } = [];

    [Column("created_at")]
    public long CreatedAt { get; set; }

    [Column("updated_at")]
    public long UpdatedAt { get; set; }
}

/// <summary>
/// Представляет код подтверждения или сброса.
/// </summary>
[Table("verification_codes")]
public class VerificationCode
{
    /// <summary>
    /// Получает или задаёт email.
    /// </summary>
    [Column("email")]
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт тип операции.
    /// </summary>
    [Column("kind")]
    public string Kind { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт значение кода.
    /// </summary>
    [Column("code")]
    public string Code { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт время истечения в миллисекундах Unix.
    /// </summary>
    [Column("expires_at")]
    public long ExpiresAt { get; set; }
}

/// <summary>
/// Представляет профиль пользователя.
/// </summary>
[Table("profiles")]
public class Profile
{
    /// <summary>
    /// Получает или задаёт ID пользователя.
    /// </summary>
    [Key]
    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт email.
    /// </summary>
    [Column("email")]
    public string Email { get; set; } = string.Empty;

    [Column("email_verified")]
    public bool EmailVerified { get; set; }

    /// <summary>
    /// Получает или задаёт имя пользователя.
    /// </summary>
    [Column("name")]
    public string? Name { get; set; }

    /// <summary>
    /// Получает или задаёт телефон.
    /// </summary>
    [Column("phone")]
    public string? Phone { get; set; }

    [Column("phone_verified")]
    public bool PhoneVerified { get; set; }

    /// <summary>
    /// Получает или задаёт адрес доставки.
    /// </summary>
    [Column("shipping_address")]
    public string? ShippingAddress { get; set; }

    [Column("shipping_addresses_json", TypeName = "jsonb")]
    public string ShippingAddressesJson { get; set; } = "[]";

    /// <summary>
    /// Получает или задаёт никнейм.
    /// </summary>
    [Column("nickname")]
    public string? Nickname { get; set; }

    [Column("admin_preferences_json")]
    public string? AdminPreferencesJson { get; set; }
}

[Table("telegram_auth_requests")]
public class TelegramAuthRequest
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("state")]
    public string State { get; set; } = string.Empty;

    [Column("bot_id")]
    public string BotId { get; set; } = string.Empty;

    [Column("telegram_user_id")]
    public string? TelegramUserId { get; set; }

    [Column("chat_id")]
    public long? ChatId { get; set; }

    [Column("user_id")]
    public string? UserId { get; set; }

    [Column("phone_number")]
    public string? PhoneNumber { get; set; }

    [Column("intent")]
    public string Intent { get; set; } = "signin";

    [Column("status")]
    public string Status { get; set; } = "pending";

    [Column("created_at")]
    public long CreatedAt { get; set; }

    [Column("expires_at")]
    public long ExpiresAt { get; set; }

    [Column("completed_at")]
    public long? CompletedAt { get; set; }

    [Column("consumed_at")]
    public long? ConsumedAt { get; set; }
}


[Table("contact_change_requests")]
public class ContactChangeRequest
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Column("kind")]
    public string Kind { get; set; } = string.Empty;

    [Column("target_value")]
    public string TargetValue { get; set; } = string.Empty;

    [Column("code")]
    public string? Code { get; set; }

    [Column("state")]
    public string? State { get; set; }

    [Column("chat_id")]
    public long? ChatId { get; set; }

    [Column("telegram_user_id")]
    public string? TelegramUserId { get; set; }

    [Column("status")]
    public string Status { get; set; } = "pending";

    [Column("created_at")]
    public long CreatedAt { get; set; }

    [Column("expires_at")]
    public long ExpiresAt { get; set; }

    [Column("verified_at")]
    public long? VerifiedAt { get; set; }

    [Column("consumed_at")]
    public long? ConsumedAt { get; set; }

    [Column("last_sent_at")]
    public long? LastSentAt { get; set; }

    [Column("resend_count")]
    public int ResendCount { get; set; }

    [Column("resend_window_started_at")]
    public long? ResendWindowStartedAt { get; set; }
}

[Table("user_external_identities")]
public class UserExternalIdentity
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Column("provider")]
    public string Provider { get; set; } = string.Empty;

    [Column("provider_user_id")]
    public string ProviderUserId { get; set; } = string.Empty;

    [Column("provider_email")]
    public string? ProviderEmail { get; set; }

    [Column("provider_username")]
    public string? ProviderUsername { get; set; }

    [Column("display_name")]
    public string? DisplayName { get; set; }

    [Column("avatar_url")]
    public string? AvatarUrl { get; set; }

    [Column("bot_id")]
    public string? BotId { get; set; }

    [Column("chat_id")]
    public long? ChatId { get; set; }

    [Column("verified_at")]
    public long? VerifiedAt { get; set; }

    [Column("last_used_at")]
    public long? LastUsedAt { get; set; }

    [Column("created_at")]
    public long CreatedAt { get; set; }

    [Column("updated_at")]
    public long UpdatedAt { get; set; }
}

[Table("external_auth_requests")]
public class ExternalAuthRequest
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("provider")]
    public string Provider { get; set; } = string.Empty;

    [Column("state")]
    public string State { get; set; } = string.Empty;

    [Column("return_url")]
    public string ReturnUrl { get; set; } = "/profile";

    [Column("intent")]
    public string Intent { get; set; } = "signin";

    [Column("status")]
    public string Status { get; set; } = "pending";

    [Column("error")]
    public string? Error { get; set; }

    [Column("user_id")]
    public string? UserId { get; set; }

    [Column("created_at")]
    public long CreatedAt { get; set; }

    [Column("expires_at")]
    public long ExpiresAt { get; set; }

    [Column("completed_at")]
    public long? CompletedAt { get; set; }

    [Column("consumed_at")]
    public long? ConsumedAt { get; set; }
}

/// <summary>
/// Представляет товар каталога.
/// </summary>
[Table("products")]
public class Product
{
    /// <summary>
    /// Получает или задаёт ID товара.
    /// </summary>
    [Key]
    [Column("id")]
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт slug.
    /// </summary>
    [Column("slug")]
    public string Slug { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт категорию.
    /// </summary>
    [Column("category")]
    public string? Category { get; set; }

    /// <summary>
    /// Получает или задаёт признак новинки.
    /// </summary>
    [Column("is_new")]
    public bool IsNew { get; set; }

    /// <summary>
    /// Получает или задаёт признак популярности.
    /// </summary>
    [Column("is_popular")]
    public bool IsPopular { get; set; }

    /// <summary>
    /// Получает или задаёт количество лайков.
    /// </summary>
    [Column("likes_count")]
    public int LikesCount { get; set; }

    /// <summary>
    /// Получает или задаёт время создания в миллисекундах Unix.
    /// </summary>
    [Column("creation_time")]
    public long CreationTime { get; set; }

    [Column("is_hidden")]
    public bool IsHidden { get; set; }

    [Column("hidden_at")]
    public long? HiddenAt { get; set; }

    [Column("hidden_by_user_id")]
    public string? HiddenByUserId { get; set; }

    /// <summary>
    /// Получает или задаёт исходные JSON-данные товара.
    /// </summary>
    [Column("data", TypeName = "jsonb")]
    public string Data { get; set; } = "{}";
}

[Table("product_reviews")]
public class ProductReview
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("product_id")]
    public string ProductId { get; set; } = string.Empty;

    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Column("author_name")]
    public string AuthorName { get; set; } = string.Empty;

    [Column("text")]
    public string Text { get; set; } = string.Empty;

    [Column("media_json", TypeName = "jsonb")]
    public string MediaJson { get; set; } = "[]";

    [Column("created_at")]
    public long CreatedAt { get; set; }

    [Column("edited_at")]
    public long? EditedAt { get; set; }

    [Column("is_hidden")]
    public bool IsHidden { get; set; }

    [Column("hidden_at")]
    public long? HiddenAt { get; set; }

    [Column("hidden_by_user_id")]
    public string? HiddenByUserId { get; set; }

    [Column("is_deleted")]
    public bool IsDeleted { get; set; }

    [Column("deleted_at")]
    public long? DeletedAt { get; set; }

    [Column("deleted_by_user_id")]
    public string? DeletedByUserId { get; set; }

    [Column("deleted_by_role")]
    public string? DeletedByRole { get; set; }
}

[Table("size_dictionaries")]
public class SizeDictionary
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("slug")]
    public string Slug { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    [Column("color")]
    public string? Color { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("show_in_catalog_filter")]
    public bool ShowInCatalogFilter { get; set; } = true;

    [Column("show_color_in_catalog")]
    public bool ShowColorInCatalog { get; set; } = true;

    [Column("sort_order")]
    public int SortOrder { get; set; }

    [Column("created_at")]
    public long CreatedAt { get; set; }
}

[Table("material_dictionaries")]
public class MaterialDictionary
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("slug")]
    public string Slug { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    [Column("color")]
    public string? Color { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("show_in_catalog_filter")]
    public bool ShowInCatalogFilter { get; set; } = true;

    [Column("show_color_in_catalog")]
    public bool ShowColorInCatalog { get; set; } = true;

    [Column("sort_order")]
    public int SortOrder { get; set; }

    [Column("created_at")]
    public long CreatedAt { get; set; }
}

[Table("color_dictionaries")]
public class ColorDictionary
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("slug")]
    public string Slug { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    [Column("color")]
    public string? Color { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("show_in_catalog_filter")]
    public bool ShowInCatalogFilter { get; set; } = true;

    [Column("show_color_in_catalog")]
    public bool ShowColorInCatalog { get; set; } = true;

    [Column("sort_order")]
    public int SortOrder { get; set; }

    [Column("created_at")]
    public long CreatedAt { get; set; }
}

[Table("category_dictionaries")]
public class CategoryDictionary
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("slug")]
    public string Slug { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    [Column("color")]
    public string? Color { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("show_in_catalog_filter")]
    public bool ShowInCatalogFilter { get; set; } = true;

    [Column("show_color_in_catalog")]
    public bool ShowColorInCatalog { get; set; } = true;

    [Column("sort_order")]
    public int SortOrder { get; set; }

    [Column("created_at")]
    public long CreatedAt { get; set; }
}

[Table("collection_dictionaries")]
public class CollectionDictionary
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("slug")]
    public string Slug { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    [Column("color")]
    public string? Color { get; set; }

    [Column("image_url")]
    public string? ImageUrl { get; set; }

    [Column("preview_mode")]
    public string PreviewMode { get; set; } = "gallery";

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("show_in_catalog_filter")]
    public bool ShowInCatalogFilter { get; set; }

    [Column("show_color_in_catalog")]
    public bool ShowColorInCatalog { get; set; } = true;

    [Column("sort_order")]
    public int SortOrder { get; set; }

    [Column("created_at")]
    public long CreatedAt { get; set; }
}

[Table("product_size_stocks")]
public class ProductSizeStock
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("product_id")]
    public string ProductId { get; set; } = string.Empty;

    [Column("size_id")]
    public string SizeId { get; set; } = string.Empty;

    [Column("stock")]
    public int Stock { get; set; }
}

[Table("stock_change_history")]
public class StockChangeHistory
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("product_id")]
    public string ProductId { get; set; } = string.Empty;

    [Column("size_id")]
    public string SizeId { get; set; } = string.Empty;

    [Column("changed_by_user_id")]
    public string ChangedByUserId { get; set; } = string.Empty;

    [Column("reason")]
    public string Reason { get; set; } = "admin_manual";

    [Column("order_id")]
    public string? OrderId { get; set; }

    [Column("old_value")]
    public int OldValue { get; set; }

    [Column("new_value")]
    public int NewValue { get; set; }

    [Column("changed_at")]
    public long ChangedAt { get; set; }
}

[Table("price_change_history")]
public class PriceChangeHistory
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("product_id")]
    public string ProductId { get; set; } = string.Empty;

    [Column("changed_by_user_id")]
    public string ChangedByUserId { get; set; } = string.Empty;

    [Column("field_name")]
    public string FieldName { get; set; } = string.Empty;

    [Column("old_value")]
    public decimal? OldValue { get; set; }

    [Column("new_value")]
    public decimal? NewValue { get; set; }

    [Column("changed_at")]
    public long ChangedAt { get; set; }
}

/// <summary>
/// Представляет элемент корзины.
/// </summary>
[Table("cart_items")]
public class CartItem
{
    /// <summary>
    /// Получает или задаёт ID позиции корзины.
    /// </summary>
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    /// <summary>
    /// Получает или задаёт ID пользователя.
    /// </summary>
    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт ID товара.
    /// </summary>
    [Column("product_id")]
    public string ProductId { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт размер товара.
    /// </summary>
    [Column("size")]
    public string Size { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт количество.
    /// </summary>
    [Column("quantity")]
    public int Quantity { get; set; }
}

/// <summary>
/// Представляет связь лайка пользователя и товара.
/// </summary>
[Table("likes")]
public class Like
{
    /// <summary>
    /// Получает или задаёт ID лайка.
    /// </summary>
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    /// <summary>
    /// Получает или задаёт ID пользователя.
    /// </summary>
    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Получает или задаёт ID товара.
    /// </summary>
    [Column("product_id")]
    public string ProductId { get; set; } = string.Empty;
}

/// <summary>
/// Представляет событие изменения избранного пользователя.
/// </summary>
[Table("favorite_events")]
public class FavoriteEvent
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Column("product_id")]
    public string ProductId { get; set; } = string.Empty;

    [Column("event_type")]
    public string EventType { get; set; } = "added";

    [Column("created_at")]
    public long CreatedAt { get; set; }
}

/// <summary>
/// Представляет событие входа пользователя.
/// </summary>
[Table("auth_events")]
public class AuthEvent
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Column("provider")]
    public string Provider { get; set; } = "email";

    [Column("event_type")]
    public string EventType { get; set; } = "login";

    [Column("created_at")]
    public long CreatedAt { get; set; }
}

/// <summary>
/// Представляет запись заказа.
/// </summary>
[Table("product_views")]
public class ProductView
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("product_id")]
    public string ProductId { get; set; } = string.Empty;

    [Column("user_id")]
    public string? UserId { get; set; }

    [Column("visitor_id")]
    public string? VisitorId { get; set; }

    [Column("viewer_key")]
    public string ViewerKey { get; set; } = string.Empty;

    [Column("day_key")]
    public int DayKey { get; set; }

    [Column("view_count")]
    public int ViewCount { get; set; }

    [Column("first_viewed_at")]
    public long FirstViewedAt { get; set; }

    [Column("last_viewed_at")]
    public long LastViewedAt { get; set; }
}

[Table("orders")]
public class Order
{
    /// <summary>
    /// Получает или задаёт ID заказа.
    /// </summary>
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    /// <summary>
    /// Получает или задаёт ID пользователя.
    /// </summary>
    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Column("order_number")]
    public int OrderNumber { get; set; }

    /// <summary>
    /// Получает или задаёт сериализованные позиции заказа.
    /// </summary>
    [Column("items_json", TypeName = "jsonb")]
    public string ItemsJson { get; set; } = "[]";

    /// <summary>
    /// Получает или задаёт общую сумму.
    /// </summary>
    [Column("total_amount")]
    public double TotalAmount { get; set; }

    /// <summary>
    /// Получает или задаёт статус заказа.
    /// </summary>
    [Column("status")]
    public string Status { get; set; } = "processing";

    [Column("payment_method")]
    public string PaymentMethod { get; set; } = "cod";

    [Column("purchase_channel")]
    public string PurchaseChannel { get; set; } = "web";

    [Column("shipping_method")]
    public string ShippingMethod { get; set; } = "home";

    [Column("shipping_amount")]
    public double ShippingAmount { get; set; }

    [Column("pickup_point_id")]
    public string? PickupPointId { get; set; }

    [Column("yandex_request_id")]
    public string? YandexRequestId { get; set; }

    [Column("yandex_delivery_status")]
    public string? YandexDeliveryStatus { get; set; }

    [Column("yandex_delivery_status_description")]
    public string? YandexDeliveryStatusDescription { get; set; }

    [Column("yandex_delivery_status_reason")]
    public string? YandexDeliveryStatusReason { get; set; }

    [Column("yandex_delivery_status_updated_at")]
    public long? YandexDeliveryStatusUpdatedAt { get; set; }

    [Column("yandex_delivery_status_synced_at")]
    public long? YandexDeliveryStatusSyncedAt { get; set; }

    [Column("yandex_delivery_tracking_url")]
    public string? YandexDeliveryTrackingUrl { get; set; }

    [Column("yandex_pickup_code")]
    public string? YandexPickupCode { get; set; }

    [Column("yandex_delivery_last_sync_error")]
    public string? YandexDeliveryLastSyncError { get; set; }

    [Column("shipping_address")]
    public string ShippingAddress { get; set; } = string.Empty;

    [Column("customer_name")]
    public string CustomerName { get; set; } = string.Empty;

    [Column("customer_email")]
    public string CustomerEmail { get; set; } = string.Empty;

    [Column("customer_phone")]
    public string CustomerPhone { get; set; } = string.Empty;

    [Column("status_history_json", TypeName = "jsonb")]
    public string StatusHistoryJson { get; set; } = "[]";

    /// <summary>
    /// Получает или задаёт время создания в миллисекундах Unix.
    /// </summary>
    [Column("created_at")]
    public long CreatedAt { get; set; }

    [Column("updated_at")]
    public long UpdatedAt { get; set; }
}

[Table("order_payments")]
public class OrderPayment
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("order_id")]
    public string OrderId { get; set; } = string.Empty;

    [Column("provider")]
    public string Provider { get; set; } = "yoomoney";

    [Column("payment_method")]
    public string PaymentMethod { get; set; } = "yoomoney_card";

    [Column("payment_type")]
    public string PaymentType { get; set; } = "AC";

    [Column("status")]
    public string Status { get; set; } = "pending";

    [Column("currency")]
    public string Currency { get; set; } = "RUB";

    [Column("requested_amount")]
    public double RequestedAmount { get; set; }

    [Column("charge_amount")]
    public double ChargeAmount { get; set; }

    [Column("expected_received_amount")]
    public double ExpectedReceivedAmount { get; set; }

    [Column("received_amount")]
    public double? ReceivedAmount { get; set; }

    [Column("actual_withdraw_amount")]
    public double? ActualWithdrawAmount { get; set; }

    [Column("receiver_account")]
    public string ReceiverAccount { get; set; } = string.Empty;

    [Column("label")]
    public string Label { get; set; } = string.Empty;

    [Column("operation_id")]
    public string? OperationId { get; set; }

    [Column("notification_type")]
    public string? NotificationType { get; set; }

    [Column("sender")]
    public string? Sender { get; set; }

    [Column("return_url")]
    public string? ReturnUrl { get; set; }

    [Column("expires_at")]
    public long? ExpiresAt { get; set; }

    [Column("paid_at")]
    public long? PaidAt { get; set; }

    [Column("last_checked_at")]
    public long? LastCheckedAt { get; set; }

    [Column("last_error")]
    public string? LastError { get; set; }

    [Column("last_payload_json", TypeName = "jsonb")]
    public string? LastPayloadJson { get; set; }

    [Column("verification_source")]
    public string? VerificationSource { get; set; }

    [Column("created_at")]
    public long CreatedAt { get; set; }

    [Column("updated_at")]
    public long UpdatedAt { get; set; }
}
