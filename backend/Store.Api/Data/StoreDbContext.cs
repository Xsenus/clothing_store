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
    /// Возвращает набор refresh-сессий.
    /// </summary>
    public DbSet<RefreshSession> RefreshSessions => Set<RefreshSession>();
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
    public DbSet<ProductReview> ProductReviews => Set<ProductReview>();
    public DbSet<SizeDictionary> SizeDictionaries => Set<SizeDictionary>();
    public DbSet<MaterialDictionary> MaterialDictionaries => Set<MaterialDictionary>();
    public DbSet<ColorDictionary> ColorDictionaries => Set<ColorDictionary>();
    public DbSet<CategoryDictionary> CategoryDictionaries => Set<CategoryDictionary>();
    public DbSet<ProductSizeStock> ProductSizeStocks => Set<ProductSizeStock>();
    public DbSet<StockChangeHistory> StockChangeHistories => Set<StockChangeHistory>();
    public DbSet<PriceChangeHistory> PriceChangeHistories => Set<PriceChangeHistory>();
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
    public DbSet<AppSetting> AppSettings => Set<AppSetting>();
    public DbSet<TelegramBot> TelegramBots => Set<TelegramBot>();
    public DbSet<TelegramBotSubscriber> TelegramBotSubscribers => Set<TelegramBotSubscriber>();
    public DbSet<TelegramAuthRequest> TelegramAuthRequests => Set<TelegramAuthRequest>();
    public DbSet<ContactChangeRequest> ContactChangeRequests => Set<ContactChangeRequest>();
    public DbSet<GalleryImage> GalleryImages => Set<GalleryImage>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<VerificationCode>().HasKey(x => new { x.Email, x.Kind });

        modelBuilder.Entity<User>().HasIndex(x => x.Email).IsUnique();
        modelBuilder.Entity<Product>().HasIndex(x => x.Slug).IsUnique();
        modelBuilder.Entity<ProductReview>().HasIndex(x => new { x.ProductId, x.UserId }).IsUnique();
        modelBuilder.Entity<ProductReview>().HasIndex(x => new { x.ProductId, x.CreatedAt });
        modelBuilder.Entity<CartItem>().HasIndex(x => new { x.UserId, x.ProductId, x.Size }).IsUnique();
        modelBuilder.Entity<Like>().HasIndex(x => new { x.UserId, x.ProductId }).IsUnique();
        modelBuilder.Entity<RefreshSession>().HasIndex(x => x.UserId);
        modelBuilder.Entity<Profile>().HasIndex(x => x.Nickname).IsUnique();
        modelBuilder.Entity<SizeDictionary>().HasIndex(x => x.Name).IsUnique();
        modelBuilder.Entity<SizeDictionary>().HasIndex(x => x.Slug).IsUnique();
        modelBuilder.Entity<MaterialDictionary>().HasIndex(x => x.Name).IsUnique();
        modelBuilder.Entity<MaterialDictionary>().HasIndex(x => x.Slug).IsUnique();
        modelBuilder.Entity<ColorDictionary>().HasIndex(x => x.Name).IsUnique();
        modelBuilder.Entity<ColorDictionary>().HasIndex(x => x.Slug).IsUnique();
        modelBuilder.Entity<CategoryDictionary>().HasIndex(x => x.Name).IsUnique();
        modelBuilder.Entity<CategoryDictionary>().HasIndex(x => x.Slug).IsUnique();
        modelBuilder.Entity<ProductSizeStock>().HasIndex(x => new { x.ProductId, x.SizeId }).IsUnique();
        modelBuilder.Entity<StockChangeHistory>().HasIndex(x => x.ChangedAt);
        modelBuilder.Entity<PriceChangeHistory>().HasIndex(x => x.ChangedAt);
        modelBuilder.Entity<TelegramBot>().HasIndex(x => x.Username);
        modelBuilder.Entity<TelegramBotSubscriber>().HasIndex(x => new { x.BotId, x.ChatId }).IsUnique();
        modelBuilder.Entity<TelegramAuthRequest>().HasIndex(x => x.State).IsUnique();
        modelBuilder.Entity<ContactChangeRequest>().HasIndex(x => new { x.UserId, x.Kind, x.Status });
        modelBuilder.Entity<ContactChangeRequest>().HasIndex(x => x.State);
        modelBuilder.Entity<GalleryImage>().HasIndex(x => x.Name);

        modelBuilder.Entity<Session>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<RefreshSession>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Profile>()
            .HasOne<User>()
            .WithOne()
            .HasForeignKey<Profile>(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Order>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<CartItem>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<CartItem>()
            .HasOne<Product>()
            .WithMany()
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProductReview>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProductReview>()
            .HasOne<Product>()
            .WithMany()
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Like>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Like>()
            .HasOne<Product>()
            .WithMany()
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProductSizeStock>()
            .HasOne<Product>()
            .WithMany()
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProductSizeStock>()
            .HasOne<SizeDictionary>()
            .WithMany()
            .HasForeignKey(x => x.SizeId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockChangeHistory>()
            .HasOne<Product>()
            .WithMany()
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<StockChangeHistory>()
            .HasOne<SizeDictionary>()
            .WithMany()
            .HasForeignKey(x => x.SizeId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<PriceChangeHistory>()
            .HasOne<Product>()
            .WithMany()
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
