namespace Store.Api.Services;

public sealed class DatabaseBackupSchedulerService : BackgroundService
{
    private static readonly TimeSpan ErrorDelay = TimeSpan.FromSeconds(30);

    private readonly DatabaseBackupService _databaseBackupService;
    private readonly ILogger<DatabaseBackupSchedulerService> _logger;

    public DatabaseBackupSchedulerService(
        DatabaseBackupService databaseBackupService,
        ILogger<DatabaseBackupSchedulerService> logger)
    {
        _databaseBackupService = databaseBackupService;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _databaseBackupService.EnsureScheduledBackupsAsync(stoppingToken);
                await Task.Delay(_databaseBackupService.PollingInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Database backup scheduler iteration failed.");
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
