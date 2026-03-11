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
        var activeBots = await db.TelegramBots.Where(x => x.Enabled && x.Token != "").Select(x => x.Id).ToListAsync(token);
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

                    if (text.StartsWith("/check"))
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
            ImageUrl = string.IsNullOrWhiteSpace(payload.ImageUrl) ? null : payload.ImageUrl.Trim(),
            Token = token,
            Username = string.IsNullOrWhiteSpace(payload.Username) ? null : payload.Username.Trim().TrimStart('@'),
            Enabled = payload.Enabled,
            CommandsJson = SerializeCommands(payload.Commands),
            CreatedAt = now,
            UpdatedAt = now
        };

        await ApplyBotMetadataAsync(db, bot, CancellationToken.None);
        await FetchMeInfoAsync(bot.Token, CancellationToken.None);

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
        if (payload.ImageUrl is not null) bot.ImageUrl = string.IsNullOrWhiteSpace(payload.ImageUrl) ? null : payload.ImageUrl.Trim();
        bot.Token = tokenCandidate;
        if (payload.Username is not null) bot.Username = string.IsNullOrWhiteSpace(payload.Username) ? null : payload.Username.Trim().TrimStart('@');
        if (payload.Enabled.HasValue) bot.Enabled = payload.Enabled.Value;
        if (payload.Commands is not null) bot.CommandsJson = SerializeCommands(payload.Commands);
        bot.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        await ApplyBotMetadataAsync(db, bot, CancellationToken.None);
        await FetchMeInfoAsync(bot.Token, CancellationToken.None);

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
        await ApplyBotMetadataAsync(db, bot, CancellationToken.None);
        await db.SaveChangesAsync();
        return ToDto(bot);
    }

    private async Task ApplyBotMetadataAsync(StoreDbContext db, TelegramBot bot, CancellationToken cancellationToken)
    {
        var meInfo = await FetchMeInfoAsync(bot.Token, cancellationToken);
        bot.Username = meInfo.Username ?? bot.Username;
        bot.LastBotInfoJson = JsonSerializer.Serialize(meInfo.RawResult);

        var client = _httpClientFactory.CreateClient();

        var commands = DeserializeCommands(bot.CommandsJson);
        if (!commands.Any(x => x.Command == "/check"))
        {
            commands.Insert(0, new TelegramBotCommandPayload("/check", "Проверка работы бота"));
            bot.CommandsJson = SerializeCommands(commands);
        }

        var setCommandsPayload = JsonSerializer.Serialize(new
        {
            commands = commands.Select(x => new { command = x.Command.TrimStart('/'), description = x.Description }).ToList()
        });
        using var req = new HttpRequestMessage(HttpMethod.Post, $"https://api.telegram.org/bot{bot.Token}/setMyCommands")
        {
            Content = new StringContent(setCommandsPayload, Encoding.UTF8, "application/json")
        };
        await client.SendAsync(req, cancellationToken);
        bot.LastCheckedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        bot.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
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
            catch { }
        }

        return new
        {
            bot.Id,
            bot.Name,
            bot.Description,
            bot.ImageUrl,
            bot.Username,
            bot.Enabled,
            Commands = DeserializeCommands(bot.CommandsJson),
            bot.CreatedAt,
            bot.UpdatedAt,
            bot.LastCheckedAt,
            BotInfo = info
        };
    }

    private static string SerializeCommands(List<TelegramBotCommandPayload>? commands)
    {
        var normalized = (commands ?? []).Where(x => !string.IsNullOrWhiteSpace(x.Command) && !string.IsNullOrWhiteSpace(x.Description))
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
