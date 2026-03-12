using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

public interface ITelegramBotManager
{
    Task<List<object>> GetBotsAsync();
    Task<object> CreateBotAsync(TelegramBotPayload payload);
    Task<object?> UpdateBotAsync(string id, TelegramBotPatchPayload payload);
    Task<bool> DeleteBotAsync(string id);
    Task<object?> CheckBotAsync(string id);
    Task<bool> HandleWebhookUpdateAsync(string id, string? secret, JsonElement update, CancellationToken token);
    Task<object> ValidateTokenAsync(string token);
    Task SyncNowAsync();
}

public class TelegramBotManager : BackgroundService, ITelegramBotManager
{
    private const int MaxBotNameLength = 64;
    private const int MaxDescriptionLength = 512;
    private const int MaxShortDescriptionLength = 120;
    private const int MaxCommandsCount = 100;
    private const int MaxCommandLength = 32;
    private const int MaxCommandDescriptionLength = 256;
    private const int MaxReplyTextLength = 4096;
    private const int MaxProfilePhotoBytes = 10 * 1024 * 1024;

    private static readonly Regex TelegramCommandPattern = new("^[a-z0-9_]{1,32}$", RegexOptions.Compiled);
    private static readonly IReadOnlyList<TelegramBotReplyTemplatePayload> DefaultReplyTemplates =
    [
        new("welcome", "Приветствие", "Отправляется при первом сообщении в бот.", true, "Привет! Я бот {bot_name}. Используйте команды из меню."),
        new("known_command", "Ответ на известную команду", "Срабатывает, когда пользователь вызывает настроенную команду без отдельной логики.", false, "Команда {command} получена. Скоро здесь появится отдельное действие."),
        new("unknown_command", "Неизвестная команда", "Срабатывает, когда пользователь отправляет команду, которой нет в списке.", true, "Команда не распознана. Используйте меню Telegram или /check."),
        new("auth_only", "Бот только для авторизации", "Ответ на обычное сообщение, если бот отмечен для авторизации.", true, "Этот бот используется для авторизации через Telegram. Для входа откройте сайт и нажмите кнопку \"Войти через Telegram\"."),
        new("text_fallback", "Ответ на обычный текст", "Ответ на сообщение без команды для обычного бота.", false, "Сейчас я понимаю только системные и настроенные команды."),
        new("order_created", "Шаблон: новый заказ", "Заготовка для будущих уведомлений о создании заказа.", false, "Заказ {order_number} создан. Мы сообщим, когда начнем его собирать."),
        new("order_status_changed", "Шаблон: статус заказа", "Заготовка для будущих уведомлений о смене статуса заказа.", false, "Статус заказа {order_number} изменился: {status}."),
        new("discount_broadcast", "Шаблон: скидки и акции", "Заготовка для будущих массовых уведомлений о скидках.", false, "Для вас есть новое предложение: {discount_name}.")
    ];

    private readonly IServiceProvider _serviceProvider;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<TelegramBotManager> _logger;
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _botWorkers = new();

    public TelegramBotManager(IServiceProvider serviceProvider, IHttpClientFactory httpClientFactory, ILogger<TelegramBotManager> logger)
    {
        _serviceProvider = serviceProvider;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await SyncWorkersAsync(stoppingToken);
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        foreach (var pair in _botWorkers.ToArray())
        {
            pair.Value.Cancel();
            pair.Value.Dispose();
            _botWorkers.TryRemove(pair.Key, out _);
        }

        await base.StopAsync(cancellationToken);
    }

