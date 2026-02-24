using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

var projectRoot = Environment.GetEnvironmentVariable("STORE_ROOT")
    ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));

var backendDir = Environment.GetEnvironmentVariable("STORE_BACKEND_DIR")
    ?? Path.Combine(projectRoot, "backend");
var seedDir = Environment.GetEnvironmentVariable("STORE_SEED_DIR")
    ?? Path.Combine(projectRoot, "seed");
var uploadsDir = Environment.GetEnvironmentVariable("STORE_UPLOADS_DIR")
    ?? Path.Combine(backendDir, "uploads");
var productsJsonPath = Environment.GetEnvironmentVariable("STORE_PRODUCTS_PATH")
    ?? Path.Combine(backendDir, "products.json");
var seedProductsPath = Environment.GetEnvironmentVariable("STORE_SEED_PRODUCTS_PATH")
    ?? Path.Combine(seedDir, "products.jsonl");
var migrationsDir = Path.Combine(projectRoot, "backend", "Store.Api", "Migrations");

Directory.CreateDirectory(uploadsDir);

var pgConnectionString = builder.Configuration["DATABASE_URL"]
                         ?? builder.Configuration.GetConnectionString("DefaultConnection")
                         ?? "Host=localhost;Port=5432;Database=clothing_store;Username=postgres;Password=postgres";

var state = new AppState(pgConnectionString, uploadsDir, productsJsonPath, seedProductsPath, migrationsDir, builder.Configuration);
state.Initialize();

builder.Services.AddSingleton(state);
builder.Services.AddCors(o => o.AddPolicy("all", p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors("all");
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadsDir),
    RequestPath = "/uploads"
});

app.MapPost("/auth/signup", (AuthPayload payload, AppState s) => s.SignUp(payload));
app.MapPost("/auth/resend", (ResetRequestPayload payload, AppState s) => s.Resend(payload));
app.MapPost("/auth/verify", (VerifyPayload payload, AppState s) => s.VerifySignup(payload));
app.MapPost("/auth/login", (AuthPayload payload, AppState s) => s.Login(payload));

app.MapPost("/admin/login", (AuthPayload payload, AppState s) => s.AdminLogin(payload));
app.MapGet("/admin/me", (HttpRequest req, AppState s) => s.RequireAdmin(req) ? Results.Ok(new { ok = true }) : Results.Unauthorized());
app.MapPost("/admin/logout", (HttpRequest req, AppState s) =>
{
    var token = req.Headers["X-Admin-Token"].ToString().Trim();
    if (!string.IsNullOrWhiteSpace(token)) s.DeleteAdminSession(token);
    return Results.Ok(new { ok = true });
});

app.MapPost("/auth/logout", (HttpRequest req, AppState s) =>
{
    var token = s.ExtractBearer(req);
    if (!string.IsNullOrWhiteSpace(token)) s.DeleteSession(token);
    return Results.Ok(new { ok = true });
});

app.MapGet("/auth/me", (HttpRequest req, AppState s) =>
{
    var user = s.RequireUser(req);
    if (user is null) return Results.Unauthorized();
    return Results.Ok(new { user = new { id = user.Id, email = user.Email }, profile = s.GetProfile(user.Id) });
});

app.MapPost("/auth/reset/request", (ResetRequestPayload payload, AppState s) => s.ResetRequest(payload));
app.MapPost("/auth/reset/confirm", (ResetConfirmPayload payload, AppState s) => s.ResetConfirm(payload));

app.MapGet("/profile", (HttpRequest req, AppState s) =>
{
    var user = s.RequireUser(req);
    if (user is null) return Results.Unauthorized();
    var profile = s.GetProfile(user.Id);
    return profile is not null
        ? Results.Ok(profile)
        : Results.Ok(new { name = "", phone = "", shippingAddress = "", email = user.Email, nickname = $"user{user.Id[..6]}" });
});

app.MapPost("/profile", (HttpRequest req, ProfilePayload payload, AppState s) =>
{
    var user = s.RequireUser(req);
    if (user is null) return Results.Unauthorized();
    var nick = payload.Nickname?.Trim();
    if (!string.IsNullOrWhiteSpace(nick) && s.IsNicknameTaken(user.Id, nick)) return Results.BadRequest(new { detail = "Nickname already taken" });
    return Results.Ok(s.UpsertProfile(user.Id, user.Email, payload.Name, payload.Phone, payload.ShippingAddress, nick));
});

app.MapGet("/products", (AppState s) => Results.Json(s.ListProducts()));
app.MapGet("/products/new", (AppState s) => Results.Json(s.ListProducts(isNew: true)));
app.MapGet("/products/popular", (AppState s) => Results.Json(s.ListProducts(isPopular: true, orderPopular: true)));
app.MapGet("/products/category/{category}/new", (string category, AppState s) => Results.Json(s.ListProducts(category: category, isNew: true)));
app.MapGet("/products/category/{category}/popular", (string category, AppState s) => Results.Json(s.ListProducts(category: category, isPopular: true, orderPopular: true)));
app.MapGet("/products/{slug}", (string slug, AppState s) =>
{
    var p = s.GetProductBySlug(slug);
    return p is null ? Results.NotFound(new { detail = "Product not found" }) : Results.Json(p);
});

