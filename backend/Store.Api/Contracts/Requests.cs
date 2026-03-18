namespace Store.Api.Contracts;

/// <summary>
/// Данные для аутентификации.
/// </summary>
public record AuthPayload(string Email, string Password);

/// <summary>
/// Данные для подтверждения кода.
/// </summary>
public record VerifyPayload(string Email, string Code);

/// <summary>
/// Данные для запроса сброса пароля.
/// </summary>
public record ResetRequestPayload(string Email);

/// <summary>
/// Данные для подтверждения сброса пароля.
/// </summary>
public record ResetConfirmPayload(string Email, string Code, string NewPassword);

/// <summary>
/// Данные обновления сессии по refresh-токену.
/// </summary>
public record RefreshPayload(string RefreshToken);

/// <summary>
/// Данные профиля пользователя.
/// </summary>
public record ProfilePayload(string? Name, string? Phone, string? ShippingAddress, string? Nickname, string? Email = null);

/// <summary>
/// Данные для добавления товара в корзину.
/// </summary>
public record CartItemPayload(string ProductId, string Size, int Quantity);

/// <summary>
/// Данные для обновления позиции корзины.
/// </summary>
public record CartUpdatePayload(int Quantity);

/// <summary>
/// Данные для переключения лайка.
/// </summary>
public record LikeTogglePayload(string ProductId);

/// <summary>
/// Данные отзыва.
/// </summary>
public record ReviewPayload(string Text, List<string>? Media);
public record ReviewModerationPayload(string Action);

/// <summary>
/// Данные для создания заказа.
/// </summary>
public record OrderPayload(
    List<Dictionary<string, object>> Items,
    double TotalAmount,
    string? Status,
    string? CustomerName,
    string? CustomerEmail,
    string? CustomerPhone,
    string? ShippingAddress,
    string? PaymentMethod,
    string? PurchaseChannel);

public record AdminOrderPatchPayload(
    string? Status,
    string? ShippingAddress,
    string? PaymentMethod,
    string? CustomerName,
    string? CustomerEmail,
    string? CustomerPhone,
    string? ManagerComment);

/// <summary>
/// Данные авторизации Telegram Login Widget.
/// </summary>
public record TelegramAuthPayload(
    string Id,
    string? FirstName,
    string? LastName,
    string? Username,
    string? PhotoUrl,
    string AuthDate,
    string Hash);

public record TelegramStartAuthPayload(string? ReturnUrl);

public record ContactChangeStartPayload(string Value);

public record ContactChangeConfirmPayload(string Value, string Code);

public record SmtpTestEmailPayload(
    string ToEmail,
    bool Enabled,
    string? Host,
    string? Port,
    string? Username,
    string? Password,
    string? FromEmail,
    string? FromName,
    bool UseSsl,
    string? SecurityMode);

/// <summary>
/// Параметры поиска адреса через DaData.
/// </summary>
public record AddressSuggestPayload(string Query, int? Count);

/// <summary>
/// Параметры расчёта стоимости доставки Яндекс.
/// </summary>
public record YandexDeliveryCalculatePayload(string ToAddress, decimal? WeightKg, decimal? DeclaredCost);

public record TelegramBotCommandPayload(string Command, string Description);

public record TelegramBotReplyTemplatePayload(
    string Key,
    string Label,
    string? Description,
    bool Enabled,
    string Text);

public record TelegramBotPayload(
    string Name,
    string Description,
    string? ShortDescription,
    string? ImageUrl,
    string Token,
    string? Username,
    bool Enabled,
    string? UpdateMode,
    bool UseForLogin,
    bool AutoRepliesEnabled,
    List<TelegramBotCommandPayload>? Commands,
    List<TelegramBotReplyTemplatePayload>? ReplyTemplates);

public record TelegramBotPatchPayload(
    string? Name,
    string? Description,
    string? ShortDescription,
    string? ImageUrl,
    string? Token,
    string? Username,
    bool? Enabled,
    string? UpdateMode,
    bool? UseForLogin,
    bool? AutoRepliesEnabled,
    List<TelegramBotCommandPayload>? Commands,
    List<TelegramBotReplyTemplatePayload>? ReplyTemplates);


public record TelegramBotValidatePayload(string Token);

public record DictionaryItemPayload(string Name, string? Slug, string? Description, string? Color, bool? IsActive, bool? ShowInCatalogFilter, bool? ShowColorInCatalog, int? SortOrder);

public record DictionaryItemPatchPayload(string? Name, string? Slug, string? Description, string? Color, bool? IsActive, bool? ShowInCatalogFilter, bool? ShowColorInCatalog, int? SortOrder);
