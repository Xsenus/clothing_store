using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Store.Api.Configuration;
using Store.Api.Data;

namespace Store.Api.Services;

public sealed record DatabaseBackupFileInfo(
    string FileName,
    string RelativePath,
    long SizeBytes,
    long CreatedAt,
    string Trigger);

public sealed record DatabaseBackupOverview(
    bool AutomaticEnabled,
    string ScheduleLocal,
    int RetentionDays,
    string RootDirectory,
    string TimeZone,
    string PgDumpCommand,
    IReadOnlyList<DatabaseBackupFileInfo> Items);

public sealed record DatabaseBackupCreateResult(
    DatabaseBackupFileInfo Backup,
    string DownloadPath);

public sealed class DatabaseBackupService
{
    private const string AutomaticEnabledSettingKey = "database_backup_enabled";
    private const string ScheduleSettingKey = "database_backup_schedule_local";
    private const string RetentionDaysSettingKey = "database_backup_retention_days";
    private static readonly TimeSpan DefaultPollingInterval = TimeSpan.FromMinutes(1);
    private static readonly TimeOnly[] DefaultSchedule =
    [
        new(3, 0),
        new(15, 0)
    ];

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly StoreRuntimePaths _runtimePaths;
    private readonly ILogger<DatabaseBackupService> _logger;
    private readonly SemaphoreSlim _backupSemaphore = new(1, 1);

