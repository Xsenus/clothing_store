using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Store.Api.Configuration;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

/// <summary>
/// Генерирует демонстрационные данные для админских регламентных операций.
/// </summary>
public class AdminDataSeeder
{
    private readonly StoreDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly StoreRuntimePaths _runtimePaths;

    public AdminDataSeeder(StoreDbContext db, IConfiguration configuration, StoreRuntimePaths runtimePaths)
    {
        _db = db;
        _configuration = configuration;
        _runtimePaths = runtimePaths;
    }

    public async Task<AdminDataSeedResult> SeedDemoDataAsync(int productCount = 50)
    {
        productCount = Math.Clamp(productCount, 10, 200);

        var admin = await _db.Users.FirstOrDefaultAsync(x => x.IsAdmin);
        if (admin is null)
            throw new InvalidOperationException("Admin user is required for demo data seed");

        _db.CartItems.RemoveRange(_db.CartItems);
        _db.Likes.RemoveRange(_db.Likes);
        _db.Orders.RemoveRange(_db.Orders);
        _db.Products.RemoveRange(_db.Products);

        var systemProfiles = await _db.Profiles.Where(x => x.UserId == admin.Id).ToListAsync();
        _db.Profiles.RemoveRange(await _db.Profiles.Where(x => x.UserId != admin.Id).ToListAsync());
        _db.Users.RemoveRange(await _db.Users.Where(x => x.Id != admin.Id).ToListAsync());
        await _db.SaveChangesAsync();

        if (!systemProfiles.Any())
        {
            _db.Profiles.Add(new Profile
            {
                UserId = admin.Id,
                Email = admin.Email,
                Name = _configuration["AdminUser:Name"] ?? "System Admin"
            });
            await _db.SaveChangesAsync();
        }

        var random = new Random();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var demoUsers = new List<User>();
        for (var i = 1; i <= 16; i++)
        {
            var (hash, salt) = AuthService.HashPassword("Password123!", _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000);
            demoUsers.Add(new User
            {
                Email = $"demo.user{i:00}@example.com",
                PasswordHash = hash,
                Salt = salt,
                Verified = true,
                CreatedAt = now - random.NextInt64(1, 100) * 86_400_000,
                IsAdmin = false,
                IsBlocked = false,
                IsSystem = false
            });
        }

        _db.Users.AddRange(demoUsers);
        await _db.SaveChangesAsync();

        _db.Profiles.AddRange(demoUsers.Select((user, index) => new Profile
        {
            UserId = user.Id,
            Email = user.Email,
            Name = $"Демо Пользователь {index + 1}",
            Phone = $"+7999{random.Next(1000000, 9999999)}",
            ShippingAddress = $"г. Москва, ул. Демонстрационная, д. {index + 3}",
            Nickname = $"demo_{index + 1}"
        }));

        var sizes = new[] { "XS", "S", "M", "L", "XL" };

        var seedProductsPath = _runtimePaths.SeedProductsPath;

        var preparedProducts = await LoadPreparedProductsAsync(seedProductsPath);
        if (preparedProducts.Count == 0)
            throw new InvalidOperationException($"Prepared products seed is empty or invalid: {seedProductsPath}");

        var products = new List<Product>();
        for (var i = 0; i < productCount; i++)
        {
            var template = preparedProducts[i % preparedProducts.Count].DeepClone().AsObject();
            var id = Guid.NewGuid().ToString("N");
            var slugBase = template["slug"]?.ToString()?.Trim() ?? $"prepared-product-{i + 1:000}";
            var slug = $"{slugBase}-{i + 1:000}";
            var likesCount = template["likesCount"]?.GetValue<int>() ?? random.Next(0, 80);
            var creationTime = template["creationTime"]?.GetValue<long>() ?? (now - random.NextInt64(0, 90) * 86_400_000);

            template["id"] = id;
            template["slug"] = slug;
            template["creationTime"] = creationTime;
            template["likesCount"] = likesCount;

            products.Add(new Product
            {
                Id = id,
                Slug = slug,
                Category = template["category"]?.ToString(),
                IsNew = template["isNew"]?.GetValue<bool>() ?? false,
                IsPopular = template["isPopular"]?.GetValue<bool>() ?? false,
                LikesCount = likesCount,
                CreationTime = creationTime,
                Data = template.ToJsonString()
            });
        }

        _db.Products.AddRange(products);

        var cartItems = new List<CartItem>();
        var likes = new List<Like>();
        var orders = new List<Order>();
        foreach (var user in demoUsers)
        {
            var selectedProducts = products.OrderBy(_ => random.Next()).Take(random.Next(2, 6)).ToList();
            foreach (var product in selectedProducts.Take(2))
            {
                cartItems.Add(new CartItem
                {
                    UserId = user.Id,
                    ProductId = product.Id,
                    Size = sizes[random.Next(sizes.Length)],
                    Quantity = random.Next(1, 3)
                });
            }

            foreach (var product in selectedProducts.Take(3))
            {
                likes.Add(new Like
                {
                    UserId = user.Id,
                    ProductId = product.Id
                });
            }

            var orderItems = selectedProducts.Take(random.Next(1, 4)).Select(product =>
            {
                var qty = random.Next(1, 3);
                return new
                {
                    productId = product.Id,
                    quantity = qty,
                    size = sizes[random.Next(sizes.Length)],
                    price = JsonNode.Parse(product.Data)?["price"]?.GetValue<double>() ?? 0
                };
            }).ToList();
            var total = orderItems.Sum(x => x.price * x.quantity);

            orders.Add(new Order
            {
                UserId = user.Id,
                ItemsJson = System.Text.Json.JsonSerializer.Serialize(orderItems),
                TotalAmount = total,
                Status = random.Next(0, 2) == 0 ? "processing" : "completed",
                CreatedAt = now - random.NextInt64(0, 60) * 86_400_000
            });
        }

        _db.CartItems.AddRange(cartItems);
        _db.Likes.AddRange(likes);
        _db.Orders.AddRange(orders);
        await _db.SaveChangesAsync();

        return new AdminDataSeedResult(products.Count, demoUsers.Count, cartItems.Count, orders.Count, likes.Count);
    }
    private static async Task<List<JsonObject>> LoadPreparedProductsAsync(string seedProductsPath)
    {
        if (!File.Exists(seedProductsPath))
            return [];

        var result = new List<JsonObject>();
        foreach (var line in await File.ReadAllLinesAsync(seedProductsPath))
        {
            if (string.IsNullOrWhiteSpace(line))
                continue;

            var json = JsonNode.Parse(line)?.AsObject();
            if (json is null)
                continue;

            if (string.IsNullOrWhiteSpace(json["slug"]?.ToString()))
                continue;

            result.Add(json);
        }

        return result;
    }

}

public record AdminDataSeedResult(int Products, int Users, int CartItems, int Orders, int Likes);