app.MapPost("/products", (HttpRequest req, JsonObject payload, AppState s) =>
{
    if (!s.RequireAdmin(req)) return Results.Unauthorized();
    return Results.Json(s.CreateProduct(payload));
});

app.MapPatch("/products/{productId}", (string productId, HttpRequest req, JsonObject payload, AppState s) =>
{
    if (!s.RequireAdmin(req)) return Results.Unauthorized();
    var updated = s.UpdateProduct(productId, payload);
    return updated is null ? Results.NotFound(new { detail = "Product not found" }) : Results.Json(updated);
});

app.MapDelete("/products/{productId}", (string productId, HttpRequest req, AppState s) =>
{
    if (!s.RequireAdmin(req)) return Results.Unauthorized();
    s.DeleteProduct(productId);
    return Results.Ok(new { ok = true });
});

app.MapGet("/cart", (HttpRequest req, AppState s) =>
{
    var u = s.RequireUser(req); if (u is null) return Results.Unauthorized();
    return Results.Json(s.ListCartItems(u.Id));
});
app.MapPost("/cart", (HttpRequest req, CartItemPayload payload, AppState s) =>
{
    var u = s.RequireUser(req); if (u is null) return Results.Unauthorized();
    return s.AddCartItem(u.Id, payload);
});
app.MapPatch("/cart/{itemId}", (string itemId, HttpRequest req, CartUpdatePayload payload, AppState s) =>
{
    var u = s.RequireUser(req); if (u is null) return Results.Unauthorized();
    return s.UpdateCartItem(u.Id, itemId, payload.Quantity);
});
app.MapDelete("/cart/{itemId}", (string itemId, HttpRequest req, AppState s) =>
{
    var u = s.RequireUser(req); if (u is null) return Results.Unauthorized();
    s.DeleteCartItem(u.Id, itemId);
    return Results.Ok(new { ok = true });
});
app.MapDelete("/cart", (HttpRequest req, AppState s) =>
{
    var u = s.RequireUser(req); if (u is null) return Results.Unauthorized();
    s.ClearCart(u.Id);
    return Results.Ok(new { ok = true });
});

app.MapGet("/likes", (HttpRequest req, AppState s) =>
{
    var u = s.RequireUser(req); if (u is null) return Results.Unauthorized();
    return Results.Json(s.ListLikes(u.Id));
});
app.MapPost("/likes/toggle", (HttpRequest req, LikeTogglePayload payload, AppState s) =>
{
    var u = s.RequireUser(req); if (u is null) return Results.Unauthorized();
    return Results.Json(s.ToggleLike(u.Id, payload.ProductId));
});

app.MapPost("/admin/upload", async (HttpRequest req, AppState s) =>
{
    if (!s.RequireAdmin(req)) return Results.Unauthorized();
    return Results.Ok(new { urls = await s.SaveUploads(req.Form.Files) });
});

app.MapPost("/upload", async (HttpRequest req, AppState s) =>
{
    var u = s.RequireUser(req); if (u is null) return Results.Unauthorized();
    return Results.Ok(new { urls = await s.SaveUploads(req.Form.Files) });
});

app.MapPost("/products/{productId}/reviews", (string productId, HttpRequest req, ReviewPayload payload, AppState s) =>
{
    var u = s.RequireUser(req); if (u is null) return Results.Unauthorized();
    var review = s.AddReview(productId, u.Id, payload.Text, payload.Media ?? new List<string>());
    return review is null ? Results.NotFound(new { detail = "Product not found" }) : Results.Json(review);
});

app.MapDelete("/products/{productId}/reviews/{reviewId}", (string productId, string reviewId, HttpRequest req, AppState s) =>
{
    if (!s.RequireAdmin(req)) return Results.Unauthorized();
    return s.DeleteReview(productId, reviewId) ? Results.Ok(new { ok = true }) : Results.NotFound(new { detail = "Product not found" });
});

app.MapGet("/orders", (HttpRequest req, AppState s) =>
{
    var u = s.RequireUser(req); if (u is null) return Results.Unauthorized();
    return Results.Json(s.ListOrders(u.Id));
});
app.MapPost("/orders", (HttpRequest req, OrderPayload payload, AppState s) =>
{
    var u = s.RequireUser(req); if (u is null) return Results.Unauthorized();
    return Results.Ok(new { id = s.CreateOrder(u.Id, payload.Items, payload.TotalAmount, payload.Status ?? "processing") });
});

var appUrl = Environment.GetEnvironmentVariable("ASPNETCORE_URLS")
    ?? builder.Configuration["APP_URL"]
    ?? "http://0.0.0.0:3001";

