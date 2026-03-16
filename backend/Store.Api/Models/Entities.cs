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

    /// <summary>
    /// Получает или задаёт никнейм.
    /// </summary>
    [Column("nickname")]
    public string? Nickname { get; set; }
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

    /// <summary>
    /// Получает или задаёт исходные JSON-данные товара.
    /// </summary>
    [Column("data", TypeName = "jsonb")]
    public string Data { get; set; } = "{}";
}

[Table("size_dictionaries")]
public class SizeDictionary
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    [Column("color")]
    public string? Color { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

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

    [Column("description")]
    public string? Description { get; set; }

    [Column("color")]
    public string? Color { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

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

    [Column("description")]
    public string? Description { get; set; }

    [Column("color")]
    public string? Color { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

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

    [Column("description")]
    public string? Description { get; set; }

    [Column("color")]
    public string? Color { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

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
/// Представляет запись заказа.
/// </summary>
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

    /// <summary>
    /// Получает или задаёт время создания в миллисекундах Unix.
    /// </summary>
    [Column("created_at")]
    public long CreatedAt { get; set; }
}