    public async Task<object> ValidateTokenAsync(string token)
    {
        var normalizedToken = token?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalizedToken))
            throw new InvalidOperationException("Telegram bot token is required");

        var me = await FetchMeInfoAsync(normalizedToken, CancellationToken.None);
        return JsonSerializer.Deserialize<object>(me.RawResult.GetRawText()) ?? new { };
    }

    public async Task SyncNowAsync() => await SyncWorkersAsync(CancellationToken.None);

    public async Task<List<object>> GetBotsAsync()
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();
        var bots = await db.TelegramBots.OrderByDescending(x => x.CreatedAt).ToListAsync();
        return bots.Select(ToDto).Cast<object>().ToList();
    }

    public async Task<object> CreateBotAsync(TelegramBotPayload payload)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();

        var name = NormalizeRequiredName(payload.Name);
        var description = NormalizeDescription(payload.Description);
        var shortDescription = NormalizeShortDescription(payload.ShortDescription);
        var imageUrl = NormalizeOptional(payload.ImageUrl);
        var token = payload.Token?.Trim() ?? string.Empty;
        var commands = NormalizeCommands(payload.Commands);
        var replyTemplates = NormalizeReplyTemplates(payload.ReplyTemplates);
        var updateMode = NormalizeUpdateMode(payload.UpdateMode);

        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Telegram bot token is required");

        ValidateBotConfiguration(name, description, shortDescription, commands, replyTemplates);
        await FetchMeInfoAsync(token, CancellationToken.None);

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var bot = new TelegramBot
        {
            Name = name,
            Description = description,
            ShortDescription = shortDescription,
            ImageUrl = imageUrl,
            Token = token,
            Enabled = payload.Enabled,
            UpdateMode = updateMode,
            WebhookSecret = updateMode == TelegramBot.UpdateModeWebhook ? CreateWebhookSecret() : null,
            UseForLogin = payload.UseForLogin,
            AutoRepliesEnabled = payload.AutoRepliesEnabled,
            CommandsJson = SerializeCommands(commands),
            ReplyTemplatesJson = SerializeReplyTemplates(replyTemplates),
            CreatedAt = now,
            UpdatedAt = now
        };

        if (bot.UseForLogin)
        {
            var currentLoginBots = await db.TelegramBots.Where(x => x.UseForLogin).ToListAsync();
            foreach (var existingBot in currentLoginBots)
                existingBot.UseForLogin = false;
        }

        await ApplyBotMetadataAsync(bot, CancellationToken.None);
        db.TelegramBots.Add(bot);
        await db.SaveChangesAsync();
        await SyncNowAsync();
        return ToDto(bot);
    }

    public async Task<object?> UpdateBotAsync(string id, TelegramBotPatchPayload payload)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();
        var bot = await db.TelegramBots.FirstOrDefaultAsync(x => x.Id == id);
        if (bot is null)
            return null;

        var tokenCandidate = payload.Token is null ? bot.Token : payload.Token.Trim();
        if (string.IsNullOrWhiteSpace(tokenCandidate))
            throw new InvalidOperationException("Telegram bot token is required");

        if (payload.Name is not null)
            bot.Name = NormalizeRequiredName(payload.Name);
        if (payload.Description is not null)
            bot.Description = NormalizeDescription(payload.Description);
        if (payload.ShortDescription is not null)
            bot.ShortDescription = NormalizeShortDescription(payload.ShortDescription);
        if (payload.ImageUrl is not null)
            bot.ImageUrl = NormalizeOptional(payload.ImageUrl);
        if (payload.Enabled.HasValue)
            bot.Enabled = payload.Enabled.Value;
        if (payload.UpdateMode is not null)
            bot.UpdateMode = NormalizeUpdateMode(payload.UpdateMode);
        if (payload.UseForLogin.HasValue)
            bot.UseForLogin = payload.UseForLogin.Value;
        if (payload.AutoRepliesEnabled.HasValue)
            bot.AutoRepliesEnabled = payload.AutoRepliesEnabled.Value;
        if (payload.Commands is not null)
            bot.CommandsJson = SerializeCommands(NormalizeCommands(payload.Commands));
        if (payload.ReplyTemplates is not null)
            bot.ReplyTemplatesJson = SerializeReplyTemplates(NormalizeReplyTemplates(payload.ReplyTemplates));

        bot.Token = tokenCandidate;
        bot.WebhookSecret = bot.UpdateMode == TelegramBot.UpdateModeWebhook ? EnsureWebhookSecret(bot.WebhookSecret) : null;
        bot.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var commands = DeserializeCommands(bot.CommandsJson);
        var replyTemplates = DeserializeReplyTemplates(bot.ReplyTemplatesJson);
        ValidateBotConfiguration(bot.Name, bot.Description, bot.ShortDescription, commands, replyTemplates);
        await FetchMeInfoAsync(tokenCandidate, CancellationToken.None);

        if (bot.UseForLogin)
        {
            var currentLoginBots = await db.TelegramBots
                .Where(x => x.Id != bot.Id && x.UseForLogin)
                .ToListAsync();
            foreach (var existingBot in currentLoginBots)
                existingBot.UseForLogin = false;
        }

        await ApplyBotMetadataAsync(bot, CancellationToken.None);
        await db.SaveChangesAsync();
        await SyncNowAsync();
        return ToDto(bot);
    }

    public async Task<bool> DeleteBotAsync(string id)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();
        var bot = await db.TelegramBots.FirstOrDefaultAsync(x => x.Id == id);
        if (bot is null)
            return false;

        var subscribers = await db.TelegramBotSubscribers.Where(x => x.BotId == id).ToListAsync();
        if (subscribers.Count > 0)
            db.TelegramBotSubscribers.RemoveRange(subscribers);

        db.TelegramBots.Remove(bot);
        await db.SaveChangesAsync();
        await SyncNowAsync();
        return true;
    }

    public async Task<bool> HandleWebhookUpdateAsync(string id, string? secret, JsonElement update, CancellationToken token)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();
        var bot = await db.TelegramBots.FirstOrDefaultAsync(x => x.Id == id, token);
        if (bot is null || !bot.Enabled || !string.Equals(bot.UpdateMode, TelegramBot.UpdateModeWebhook, StringComparison.Ordinal))
            return false;

        var expectedSecret = bot.WebhookSecret?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(expectedSecret) || !string.Equals(secret?.Trim(), expectedSecret, StringComparison.Ordinal))
            return false;

        if (!update.TryGetProperty("message", out var messageEl))
            return true;

        var client = _httpClientFactory.CreateClient();
        await HandleMessageAsync(client, db, bot, messageEl, token);
        return true;
    }

    public async Task<object?> CheckBotAsync(string id)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();
        var bot = await db.TelegramBots.FirstOrDefaultAsync(x => x.Id == id);
        if (bot is null)
            return null;

        ValidateBotConfiguration(bot.Name, bot.Description, bot.ShortDescription, DeserializeCommands(bot.CommandsJson), DeserializeReplyTemplates(bot.ReplyTemplatesJson));
        await ApplyBotMetadataAsync(bot, CancellationToken.None);
        await db.SaveChangesAsync();
        return ToDto(bot);
    }

    private async Task SyncWorkersAsync(CancellationToken token)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();
        var activeBots = await db.TelegramBots
            .Where(x => x.Enabled
                && !string.IsNullOrWhiteSpace(x.Token)
                && x.UpdateMode == TelegramBot.UpdateModePolling)
            .Select(x => x.Id)
            .ToListAsync(token);
        var activeSet = activeBots.ToHashSet();

        foreach (var id in activeBots)
        {
            if (_botWorkers.ContainsKey(id))
                continue;

            var cts = CancellationTokenSource.CreateLinkedTokenSource(token);
            if (_botWorkers.TryAdd(id, cts))
            {
                _ = Task.Run(() => RunBotLoopAsync(id, cts.Token), cts.Token);
                _logger.LogInformation("Started telegram bot worker {BotId}", id);
            }
        }

        foreach (var pair in _botWorkers.ToArray())
        {
            if (activeSet.Contains(pair.Key))
                continue;

            pair.Value.Cancel();
            pair.Value.Dispose();
            _botWorkers.TryRemove(pair.Key, out _);
            _logger.LogInformation("Stopped telegram bot worker {BotId}", pair.Key);
        }
    }

    private async Task RunBotLoopAsync(string botId, CancellationToken token)
    {
        var client = _httpClientFactory.CreateClient();
        var offset = 0L;

        while (!token.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();
                var bot = await db.TelegramBots.FirstOrDefaultAsync(x => x.Id == botId, token);
                if (bot is null || !bot.Enabled || string.IsNullOrWhiteSpace(bot.Token))
                    return;

                var url = $"https://api.telegram.org/bot{bot.Token}/getUpdates?timeout=25&offset={offset}";
                using var res = await client.GetAsync(url, token);
                if (!res.IsSuccessStatusCode)
                {
                    await Task.Delay(3000, token);
                    continue;
                }

                using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(token));
                if (!doc.RootElement.TryGetProperty("result", out var result) || result.ValueKind != JsonValueKind.Array)
                    continue;

                foreach (var update in result.EnumerateArray())
                {
                    var updateId = update.TryGetProperty("update_id", out var idEl) ? idEl.GetInt64() : 0;
                    if (updateId >= offset)
                        offset = updateId + 1;

                    if (!update.TryGetProperty("message", out var messageEl))
                        continue;

                    await HandleMessageAsync(client, db, bot, messageEl, token);
                }
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Telegram bot loop failed for {BotId}", botId);
                await Task.Delay(3000, token);
            }
        }
    }

    private async Task HandleMessageAsync(HttpClient client, StoreDbContext db, TelegramBot bot, JsonElement messageEl, CancellationToken token)
    {
        var chatId = TryGetInt64(messageEl, "chat", "id");
        if (chatId == 0)
            return;

        var (subscriber, isFirstInteraction) = await UpsertSubscriberAsync(db, bot.Id, messageEl, token);
        var fromTelegramUserId = TryGetInt64(messageEl, "from", "id");

        if (bot.UseForLogin)
        {
            var handledPhoneVerification = false;
            try
            {
                handledPhoneVerification = await TryHandlePhoneVerificationMessageAsync(client, db, bot, messageEl, chatId, fromTelegramUserId, token);
            }
            catch (PostgresException ex) when (ex.SqlState == "42P01")
            {
                _logger.LogWarning(ex, "Skipping phone verification flow because relation contact_change_requests is missing. Apply pending migrations.");
            }

            if (handledPhoneVerification)
            {
                await db.SaveChangesAsync(token);
                return;
            }

            var handledLogin = await TryHandleLoginFlowMessageAsync(client, db, bot, messageEl, chatId, fromTelegramUserId, token);
            if (handledLogin)
            {
                await db.SaveChangesAsync(token);
                return;
            }
        }

        var text = messageEl.TryGetProperty("text", out var textEl) ? textEl.GetString()?.Trim() : null;

        if (string.IsNullOrWhiteSpace(text))
        {
            await db.SaveChangesAsync(token);
            return;
        }

        var normalizedCommand = ExtractIncomingCommand(text);
        if (string.Equals(normalizedCommand, "/check", StringComparison.Ordinal))
        {
            await SendMessageAsync(client, bot.Token, chatId, $"✅ Bot '{bot.Name}' работает. ID: {bot.Id}", null, token);
            await db.SaveChangesAsync(token);
            return;
        }

        if (!bot.AutoRepliesEnabled)
        {
            await db.SaveChangesAsync(token);
            return;
        }

        var replyTemplates = DeserializeReplyTemplates(bot.ReplyTemplatesJson);
        if (isFirstInteraction && await TrySendReplyTemplateAsync(client, bot, chatId, subscriber, replyTemplates, "welcome", normalizedCommand, token))
        {
            await db.SaveChangesAsync(token);
            return;
        }

        if (!string.IsNullOrWhiteSpace(normalizedCommand))
        {
            var configuredCommands = DeserializeCommands(bot.CommandsJson)
                .Select(x => NormalizeCommand(x.Command))
                .ToHashSet(StringComparer.Ordinal);
            var templateKey = configuredCommands.Contains(normalizedCommand) ? "known_command" : "unknown_command";
            await TrySendReplyTemplateAsync(client, bot, chatId, subscriber, replyTemplates, templateKey, normalizedCommand, token);
        }
        else
        {
            var templateKey = bot.UseForLogin ? "auth_only" : "text_fallback";
            await TrySendReplyTemplateAsync(client, bot, chatId, subscriber, replyTemplates, templateKey, normalizedCommand, token);
        }

        await db.SaveChangesAsync(token);
    }

    private async Task<bool> TryHandlePhoneVerificationMessageAsync(
        HttpClient client,
        StoreDbContext db,
        TelegramBot bot,
        JsonElement messageEl,
        long chatId,
        long fromTelegramUserId,
        CancellationToken token)
    {
        var text = messageEl.TryGetProperty("text", out var textEl) ? textEl.GetString()?.Trim() : null;
        if (!string.IsNullOrWhiteSpace(text) && text.StartsWith("/start", StringComparison.OrdinalIgnoreCase))
        {
            var state = ExtractStateFromStartCommand(text, "verify_phone_");
            if (string.IsNullOrWhiteSpace(state))
                return false;

            var request = await db.ContactChangeRequests
                .Where(x => x.Kind == "phone" && x.State == state)
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefaultAsync(token);
            if (request is null)
            {
                await SendMessageAsync(client, bot.Token, chatId, "Запрос подтверждения телефона не найден. Запустите подтверждение с сайта заново.", null, token);
                return true;
            }

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (request.ExpiresAt <= now)
            {
                request.Status = "expired";
                await SendMessageAsync(client, bot.Token, chatId, "Ссылка подтверждения телефона устарела. Повторите на сайте.", null, token);
                return true;
            }

            var linkedUser = fromTelegramUserId > 0
                ? await db.Users.FirstOrDefaultAsync(x => x.Email == $"telegram_{fromTelegramUserId}@telegram.local", token)
                : null;
            if (linkedUser is null || !string.Equals(linkedUser.Id, request.UserId, StringComparison.Ordinal))
            {
                await SendMessageAsync(client, bot.Token, chatId, "Этот Telegram-аккаунт не привязан к профилю, для которого запрошено подтверждение.", null, token);
                return true;
            }

            request.ChatId = chatId;
            request.TelegramUserId = fromTelegramUserId > 0 ? fromTelegramUserId.ToString() : null;
            request.Status = "awaiting_phone";

            await SendMessageAsync(
                client,
                bot.Token,
                chatId,
                "Нажмите кнопку ниже и отправьте контакт, чтобы подтвердить номер телефона.",
                new
                {
                    keyboard = new object[]
                    {
                        new object[]
                        {
                            new { text = "📱 Подтвердить номер", request_contact = true }
                        }
                    },
                    resize_keyboard = true,
                    one_time_keyboard = true
                },
                token);
            return true;
        }

        if (!messageEl.TryGetProperty("contact", out var contactEl))
            return false;

        var nowUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var requestByChat = await db.ContactChangeRequests
            .Where(x => x.Kind == "phone"
                && x.ChatId == chatId
                && x.Status == "awaiting_phone"
                && x.ExpiresAt > nowUnixMs)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(token);
        if (requestByChat is null)
            return false;

        var contactUserId = contactEl.TryGetProperty("user_id", out var contactUserIdEl) ? contactUserIdEl.GetInt64() : 0L;
        if (contactUserId > 0 && fromTelegramUserId > 0 && contactUserId != fromTelegramUserId)
        {
            await SendMessageAsync(client, bot.Token, chatId, "Отправьте контакт именно текущего Telegram-аккаунта.", null, token);
            return true;
        }

        var phoneNumber = contactEl.TryGetProperty("phone_number", out var phoneEl) ? phoneEl.GetString() : null;
        var normalizedPhone = NormalizePhone(phoneNumber);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
        {
            await SendMessageAsync(client, bot.Token, chatId, "Не удалось получить номер телефона. Повторите попытку.", null, token);
            return true;
        }

        if (!string.Equals(normalizedPhone, NormalizePhone(requestByChat.TargetValue), StringComparison.Ordinal))
        {
            await SendMessageAsync(client, bot.Token, chatId, "Номер не совпадает с указанным на сайте. Повторите подтверждение с нужным номером.", null, token);
            return true;
        }

        requestByChat.Status = "completed";
        requestByChat.VerifiedAt = nowUnixMs;
        requestByChat.TelegramUserId = fromTelegramUserId > 0 ? fromTelegramUserId.ToString() : requestByChat.TelegramUserId;

        await SendMessageAsync(client, bot.Token, chatId, "Номер телефона подтвержден ✅ Вернитесь на сайт и сохраните изменения.", new { remove_keyboard = true }, token);
        return true;
    }

    private async Task<bool> TryHandleLoginFlowMessageAsync(
        HttpClient client,
        StoreDbContext db,
        TelegramBot bot,
        JsonElement messageEl,
        long chatId,
        long fromTelegramUserId,
        CancellationToken token)
    {
        var text = messageEl.TryGetProperty("text", out var textEl) ? textEl.GetString()?.Trim() : null;
        if (!string.IsNullOrWhiteSpace(text) && text.StartsWith("/start", StringComparison.OrdinalIgnoreCase))
        {
            var state = ExtractStateFromStartCommand(text);
            if (string.IsNullOrWhiteSpace(state))
            {
                await SendMessageAsync(client, bot.Token, chatId, "Для входа используйте ссылку с сайта, кнопка «Войти через Telegram».", null, token);
                return true;
            }

            var authRequest = await db.TelegramAuthRequests
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefaultAsync(x => x.State == state && x.BotId == bot.Id, token);
            if (authRequest is null)
            {
                await SendMessageAsync(client, bot.Token, chatId, "Ссылка авторизации не найдена. Запросите новую на сайте.", null, token);
                return true;
            }

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (authRequest.ExpiresAt <= now)
            {
                authRequest.Status = "expired";
                await SendMessageAsync(client, bot.Token, chatId, "Ссылка авторизации устарела. Вернитесь на сайт и начните вход заново.", null, token);
                return true;
            }

            if (!string.IsNullOrWhiteSpace(authRequest.UserId) && string.Equals(authRequest.Status, "completed", StringComparison.Ordinal))
            {
                await SendMessageAsync(client, bot.Token, chatId, "Вы уже авторизованы. Вернитесь на сайт — вход будет завершен автоматически.", null, token);
                return true;
            }

            authRequest.ChatId = chatId;
            authRequest.TelegramUserId = fromTelegramUserId > 0 ? fromTelegramUserId.ToString() : authRequest.TelegramUserId;

            var user = fromTelegramUserId > 0
                ? await db.Users.FirstOrDefaultAsync(x => x.Email == $"telegram_{fromTelegramUserId}@telegram.local", token)
                : null;

            if (user is not null)
            {
                authRequest.UserId = user.Id;
                authRequest.Status = "completed";
                authRequest.CompletedAt = now;
                await SendMessageAsync(client, bot.Token, chatId, "Вход подтвержден ✅ Вернитесь на сайт, профиль уже открыт.", null, token);
                return true;
            }

            authRequest.Status = "awaiting_phone";
            await SendMessageAsync(
                client,
                bot.Token,
                chatId,
                "Чтобы завершить первый вход, отправьте номер телефона кнопкой ниже.",
                new
                {
                    keyboard = new object[]
                    {
                        new object[]
                        {
                            new
                            {
                                text = "📱 Отправить номер телефона",
                                request_contact = true
                            }
                        }
                    },
                    resize_keyboard = true,
                    one_time_keyboard = true
                },
                token);
            return true;
        }

        if (!messageEl.TryGetProperty("contact", out var contactEl))
            return false;

        var nowUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var awaitingRequest = await db.TelegramAuthRequests
            .Where(x => x.BotId == bot.Id
                && x.ChatId == chatId
                && x.Status == "awaiting_phone"
                && x.ExpiresAt > nowUnixMs)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(token);

        if (awaitingRequest is null)
            return false;

        var contactUserId = contactEl.TryGetProperty("user_id", out var contactUserIdEl) ? contactUserIdEl.GetInt64() : 0L;
        if (contactUserId > 0 && fromTelegramUserId > 0 && contactUserId != fromTelegramUserId)
        {
            await SendMessageAsync(client, bot.Token, chatId, "Пожалуйста, отправьте свой номер телефона из текущего Telegram-аккаунта.", null, token);
            return true;
        }

        var phoneNumber = contactEl.TryGetProperty("phone_number", out var phoneEl) ? phoneEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(phoneNumber) || fromTelegramUserId <= 0)
        {
            await SendMessageAsync(client, bot.Token, chatId, "Не удалось получить номер телефона. Повторите попытку.", null, token);
            return true;
        }

        var email = $"telegram_{fromTelegramUserId}@telegram.local";
        var userEntity = await db.Users.FirstOrDefaultAsync(x => x.Email == email, token);
        if (userEntity is null)
        {
            userEntity = new User
            {
                Id = Guid.NewGuid().ToString("N"),
                Email = email,
                PasswordHash = string.Empty,
                Salt = string.Empty,
                CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Verified = true
            };
            db.Users.Add(userEntity);

            db.Profiles.Add(new Profile
            {
                UserId = userEntity.Id,
                Email = email,
                Name = string.Join(" ", new[]
                {
                    TryGetString(messageEl, "from", "first_name"),
                    TryGetString(messageEl, "from", "last_name")
                }.Where(x => !string.IsNullOrWhiteSpace(x))).Trim(),
                Nickname = TryGetString(messageEl, "from", "username"),
                Phone = phoneNumber,
                PhoneVerified = true
            });
        }
        else
        {
            var profile = await db.Profiles.FirstOrDefaultAsync(x => x.UserId == userEntity.Id, token);
            if (profile is null)
            {
                profile = new Profile
                {
                    UserId = userEntity.Id,
                    Email = userEntity.Email
                };
                db.Profiles.Add(profile);
            }

            if (string.IsNullOrWhiteSpace(profile.Phone))
                profile.Phone = phoneNumber;
            profile.PhoneVerified = true;
        }

        awaitingRequest.UserId = userEntity.Id;
        awaitingRequest.PhoneNumber = phoneNumber;
        awaitingRequest.TelegramUserId = fromTelegramUserId.ToString();
        awaitingRequest.Status = "completed";
        awaitingRequest.CompletedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        await SendMessageAsync(
            client,
            bot.Token,
            chatId,
            "Готово ✅ Телефон подтвержден, вход завершен. Возвращайтесь на сайт — профиль откроется автоматически.",
            new { remove_keyboard = true },
            token);
        return true;
    }

    private static string? ExtractStateFromStartCommand(string text, string prefix = "login_")
    {
        if (string.IsNullOrWhiteSpace(text))
            return null;

        var parts = text.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length < 2)
            return null;

        var payload = parts[1];
        if (!payload.StartsWith(prefix, StringComparison.Ordinal))
            return null;

        var state = payload[prefix.Length..].Trim();
        return string.IsNullOrWhiteSpace(state) ? null : state;
    }

    private async Task<(TelegramBotSubscriber Subscriber, bool IsFirstInteraction)> UpsertSubscriberAsync(StoreDbContext db, string botId, JsonElement messageEl, CancellationToken token)
    {
        var chatId = TryGetInt64(messageEl, "chat", "id");
        var username = TryGetString(messageEl, "from", "username") ?? TryGetString(messageEl, "chat", "username");
        var firstName = TryGetString(messageEl, "from", "first_name") ?? TryGetString(messageEl, "chat", "first_name");
        var lastName = TryGetString(messageEl, "from", "last_name") ?? TryGetString(messageEl, "chat", "last_name");
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var subscriber = await db.TelegramBotSubscribers.FirstOrDefaultAsync(x => x.BotId == botId && x.ChatId == chatId, token);
        if (subscriber is null)
        {
            subscriber = new TelegramBotSubscriber
            {
                BotId = botId,
                ChatId = chatId,
                Username = NormalizeOptional(username),
                FirstName = NormalizeOptional(firstName),
                LastName = NormalizeOptional(lastName),
                CreatedAt = now,
                UpdatedAt = now
            };
            db.TelegramBotSubscribers.Add(subscriber);
            return (subscriber, true);
        }

        subscriber.Username = NormalizeOptional(username) ?? subscriber.Username;
        subscriber.FirstName = NormalizeOptional(firstName) ?? subscriber.FirstName;
        subscriber.LastName = NormalizeOptional(lastName) ?? subscriber.LastName;
        subscriber.UpdatedAt = now;
        return (subscriber, false);
    }

    private async Task<bool> TrySendReplyTemplateAsync(
        HttpClient client,
        TelegramBot bot,
        long chatId,
        TelegramBotSubscriber? subscriber,
        List<TelegramBotReplyTemplatePayload> replyTemplates,
        string templateKey,
        string? command,
        CancellationToken cancellationToken)
    {
        var template = replyTemplates.FirstOrDefault(x => string.Equals(x.Key, templateKey, StringComparison.OrdinalIgnoreCase));
        if (template is null || !template.Enabled || string.IsNullOrWhiteSpace(template.Text))
            return false;

        var text = RenderReplyTemplate(template.Text, bot, subscriber, command);
        if (string.IsNullOrWhiteSpace(text))
            return false;

        await SendMessageAsync(client, bot.Token, chatId, text, null, cancellationToken);
        return true;
    }

    private async Task ApplyBotMetadataAsync(TelegramBot bot, CancellationToken cancellationToken)
    {
        ValidateBotConfiguration(bot.Name, bot.Description, bot.ShortDescription, DeserializeCommands(bot.CommandsJson), DeserializeReplyTemplates(bot.ReplyTemplatesJson));

        var meInfo = await FetchMeInfoAsync(bot.Token, cancellationToken);
        bot.Username = meInfo.Username ?? bot.Username;
        bot.LastBotInfoJson = JsonSerializer.Serialize(meInfo.RawResult);

        var commands = DeserializeCommands(bot.CommandsJson);
        await CallTelegramMethodAsync(bot.Token, "setMyCommands", new
        {
            commands = commands.Select(x => new { command = x.Command.TrimStart('/'), description = x.Description }).ToList()
        }, cancellationToken);

        await CallTelegramMethodAsync(bot.Token, "setMyName", new
        {
            name = bot.Name
        }, cancellationToken);

        await CallTelegramMethodAsync(bot.Token, "setMyDescription", new
        {
            description = bot.Description ?? string.Empty
        }, cancellationToken);

        await CallTelegramMethodAsync(bot.Token, "setMyShortDescription", new
        {
            short_description = bot.ShortDescription ?? string.Empty
        }, cancellationToken);

        if (string.Equals(bot.UpdateMode, TelegramBot.UpdateModeWebhook, StringComparison.Ordinal))
        {
            bot.WebhookSecret = EnsureWebhookSecret(bot.WebhookSecret);
            await SetWebhookAsync(bot, cancellationToken);
        }
        else
        {
            await DeleteWebhookAsync(bot.Token, cancellationToken);
        }

        if (!string.IsNullOrWhiteSpace(bot.ImageUrl))
            await UpdateBotProfilePhotoAsync(bot, cancellationToken);

        bot.LastCheckedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        bot.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    private async Task UpdateBotProfilePhotoAsync(TelegramBot bot, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var photoResponse = await client.GetAsync(bot.ImageUrl!, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        var mediaType = photoResponse.Content.Headers.ContentType?.MediaType?.Trim().ToLowerInvariant();
        if (!photoResponse.IsSuccessStatusCode)
            throw new InvalidOperationException($"Unable to download bot image from {bot.ImageUrl}");

        if (!string.IsNullOrWhiteSpace(mediaType) &&
            mediaType is not "image/jpeg" and not "image/jpg" and not "application/octet-stream")
        {
            throw new InvalidOperationException("Telegram bot profile photo must be a JPG image");
        }

        await using var photoStream = await photoResponse.Content.ReadAsStreamAsync(cancellationToken);
        await using var buffer = new MemoryStream();
        await photoStream.CopyToAsync(buffer, cancellationToken);

        if (buffer.Length == 0)
            throw new InvalidOperationException("Telegram bot profile photo is empty");
        if (buffer.Length > MaxProfilePhotoBytes)
            throw new InvalidOperationException("Telegram bot profile photo is too large");

        buffer.Position = 0;
        using var formData = new MultipartFormDataContent();
        formData.Add(
            new StringContent(JsonSerializer.Serialize(new { type = "static", photo = "attach://bot_photo" }), Encoding.UTF8, "application/json"),
            "photo");

        var streamContent = new StreamContent(buffer);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        formData.Add(streamContent, "bot_photo", "bot-photo.jpg");

        using var req = new HttpRequestMessage(HttpMethod.Post, $"https://api.telegram.org/bot{bot.Token}/setMyProfilePhoto")
        {
            Content = formData
        };
        using var res = await client.SendAsync(req, cancellationToken);
        await EnsureSuccessfulTelegramResponseAsync(res, "setMyProfilePhoto", cancellationToken);
    }

    private async Task CallTelegramMethodAsync(string token, string method, object? payload, CancellationToken cancellationToken)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, $"https://api.telegram.org/bot{token}/{method}");
        if (payload is not null)
        {
            req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        }

        var client = _httpClientFactory.CreateClient();
        using var res = await client.SendAsync(req, cancellationToken);
        await EnsureSuccessfulTelegramResponseAsync(res, method, cancellationToken);
    }

    private async Task SetWebhookAsync(TelegramBot bot, CancellationToken cancellationToken)
    {
        var baseUrl = Environment.GetEnvironmentVariable("ASPNETCORE_URLS")?.Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()
            ?? "http://0.0.0.0:3001";

        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var parsedBaseUrl))
            throw new InvalidOperationException("Unable to resolve webhook base URL from ASPNETCORE_URLS");

        if (parsedBaseUrl.Host is "0.0.0.0" or "localhost" or "127.0.0.1")
            throw new InvalidOperationException("Webhook mode requires a public HTTPS APP_URL/ASPNETCORE_URLS host");

        if (!string.Equals(parsedBaseUrl.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Webhook mode requires HTTPS URL");

        var webhookUrl = new Uri(parsedBaseUrl, $"/integrations/telegram/webhook/{bot.Id}").ToString();
        await CallTelegramMethodAsync(bot.Token, "setWebhook", new
        {
            url = webhookUrl,
            secret_token = bot.WebhookSecret
        }, cancellationToken);
    }

    private async Task DeleteWebhookAsync(string token, CancellationToken cancellationToken)
    {
        await CallTelegramMethodAsync(token, "deleteWebhook", new
        {
            drop_pending_updates = false
        }, cancellationToken);
    }

    private async Task EnsureSuccessfulTelegramResponseAsync(HttpResponseMessage response, string method, CancellationToken cancellationToken)
    {
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var description = ExtractTelegramErrorDescription(content);
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(description)
                    ? $"Telegram {method} failed with status {(int)response.StatusCode}"
                    : $"Telegram {method} failed: {description}");
        }

        using var doc = JsonDocument.Parse(content);
        if (!doc.RootElement.TryGetProperty("ok", out var okEl) || !okEl.GetBoolean())
        {
            var description = ExtractTelegramErrorDescription(content);
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(description)
                    ? $"Telegram {method} returned unsuccessful response"
                    : $"Telegram {method} failed: {description}");
        }
    }

    private async Task<TelegramBotMeInfo> FetchMeInfoAsync(string token, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var meRes = await client.GetAsync($"https://api.telegram.org/bot{token}/getMe", cancellationToken);
        var meContent = await meRes.Content.ReadAsStringAsync(cancellationToken);

        if (!meRes.IsSuccessStatusCode)
        {
            var description = ExtractTelegramErrorDescription(meContent);
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(description)
                    ? $"Telegram getMe failed with status {(int)meRes.StatusCode}"
                    : $"Telegram getMe failed: {description}");
        }

        using var doc = JsonDocument.Parse(meContent);
        if (!doc.RootElement.TryGetProperty("ok", out var okEl) || !okEl.GetBoolean())
        {
            var description = ExtractTelegramErrorDescription(meContent);
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(description)
                    ? "Telegram getMe returned unsuccessful response"
                    : $"Telegram getMe failed: {description}");
        }

        if (!doc.RootElement.TryGetProperty("result", out var resultEl) || resultEl.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException("Telegram getMe response does not contain bot info");

        var rawJson = resultEl.GetRawText();
        using var rawDoc = JsonDocument.Parse(rawJson);
        var cloned = rawDoc.RootElement.Clone();
        var username = cloned.TryGetProperty("username", out var u) ? u.GetString() : null;

        return new TelegramBotMeInfo(username, cloned);
    }

    private static void ValidateBotConfiguration(
        string name,
        string description,
        string? shortDescription,
        List<TelegramBotCommandPayload> commands,
        List<TelegramBotReplyTemplatePayload> replyTemplates)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("Telegram bot name is required");
        if (name.Length > MaxBotNameLength)
            throw new InvalidOperationException($"Telegram bot name must be at most {MaxBotNameLength} characters");
        if ((description ?? string.Empty).Length > MaxDescriptionLength)
            throw new InvalidOperationException($"Telegram bot description must be at most {MaxDescriptionLength} characters");
        if ((shortDescription ?? string.Empty).Length > MaxShortDescriptionLength)
            throw new InvalidOperationException($"Telegram bot short description must be at most {MaxShortDescriptionLength} characters");
        if (commands.Count > MaxCommandsCount)
            throw new InvalidOperationException($"Telegram bot can have at most {MaxCommandsCount} commands");

        foreach (var command in commands)
        {
            var normalized = command.Command.Trim().TrimStart('/');
            if (!TelegramCommandPattern.IsMatch(normalized))
            {
                throw new InvalidOperationException(
                    $"Telegram command '{command.Command}' is invalid. Use only lowercase latin letters, digits and underscore, 1-{MaxCommandLength} chars");
            }

            if ((command.Description ?? string.Empty).Length is 0 or > MaxCommandDescriptionLength)
                throw new InvalidOperationException($"Description for command '{command.Command}' must be 1-{MaxCommandDescriptionLength} characters");
        }

        foreach (var template in replyTemplates)
        {
            if (template.Enabled && string.IsNullOrWhiteSpace(template.Text))
                throw new InvalidOperationException($"Reply template '{template.Label}' is enabled but empty");
            if ((template.Text ?? string.Empty).Length > MaxReplyTextLength)
                throw new InvalidOperationException($"Reply template '{template.Label}' must be at most {MaxReplyTextLength} characters");
        }
    }

    private static string NormalizePhone(string? phone)
    {
        var trimmed = (phone ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return string.Empty;

        var chars = trimmed.Where(c => char.IsDigit(c) || c == '+').ToArray();
        var normalized = new string(chars);
        if (string.IsNullOrWhiteSpace(normalized))
            return string.Empty;

        if (!normalized.StartsWith('+') && normalized.All(char.IsDigit))
            normalized = $"+{normalized}";

        return normalized;
    }

    private static async Task SendMessageAsync(HttpClient client, string token, long chatId, string text, object? replyMarkup, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(new
        {
            chat_id = chatId,
            text,
            reply_markup = replyMarkup
        });
        using var req = new HttpRequestMessage(HttpMethod.Post, $"https://api.telegram.org/bot{token}/sendMessage")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
        await client.SendAsync(req, cancellationToken);
    }

    private static object ToDto(TelegramBot bot)
    {
        object? info = null;
        if (!string.IsNullOrWhiteSpace(bot.LastBotInfoJson))
        {
            try
            {
                info = JsonSerializer.Deserialize<object>(bot.LastBotInfoJson!);
            }
            catch
            {
                // ignore malformed cached bot info
            }
        }

        return new
        {
            bot.Id,
            bot.Name,
            bot.Description,
            bot.ShortDescription,
            bot.ImageUrl,
            bot.Username,
            tokenMasked = MaskToken(bot.Token),
            hasToken = !string.IsNullOrWhiteSpace(bot.Token),
            bot.Enabled,
            bot.UpdateMode,
            hasWebhookSecret = !string.IsNullOrWhiteSpace(bot.WebhookSecret),
            bot.UseForLogin,
            bot.AutoRepliesEnabled,
            Commands = DeserializeCommands(bot.CommandsJson),
            ReplyTemplates = DeserializeReplyTemplates(bot.ReplyTemplatesJson),
            bot.CreatedAt,
            bot.UpdatedAt,
            bot.LastCheckedAt,
            BotInfo = info
        };
    }

    private static string RenderReplyTemplate(string template, TelegramBot bot, TelegramBotSubscriber? subscriber, string? command)
    {
        var rendered = template
            .Replace("{bot_name}", bot.Name ?? string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("{command}", command ?? string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("{username}", subscriber?.Username ?? bot.Username ?? string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("{first_name}", subscriber?.FirstName ?? string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("{last_name}", subscriber?.LastName ?? string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("{order_number}", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("{status}", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("{discount_name}", string.Empty, StringComparison.OrdinalIgnoreCase);

        return rendered.Trim();
    }

    private static string? ExtractTelegramErrorDescription(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return null;

        try
        {
            using var doc = JsonDocument.Parse(content);
            if (doc.RootElement.TryGetProperty("description", out var descriptionEl) && descriptionEl.ValueKind == JsonValueKind.String)
                return descriptionEl.GetString();
        }
        catch
        {
            // ignore malformed telegram error payload
        }

        return null;
    }

    private static string MaskToken(string token)
    {
        var trimmed = token?.Trim() ?? string.Empty;
        if (trimmed.Length <= 4)
            return new string('*', trimmed.Length);
        if (trimmed.Length <= 8)
            return $"{trimmed[..2]}****{trimmed[^2..]}";

        return $"{trimmed[..4]}****{trimmed[^4..]}";
    }

    private static string NormalizeUpdateMode(string? mode)
    {
        var normalized = (mode ?? TelegramBot.UpdateModePolling).Trim().ToLowerInvariant();
        return normalized switch
        {
            TelegramBot.UpdateModePolling => TelegramBot.UpdateModePolling,
            TelegramBot.UpdateModeWebhook => TelegramBot.UpdateModeWebhook,
            _ => throw new InvalidOperationException("Telegram bot update mode must be polling or webhook")
        };
    }

    private static string CreateWebhookSecret() => Convert.ToBase64String(Guid.NewGuid().ToByteArray())
        .Replace("+", "", StringComparison.Ordinal)
        .Replace("/", "", StringComparison.Ordinal)
        .Replace("=", "", StringComparison.Ordinal);

    private static string EnsureWebhookSecret(string? secret)
    {
        var normalized = secret?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? CreateWebhookSecret() : normalized;
    }

    private static string NormalizeRequiredName(string value)
    {
        var normalized = value?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalized))
            throw new InvalidOperationException("Telegram bot name is required");
        return normalized;
    }

    private static string NormalizeDescription(string? value) => value?.Trim() ?? string.Empty;

    private static string? NormalizeShortDescription(string? value)
    {
        var normalized = value?.Trim() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static string? NormalizeOptional(string? value)
    {
        var normalized = value?.Trim() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static List<TelegramBotCommandPayload> NormalizeCommands(List<TelegramBotCommandPayload>? commands)
    {
        return (commands ?? [])
            .Where(x => !string.IsNullOrWhiteSpace(x.Command) || !string.IsNullOrWhiteSpace(x.Description))
            .Select(x => new TelegramBotCommandPayload(NormalizeCommand(x.Command), (x.Description ?? string.Empty).Trim()))
            .DistinctBy(x => x.Command)
            .ToList();
    }

    private static string SerializeCommands(List<TelegramBotCommandPayload>? commands)
    {
        return JsonSerializer.Serialize(NormalizeCommands(commands));
    }

    private static List<TelegramBotCommandPayload> DeserializeCommands(string json)
    {
        try
        {
            var commands = JsonSerializer.Deserialize<List<TelegramBotCommandPayload>>(json);
            return NormalizeCommands(commands);
        }
        catch
        {
            return [];
        }
    }

    private static List<TelegramBotReplyTemplatePayload> NormalizeReplyTemplates(List<TelegramBotReplyTemplatePayload>? templates)
    {
        var incoming = (templates ?? [])
            .Where(x => !string.IsNullOrWhiteSpace(x.Key))
            .ToDictionary(x => NormalizeTemplateKey(x.Key), x => x, StringComparer.Ordinal);

        return DefaultReplyTemplates
            .Select(template =>
            {
                if (!incoming.TryGetValue(NormalizeTemplateKey(template.Key), out var custom))
                    return template;

                return new TelegramBotReplyTemplatePayload(
                    template.Key,
                    template.Label,
                    template.Description,
                    custom.Enabled,
                    (custom.Text ?? string.Empty).Trim());
            })
            .ToList();
    }

    private static string SerializeReplyTemplates(List<TelegramBotReplyTemplatePayload>? templates)
    {
        return JsonSerializer.Serialize(NormalizeReplyTemplates(templates));
    }

    private static List<TelegramBotReplyTemplatePayload> DeserializeReplyTemplates(string json)
    {
        try
        {
            var templates = JsonSerializer.Deserialize<List<TelegramBotReplyTemplatePayload>>(json);
            return NormalizeReplyTemplates(templates);
        }
        catch
        {
            return NormalizeReplyTemplates(null);
        }
    }

    private static string NormalizeTemplateKey(string key) => key.Trim().ToLowerInvariant();

    private static string NormalizeCommand(string command)
    {
        var c = (command ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(c))
            return string.Empty;
        if (!c.StartsWith('/'))
            c = "/" + c;
        return c.ToLowerInvariant();
    }

    private static string? ExtractIncomingCommand(string? text)
    {
        if (string.IsNullOrWhiteSpace(text) || !text.StartsWith('/'))
            return null;

        var firstToken = text.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0];
        var command = firstToken.Split('@', 2, StringSplitOptions.RemoveEmptyEntries)[0];
        return NormalizeCommand(command);
    }

    private static string? TryGetString(JsonElement root, string parent, string property)
    {
        if (!root.TryGetProperty(parent, out var parentElement) || parentElement.ValueKind != JsonValueKind.Object)
            return null;
        if (!parentElement.TryGetProperty(property, out var valueElement) || valueElement.ValueKind != JsonValueKind.String)
            return null;
        return valueElement.GetString();
    }

    private static long TryGetInt64(JsonElement root, string parent, string property)
    {
        if (!root.TryGetProperty(parent, out var parentElement) || parentElement.ValueKind != JsonValueKind.Object)
            return 0;
        if (!parentElement.TryGetProperty(property, out var valueElement))
            return 0;
        return valueElement.ValueKind == JsonValueKind.Number && valueElement.TryGetInt64(out var value) ? value : 0;
    }

    private sealed record TelegramBotMeInfo(string? Username, JsonElement RawResult);
}
