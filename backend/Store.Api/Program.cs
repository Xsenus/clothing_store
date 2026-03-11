using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

var projectRoot = Environment.GetEnvironmentVariable("STORE_ROOT")
    ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
var seedDir = Environment.GetEnvironmentVariable("STORE_SEED_DIR")
    ?? Path.Combine(projectRoot, "seed");
var seedProductsPath = Environment.GetEnvironmentVariable("STORE_SEED_PRODUCTS_PATH")
    ?? Path.Combine(seedDir, "products.jsonl");
var uploadsDir = Environment.GetEnvironmentVariable("STORE_UPLOADS_DIR")
    ?? Path.Combine(projectRoot, "backend", "uploads");
Directory.CreateDirectory(uploadsDir);

var databaseUrl = builder.Configuration.GetConnectionString("DefaultConnection");

if (string.IsNullOrWhiteSpace(databaseUrl))
{
    // systemd can start the DLL from /opt/.../publish while WorkingDirectory points
    // to the repository root. In that case default host config misses runtime
    // appsettings files, so we attempt an explicit fallback lookup from runtime dir.
    var runtimeConfig = new ConfigurationBuilder()
        .SetBasePath(AppContext.BaseDirectory)
        .AddJsonFile("appsettings.json", optional: true, reloadOnChange: false)
        .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: false)
        .AddEnvironmentVariables()
        .Build();

    databaseUrl = runtimeConfig.GetConnectionString("DefaultConnection");

    if (!string.IsNullOrWhiteSpace(databaseUrl))
    {
        builder.Configuration["ConnectionStrings:DefaultConnection"] = databaseUrl;
    }
}

if (string.IsNullOrWhiteSpace(databaseUrl))
    throw new InvalidOperationException(
        "ConnectionStrings:DefaultConnection must be set. " +
        "Check /opt/clothing_store/.env (ConnectionStrings__DefaultConnection), " +
        "systemd EnvironmentFile, or appsettings.Production.json in publish directory.");

builder.Configuration["ResolvedDatabase:Provider"] = "postgres";
builder.Configuration["ResolvedDatabase:ConnectionString"] = databaseUrl;
builder.Services.AddDbContext<StoreDbContext>(opt => opt.UseNpgsql(databaseUrl));

builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<AdminDataSeeder>();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<DatabaseInitializer>();
builder.Services.AddSingleton<GalleryStorageService>();
builder.Services.AddSingleton<TelegramBotManager>();
builder.Services.AddSingleton<ITelegramBotManager>(sp => sp.GetRequiredService<TelegramBotManager>());
builder.Services.AddHostedService(sp => sp.GetRequiredService<TelegramBotManager>());
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var corsAllowAnyOrigin = builder.Configuration.GetValue<bool?>("Cors:AllowAnyOrigin") ?? true;
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddPolicy("app", policy =>
    {
        if (corsAllowAnyOrigin)
        {
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
            return;
        }

        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
            return;
        }

        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

var app = builder.Build();

app.Logger.LogInformation(
    "Database provider: {Provider}",
    app.Configuration["ResolvedDatabase:Provider"] ?? "unknown");

await app.Services.GetRequiredService<DatabaseInitializer>().InitializeAsync(seedProductsPath);
var restoredGalleryImages = await app.Services.GetRequiredService<GalleryStorageService>().RestoreMissingImagesAsync();
if (restoredGalleryImages > 0)
{
    app.Logger.LogInformation("Restored {Count} gallery images from database to disk.", restoredGalleryImages);
}

var configuredAppUrls = Environment.GetEnvironmentVariable("ASPNETCORE_URLS")
    ?? builder.Configuration["APP_URL"]
    ?? builder.Configuration["Kestrel:Endpoints:Http:Url"]
    ?? "http://0.0.0.0:3001";

var appUrls = new List<string>();
string? appPathBase = null;

foreach (var rawUrl in configuredAppUrls.Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
{
    if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out var parsedAppUrl))
    {
        appUrls.Add(rawUrl);
        continue;
    }

    appUrls.Add(parsedAppUrl.GetLeftPart(UriPartial.Authority));

    if (string.IsNullOrWhiteSpace(parsedAppUrl.AbsolutePath) || parsedAppUrl.AbsolutePath == "/")
    {
        continue;
    }

    var parsedPathBase = parsedAppUrl.AbsolutePath.TrimEnd('/');

    if (string.IsNullOrWhiteSpace(appPathBase))
    {
        appPathBase = parsedPathBase;
        continue;
    }

    if (!string.Equals(appPathBase, parsedPathBase, StringComparison.Ordinal))
    {
        throw new InvalidOperationException(
            $"All configured app URLs must use the same path base. Found '{appPathBase}' and '{parsedPathBase}'.");
    }
}


if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
    await next();
});

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";
        var traceId = context.TraceIdentifier;
        await context.Response.WriteAsJsonAsync(new { detail = "Internal server error", traceId });
    });
});

if (app.Configuration.GetValue<bool?>("Swagger:Enabled") ?? app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (!string.IsNullOrWhiteSpace(appPathBase))
{
    app.UsePathBase(appPathBase);
}

app.UseCors("app");
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadsDir),
    RequestPath = "/uploads"
});
app.MapControllers();

if (appUrls.Count > 0)
{
    foreach (var appUrl in appUrls)
    {
        app.Urls.Add(appUrl);
    }

    app.Logger.LogInformation(
        "Store API starting at {AppUrls}{PathBase}",
        string.Join(';', appUrls),
        appPathBase ?? string.Empty);
    app.Run();
}
else
{
    app.Logger.LogInformation("Store API starting with default ASP.NET Core bindings");
    app.Run();
}
