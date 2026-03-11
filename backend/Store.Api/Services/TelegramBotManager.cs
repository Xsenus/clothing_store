using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
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
    Task<object> ValidateTokenAsync(string token);
    Task SyncNowAsync();
}

public class TelegramBotManager : BackgroundService, ITelegramBotManager
{
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

    public async Task<object> ValidateTokenAsync(string token)
    {
        var normalizedToken = token?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalizedToken))
            throw new InvalidOperationException("Telegram bot token is required");

        var me = await FetchMeInfoAsync(normalizedToken, CancellationToken.None);
        return JsonSerializer.Deserialize<object>(me.RawResult.GetRawText()) ?? new { };
    }

    public async Task SyncNowAsync() => await SyncWorkersAsync(CancellationToken.None);

    private async Task SyncWorkersAsync(CancellationToken token)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();
        var activeBots = await db.TelegramBots
            .Where(x => x.Enabled && !string.IsNullOrWhiteSpace(x.Token))
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

                    var chatId = messageEl.TryGetProperty("chat", out var chatEl) && chatEl.TryGetProperty("id", out var chatIdEl)
                        ? chatIdEl.GetInt64()
                        : 0;
                    var text = messageEl.TryGetProperty("text", out var textEl) ? textEl.GetString() : null;
                    if (chatId == 0 || string.IsNullOrWhiteSpace(text))
                        continue;

                    if (text.StartsWith("/check", StringComparison.OrdinalIgnoreCase))
                    {
                        await SendMessageAsync(client, bot.Token, chatId, $"✅ Bot '{bot.Name}' работает. ID: {bot.Id}", token);
                    }
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

    private static async Task SendMessageAsync(HttpClient client, string token, long chatId, string text, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(new { chat_id = chatId, text });
        using var req = new HttpRequestMessage(HttpMethod.Post, $"https://api.telegram.org/bot{token}/sendMessage")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
        await client.SendAsync(req, cancellationToken);
    }

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

        var token = payload.Token?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Telegram bot token is required");

        await FetchMeInfoAsync(token, CancellationToken.None);

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var bot = new TelegramBot
        {
            Name = payload.Name.Trim(),
            Description = payload.Description?.Trim() ?? string.Empty,
            ShortDescription = payload.ShortDescription?.Trim(),
            ImageUrl = string.IsNullOrWhiteSpace(payload.ImageUrl) ? null : payload.ImageUrl.Trim(),
            Token = token,
            Enabled = payload.Enabled,
            CommandsJson = SerializeCommands(payload.Commands),
            CreatedAt = now,
            UpdatedAt = now
        };

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
        if (bot is null) return null;

        var tokenCandidate = payload.Token is null ? bot.Token : payload.Token.Trim();
        if (string.IsNullOrWhiteSpace(tokenCandidate))
            throw new InvalidOperationException("Telegram bot token is required");

        await FetchMeInfoAsync(tokenCandidate, CancellationToken.None);

        if (payload.Name is not null) bot.Name = payload.Name.Trim();
        if (payload.Description is not null) bot.Description = payload.Description.Trim();
        if (payload.ShortDescription is not null) bot.ShortDescription = payload.ShortDescription.Trim();
        if (payload.ImageUrl is not null) bot.ImageUrl = string.IsNullOrWhiteSpace(payload.ImageUrl) ? null : payload.ImageUrl.Trim();
        bot.Token = tokenCandidate;
        if (payload.Enabled.HasValue) bot.Enabled = payload.Enabled.Value;
        if (payload.Commands is not null) bot.CommandsJson = SerializeCommands(payload.Commands);
        bot.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

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
        if (bot is null) return false;
        db.TelegramBots.Remove(bot);
        await db.SaveChangesAsync();
        await SyncNowAsync();
        return true;
    }

    public async Task<object?> CheckBotAsync(string id)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();
        var bot = await db.TelegramBots.FirstOrDefaultAsync(x => x.Id == id);
        if (bot is null) return null;
        await ApplyBotMetadataAsync(bot, CancellationToken.None);
        await db.SaveChangesAsync();
        return ToDto(bot);
    }

    private async Task ApplyBotMetadataAsync(TelegramBot bot, CancellationToken cancellationToken)
    {
        var meInfo = await FetchMeInfoAsync(bot.Token, cancellationToken);
        bot.Username = meInfo.Username ?? bot.Username;
        bot.LastBotInfoJson = JsonSerializer.Serialize(meInfo.RawResult);

        var commands = DeserializeCommands(bot.CommandsJson);
        if (!commands.Any(x => x.Command == "/check"))
        {
            commands.Insert(0, new TelegramBotCommandPayload("/check", "Проверка работы бота"));
            bot.CommandsJson = SerializeCommands(commands);
        }

        await CallTelegramMethodAsync(bot.Token, "setMyCommands", new
        {
            commands = commands.Select(x => new { command = x.Command.TrimStart('/'), description = x.Description }).ToList()
        }, cancellationToken);

        await CallTelegramMethodAsync(bot.Token, "setMyDescription", new
        {
            description = bot.Description ?? string.Empty
        }, cancellationToken);

        await CallTelegramMethodAsync(bot.Token, "setMyShortDescription", new
        {
            short_description = bot.ShortDescription ?? string.Empty
        }, cancellationToken);

        if (!string.IsNullOrWhiteSpace(bot.ImageUrl) && !string.IsNullOrWhiteSpace(bot.Username))
        {
            await TryUpdateBotPhotoAsync(bot, cancellationToken);
        }

        bot.LastCheckedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        bot.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    private async Task TryUpdateBotPhotoAsync(TelegramBot bot, CancellationToken cancellationToken)
    {
        try
        {
            var client = _httpClientFactory.CreateClient();
            await using var photoStream = await client.GetStreamAsync(bot.ImageUrl!, cancellationToken);
            using var formData = new MultipartFormDataContent
            {
                { new StringContent($"@{bot.Username}"), "chat_id" }
            };
            var streamContent = new StreamContent(photoStream);
            streamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");
            formData.Add(streamContent, "photo", "bot-photo.jpg");

            using var req = new HttpRequestMessage(HttpMethod.Post, $"https://api.telegram.org/bot{bot.Token}/setChatPhoto")
            {
                Content = formData
            };
            using var res = await client.SendAsync(req, cancellationToken);
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Telegram setChatPhoto failed for bot {BotId}: {StatusCode}", bot.Id, (int)res.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to update Telegram bot photo for {BotId}", bot.Id);
        }
    }

    private async Task CallTelegramMethodAsync(string token, string method, object payload, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var req = new HttpRequestMessage(HttpMethod.Post, $"https://api.telegram.org/bot{token}/{method}")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };

        using var res = await client.SendAsync(req, cancellationToken);
        var content = await res.Content.ReadAsStringAsync(cancellationToken);
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"Telegram {method} failed with status {(int)res.StatusCode}");

        using var doc = JsonDocument.Parse(content);
        if (!doc.RootElement.TryGetProperty("ok", out var okEl) || !okEl.GetBoolean())
            throw new InvalidOperationException($"Telegram {method} returned unsuccessful response");
    }

    private async Task<TelegramBotMeInfo> FetchMeInfoAsync(string token, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var meRes = await client.GetAsync($"https://api.telegram.org/bot{token}/getMe", cancellationToken);
        var meContent = await meRes.Content.ReadAsStringAsync(cancellationToken);

        if (!meRes.IsSuccessStatusCode)
            throw new InvalidOperationException($"Telegram getMe failed with status {(int)meRes.StatusCode}");

        using var doc = JsonDocument.Parse(meContent);
        if (!doc.RootElement.TryGetProperty("ok", out var okEl) || !okEl.GetBoolean())
            throw new InvalidOperationException("Telegram getMe returned unsuccessful response");

        if (!doc.RootElement.TryGetProperty("result", out var resultEl) || resultEl.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException("Telegram getMe response does not contain bot info");

        var rawJson = resultEl.GetRawText();
        using var rawDoc = JsonDocument.Parse(rawJson);
        var cloned = rawDoc.RootElement.Clone();
        var username = cloned.TryGetProperty("username", out var u) ? u.GetString() : null;

        return new TelegramBotMeInfo(username, cloned);
    }

    private sealed record TelegramBotMeInfo(string? Username, JsonElement RawResult);

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
            Commands = DeserializeCommands(bot.CommandsJson),
            bot.CreatedAt,
            bot.UpdatedAt,
            bot.LastCheckedAt,
            BotInfo = info
        };
    }

    private static string MaskToken(string token)
    {
        var trimmed = token?.Trim() ?? string.Empty;
        if (trimmed.Length <= 8)
            return "********";

        var start = trimmed[..4];
        var end = trimmed[^4..];
        return $"{start}****{end}";
    }

    private static string SerializeCommands(List<TelegramBotCommandPayload>? commands)
    {
        var normalized = (commands ?? [])
            .Where(x => !string.IsNullOrWhiteSpace(x.Command) && !string.IsNullOrWhiteSpace(x.Description))
            .Select(x => new TelegramBotCommandPayload(NormalizeCommand(x.Command), x.Description.Trim()))
            .DistinctBy(x => x.Command)
            .ToList();

        return JsonSerializer.Serialize(normalized);
    }

    private static List<TelegramBotCommandPayload> DeserializeCommands(string json)
    {
        try
        {
            var commands = JsonSerializer.Deserialize<List<TelegramBotCommandPayload>>(json);
            return commands ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static string NormalizeCommand(string command)
    {
        var c = command.Trim();
        if (!c.StartsWith('/')) c = "/" + c;
        return c.ToLowerInvariant();
    }
}