    public DatabaseBackupService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        StoreRuntimePaths runtimePaths,
        ILogger<DatabaseBackupService> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _runtimePaths = runtimePaths;
        _logger = logger;
    }

    public TimeSpan PollingInterval => DefaultPollingInterval;

    public async Task<DatabaseBackupOverview> GetOverviewAsync(CancellationToken cancellationToken = default)
    {
        var settings = await LoadSettingsAsync(cancellationToken);
        var items = await ListBackupsAsync(cancellationToken);

        return new DatabaseBackupOverview(
            settings.AutomaticEnabled,
            settings.ScheduleRaw,
            settings.RetentionDays,
            settings.RootDirectory,
            TimeZoneInfo.Local.DisplayName,
            ResolvePgDumpDisplayCommand(settings.PgDumpCommand),
            items);
    }

    public Task<IReadOnlyList<DatabaseBackupFileInfo>> ListBackupsAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Directory.CreateDirectory(_runtimePaths.DatabaseBackupsDir);

        var rootDirectory = _runtimePaths.DatabaseBackupsDir;
        var files = Directory.Exists(rootDirectory)
            ? Directory.EnumerateFiles(rootDirectory, "*.dump", SearchOption.AllDirectories)
            : Array.Empty<string>();

        var items = files
            .Select(path => BuildFileInfo(path, rootDirectory))
            .Where(static item => item is not null)
            .Select(static item => item!)
            .OrderByDescending(item => item.CreatedAt)
            .Take(100)
            .ToList();

        return Task.FromResult<IReadOnlyList<DatabaseBackupFileInfo>>(items);
    }

    public async Task<DatabaseBackupCreateResult> CreateManualBackupAsync(CancellationToken cancellationToken = default)
    {
        var backup = await CreateBackupAsync("manual", null, cancellationToken);
        return new DatabaseBackupCreateResult(
            backup,
            $"/admin/database-backups/download?relativePath={Uri.EscapeDataString(backup.RelativePath.Replace('\\', '/'))}");
    }

    public async Task<int> EnsureScheduledBackupsAsync(CancellationToken cancellationToken = default)
    {
        var settings = await LoadSettingsAsync(cancellationToken);
        await CleanupExpiredBackupsAsync(settings.RetentionDays, cancellationToken);

        if (!settings.AutomaticEnabled || settings.Schedule.Count == 0)
            return 0;

        var nowLocal = DateTimeOffset.Now;
        var createdCount = 0;
        foreach (var scheduledTime in settings.Schedule)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (scheduledTime > TimeOnly.FromDateTime(nowLocal.DateTime))
                continue;

            var slotKey = scheduledTime.ToString("HHmm", CultureInfo.InvariantCulture);
            if (HasBackupForSlot(settings.RootDirectory, nowLocal.Date, slotKey))
                continue;

            await CreateBackupAsync("auto", slotKey, cancellationToken);
            createdCount++;
        }

        return createdCount;
    }

    public string? ResolveBackupPath(string? relativePath)
    {
        var normalizedRelativePath = relativePath?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedRelativePath))
            return null;

        var safeRelativePath = normalizedRelativePath
            .Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar)
            .TrimStart(Path.DirectorySeparatorChar);

        var fullPath = Path.GetFullPath(Path.Combine(_runtimePaths.DatabaseBackupsDir, safeRelativePath));
        var rootPath = Path.GetFullPath(_runtimePaths.DatabaseBackupsDir)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;

        if (!fullPath.StartsWith(rootPath, StringComparison.OrdinalIgnoreCase))
            return null;

        if (!System.IO.File.Exists(fullPath))
            return null;

        return fullPath;
    }

    private async Task<DatabaseBackupFileInfo> CreateBackupAsync(
        string trigger,
        string? scheduleSlot,
        CancellationToken cancellationToken)
    {
        var settings = await LoadSettingsAsync(cancellationToken);
        await _backupSemaphore.WaitAsync(cancellationToken);
        try
        {
            Directory.CreateDirectory(settings.RootDirectory);

            var connectionString = _configuration.GetConnectionString("DefaultConnection");
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new InvalidOperationException("Default database connection string is not configured.");

            var csb = new NpgsqlConnectionStringBuilder(connectionString);
            if (string.IsNullOrWhiteSpace(csb.Database))
                throw new InvalidOperationException("Database name is missing in the PostgreSQL connection string.");

            var nowLocal = DateTimeOffset.Now;
            var targetDirectory = Path.Combine(
                settings.RootDirectory,
                nowLocal.ToString("yyyy", CultureInfo.InvariantCulture),
                nowLocal.ToString("MM", CultureInfo.InvariantCulture),
                nowLocal.ToString("dd", CultureInfo.InvariantCulture));
            Directory.CreateDirectory(targetDirectory);

            var scheduleSuffix = string.IsNullOrWhiteSpace(scheduleSlot) ? string.Empty : $"_{scheduleSlot}";
            var fileName = $"{SanitizeFilePart(csb.Database)}_{nowLocal:yyyyMMdd_HHmmss}_{trigger}{scheduleSuffix}.dump";
            var outputPath = Path.Combine(targetDirectory, fileName);
            var pgDumpExecutable = ResolvePgDumpExecutable(settings.PgDumpCommand);

            var startInfo = new ProcessStartInfo
            {
                FileName = pgDumpExecutable,
                WorkingDirectory = targetDirectory,
                UseShellExecute = false,
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                CreateNoWindow = true
            };
            startInfo.ArgumentList.Add("--host");
            startInfo.ArgumentList.Add(string.IsNullOrWhiteSpace(csb.Host) ? "127.0.0.1" : csb.Host);
            startInfo.ArgumentList.Add("--port");
            startInfo.ArgumentList.Add(csb.Port.ToString(CultureInfo.InvariantCulture));
            startInfo.ArgumentList.Add("--username");
            startInfo.ArgumentList.Add(csb.Username ?? string.Empty);
            startInfo.ArgumentList.Add("--dbname");
            startInfo.ArgumentList.Add(csb.Database);
            startInfo.ArgumentList.Add("--format");
            startInfo.ArgumentList.Add("custom");
            startInfo.ArgumentList.Add("--compress");
            startInfo.ArgumentList.Add("6");
            startInfo.ArgumentList.Add("--blobs");
            startInfo.ArgumentList.Add("--no-password");
            startInfo.ArgumentList.Add("--file");
            startInfo.ArgumentList.Add(outputPath);

            if (!string.IsNullOrWhiteSpace(csb.Password))
                startInfo.Environment["PGPASSWORD"] = csb.Password;

            Process process;
            try
            {
                process = new Process { StartInfo = startInfo };
                if (!process.Start())
                    throw new InvalidOperationException("Failed to start pg_dump process.");
            }
            catch (Win32Exception ex)
            {
                TryDeleteFile(outputPath);
                throw new InvalidOperationException(
                    $"Не удалось запустить pg_dump по пути '{pgDumpExecutable}'. {ex.Message}",
                    ex);
            }

            using (process)
            {
                var stdErrTask = process.StandardError.ReadToEndAsync(cancellationToken);
                var stdOutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
                await process.WaitForExitAsync(cancellationToken);

                var stdErr = (await stdErrTask).Trim();
                _ = await stdOutTask;

                if (process.ExitCode != 0)
                {
                    TryDeleteFile(outputPath);
                    var detail = string.IsNullOrWhiteSpace(stdErr)
                        ? $"pg_dump exited with code {process.ExitCode}."
                        : stdErr;
                    throw new InvalidOperationException(detail);
                }

                var fileInfo = BuildFileInfo(outputPath, settings.RootDirectory)
                    ?? throw new InvalidOperationException("Backup file was created but could not be indexed.");

                _logger.LogInformation(
                    "Created database backup {FileName} ({SizeBytes} bytes, trigger={Trigger})",
                    fileInfo.FileName,
                    fileInfo.SizeBytes,
                    trigger);

                await CleanupExpiredBackupsAsync(settings.RetentionDays, cancellationToken);
                return fileInfo;
            }
        }
        finally
        {
            _backupSemaphore.Release();
        }
    }

    private bool HasBackupForSlot(string rootDirectory, DateTime localDate, string slotKey)
    {
        var dayDirectory = Path.Combine(
            rootDirectory,
            localDate.ToString("yyyy", CultureInfo.InvariantCulture),
            localDate.ToString("MM", CultureInfo.InvariantCulture),
            localDate.ToString("dd", CultureInfo.InvariantCulture));

        if (!Directory.Exists(dayDirectory))
            return false;

        return Directory.EnumerateFiles(dayDirectory, $"*_auto_{slotKey}.dump", SearchOption.TopDirectoryOnly).Any();
    }

    private Task CleanupExpiredBackupsAsync(int retentionDays, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (retentionDays <= 0 || !Directory.Exists(_runtimePaths.DatabaseBackupsDir))
            return Task.CompletedTask;

        var threshold = DateTimeOffset.Now.AddDays(-retentionDays);
        foreach (var filePath in Directory.EnumerateFiles(_runtimePaths.DatabaseBackupsDir, "*.dump", SearchOption.AllDirectories))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var fileInfo = new FileInfo(filePath);
            if (fileInfo.LastWriteTimeUtc > threshold.UtcDateTime)
                continue;

            TryDeleteFile(filePath);
        }

        foreach (var directory in Directory.EnumerateDirectories(_runtimePaths.DatabaseBackupsDir, "*", SearchOption.AllDirectories)
                     .OrderByDescending(path => path.Length))
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!Directory.EnumerateFileSystemEntries(directory).Any())
            {
                Directory.Delete(directory, false);
            }
        }

        return Task.CompletedTask;
    }

    private async Task<BackupSettings> LoadSettingsAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDbContext>();

        var appSettings = await db.AppSettings
            .AsNoTracking()
            .Where(x => x.Key == AutomaticEnabledSettingKey || x.Key == ScheduleSettingKey || x.Key == RetentionDaysSettingKey)
            .ToDictionaryAsync(x => x.Key, x => x.Value, cancellationToken);

        var automaticEnabled = ParseBoolean(
            GetSettingOrConfig(appSettings, AutomaticEnabledSettingKey, "DatabaseBackup:Enabled"),
            fallback: true);
        var scheduleRaw = GetSettingOrConfig(appSettings, ScheduleSettingKey, "DatabaseBackup:ScheduleLocal") ?? "03:00,15:00";
        var retentionDays = ParseInt(
            GetSettingOrConfig(appSettings, RetentionDaysSettingKey, "DatabaseBackup:RetentionDays"),
            fallback: 14,
            minValue: 1,
            maxValue: 365);
        var pgDumpCommand = (_configuration["DatabaseBackup:PgDumpPath"] ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(pgDumpCommand))
            pgDumpCommand = OperatingSystem.IsWindows() ? "pg_dump.exe" : "pg_dump";

        return new BackupSettings(
            automaticEnabled,
            scheduleRaw,
            ParseSchedule(scheduleRaw),
            retentionDays,
            _runtimePaths.DatabaseBackupsDir,
            pgDumpCommand);
    }

    private string? GetSettingOrConfig(
        IReadOnlyDictionary<string, string> appSettings,
        string appSettingKey,
        string configPath)
    {
        if (appSettings.TryGetValue(appSettingKey, out var appSettingValue) && !string.IsNullOrWhiteSpace(appSettingValue))
            return appSettingValue.Trim();

        var configValue = _configuration[configPath];
        return string.IsNullOrWhiteSpace(configValue) ? null : configValue.Trim();
    }

    private static IReadOnlyList<TimeOnly> ParseSchedule(string? rawValue)
    {
        var parsed = (rawValue ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(value => TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time)
                ? time
                : (TimeOnly?)null)
            .Where(static time => time.HasValue)
            .Select(static time => time!.Value)
            .Distinct()
            .OrderBy(time => time)
            .ToList();

        return parsed.Count > 0 ? parsed : DefaultSchedule;
    }

    private string ResolvePgDumpDisplayCommand(string configuredCommand)
    {
        return TryResolvePgDumpExecutable(configuredCommand) ?? configuredCommand;
    }

    private string ResolvePgDumpExecutable(string configuredCommand)
    {
        return TryResolvePgDumpExecutable(configuredCommand)
            ?? throw new InvalidOperationException(BuildPgDumpNotFoundMessage(configuredCommand));
    }

    private static string? TryResolvePgDumpExecutable(string configuredCommand)
    {
        foreach (var candidate in GetPgDumpCandidates(configuredCommand))
        {
            var resolved = TryResolveExecutableCandidate(candidate);
            if (!string.IsNullOrWhiteSpace(resolved))
                return resolved;
        }

        return null;
    }

    private static IEnumerable<string> GetPgDumpCandidates(string configuredCommand)
    {
        var normalizedConfiguredValue = NormalizeCommandValue(configuredCommand);
        if (!string.IsNullOrWhiteSpace(normalizedConfiguredValue))
            yield return normalizedConfiguredValue;

        var defaultCommand = OperatingSystem.IsWindows() ? "pg_dump.exe" : "pg_dump";
        if (!string.Equals(normalizedConfiguredValue, defaultCommand, StringComparison.OrdinalIgnoreCase))
            yield return defaultCommand;

        foreach (var candidate in OperatingSystem.IsWindows()
                     ? EnumerateWindowsPgDumpLocations()
                     : EnumerateUnixPgDumpLocations())
        {
            yield return candidate;
        }
    }

    private static string? TryResolveExecutableCandidate(string candidate)
    {
        var normalizedCandidate = NormalizeCommandValue(candidate);
        if (string.IsNullOrWhiteSpace(normalizedCandidate))
            return null;

        if (Path.IsPathRooted(normalizedCandidate)
            || normalizedCandidate.Contains(Path.DirectorySeparatorChar)
            || normalizedCandidate.Contains(Path.AltDirectorySeparatorChar))
        {
            return System.IO.File.Exists(normalizedCandidate)
                ? Path.GetFullPath(normalizedCandidate)
                : null;
        }

        if (System.IO.File.Exists(normalizedCandidate))
            return Path.GetFullPath(normalizedCandidate);

        return TryResolveFromPath(normalizedCandidate);
    }

    private static string? TryResolveFromPath(string executableName)
    {
        var pathValue = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrWhiteSpace(pathValue))
            return null;

        foreach (var rawDirectory in pathValue.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var directory = NormalizeCommandValue(rawDirectory);
            if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
                continue;

            foreach (var candidateName in EnumerateExecutableNames(executableName))
            {
                var candidatePath = Path.Combine(directory, candidateName);
                if (System.IO.File.Exists(candidatePath))
                    return candidatePath;
            }
        }

        return null;
    }

    private static IEnumerable<string> EnumerateExecutableNames(string executableName)
    {
        yield return executableName;

        if (!OperatingSystem.IsWindows() || Path.HasExtension(executableName))
            yield break;

        var pathExtValue = Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE;.BAT;.CMD";
        foreach (var rawExtension in pathExtValue.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var extension = rawExtension.StartsWith('.') ? rawExtension : $".{rawExtension}";
            yield return $"{executableName}{extension}";
        }
    }

    private static IEnumerable<string> EnumerateWindowsPgDumpLocations()
    {
        foreach (var rootVariable in new[] { "ProgramFiles", "ProgramFiles(x86)" })
        {
            var programFilesRoot = Environment.GetEnvironmentVariable(rootVariable);
            if (string.IsNullOrWhiteSpace(programFilesRoot))
                continue;

            var postgresRoot = Path.Combine(programFilesRoot, "PostgreSQL");
            foreach (var versionDirectory in EnumerateDirectoriesSafe(postgresRoot).OrderByDescending(Path.GetFileName))
            {
                var candidatePath = Path.Combine(versionDirectory, "bin", "pg_dump.exe");
                if (System.IO.File.Exists(candidatePath))
                    yield return candidatePath;
            }
        }

        var chocolateyRoot = Environment.GetEnvironmentVariable("ChocolateyInstall");
        if (!string.IsNullOrWhiteSpace(chocolateyRoot))
        {
            var candidatePath = Path.Combine(chocolateyRoot, "bin", "pg_dump.exe");
            if (System.IO.File.Exists(candidatePath))
                yield return candidatePath;
        }
    }

    private static IEnumerable<string> EnumerateUnixPgDumpLocations()
    {
        foreach (var candidatePath in new[] { "/usr/bin/pg_dump", "/usr/local/bin/pg_dump", "/opt/homebrew/bin/pg_dump" })
        {
            if (System.IO.File.Exists(candidatePath))
                yield return candidatePath;
        }

        foreach (var versionDirectory in EnumerateDirectoriesSafe("/usr/lib/postgresql").OrderByDescending(Path.GetFileName))
        {
            var candidatePath = Path.Combine(versionDirectory, "bin", "pg_dump");
            if (System.IO.File.Exists(candidatePath))
                yield return candidatePath;
        }
    }

    private static IEnumerable<string> EnumerateDirectoriesSafe(string path)
    {
        try
        {
            return Directory.Exists(path)
                ? Directory.EnumerateDirectories(path, "*", SearchOption.TopDirectoryOnly)
                : Array.Empty<string>();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private static string NormalizeCommandValue(string? value)
    {
        return Environment.ExpandEnvironmentVariables((value ?? string.Empty).Trim().Trim('"'));
    }

    private static string BuildPgDumpNotFoundMessage(string configuredCommand)
    {
        var normalizedConfiguredValue = NormalizeCommandValue(configuredCommand);
        var configuredHint = string.IsNullOrWhiteSpace(normalizedConfiguredValue)
            ? "Автоматический поиск pg_dump не дал результата."
            : $"Не удалось найти pg_dump по значению '{normalizedConfiguredValue}'.";

        return $"{configuredHint} Для Windows укажите полный путь, например 'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe', либо добавьте каталог PostgreSQL\\\\bin в PATH. Для Linux установите пакет postgresql-client и укажите путь вроде '/usr/bin/pg_dump', если он не попал в PATH.";
    }

    private static bool ParseBoolean(string? value, bool fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
            return fallback;

        return value.Trim().ToLowerInvariant() switch
        {
            "1" or "true" or "yes" or "on" => true,
            "0" or "false" or "no" or "off" => false,
            _ => fallback
        };
    }

    private static int ParseInt(string? value, int fallback, int minValue, int maxValue)
    {
        if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
            return fallback;

        return Math.Clamp(parsed, minValue, maxValue);
    }

    private static DatabaseBackupFileInfo? BuildFileInfo(string filePath, string rootDirectory)
    {
        if (!System.IO.File.Exists(filePath))
            return null;

        var fileInfo = new FileInfo(filePath);
        var relativePath = Path.GetRelativePath(rootDirectory, filePath);
        var trigger = fileInfo.Name.Contains("_manual", StringComparison.OrdinalIgnoreCase)
            ? "manual"
            : fileInfo.Name.Contains("_auto", StringComparison.OrdinalIgnoreCase)
                ? "auto"
                : "unknown";

        return new DatabaseBackupFileInfo(
            fileInfo.Name,
            relativePath.Replace('\\', '/'),
            fileInfo.Length,
            new DateTimeOffset(fileInfo.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
            trigger);
    }

    private static string SanitizeFilePart(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "database";

        var invalidChars = Path.GetInvalidFileNameChars();
        var sanitized = new string(value
            .Trim()
            .Select(ch => invalidChars.Contains(ch) || char.IsWhiteSpace(ch) ? '_' : ch)
            .ToArray());

        return string.IsNullOrWhiteSpace(sanitized) ? "database" : sanitized;
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (System.IO.File.Exists(path))
                System.IO.File.Delete(path);
        }
        catch
        {
            // Ignore cleanup failures for partial backup files.
        }
    }

    private sealed record BackupSettings(
        bool AutomaticEnabled,
        string ScheduleRaw,
        IReadOnlyList<TimeOnly> Schedule,
        int RetentionDays,
        string RootDirectory,
        string PgDumpCommand);
}
