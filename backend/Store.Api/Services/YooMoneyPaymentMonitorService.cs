using Microsoft.Extensions.DependencyInjection;

namespace Store.Api.Services;

public sealed class YooMoneyPaymentMonitorService : BackgroundService
{
    private static readonly TimeSpan IdleDelay = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan ErrorDelay = TimeSpan.FromSeconds(30);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<YooMoneyPaymentMonitorService> _logger;

    public YooMoneyPaymentMonitorService(
        IServiceScopeFactory scopeFactory,
        ILogger<YooMoneyPaymentMonitorService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var paymentService = scope.ServiceProvider.GetRequiredService<IYooMoneyPaymentService>();
                await paymentService.ProcessPendingPaymentsAsync(stoppingToken);
                await Task.Delay(IdleDelay, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "YooMoney payment monitor iteration failed.");
                try
                {
                    await Task.Delay(ErrorDelay, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
            }
        }
    }
}
