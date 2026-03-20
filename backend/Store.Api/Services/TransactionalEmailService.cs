using System.Globalization;
using System.Net;
using System.Net.Mail;
using System.Text.Json;
using System.Text.RegularExpressions;
using MailKit.Security;
using Microsoft.EntityFrameworkCore;
using MimeKit;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;
using MailKitSmtpClient = MailKit.Net.Smtp.SmtpClient;

namespace Store.Api.Services;

public sealed record EmailTemplateDefinition(
    string Key,
    string Label,
    string Description,
    bool EnabledByDefault,
    string DefaultSubject,
    string DefaultBody,
    IReadOnlyList<string> Placeholders);

public sealed record EmailSendResult(bool Success, string Detail);

public static class EmailTemplateCatalog
{
    public const string PasswordReset = "password_reset";
    public const string OrderCreated = "order_created";
    public const string OrderShipped = "order_shipped";
    public const string OrderStatusChanged = "order_status_changed";
    public const string EmailConfirmation = "email_confirmation";
    public const string TelegramConnected = "telegram_connected";

    public static readonly IReadOnlyList<EmailTemplateDefinition> Definitions =
    [
        new(
            PasswordReset,
            "Сброс пароля",
            "Письмо с кодом для восстановления доступа.",
            true,
            "Сброс пароля — {{site_title}}",
            "Здравствуйте!\n\nВы запросили сброс пароля на сайте {{site_title}}.\n\nКод для сброса пароля: {{code}}\nКод действует {{ttl_minutes}} минут.\n\nЕсли это были не вы, просто проигнорируйте это письмо.",
            ["site_title", "code", "ttl_minutes", "user_email", "current_date_time"]),
        new(
            OrderCreated,
            "Создание заказа",
            "Уведомление клиенту после оформления заказа.",
            true,
            "Заказ {{order_number}} создан",
            "Здравствуйте, {{customer_name}}!\n\nВаш заказ {{order_number}} успешно создан на сайте {{site_title}}.\n\nСумма: {{total_amount}}\nСпособ оплаты: {{payment_method_label}}\nАдрес доставки: {{shipping_address}}\n\nСостав заказа:\n{{order_items}}\n\nМы сообщим вам, когда статус заказа изменится.",
            ["site_title", "order_number", "customer_name", "total_amount", "payment_method_label", "shipping_address", "order_items", "current_date_time"]),
        new(
            OrderShipped,
            "Отправка заказа",
            "Письмо, когда заказ передан в доставку.",
            true,
            "Заказ {{order_number}} передан в доставку",
            "Здравствуйте, {{customer_name}}!\n\nЗаказ {{order_number}} передан в доставку.\n\nТекущий статус: {{order_status_label}}\nАдрес доставки: {{shipping_address}}\nКомментарий менеджера: {{manager_comment}}\n\nСпасибо, что выбрали {{site_title}}.",
            ["site_title", "order_number", "customer_name", "order_status_label", "shipping_address", "manager_comment", "current_date_time"]),
        new(
            OrderStatusChanged,
            "Смена статуса заказа",
            "Общее письмо о смене статуса заказа.",
            true,
            "Статус заказа {{order_number}} обновлён",
            "Здравствуйте, {{customer_name}}!\n\nСтатус заказа {{order_number}} изменён.\n\nБыло: {{previous_order_status_label}}\nСтало: {{order_status_label}}\nКомментарий менеджера: {{manager_comment}}\n\nАктуальный состав заказа:\n{{order_items}}",
            ["order_number", "customer_name", "previous_order_status_label", "order_status_label", "manager_comment", "order_items", "current_date_time"]),
        new(
            EmailConfirmation,
            "Подтверждение email",
            "Письмо с кодом подтверждения email.",
            true,
            "Подтверждение email — {{site_title}}",
            "Здравствуйте!\n\nКод подтверждения email для сайта {{site_title}}: {{code}}\nКод действует {{ttl_minutes}} минут.\n\nEmail: {{user_email}}",
            ["site_title", "code", "ttl_minutes", "user_email", "current_date_time"]),
        new(
            TelegramConnected,
            "Подключение Telegram",
            "Уведомление о подключении Telegram-аккаунта.",
            false,
            "Telegram подключён к вашему профилю",
            "Здравствуйте!\n\nК вашему профилю {{user_email}} подключён Telegram-аккаунт.\n\nTelegram ID: {{telegram_id}}\nUsername: {{telegram_username}}\nДата подключения: {{connected_at}}",
            ["user_email", "telegram_id", "telegram_username", "connected_at", "current_date_time"])
    ];

