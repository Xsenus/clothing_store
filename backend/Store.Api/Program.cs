using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.StaticFiles;
using Store.Api.Configuration;
using Store.Api.Data;
using Store.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

if (!File.Exists(Path.Combine(builder.Environment.ContentRootPath, "appsettings.json")))
{
    builder.Configuration
        .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.json"), optional: true, reloadOnChange: false)
        .AddJsonFile(
            Path.Combine(AppContext.BaseDirectory, $"appsettings.{builder.Environment.EnvironmentName}.json"),
            optional: true,
            reloadOnChange: false)
        .AddEnvironmentVariables();
}

var storeRuntimePaths = StoreRuntimePaths.Resolve(
    builder.Configuration,
    builder.Environment.ContentRootPath,
    AppContext.BaseDirectory);
Directory.CreateDirectory(storeRuntimePaths.UploadsDir);

var databaseUrl = builder.Configuration.GetConnectionString("DefaultConnection");

if (string.IsNullOrWhiteSpace(databaseUrl))
    throw new InvalidOperationException(
        "ConnectionStrings:DefaultConnection must be set. " +
        "Check backend environment variables, user secrets, or appsettings.");

if (!builder.Environment.IsDevelopment()
    && databaseUrl.Contains("CHANGE_ME", StringComparison.OrdinalIgnoreCase))
{
    throw new InvalidOperationException(
        "ConnectionStrings:DefaultConnection still contains a placeholder value. " +
        "Configure a real production connection string before startup.");
}

builder.Configuration["ResolvedDatabase:Provider"] = "postgres";
builder.Configuration["ResolvedDatabase:ConnectionString"] = databaseUrl;
builder.Services.AddDbContext<StoreDbContext>(opt => opt.UseNpgsql(databaseUrl));
builder.Services.AddSingleton(storeRuntimePaths);

builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<IOrderInventoryService, OrderInventoryService>();
builder.Services.AddScoped<IDaDataAddressSuggestService, DaDataAddressSuggestService>();
builder.Services.AddScoped<IOrderPaymentService, OrderPaymentService>();
builder.Services.AddScoped<IYooMoneyPaymentService, YooMoneyPaymentService>();
builder.Services.AddScoped<IYooKassaPaymentService, YooKassaPaymentService>();
builder.Services.AddScoped<IYandexDeliveryQuoteService, YandexDeliveryQuoteService>();
builder.Services.AddScoped<IYandexDeliveryTrackingService, YandexDeliveryTrackingService>();
builder.Services.AddScoped<TransactionalEmailService>();
builder.Services.AddSingleton<OrderEmailQueue>();
builder.Services.AddSingleton<IOrderEmailQueue>(sp => sp.GetRequiredService<OrderEmailQueue>());
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<DatabaseInitializer>();
builder.Services.AddSingleton<GalleryStorageService>();
builder.Services.AddSingleton<TelegramBotManager>();
builder.Services.AddSingleton<ITelegramBotManager>(sp => sp.GetRequiredService<TelegramBotManager>());
builder.Services.AddHostedService(sp => sp.GetRequiredService<OrderEmailQueue>());
builder.Services.AddHostedService(sp => sp.GetRequiredService<TelegramBotManager>());
builder.Services.AddHostedService<OrderPaymentMonitorService>();
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
app.Logger.LogInformation(
    "Resolved runtime paths: seed={SeedProductsPath}, uploads={UploadsDir}",
    storeRuntimePaths.SeedProductsPath,
    storeRuntimePaths.UploadsDir);

await app.Services.GetRequiredService<DatabaseInitializer>().InitializeAsync(storeRuntimePaths.SeedProductsPath);
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
var uploadsContentTypeProvider = new FileExtensionContentTypeProvider();
uploadsContentTypeProvider.Mappings[".avif"] = "image/avif";
uploadsContentTypeProvider.Mappings[".jfif"] = "image/jpeg";
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(storeRuntimePaths.UploadsDir),
    RequestPath = "/uploads",
    ContentTypeProvider = uploadsContentTypeProvider
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
