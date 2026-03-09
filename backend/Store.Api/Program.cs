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

var sqlitePath = Environment.GetEnvironmentVariable("STORE_SQLITE_PATH")
    ?? Path.Combine(projectRoot, "backend", "app.db");
var databaseUrl = builder.Configuration["DATABASE_URL"]
    ?? builder.Configuration.GetConnectionString("DefaultConnection");
var useSqlite = string.IsNullOrWhiteSpace(databaseUrl)
    || databaseUrl.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase)
    || databaseUrl.StartsWith("Filename=", StringComparison.OrdinalIgnoreCase)
    || databaseUrl.StartsWith("sqlite", StringComparison.OrdinalIgnoreCase);

if (useSqlite)
{
    var sqliteDir = Path.GetDirectoryName(sqlitePath);
    if (!string.IsNullOrWhiteSpace(sqliteDir))
    {
        Directory.CreateDirectory(sqliteDir);
    }

    var sqliteConnection = $"Data Source={sqlitePath}";
    builder.Configuration["ResolvedDatabase:Provider"] = "sqlite";
    builder.Configuration["ResolvedDatabase:ConnectionString"] = sqliteConnection;
    builder.Services.AddDbContext<StoreDbContext>(opt => opt.UseSqlite(sqliteConnection));
}
else
{
    builder.Configuration["ResolvedDatabase:Provider"] = "postgres";
    builder.Configuration["ResolvedDatabase:ConnectionString"] = databaseUrl;
    builder.Services.AddDbContext<StoreDbContext>(opt => opt.UseNpgsql(databaseUrl));
}

builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<AdminDataSeeder>();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<DatabaseInitializer>();
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
