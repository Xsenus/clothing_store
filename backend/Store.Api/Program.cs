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
builder.Services.AddCors(o => o.AddPolicy("all", p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

await app.Services.GetRequiredService<DatabaseInitializer>().InitializeAsync(seedProductsPath);

app.UseCors("all");
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadsDir),
    RequestPath = "/uploads"
});
app.MapControllers();

var appUrl = Environment.GetEnvironmentVariable("ASPNETCORE_URLS")
    ?? builder.Configuration["APP_URL"]
    ?? "http://0.0.0.0:3001";

app.Run(appUrl);