    public static string GetSettingKey(string templateKey, string field)
        => $"email_template_{templateKey}_{field}";

    public static EmailTemplateDefinition? Find(string templateKey)
        => Definitions.FirstOrDefault(x => string.Equals(x.Key, templateKey, StringComparison.OrdinalIgnoreCase));

    public static Dictionary<string, string> BuildDefaultSettings()
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var definition in Definitions)
        {
            result[GetSettingKey(definition.Key, "enabled")] = definition.EnabledByDefault ? "true" : "false";
            result[GetSettingKey(definition.Key, "subject")] = definition.DefaultSubject;
            result[GetSettingKey(definition.Key, "body")] = definition.DefaultBody;
        }

        return result;
    }
}

public class TransactionalEmailService
{
    private static readonly Regex TemplateVariableRegex = new(@"\{\{\s*(?<key>[a-zA-Z0-9_]+)\s*\}\}", RegexOptions.Compiled);
    private const string SmtpSecurityModeAuto = "auto";
    private const string SmtpSecurityModeNone = "none";
    private const string SmtpSecurityModeStartTls = "starttls";
    private const string SmtpSecurityModeSslOnConnect = "ssl_on_connect";

    private static readonly IReadOnlyDictionary<string, string> OrderStatusLabels = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["processing"] = "В обработке",
        ["created"] = "Оформлен",
        ["paid"] = "Оплачен",
        ["in_transit"] = "В пути",
        ["delivered"] = "Доставлен",
        ["completed"] = "Завершен",
        ["canceled"] = "Отменен",
        ["cancelled"] = "Отменен",
        ["returned"] = "Возврат"
    };

    private static readonly IReadOnlyDictionary<string, string> PaymentMethodLabels = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["cod"] = "Оплата при получении",
        ["card"] = "Банковская карта",
        ["sbp"] = "СБП",
        ["cash"] = "Наличные"
    };

    private static readonly IReadOnlyDictionary<string, string> PurchaseChannelLabels = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["web"] = "Сайт",
        ["mobile"] = "Мобильное приложение",
        ["admin"] = "Администратор"
    };

    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly ILogger<TransactionalEmailService> _logger;

    private sealed record LoadedTemplate(bool Enabled, string Subject, string Body);

    private sealed record SmtpConfiguration(
        bool Enabled,
        string Host,
        int Port,
        string Username,
        string Password,
        string FromEmail,
        string FromName,
        bool UseSsl,
        string SecurityMode,
        string SiteTitle);

    private sealed record ParsedOrderItem(string ProductId, string Size, int Quantity);

    public TransactionalEmailService(StoreDbContext db, IConfiguration configuration, ILogger<TransactionalEmailService> logger)
    {
        _db = db;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<EmailSendResult> SendTestEmailAsync(SmtpTestEmailPayload payload, CancellationToken cancellationToken = default)
    {
        var recipientEmail = NormalizeEmail(payload.ToEmail);
        if (!IsValidEmail(recipientEmail))
            return new EmailSendResult(false, "Укажите корректный email для тестового письма.");

        var smtp = BuildSmtpConfiguration(payload);
        if (!smtp.Enabled)
            return new EmailSendResult(false, "SMTP отключен. Включите отправку email перед тестом.");

        if (string.IsNullOrWhiteSpace(smtp.Host) || string.IsNullOrWhiteSpace(smtp.FromEmail))
            return new EmailSendResult(false, "Для теста заполните SMTP Host и From Email.");

        var body =
            $"Это тестовое письмо от {smtp.SiteTitle}.\n\n" +
            $"Дата: {DateTimeOffset.Now:dd.MM.yyyy HH:mm:ss}\n" +
            $"SMTP Host: {smtp.Host}\n" +
            $"SMTP Port: {smtp.Port}\n" +
            $"From: {smtp.FromName} <{smtp.FromEmail}>\n" +
            $"SSL/TLS: {(smtp.UseSsl ? "включен" : "выключен")}\n";

        return await SendEmailAsync(
            smtp,
            recipientEmail,
            $"Тест SMTP — {smtp.SiteTitle}",
            body,
            swallowFailures: false,
            cancellationToken);
    }

    public async Task TrySendPasswordResetEmailAsync(string email, string code, int ttlMinutes, CancellationToken cancellationToken = default)
    {
        await TrySendTemplateEmailAsync(
            EmailTemplateCatalog.PasswordReset,
            email,
            new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
            {
                ["user_email"] = NormalizeEmail(email),
                ["code"] = code,
                ["ttl_minutes"] = ttlMinutes.ToString(CultureInfo.InvariantCulture)
            },
            cancellationToken);
    }

    public async Task TrySendEmailConfirmationEmailAsync(string email, string code, int ttlMinutes, CancellationToken cancellationToken = default)
    {
        await TrySendTemplateEmailAsync(
            EmailTemplateCatalog.EmailConfirmation,
            email,
            new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
            {
                ["user_email"] = NormalizeEmail(email),
                ["code"] = code,
                ["ttl_minutes"] = ttlMinutes.ToString(CultureInfo.InvariantCulture)
            },
            cancellationToken);
    }

    public async Task TrySendOrderCreatedEmailAsync(Order order, CancellationToken cancellationToken = default)
    {
        var recipientEmail = await ResolveNotificationEmailAsync(order.UserId, order.CustomerEmail, cancellationToken);
        if (string.IsNullOrWhiteSpace(recipientEmail))
            return;

        var variables = await BuildOrderVariablesAsync(order, previousStatus: null, managerComment: null, cancellationToken);
        await TrySendTemplateEmailAsync(EmailTemplateCatalog.OrderCreated, recipientEmail, variables, cancellationToken);
    }

    public async Task TrySendOrderStatusChangedEmailAsync(Order order, string previousStatus, string? managerComment, CancellationToken cancellationToken = default)
    {
        var recipientEmail = await ResolveNotificationEmailAsync(order.UserId, order.CustomerEmail, cancellationToken);
        if (string.IsNullOrWhiteSpace(recipientEmail))
            return;

        var templateKey = string.Equals(NormalizeOrderStatus(order.Status), "in_transit", StringComparison.OrdinalIgnoreCase)
            ? EmailTemplateCatalog.OrderShipped
            : EmailTemplateCatalog.OrderStatusChanged;

        var variables = await BuildOrderVariablesAsync(order, previousStatus, managerComment, cancellationToken);
        await TrySendTemplateEmailAsync(templateKey, recipientEmail, variables, cancellationToken);
    }

    public async Task TrySendTelegramConnectedEmailAsync(string userId, string? telegramId, string? telegramUsername, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(userId))
            return;

        var recipientEmail = await ResolveNotificationEmailAsync(userId, null, cancellationToken);
        if (string.IsNullOrWhiteSpace(recipientEmail))
            return;

        var user = await _db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken);
        var profile = await _db.Profiles
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.UserId == userId, cancellationToken);

        var variables = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["user_email"] = recipientEmail,
            ["user_name"] = profile?.Name,
            ["telegram_id"] = telegramId,
            ["telegram_username"] = string.IsNullOrWhiteSpace(telegramUsername) ? profile?.Nickname : telegramUsername,
            ["connected_at"] = DateTimeOffset.Now.ToString("dd.MM.yyyy HH:mm:ss", CultureInfo.GetCultureInfo("ru-RU")),
            ["account_id"] = user?.Id
        };

        await TrySendTemplateEmailAsync(EmailTemplateCatalog.TelegramConnected, recipientEmail, variables, cancellationToken);
    }

    private async Task TrySendTemplateEmailAsync(
        string templateKey,
        string recipientEmail,
        IDictionary<string, string?> variables,
        CancellationToken cancellationToken)
    {
        var normalizedRecipient = NormalizeEmail(recipientEmail);
        if (!IsValidEmail(normalizedRecipient))
            return;

        var smtp = await LoadSmtpConfigurationAsync(cancellationToken);
        if (!smtp.Enabled)
        {
            _logger.LogInformation("Skipping email template {TemplateKey}: SMTP is disabled.", templateKey);
            return;
        }

        if (string.IsNullOrWhiteSpace(smtp.Host) || string.IsNullOrWhiteSpace(smtp.FromEmail))
        {
            _logger.LogWarning("Skipping email template {TemplateKey}: SMTP host or from email is missing.", templateKey);
            return;
        }

        var template = await LoadTemplateAsync(templateKey, cancellationToken);
        if (!template.Enabled)
        {
            _logger.LogInformation("Skipping email template {TemplateKey}: template is disabled.", templateKey);
            return;
        }

        var mergedVariables = BuildCommonVariables(smtp);
        foreach (var (key, value) in variables)
            mergedVariables[key] = value ?? string.Empty;

        var subject = RenderTemplate(template.Subject, mergedVariables);
        var body = RenderTemplate(template.Body, mergedVariables);

        var result = await SendEmailAsync(smtp, normalizedRecipient, subject, body, swallowFailures: true, cancellationToken);
        if (!result.Success)
        {
            _logger.LogWarning(
                "Failed to deliver template email {TemplateKey} to {Recipient}: {Detail}",
                templateKey,
                normalizedRecipient,
                result.Detail);
        }
    }

    private async Task<LoadedTemplate> LoadTemplateAsync(string templateKey, CancellationToken cancellationToken)
    {
        var definition = EmailTemplateCatalog.Find(templateKey)
            ?? throw new InvalidOperationException($"Unknown email template '{templateKey}'.");

        var enabledKey = EmailTemplateCatalog.GetSettingKey(templateKey, "enabled");
        var subjectKey = EmailTemplateCatalog.GetSettingKey(templateKey, "subject");
        var bodyKey = EmailTemplateCatalog.GetSettingKey(templateKey, "body");

        var settings = await _db.AppSettings
            .AsNoTracking()
            .Where(x => x.Key == enabledKey || x.Key == subjectKey || x.Key == bodyKey)
            .ToListAsync(cancellationToken);
        var map = settings.ToDictionary(x => x.Key, x => x.Value, StringComparer.OrdinalIgnoreCase);

        var enabled = map.TryGetValue(enabledKey, out var enabledRaw)
            ? ParseBoolean(enabledRaw, definition.EnabledByDefault)
            : definition.EnabledByDefault;
        var subject = map.TryGetValue(subjectKey, out var subjectRaw) && !string.IsNullOrWhiteSpace(subjectRaw)
            ? subjectRaw
            : definition.DefaultSubject;
        var body = map.TryGetValue(bodyKey, out var bodyRaw) && !string.IsNullOrWhiteSpace(bodyRaw)
            ? bodyRaw
            : definition.DefaultBody;

        return new LoadedTemplate(enabled, subject, body);
    }

    private async Task<SmtpConfiguration> LoadSmtpConfigurationAsync(CancellationToken cancellationToken)
    {
        var keys = new[]
        {
            "smtp_enabled",
            "smtp_host",
            "smtp_port",
            "smtp_username",
            "smtp_password",
            "smtp_from_email",
            "smtp_from_name",
            "smtp_security_mode",
            "smtp_use_ssl",
            "site_title"
        };

        var settings = await _db.AppSettings
            .AsNoTracking()
            .Where(x => keys.Contains(x.Key))
            .ToListAsync(cancellationToken);
        var map = settings.ToDictionary(x => x.Key, x => x.Value, StringComparer.OrdinalIgnoreCase);

        var enabled = ParseBoolean(map.GetValueOrDefault("smtp_enabled") ?? _configuration["Email:SmtpEnabled"], false);
        var host = (map.GetValueOrDefault("smtp_host") ?? _configuration["Email:SmtpHost"] ?? string.Empty).Trim();
        var portRaw = (map.GetValueOrDefault("smtp_port") ?? _configuration["Email:SmtpPort"] ?? "587").Trim();
        var username = map.GetValueOrDefault("smtp_username") ?? _configuration["Email:SmtpUsername"] ?? string.Empty;
        var password = map.GetValueOrDefault("smtp_password") ?? _configuration["Email:SmtpPassword"] ?? string.Empty;
        var fromEmail = NormalizeEmail(map.GetValueOrDefault("smtp_from_email") ?? _configuration["Email:FromEmail"]);
        var fromName = (map.GetValueOrDefault("smtp_from_name") ?? _configuration["Email:FromName"] ?? "Fashion Demon").Trim();
        var useSsl = ParseBoolean(map.GetValueOrDefault("smtp_use_ssl") ?? _configuration["Email:SmtpUseSsl"], true);
        var securityMode = NormalizeSmtpSecurityMode(
            map.GetValueOrDefault("smtp_security_mode") ?? _configuration["Email:SmtpSecurityMode"],
            portRaw,
            useSsl);
        var siteTitle = (map.GetValueOrDefault("site_title") ?? "fashiondemon").Trim();
        var port = int.TryParse(portRaw, out var parsedPort) && parsedPort > 0 ? parsedPort : 587;

        return new SmtpConfiguration(
            enabled,
            host,
            port,
            username.Trim(),
            password,
            fromEmail,
            string.IsNullOrWhiteSpace(fromName) ? "Fashion Demon" : fromName,
            useSsl,
            securityMode,
            string.IsNullOrWhiteSpace(siteTitle) ? "fashiondemon" : siteTitle);
    }

    private static SmtpConfiguration BuildSmtpConfiguration(SmtpTestEmailPayload payload)
    {
        var host = (payload.Host ?? string.Empty).Trim();
        var fromEmail = NormalizeEmail(payload.FromEmail);
        var fromName = (payload.FromName ?? "Fashion Demon").Trim();
        var port = int.TryParse(payload.Port?.Trim(), out var parsedPort) && parsedPort > 0 ? parsedPort : 587;
        return new SmtpConfiguration(
            payload.Enabled,
            host,
            port,
            (payload.Username ?? string.Empty).Trim(),
            payload.Password ?? string.Empty,
            fromEmail,
            string.IsNullOrWhiteSpace(fromName) ? "Fashion Demon" : fromName,
            payload.UseSsl,
            NormalizeSmtpSecurityMode(payload.SecurityMode, payload.Port, payload.UseSsl),
            "fashiondemon");
    }

    private async Task<Dictionary<string, string?>> BuildOrderVariablesAsync(
        Order order,
        string? previousStatus,
        string? managerComment,
        CancellationToken cancellationToken)
    {
        var items = OrderPresentation.ParseStoredOrderItems(order.ItemsJson);
        var productIds = items
            .Select(x => x.ProductId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var productSnapshots = productIds.Count == 0
            ? new Dictionary<string, ProductOrderSnapshot>(StringComparer.Ordinal)
            : (await _db.Products
                .AsNoTracking()
                .Where(x => productIds.Contains(x.Id))
                .ToListAsync(cancellationToken))
                .Select(OrderPresentation.BuildProductSnapshot)
                .ToDictionary(x => x.ProductId, StringComparer.Ordinal);

        var orderItems = items.Count == 0
            ? "Состав заказа не указан."
            : string.Join(
                Environment.NewLine,
                items.Select(item =>
                {
                    var productName = item.ProductName ?? productSnapshots.GetValueOrDefault(item.ProductId)?.Name ?? item.ProductId;
                    var sizePart = string.IsNullOrWhiteSpace(item.Size) ? string.Empty : $" / {item.Size}";
                    return $"- {productName}{sizePart} x {item.Quantity}";
                }));

        var normalizedStatus = NormalizeOrderStatus(order.Status);
        var normalizedPreviousStatus = NormalizeOrderStatus(previousStatus);
        var formattedOrderNumber = OrderPresentation.FormatOrderNumber(order.OrderNumber);
        var resolvedOrderNumber = string.IsNullOrWhiteSpace(formattedOrderNumber) ? order.Id : formattedOrderNumber;
        var formattedTotal = OrderPresentation.FormatRubles(order.TotalAmount);

        return new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["order_id"] = order.Id,
            ["order_number"] = resolvedOrderNumber,
            ["order_status"] = normalizedStatus,
            ["order_status_label"] = GetDictionaryValue(OrderStatusLabels, normalizedStatus),
            ["previous_order_status"] = normalizedPreviousStatus,
            ["previous_order_status_label"] = GetDictionaryValue(OrderStatusLabels, normalizedPreviousStatus),
            ["payment_method"] = NormalizeKey(order.PaymentMethod),
            ["payment_method_label"] = GetDictionaryValue(PaymentMethodLabels, order.PaymentMethod),
            ["purchase_channel"] = NormalizeKey(order.PurchaseChannel),
            ["purchase_channel_label"] = GetDictionaryValue(PurchaseChannelLabels, order.PurchaseChannel),
            ["customer_name"] = string.IsNullOrWhiteSpace(order.CustomerName) ? "клиент" : order.CustomerName.Trim(),
            ["customer_email"] = NormalizeEmail(order.CustomerEmail),
            ["customer_phone"] = order.CustomerPhone?.Trim(),
            ["shipping_address"] = order.ShippingAddress?.Trim(),
            ["total_amount"] = formattedTotal,
            ["order_items"] = orderItems,
            ["manager_comment"] = string.IsNullOrWhiteSpace(managerComment) ? "без комментария" : managerComment.Trim()
        };
    }

    private async Task<string?> ResolveNotificationEmailAsync(string? userId, string? fallbackEmail, CancellationToken cancellationToken)
    {
        User? user = null;
        Profile? profile = null;

        if (!string.IsNullOrWhiteSpace(userId))
        {
            user = await _db.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken);
            profile = await _db.Profiles
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.UserId == userId, cancellationToken);
        }

        var candidates = new[]
        {
            profile?.Email,
            user?.Email,
            fallbackEmail
        };

        foreach (var candidate in candidates)
        {
            var normalized = NormalizeEmail(candidate);
            if (IsValidEmail(normalized) && !IsTelegramTechnicalEmail(normalized))
                return normalized;
        }

        return null;
    }

    private async Task<EmailSendResult> SendEmailAsync(
        SmtpConfiguration smtp,
        string recipientEmail,
        string subject,
        string body,
        bool swallowFailures,
        CancellationToken cancellationToken)
    {
        if (!smtp.Enabled)
            return new EmailSendResult(false, "SMTP disabled");

        if (string.IsNullOrWhiteSpace(smtp.Host) || string.IsNullOrWhiteSpace(smtp.FromEmail))
            return new EmailSendResult(false, "SMTP host or from email is missing");

        try
        {
            var mailMessage = new MimeMessage();
            mailMessage.From.Add(new MailboxAddress(smtp.FromName, smtp.FromEmail));
            mailMessage.To.Add(MailboxAddress.Parse(recipientEmail));
            mailMessage.Subject = string.IsNullOrWhiteSpace(subject) ? "Уведомление" : subject.Trim();
            mailMessage.Body = new TextPart("plain")
            {
                Text = string.IsNullOrWhiteSpace(body) ? "Письмо без текста." : body
            };

            using var mailClient = new MailKitSmtpClient();
            await mailClient.ConnectAsync(smtp.Host, smtp.Port, MapSecureSocketOptions(smtp.SecurityMode), cancellationToken);

            if (!string.IsNullOrWhiteSpace(smtp.Username))
                await mailClient.AuthenticateAsync(smtp.Username, smtp.Password, cancellationToken);

            await mailClient.SendAsync(mailMessage, cancellationToken);
            await mailClient.DisconnectAsync(true, cancellationToken);
            return new EmailSendResult(true, "Email sent");
#if false
            using var message = new MailMessage
            {
                From = new MailAddress(smtp.FromEmail, smtp.FromName),
                Subject = string.IsNullOrWhiteSpace(subject) ? "Уведомление" : subject.Trim(),
                Body = string.IsNullOrWhiteSpace(body) ? "Письмо без текста." : body,
                IsBodyHtml = false
            };
            message.To.Add(recipientEmail);

            using var client = new SmtpClient(smtp.Host, smtp.Port)
            {
                EnableSsl = smtp.UseSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                UseDefaultCredentials = false
            };

            if (!string.IsNullOrWhiteSpace(smtp.Username))
                client.Credentials = new NetworkCredential(smtp.Username, smtp.Password);

            await client.SendMailAsync(message, cancellationToken);
            return new EmailSendResult(true, "Email sent");
#endif
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SMTP send failed for {Recipient}", recipientEmail);
            var detail = BuildSmtpFailureMessage(ex, smtp);
            if (!swallowFailures)
                return new EmailSendResult(false, detail);

            return new EmailSendResult(false, detail);
        }
    }

    private static Dictionary<string, string> BuildCommonVariables(SmtpConfiguration smtp)
    {
        var now = DateTimeOffset.Now;
        return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["site_title"] = smtp.SiteTitle,
            ["support_email"] = smtp.FromEmail,
            ["from_name"] = smtp.FromName,
            ["current_date"] = now.ToString("dd.MM.yyyy", CultureInfo.GetCultureInfo("ru-RU")),
            ["current_time"] = now.ToString("HH:mm:ss", CultureInfo.GetCultureInfo("ru-RU")),
            ["current_date_time"] = now.ToString("dd.MM.yyyy HH:mm:ss", CultureInfo.GetCultureInfo("ru-RU")),
            ["year"] = now.ToString("yyyy", CultureInfo.InvariantCulture)
        };
    }

    private static string RenderTemplate(string template, IReadOnlyDictionary<string, string> variables)
    {
        return TemplateVariableRegex.Replace(template ?? string.Empty, match =>
        {
            var key = match.Groups["key"].Value;
            return variables.TryGetValue(key, out var value) ? value ?? string.Empty : string.Empty;
        });
    }

    private static List<ParsedOrderItem> ParseOrderItems(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Array)
                return [];

            var result = new List<ParsedOrderItem>();
            foreach (var element in document.RootElement.EnumerateArray())
            {
                var productId = element.TryGetProperty("productId", out var productIdEl) ? productIdEl.GetString()?.Trim() : null;
                var size = element.TryGetProperty("size", out var sizeEl) ? sizeEl.GetString()?.Trim() : null;
                var quantity = element.TryGetProperty("quantity", out var quantityEl) && quantityEl.TryGetInt32(out var parsedQuantity)
                    ? parsedQuantity
                    : 0;

                if (string.IsNullOrWhiteSpace(productId) || quantity <= 0)
                    continue;

                result.Add(new ParsedOrderItem(productId!, size ?? string.Empty, quantity));
            }

            return result;
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string ResolveProductName(Product product)
    {
        try
        {
            using var json = JsonDocument.Parse(product.Data);
            if (json.RootElement.TryGetProperty("name", out var nameElement))
            {
                var name = nameElement.GetString()?.Trim();
                if (!string.IsNullOrWhiteSpace(name))
                    return name!;
            }
        }
        catch (JsonException)
        {
        }

        return product.Slug;
    }

    private static string NormalizeOrderStatus(string? status)
    {
        var normalized = status?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "processing" : normalized;
    }

    private static string NormalizeKey(string? value)
        => value?.Trim().ToLowerInvariant() ?? string.Empty;

    private static string GetDictionaryValue(IReadOnlyDictionary<string, string> dictionary, string? key)
    {
        var normalized = NormalizeKey(key);
        if (dictionary.TryGetValue(normalized, out var label))
            return label;

        return normalized switch
        {
            "pending_payment" => "Ожидает оплаты",
            "yoomoney" => "ЮMoney",
            "yoomoney_card" => "ЮMoney: банковская карта",
            "yoomoney_wallet" => "ЮMoney: кошелек",
            "yookassa" => "YooKassa",
            "yookassa_card" => "YooKassa: банковская карта",
            "yookassa_sbp" => "YooKassa: СБП",
            "yookassa_yoomoney" => "YooKassa: ЮMoney",
            _ => normalized
        };
    }

    private static bool ParseBoolean(string? value, bool fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
            return fallback;

        return value.Trim().ToLowerInvariant() switch
        {
            "true" or "1" or "on" or "yes" => true,
            "false" or "0" or "off" or "no" => false,
            _ => fallback
        };
    }

    private static string NormalizeSmtpSecurityMode(string? rawValue, string? rawPort, bool useSslFallback)
    {
        var normalized = NormalizeKey(rawValue);
        if (normalized is SmtpSecurityModeAuto or SmtpSecurityModeNone or SmtpSecurityModeStartTls or SmtpSecurityModeSslOnConnect)
            return normalized;

        if (!useSslFallback)
            return SmtpSecurityModeNone;

        var port = int.TryParse(rawPort?.Trim(), out var parsedPort) ? parsedPort : 0;
        return port == 465 ? SmtpSecurityModeSslOnConnect : SmtpSecurityModeStartTls;
    }

    private static SecureSocketOptions MapSecureSocketOptions(string securityMode)
        => NormalizeKey(securityMode) switch
        {
            SmtpSecurityModeNone => SecureSocketOptions.None,
            SmtpSecurityModeStartTls => SecureSocketOptions.StartTls,
            SmtpSecurityModeSslOnConnect => SecureSocketOptions.SslOnConnect,
            _ => SecureSocketOptions.Auto
        };

    private static string DescribeSecurityMode(string securityMode)
        => NormalizeKey(securityMode) switch
        {
            SmtpSecurityModeNone => "без шифрования",
            SmtpSecurityModeStartTls => "STARTTLS",
            SmtpSecurityModeSslOnConnect => "SSL/TLS при подключении",
            _ => "авто"
        };

    private static string BuildSmtpFailureMessage(Exception exception, SmtpConfiguration smtp)
    {
        var baseMessage = exception.Message?.Trim();
        var selectedMode = DescribeSecurityMode(smtp.SecurityMode);

        if (exception is MailKit.Net.Smtp.SmtpCommandException
            or MailKit.ProtocolException
            or SslHandshakeException
            || (!string.IsNullOrWhiteSpace(baseMessage)
                && baseMessage.Contains("command unrecognized", StringComparison.OrdinalIgnoreCase)))
        {
            return $"Не удалось установить SMTP-соединение. Похоже, не подходит режим защиты для {smtp.Host}:{smtp.Port}. " +
                   $"Сейчас выбрано: {selectedMode}. Для 587 обычно нужен STARTTLS, для 465 - SSL/TLS при подключении.";
        }

        if (exception is System.Security.Authentication.AuthenticationException
            || (!string.IsNullOrWhiteSpace(baseMessage)
            && (baseMessage.Contains("authentication", StringComparison.OrdinalIgnoreCase)
                || baseMessage.Contains("auth", StringComparison.OrdinalIgnoreCase))))
        {
            return $"SMTP ответил ошибкой авторизации. Проверьте логин, пароль и режим защиты для {smtp.Host}:{smtp.Port}.";
        }

        return string.IsNullOrWhiteSpace(baseMessage)
            ? "Не удалось отправить письмо через SMTP."
            : baseMessage;
    }

    private static string NormalizeEmail(string? email)
        => (email ?? string.Empty).Trim().ToLowerInvariant();

    private static bool IsValidEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email))
            return false;

        try
        {
            var address = new MailAddress(email);
            return string.Equals(address.Address, email, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static bool IsTelegramTechnicalEmail(string? email)
    {
        return !string.IsNullOrWhiteSpace(email)
               && email.EndsWith("@telegram.local", StringComparison.OrdinalIgnoreCase)
               && email.StartsWith("telegram_", StringComparison.OrdinalIgnoreCase);
    }
}
