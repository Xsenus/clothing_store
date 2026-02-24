using Microsoft.EntityFrameworkCore;
using Store.Api.Models;

namespace Store.Api.Data;

/// <summary>
/// Контекст базы данных Entity Framework для API магазина.
/// </summary>
public class StoreDbContext : DbContext
{
    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="StoreDbContext"/>.
    /// </summary>
    public StoreDbContext(DbContextOptions<StoreDbContext> options)
        : base(options)
    {
    }

    /// <summary>
    /// Возвращает набор пользователей.
    /// </summary>
    public DbSet<User> Users => Set<User>();
    /// <summary>
    /// Возвращает набор пользовательских сессий.
    /// </summary>
    public DbSet<Session> Sessions => Set<Session>();
    /// <summary>
    /// Возвращает набор админских сессий.
    /// </summary>
    public DbSet<AdminSession> AdminSessions => Set<AdminSession>();
    /// <summary>
    /// Возвращает набор кодов подтверждения.
    /// </summary>
    public DbSet<VerificationCode> VerificationCodes => Set<VerificationCode>();
    /// <summary>
    /// Возвращает набор профилей.
    /// </summary>
    public DbSet<Profile> Profiles => Set<Profile>();
    /// <summary>
    /// Возвращает набор товаров.
    /// </summary>
    public DbSet<Product> Products => Set<Product>();
    /// <summary>
    /// Возвращает набор элементов корзины.
    /// </summary>
    public DbSet<CartItem> CartItems => Set<CartItem>();
    /// <summary>
    /// Возвращает набор лайков.
    /// </summary>
    public DbSet<Like> Likes => Set<Like>();
    /// <summary>
    /// Возвращает набор заказов.
    /// </summary>
    public DbSet<Order> Orders => Set<Order>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<VerificationCode>().HasKey(x => new { x.Email, x.Kind });
        modelBuilder.Entity<Product>().HasIndex(x => x.Slug).IsUnique();
        modelBuilder.Entity<CartItem>().HasIndex(x => new { x.UserId, x.ProductId, x.Size }).IsUnique();
        modelBuilder.Entity<Like>().HasIndex(x => new { x.UserId, x.ProductId }).IsUnique();
        modelBuilder.Entity<Profile>().HasIndex(x => x.Nickname).IsUnique();
    }
}
