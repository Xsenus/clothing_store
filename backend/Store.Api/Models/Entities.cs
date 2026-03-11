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
