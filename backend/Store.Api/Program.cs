using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Services;

var builder = WebApplication.CreateBuilder(args);

var projectRoot = Environment.GetEnvironmentVariable("STORE_ROOT")
    ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
var seedDir = Environment.GetEnvironmentVariable("STORE_SEED_DIR")
    ?? Path.Combine(projectRoot, "seed");
var seedProductsPath = Environment.GetEnvironmentVariable("STORE_SEED_PRODUCTS_PATH")
    ?? Path.Combine(seedDir, "products.jsonl");
var uploadsDir = Environment.GetEnvironmentVariable("STORE_UPLOADS_DIR")
    ?? Path.Combine(projectRoot, "backend", "uploads");
Directory.CreateDirectory(uploadsDir);

var connectionString = builder.Configuration["DATABASE_URL"]
                       ?? builder.Configuration.GetConnectionString("DefaultConnection")
                       ?? "Host=localhost;Port=5432;Database=clothing_store;Username=postgres;Password=postgres";

builder.Services.AddDbContext<StoreDbContext>(opt => opt.UseNpgsql(connectionString));
builder.Services.AddScoped<AuthService>();
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

await app.Services.GetRequiredService<DatabaseInitializer>().InitializeAsync(seedProductsPath);

var configuredAppUrl = Environment.GetEnvironmentVariable("ASPNETCORE_URLS")
    ?? builder.Configuration["APP_URL"];

string? appUrl = configuredAppUrl;
string? appPathBase = null;

if (!string.IsNullOrWhiteSpace(configuredAppUrl)
    && Uri.TryCreate(configuredAppUrl, UriKind.Absolute, out var parsedAppUrl))
{
    appUrl = parsedAppUrl.GetLeftPart(UriPartial.Authority);

    if (!string.IsNullOrWhiteSpace(parsedAppUrl.AbsolutePath)
        && parsedAppUrl.AbsolutePath != "/")
    {
        appPathBase = parsedAppUrl.AbsolutePath.TrimEnd('/');
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

if (!string.IsNullOrWhiteSpace(appUrl))
{
    app.Run(appUrl);
}
else
{
    app.Run();
}