app.Run(appUrl);

record AuthPayload(string Email, string Password);
record ProfilePayload(string? Name, string? Phone, string? ShippingAddress, string? Nickname);
record CartItemPayload(string ProductId, string Size, int Quantity);
record CartUpdatePayload(int Quantity);
record LikeTogglePayload(string ProductId);
record ReviewPayload(string Text, List<string>? Media);
record VerifyPayload(string Email, string Code);
record ResetRequestPayload(string Email);
record ResetConfirmPayload(string Email, string Code, string NewPassword);
record OrderPayload(List<Dictionary<string, object>> Items, double TotalAmount, string? Status);
record UserRow(string Id, string Email, bool Verified);

class AppState
{
    private readonly string _connectionString;
    private readonly string _uploadsDir;
    private readonly string _productsJsonPath;
    private readonly string _seedProductsPath;
    private readonly string _migrationsDir;
    private readonly IConfiguration _configuration;

    public AppState(string connectionString, string uploadsDir, string productsJsonPath, string seedProductsPath, string migrationsDir, IConfiguration configuration)
    {
        _connectionString = connectionString;
        _uploadsDir = uploadsDir;
        _productsJsonPath = productsJsonPath;
        _seedProductsPath = seedProductsPath;
        _migrationsDir = migrationsDir;
        _configuration = configuration;
    }

    private NpgsqlConnection Conn()
    {
        var c = new NpgsqlConnection(_connectionString);
        c.Open();
        return c;
    }

    public void Initialize()
    {
        ApplyMigrations();
        SeedProductsIfEmpty();
    }

    private void ApplyMigrations()
    {
        using var c = Conn();
        using (var cmd = new NpgsqlCommand("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())", c)) cmd.ExecuteNonQuery();

        if (!Directory.Exists(_migrationsDir)) return;
        foreach (var file in Directory.GetFiles(_migrationsDir, "*.sql").OrderBy(Path.GetFileName))
        {
            var version = Path.GetFileName(file);
            using var check = new NpgsqlCommand("SELECT 1 FROM schema_migrations WHERE version=@v", c);
            check.Parameters.AddWithValue("v", version);
            if (check.ExecuteScalar() is not null) continue;

            var sql = File.ReadAllText(file);
            using var tx = c.BeginTransaction();
            using var apply = new NpgsqlCommand(sql, c, tx);
            apply.ExecuteNonQuery();
            using var mark = new NpgsqlCommand("INSERT INTO schema_migrations(version) VALUES(@v)", c, tx);
            mark.Parameters.AddWithValue("v", version);
            mark.ExecuteNonQuery();
            tx.Commit();
        }
    }

    private void SeedProductsIfEmpty()
    {
        using var c = Conn();
        using var countCmd = new NpgsqlCommand("SELECT COUNT(*) FROM products", c);
        if (Convert.ToInt64(countCmd.ExecuteScalar()) > 0) return;

        var products = new List<JsonObject>();
        if (File.Exists(_productsJsonPath))
        {
            var arr = JsonNode.Parse(File.ReadAllText(_productsJsonPath))?.AsArray();
            if (arr is not null) products.AddRange(arr.Select(x => x!.AsObject()));
        }
        else if (File.Exists(_seedProductsPath))
        {
            foreach (var line in File.ReadLines(_seedProductsPath))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                var obj = JsonNode.Parse(line)?.AsObject();
                if (obj is not null) products.Add(obj);
            }
        }

