using System.Net;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;

namespace Store.Api.Services;

public sealed class TelegramHttpClientFactory
{
    private const string ProxySettingKey = "telegram_proxy_url";
    private const string ProxyConfigurationKey = "Telegram:ProxyUrl";

    private readonly IServiceProvider _serviceProvider;
    private readonly IConfiguration _configuration;
    private readonly ILogger<TelegramHttpClientFactory> _logger;

    public TelegramHttpClientFactory(
        IServiceProvider serviceProvider,
        IConfiguration configuration,
        ILogger<TelegramHttpClientFactory> logger)
    {
        _serviceProvider = serviceProvider;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<HttpClient> CreateClientAsync(CancellationToken cancellationToken = default)
    {
        var proxyUrl = await ResolveProxyUrlAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(proxyUrl))
        {
            return new HttpClient();
        }

        if (!Uri.TryCreate(NormalizeProxyUrl(proxyUrl), UriKind.Absolute, out var proxyUri))
        {
            _logger.LogWarning("Telegram proxy URL is invalid. Telegram requests will be sent without proxy.");
            return new HttpClient();
        }

        var proxy = new WebProxy(proxyUri);
        if (!string.IsNullOrWhiteSpace(proxyUri.UserInfo))
        {
            var credentialParts = proxyUri.UserInfo.Split(':', 2);
            proxy.Credentials = new NetworkCredential(
                Uri.UnescapeDataString(credentialParts[0]),
                credentialParts.Length > 1 ? Uri.UnescapeDataString(credentialParts[1]) : string.Empty);
        }

        var handler = new SocketsHttpHandler
        {
            Proxy = proxy,
            UseProxy = true
        };

        return new HttpClient(handler, disposeHandler: true);
    }

    private async Task<string?> ResolveProxyUrlAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();
            var row = await db.AppSettings
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Key == ProxySettingKey, cancellationToken);
            if (row is not null && !string.IsNullOrWhiteSpace(row.Value))
                return row.Value.Trim();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to load Telegram proxy URL from app settings.");
        }

        var configured = _configuration[ProxyConfigurationKey]
            ?? Environment.GetEnvironmentVariable("TELEGRAM_PROXY_URL");
        return string.IsNullOrWhiteSpace(configured) ? null : configured.Trim();
    }

    private static string NormalizeProxyUrl(string proxyUrl)
    {
        var trimmed = proxyUrl.Trim();
        return trimmed.StartsWith("socks5h://", StringComparison.OrdinalIgnoreCase)
            ? string.Concat("socks5://", trimmed.AsSpan("socks5h://".Length))
            : trimmed;
    }
}
