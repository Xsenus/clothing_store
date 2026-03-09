using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
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

    public AdminDataSeeder(StoreDbContext db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
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

        var categories = new[] { "hoodies", "t-shirts", "pants", "jackets", "accessories" };
        var sizes = new[] { "XS", "S", "M", "L", "XL" };
        var colors = new[] { "black", "white", "red", "gray", "green" };
        var materials = new[] { "Хлопок", "Футер", "Полиэстер", "Деним" };

        var products = new List<Product>();
        for (var i = 1; i <= productCount; i++)
        {
            var id = Guid.NewGuid().ToString("N");
            var category = categories[(i - 1) % categories.Length];
            var name = $"Demo {category} #{i:00}";
            var price = 2200 + random.Next(0, 9000);
            var productSizes = sizes.OrderBy(_ => random.Next()).Take(random.Next(2, sizes.Length + 1)).ToArray();
            var reviews = new JsonArray();
            var reviewCount = random.Next(1, 6);
            for (var r = 0; r < reviewCount; r++)
            {
                var reviewer = demoUsers[random.Next(demoUsers.Count)];
                reviews.Add(new JsonObject
                {
                    ["id"] = Guid.NewGuid().ToString("N"),
                    ["userId"] = reviewer.Id,
                    ["text"] = $"Отзыв #{r + 1} на {name}: отличный товар для демо-данных.",
                    ["media"] = new JsonArray(),
                    ["createdAt"] = now - random.NextInt64(0, 40) * 86_400_000
                });
            }

            var comments = new JsonArray();
            var commentCount = random.Next(1, 4);
            for (var c = 0; c < commentCount; c++)
            {
                var commenter = demoUsers[random.Next(demoUsers.Count)];
                comments.Add(new JsonObject
                {
                    ["id"] = Guid.NewGuid().ToString("N"),
                    ["userId"] = commenter.Id,
                    ["author"] = commenter.Email,
                    ["text"] = $"Комментарий #{c + 1} для карточки {name}",
                    ["createdAt"] = now - random.NextInt64(0, 30) * 86_400_000
                });
            }

            var data = new JsonObject
            {
                ["id"] = id,
                ["slug"] = $"demo-{category}-{i:00}",
                ["name"] = name,
                ["description"] = "Демо-описание товара для наполнения витрины, корзины, лайков и заказов.",
                ["price"] = price,
                ["category"] = category,
                ["images"] = new JsonArray($"https://picsum.photos/seed/{id}/800/1000"),
                ["videos"] = new JsonArray(),
                ["media"] = new JsonArray(new JsonObject { ["type"] = "image", ["url"] = $"https://picsum.photos/seed/{id}/800/1000" }),
                ["sizes"] = new JsonArray(productSizes.Select(JsonValue.Create).ToArray()),
                ["isNew"] = i <= 10,
                ["isPopular"] = i % 3 == 0,
                ["likesCount"] = random.Next(0, 180),
                ["creationTime"] = now - random.NextInt64(0, 120) * 86_400_000,
                ["sku"] = $"SKU-{i:000}",
                ["material"] = materials[random.Next(materials.Length)],
                ["color"] = colors[random.Next(colors.Length)],
                ["sizeStock"] = new JsonObject(productSizes.ToDictionary(s => s, _ => (JsonNode)JsonValue.Create(random.Next(2, 25))!)),
                ["reviews"] = reviews,
                ["comments"] = comments
            };

            products.Add(new Product
            {
                Id = id,
                Slug = data["slug"]!.ToString(),
                Category = category,
                IsNew = i <= 10,
                IsPopular = i % 3 == 0,
                LikesCount = data["likesCount"]!.GetValue<int>(),
                CreationTime = data["creationTime"]!.GetValue<long>(),
                Data = data.ToJsonString()
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
}

public record AdminDataSeedResult(int Products, int Users, int CartItems, int Orders, int Likes);