        foreach (var p in products)
        {
            p["_id"] ??= UrlToken(10);
            p["_creationTime"] ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            p["likesCount"] ??= 0;
            if (p["media"] is null)
            {
                var media = new JsonArray();
                foreach (var i in p["images"]?.AsArray() ?? new JsonArray()) media.Add(new JsonObject { ["type"] = "image", ["url"] = i?.ToString() });
                foreach (var i in p["videos"]?.AsArray() ?? new JsonArray()) media.Add(new JsonObject { ["type"] = "video", ["url"] = i?.ToString() });
                p["media"] = media;
            }
            UpsertProduct(p);
        }
    }

    private void UpsertProduct(JsonObject product)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand(@"
INSERT INTO products(id, slug, category, is_new, is_popular, likes_count, creation_time, data)
VALUES(@id, @slug, @category, @isnew, @ispop, @likes, @ctime, @data::jsonb)
ON CONFLICT(id) DO UPDATE SET
slug=EXCLUDED.slug,
category=EXCLUDED.category,
is_new=EXCLUDED.is_new,
is_popular=EXCLUDED.is_popular,
likes_count=EXCLUDED.likes_count,
creation_time=EXCLUDED.creation_time,
data=EXCLUDED.data", c);
        cmd.Parameters.AddWithValue("id", product["_id"]?.ToString() ?? UrlToken(10));
        cmd.Parameters.AddWithValue("slug", product["slug"]?.ToString() ?? "");
        cmd.Parameters.AddWithValue("category", (object?)product["category"]?.ToString() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("isnew", product["isNew"]?.GetValue<bool>() ?? false);
        cmd.Parameters.AddWithValue("ispop", product["isPopular"]?.GetValue<bool>() ?? false);
        cmd.Parameters.AddWithValue("likes", product["likesCount"]?.GetValue<int>() ?? 0);
        cmd.Parameters.AddWithValue("ctime", product["_creationTime"]?.GetValue<long>() ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        cmd.Parameters.AddWithValue("data", JsonSerializer.Serialize(product));
        cmd.ExecuteNonQuery();
    }

    public List<JsonObject> ListProducts(string? category = null, bool? isNew = null, bool? isPopular = null, bool orderPopular = false)
    {
        using var c = Conn();
        var where = new List<string>();
        if (!string.IsNullOrWhiteSpace(category)) where.Add("category = @category");
        if (isNew.HasValue) where.Add("is_new = @isnew");
        if (isPopular.HasValue) where.Add("is_popular = @ispop");
        var sql = "SELECT data FROM products" + (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "") + (orderPopular ? " ORDER BY likes_count DESC" : "");
        using var cmd = new NpgsqlCommand(sql, c);
        if (!string.IsNullOrWhiteSpace(category)) cmd.Parameters.AddWithValue("category", category);
        if (isNew.HasValue) cmd.Parameters.AddWithValue("isnew", isNew.Value);
        if (isPopular.HasValue) cmd.Parameters.AddWithValue("ispop", isPopular.Value);

        using var r = cmd.ExecuteReader();
        var result = new List<JsonObject>();
        while (r.Read()) result.Add(JsonNode.Parse(r.GetString(0))!.AsObject());
        return result;
    }

    public JsonObject? GetProductBySlug(string slug)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT data FROM products WHERE slug=@s", c);
        cmd.Parameters.AddWithValue("s", slug);
        var value = cmd.ExecuteScalar() as string;
        return value is null ? null : JsonNode.Parse(value)!.AsObject();
    }

    public JsonObject CreateProduct(JsonObject payload)
    {
        payload["_id"] = UrlToken(10);
        payload["likesCount"] ??= 0;
        payload["_creationTime"] ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        UpsertProduct(payload);
        return payload;
    }

    public JsonObject? UpdateProduct(string productId, JsonObject patch)
    {
        var existing = GetProductById(productId);
        if (existing is null) return null;
        foreach (var kv in patch) existing[kv.Key] = kv.Value?.DeepClone();
        existing["_id"] = productId;
        UpsertProduct(existing);
        return existing;
    }

    public void DeleteProduct(string productId)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("DELETE FROM products WHERE id=@i", c);
        cmd.Parameters.AddWithValue("i", productId);
        cmd.ExecuteNonQuery();
    }

    private JsonObject? GetProductById(string productId)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT data FROM products WHERE id=@i", c);
        cmd.Parameters.AddWithValue("i", productId);
        var value = cmd.ExecuteScalar() as string;
        return value is null ? null : JsonNode.Parse(value)!.AsObject();
    }

    public IResult AddCartItem(string userId, CartItemPayload payload)
    {
        var product = GetProductById(payload.ProductId);
        if (product is null) return Results.BadRequest(new { detail = "Product not found" });
        var sizeStock = product["sizeStock"] as JsonObject;
        if (sizeStock is not null && sizeStock[payload.Size] is not null)
        {
            var available = sizeStock[payload.Size]!.GetValue<int>();
            if (available <= 0) return Results.BadRequest(new { detail = "Size out of stock" });
            using var c1 = Conn();
            using var q = new NpgsqlCommand("SELECT quantity FROM cart_items WHERE user_id=@u AND product_id=@p AND size=@s", c1);
            q.Parameters.AddWithValue("u", userId); q.Parameters.AddWithValue("p", payload.ProductId); q.Parameters.AddWithValue("s", payload.Size);
            var current = q.ExecuteScalar();
            var currentQty = current is null ? 0 : Convert.ToInt32(current);
            if (currentQty + payload.Quantity > available) return Results.BadRequest(new { detail = "Not enough stock" });
        }

        using var c = Conn();
        using var cmd = new NpgsqlCommand(@"
INSERT INTO cart_items(id,user_id,product_id,size,quantity) VALUES(@id,@u,@p,@s,@q)
ON CONFLICT(user_id,product_id,size) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
RETURNING id,quantity", c);
        cmd.Parameters.AddWithValue("id", Convert.ToHexString(RandomNumberGenerator.GetBytes(10)).ToLowerInvariant());
        cmd.Parameters.AddWithValue("u", userId); cmd.Parameters.AddWithValue("p", payload.ProductId); cmd.Parameters.AddWithValue("s", payload.Size); cmd.Parameters.AddWithValue("q", payload.Quantity);
        using var r = cmd.ExecuteReader();
        r.Read();
        return Results.Json(new { cartId = r.GetString(0), quantity = r.GetInt32(1) });
    }

    public IResult UpdateCartItem(string userId, string itemId, int quantity)
    {
        using var c = Conn();
        using var itemCmd = new NpgsqlCommand("SELECT product_id,size FROM cart_items WHERE id=@i AND user_id=@u", c);
        itemCmd.Parameters.AddWithValue("i", itemId); itemCmd.Parameters.AddWithValue("u", userId);
        using var r = itemCmd.ExecuteReader();
        string? productId = null; string? size = null;
        if (r.Read()) { productId = r.GetString(0); size = r.GetString(1); }
        r.Close();

        if (productId is not null && size is not null)
        {
            var product = GetProductById(productId);
            var sizeStock = product?["sizeStock"] as JsonObject;
            if (sizeStock is not null && sizeStock[size] is not null && quantity > sizeStock[size]!.GetValue<int>())
                return Results.BadRequest(new { detail = "Not enough stock" });
        }

        using var cmd = new NpgsqlCommand("UPDATE cart_items SET quantity=@q WHERE id=@i AND user_id=@u", c);
        cmd.Parameters.AddWithValue("q", quantity); cmd.Parameters.AddWithValue("i", itemId); cmd.Parameters.AddWithValue("u", userId);
        cmd.ExecuteNonQuery();
        return Results.Json(new { cartId = itemId, quantity });
    }

    public List<JsonObject> ListCartItems(string userId)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT id,product_id,size,quantity FROM cart_items WHERE user_id=@u", c);
        cmd.Parameters.AddWithValue("u", userId);
        using var r = cmd.ExecuteReader();
        var items = new List<JsonObject>();
        while (r.Read())
        {
            var productId = r.GetString(1);
            items.Add(new JsonObject
            {
                ["cartId"] = r.GetString(0),
                ["productId"] = productId,
                ["size"] = r.GetString(2),
                ["quantity"] = r.GetInt32(3),
                ["product"] = GetProductById(productId)
            });
        }
        return items;
    }

    public void DeleteCartItem(string userId, string itemId)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("DELETE FROM cart_items WHERE user_id=@u AND id=@i", c);
        cmd.Parameters.AddWithValue("u", userId); cmd.Parameters.AddWithValue("i", itemId);
        cmd.ExecuteNonQuery();
    }

    public void ClearCart(string userId)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("DELETE FROM cart_items WHERE user_id=@u", c);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.ExecuteNonQuery();
    }

    public List<JsonObject> ListLikes(string userId)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT id,product_id FROM likes WHERE user_id=@u", c);
        cmd.Parameters.AddWithValue("u", userId);
        using var r = cmd.ExecuteReader();
        var result = new List<JsonObject>();
        while (r.Read()) result.Add(new JsonObject { ["id"] = r.GetString(0), ["productId"] = r.GetString(1) });
        return result;
    }

    public JsonObject ToggleLike(string userId, string productId)
    {
        using var c = Conn();
        using var q = new NpgsqlCommand("SELECT id FROM likes WHERE user_id=@u AND product_id=@p", c);
        q.Parameters.AddWithValue("u", userId); q.Parameters.AddWithValue("p", productId);
        var existing = q.ExecuteScalar() as string;

        if (!string.IsNullOrWhiteSpace(existing))
        {
            using var d = new NpgsqlCommand("DELETE FROM likes WHERE id=@i", c); d.Parameters.AddWithValue("i", existing); d.ExecuteNonQuery();
            using var upd = new NpgsqlCommand("UPDATE products SET likes_count = GREATEST(likes_count - 1, 0), data = jsonb_set(data,'{likesCount}', to_jsonb(GREATEST(likes_count - 1,0))) WHERE id=@p", c);
            upd.Parameters.AddWithValue("p", productId); upd.ExecuteNonQuery();
            return new JsonObject { ["liked"] = false };
        }

        using (var i = new NpgsqlCommand("INSERT INTO likes(id,user_id,product_id) VALUES(@i,@u,@p)", c))
        {
            i.Parameters.AddWithValue("i", Convert.ToHexString(RandomNumberGenerator.GetBytes(10)).ToLowerInvariant());
            i.Parameters.AddWithValue("u", userId); i.Parameters.AddWithValue("p", productId); i.ExecuteNonQuery();
        }
        using (var upd = new NpgsqlCommand("UPDATE products SET likes_count = likes_count + 1, data = jsonb_set(data,'{likesCount}', to_jsonb(likes_count + 1)) WHERE id=@p", c))
        {
            upd.Parameters.AddWithValue("p", productId); upd.ExecuteNonQuery();
        }
        return new JsonObject { ["liked"] = true };
    }

    public JsonObject? AddReview(string productId, string userId, string text, List<string> media)
    {
        var product = GetProductById(productId);
        if (product is null) return null;

        var profile = GetProfile(userId);
        var author = profile?["nickname"]?.ToString();
        if (string.IsNullOrWhiteSpace(author)) author = $"user{userId[..6]}";

        var reviews = product["reviews"] as JsonArray ?? new JsonArray();
        var review = new JsonObject
        {
            ["id"] = UrlToken(8),
            ["author"] = author,
            ["date"] = DateTime.UtcNow.ToString("dd MMMM HH:mm", CultureInfo.InvariantCulture),
            ["text"] = text.Trim(),
            ["media"] = JsonSerializer.SerializeToNode(media)
        };
        reviews.Insert(0, review);
        product["reviews"] = reviews;
        UpsertProduct(product);
        return review;
    }

    public bool DeleteReview(string productId, string reviewId)
    {
        var product = GetProductById(productId);
        if (product is null) return false;
        var reviews = product["reviews"] as JsonArray ?? new JsonArray();
        product["reviews"] = new JsonArray(reviews.Where(r => r?["id"]?.ToString() != reviewId).ToArray());
        UpsertProduct(product);
        return true;
    }

    public List<JsonObject> ListOrders(string userId)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT id,items_json,total_amount,status,created_at FROM orders WHERE user_id=@u ORDER BY created_at DESC", c);
        cmd.Parameters.AddWithValue("u", userId);
        using var r = cmd.ExecuteReader();
        var list = new List<JsonObject>();
        while (r.Read())
        {
            list.Add(new JsonObject
            {
                ["id"] = r.GetString(0),
                ["items"] = JsonNode.Parse(r.GetString(1)),
                ["totalAmount"] = r.GetDouble(2),
                ["status"] = r.GetString(3),
                ["createdAt"] = r.GetInt64(4)
            });
        }
        return list;
    }

    public string CreateOrder(string userId, List<Dictionary<string, object>> items, double totalAmount, string status)
    {
        var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(10)).ToLowerInvariant();
        using var c = Conn();
        using var cmd = new NpgsqlCommand("INSERT INTO orders(id,user_id,items_json,total_amount,status,created_at) VALUES(@i,@u,@j::jsonb,@t,@s,@c)", c);
        cmd.Parameters.AddWithValue("i", id);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("j", JsonSerializer.Serialize(items));
        cmd.Parameters.AddWithValue("t", totalAmount);
        cmd.Parameters.AddWithValue("s", status);
        cmd.Parameters.AddWithValue("c", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        cmd.ExecuteNonQuery();
        return id;
    }

    public IResult SignUp(AuthPayload payload)
    {
        var email = payload.Email.ToLowerInvariant();
        var user = GetUserByEmail(email);
        if (user is not null && user.Verified) return Results.Conflict(new { detail = "User already exists" });
        if (user is null) CreateUser(email, payload.Password);
        var code = GenerateCode();
        CreateVerificationCode(email, code, "signup", DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 1200);
        SendEmail(email, "Код подтверждения", $"Ваш код подтверждения: {code}");
        return Results.Ok(new { verificationRequired = true });
    }

    public IResult Resend(ResetRequestPayload payload)
    {
        var email = payload.Email.ToLowerInvariant();
        var user = GetUserByEmail(email);
        if (user is null) return Results.NotFound(new { detail = "User not found" });
        if (user.Verified) return Results.BadRequest(new { detail = "User already verified" });
        var code = GenerateCode();
        CreateVerificationCode(email, code, "signup", DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 1200);
        SendEmail(email, "Код подтверждения", $"Ваш код подтверждения: {code}");
        return Results.Ok(new { ok = true });
    }

    public IResult VerifySignup(VerifyPayload payload)
    {
        var email = payload.Email.ToLowerInvariant();
        if (!VerifyCode(email, payload.Code.Trim().ToUpperInvariant(), "signup")) return Results.BadRequest(new { detail = "Invalid code" });
        SetVerified(email);
        var user = GetUserByEmail(email);
        if (user is null) return Results.NotFound(new { detail = "User not found" });
        UpsertProfile(user.Id, email, null, null, null, $"user{user.Id[..6]}");
        var token = CreateSession(user.Id);
        return Results.Ok(new { token, user = new { id = user.Id, email } });
    }

    public IResult Login(AuthPayload payload)
    {
        var email = payload.Email.ToLowerInvariant();
        var user = GetUserByEmail(email);
        if (user is null || !ValidatePassword(email, payload.Password)) return Results.Unauthorized();
        if (!user.Verified) return Results.Json(new { detail = "Email not verified" }, statusCode: 403);
        return Results.Ok(new { token = CreateSession(user.Id), user = new { id = user.Id, email = payload.Email } });
    }

    public IResult AdminLogin(AuthPayload payload)
    {
        var adminEmail = _configuration["ADMIN_EMAIL"];
        var adminPassword = _configuration["ADMIN_PASSWORD"];
        if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword)) return Results.Json(new { detail = "Admin credentials not set" }, statusCode: 500);
        if (payload.Email != adminEmail || payload.Password != adminPassword) return Results.Unauthorized();
        return Results.Ok(new { token = CreateAdminSession() });
    }

    public IResult ResetRequest(ResetRequestPayload payload)
    {
        var email = payload.Email.ToLowerInvariant();
        if (GetUserByEmail(email) is null) return Results.NotFound(new { detail = "User not found" });
        var code = GenerateCode();
        CreateVerificationCode(email, code, "reset", DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 1200);
        SendEmail(email, "Код для восстановления пароля", $"Ваш код для восстановления: {code}");
        return Results.Ok(new { ok = true });
    }

    public IResult ResetConfirm(ResetConfirmPayload payload)
    {
        var email = payload.Email.ToLowerInvariant();
        if (!VerifyCode(email, payload.Code.Trim().ToUpperInvariant(), "reset")) return Results.BadRequest(new { detail = "Invalid code" });
        SetPassword(email, payload.NewPassword);
        return Results.Ok(new { ok = true });
    }

    public static string UrlToken(int bytes)
    {
        var b = RandomNumberGenerator.GetBytes(bytes);
        return Convert.ToBase64String(b).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    public async Task<List<string>> SaveUploads(IFormFileCollection files)
    {
        var urls = new List<string>();
        foreach (var file in files)
        {
            var ext = Path.GetExtension(file.FileName);
            var name = $"{UrlToken(12)}{ext}";
            var path = Path.Combine(_uploadsDir, name);
            await using var stream = File.Create(path);
            await file.CopyToAsync(stream);
            urls.Add($"/uploads/{name}");
        }
        return urls;
    }

    public string ExtractBearer(HttpRequest req)
    {
        var auth = req.Headers.Authorization.ToString();
        return auth.StartsWith("Bearer ") ? auth.Replace("Bearer ", "").Trim() : string.Empty;
    }

    public UserRow? RequireUser(HttpRequest req)
    {
        var token = ExtractBearer(req);
        if (string.IsNullOrWhiteSpace(token)) return null;
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT user_id FROM sessions WHERE token=@t", c);
        cmd.Parameters.AddWithValue("t", token);
        var userId = cmd.ExecuteScalar() as string;
        return userId is null ? null : GetUserById(userId);
    }

    public bool RequireAdmin(HttpRequest req)
    {
        var token = req.Headers["X-Admin-Token"].ToString().Trim();
        if (string.IsNullOrWhiteSpace(token)) return false;
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT 1 FROM admin_sessions WHERE token=@t", c);
        cmd.Parameters.AddWithValue("t", token);
        return cmd.ExecuteScalar() is not null;
    }

    public void DeleteSession(string token)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("DELETE FROM sessions WHERE token=@t", c);
        cmd.Parameters.AddWithValue("t", token);
        cmd.ExecuteNonQuery();
    }

    public void DeleteAdminSession(string token)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("DELETE FROM admin_sessions WHERE token=@t", c);
        cmd.Parameters.AddWithValue("t", token);
        cmd.ExecuteNonQuery();
    }

    public string CreateAdminSession()
    {
        var token = UrlToken(32);
        using var c = Conn();
        using var cmd = new NpgsqlCommand("INSERT INTO admin_sessions(token,created_at) VALUES(@t,@c)", c);
        cmd.Parameters.AddWithValue("t", token);
        cmd.Parameters.AddWithValue("c", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        cmd.ExecuteNonQuery();
        return token;
    }

    public string CreateSession(string userId)
    {
        var token = UrlToken(32);
        using var c = Conn();
        using var cmd = new NpgsqlCommand("INSERT INTO sessions(token,user_id,created_at) VALUES(@t,@u,@c)", c);
        cmd.Parameters.AddWithValue("t", token);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("c", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        cmd.ExecuteNonQuery();
        return token;
    }

    private static string HashPassword(string password, string salt)
    {
        using var pbkdf2 = new Rfc2898DeriveBytes(password, Encoding.UTF8.GetBytes(salt), 100_000, HashAlgorithmName.SHA256);
        return Convert.ToHexString(pbkdf2.GetBytes(32)).ToLowerInvariant();
    }

    public void CreateUser(string email, string password)
    {
        var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(12)).ToLowerInvariant();
        var salt = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
        var hash = HashPassword(password, salt);
        using var c = Conn();
        using var cmd = new NpgsqlCommand("INSERT INTO users(id,email,password_hash,salt,verified,created_at) VALUES(@i,@e,@h,@s,false,@c)", c);
        cmd.Parameters.AddWithValue("i", id);
        cmd.Parameters.AddWithValue("e", email);
        cmd.Parameters.AddWithValue("h", hash);
        cmd.Parameters.AddWithValue("s", salt);
        cmd.Parameters.AddWithValue("c", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        cmd.ExecuteNonQuery();
    }

    public UserRow? GetUserByEmail(string email)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT id,email,verified FROM users WHERE email=@e", c);
        cmd.Parameters.AddWithValue("e", email);
        using var r = cmd.ExecuteReader();
        return r.Read() ? new UserRow(r.GetString(0), r.GetString(1), r.GetBoolean(2)) : null;
    }

    public UserRow? GetUserById(string id)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT id,email,verified FROM users WHERE id=@i", c);
        cmd.Parameters.AddWithValue("i", id);
        using var r = cmd.ExecuteReader();
        return r.Read() ? new UserRow(r.GetString(0), r.GetString(1), r.GetBoolean(2)) : null;
    }

    public bool ValidatePassword(string email, string password)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT password_hash,salt FROM users WHERE email=@e", c);
        cmd.Parameters.AddWithValue("e", email);
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return false;
        return HashPassword(password, r.GetString(1)) == r.GetString(0);
    }

    public void SetVerified(string email)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("UPDATE users SET verified=true WHERE email=@e", c);
        cmd.Parameters.AddWithValue("e", email);
        cmd.ExecuteNonQuery();
    }

    public void SetPassword(string email, string newPassword)
    {
        var salt = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
        var hash = HashPassword(newPassword, salt);
        using var c = Conn();
        using var cmd = new NpgsqlCommand("UPDATE users SET password_hash=@h,salt=@s WHERE email=@e", c);
        cmd.Parameters.AddWithValue("h", hash);
        cmd.Parameters.AddWithValue("s", salt);
        cmd.Parameters.AddWithValue("e", email);
        cmd.ExecuteNonQuery();
    }

    public void CreateVerificationCode(string email, string code, string kind, long expiresAt)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand(@"
INSERT INTO verification_codes(email,code,kind,expires_at) VALUES(@e,@c,@k,@x)
ON CONFLICT(email,kind) DO UPDATE SET code=EXCLUDED.code, expires_at=EXCLUDED.expires_at", c);
        cmd.Parameters.AddWithValue("e", email);
        cmd.Parameters.AddWithValue("c", code);
        cmd.Parameters.AddWithValue("k", kind);
        cmd.Parameters.AddWithValue("x", expiresAt);
        cmd.ExecuteNonQuery();
    }

    public bool VerifyCode(string email, string code, string kind)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT code,expires_at FROM verification_codes WHERE email=@e AND kind=@k", c);
        cmd.Parameters.AddWithValue("e", email);
        cmd.Parameters.AddWithValue("k", kind);
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return false;
        var savedCode = r.GetString(0);
        var expires = r.GetInt64(1);
        r.Close();
        if (!string.Equals(savedCode.Trim(), code.Trim(), StringComparison.OrdinalIgnoreCase)) return false;
        if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > expires) return false;
        using var d = new NpgsqlCommand("DELETE FROM verification_codes WHERE email=@e AND kind=@k", c);
        d.Parameters.AddWithValue("e", email);
        d.Parameters.AddWithValue("k", kind);
        d.ExecuteNonQuery();
        return true;
    }

    public JsonObject UpsertProfile(string userId, string email, string? name, string? phone, string? shippingAddress, string? nickname)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand(@"
INSERT INTO profiles(user_id,email,name,phone,shipping_address,nickname)
VALUES(@u,@e,@n,@p,@s,@k)
ON CONFLICT(user_id) DO UPDATE SET
name=EXCLUDED.name,
phone=EXCLUDED.phone,
shipping_address=EXCLUDED.shipping_address,
nickname=EXCLUDED.nickname", c);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("e", email);
        cmd.Parameters.AddWithValue("n", (object?)name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("p", (object?)phone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("s", (object?)shippingAddress ?? DBNull.Value);
        cmd.Parameters.AddWithValue("k", (object?)nickname ?? DBNull.Value);
        cmd.ExecuteNonQuery();
        return GetProfile(userId)!;
    }

    public JsonObject? GetProfile(string userId)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT user_id,email,name,phone,shipping_address,nickname FROM profiles WHERE user_id=@u", c);
        cmd.Parameters.AddWithValue("u", userId);
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return null;
        return new JsonObject
        {
            ["userId"] = r.GetString(0),
            ["email"] = r.GetString(1),
            ["name"] = r.IsDBNull(2) ? null : r.GetString(2),
            ["phone"] = r.IsDBNull(3) ? null : r.GetString(3),
            ["shippingAddress"] = r.IsDBNull(4) ? null : r.GetString(4),
            ["nickname"] = r.IsDBNull(5) ? null : r.GetString(5)
        };
    }

    public bool IsNicknameTaken(string userId, string nickname)
    {
        using var c = Conn();
        using var cmd = new NpgsqlCommand("SELECT 1 FROM profiles WHERE nickname=@n AND user_id<>@u", c);
        cmd.Parameters.AddWithValue("n", nickname);
        cmd.Parameters.AddWithValue("u", userId);
        return cmd.ExecuteScalar() is not null;
    }

    public void SendEmail(string toEmail, string subject, string text)
    {
        Console.WriteLine($"EMAIL to {toEmail}: {subject} / {text}");
    }

    public string GenerateCode() => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
}
