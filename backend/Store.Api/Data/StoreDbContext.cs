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
    public DbSet<CollectionDictionary> CollectionDictionaries => Set<CollectionDictionary>();
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
    public DbSet<FavoriteEvent> FavoriteEvents => Set<FavoriteEvent>();
    public DbSet<AuthEvent> AuthEvents => Set<AuthEvent>();
    public DbSet<ProductView> ProductViews => Set<ProductView>();
    public DbSet<SiteVisit> SiteVisits => Set<SiteVisit>();
    public DbSet<CookieConsentEvent> CookieConsentEvents => Set<CookieConsentEvent>();
    /// <summary>
    /// Возвращает набор заказов.
    /// </summary>
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderPayment> OrderPayments => Set<OrderPayment>();
    public DbSet<AppSetting> AppSettings => Set<AppSetting>();
    public DbSet<TelegramBot> TelegramBots => Set<TelegramBot>();
    public DbSet<TelegramBotSubscriber> TelegramBotSubscribers => Set<TelegramBotSubscriber>();
    public DbSet<TelegramAuthRequest> TelegramAuthRequests => Set<TelegramAuthRequest>();
    public DbSet<ContactChangeRequest> ContactChangeRequests => Set<ContactChangeRequest>();
    public DbSet<UserExternalIdentity> UserExternalIdentities => Set<UserExternalIdentity>();
    public DbSet<ExternalAuthRequest> ExternalAuthRequests => Set<ExternalAuthRequest>();
    public DbSet<GalleryImage> GalleryImages => Set<GalleryImage>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasSequence<int>("orders_order_number_seq");

        modelBuilder.Entity<VerificationCode>().HasKey(x => new { x.Email, x.Kind });

        modelBuilder.Entity<User>().HasIndex(x => x.Email).IsUnique();
        modelBuilder.Entity<Product>().HasIndex(x => x.Slug).IsUnique();
        modelBuilder.Entity<ProductReview>().HasIndex(x => new { x.ProductId, x.UserId }).IsUnique();
        modelBuilder.Entity<ProductReview>().HasIndex(x => new { x.ProductId, x.CreatedAt });
        modelBuilder.Entity<CartItem>().HasIndex(x => new { x.UserId, x.ProductId, x.Size }).IsUnique();
        modelBuilder.Entity<Like>().HasIndex(x => new { x.UserId, x.ProductId }).IsUnique();
        modelBuilder.Entity<FavoriteEvent>().HasIndex(x => x.CreatedAt);
        modelBuilder.Entity<FavoriteEvent>().HasIndex(x => new { x.ProductId, x.CreatedAt });
        modelBuilder.Entity<FavoriteEvent>().HasIndex(x => new { x.UserId, x.CreatedAt });
        modelBuilder.Entity<FavoriteEvent>().HasIndex(x => new { x.EventType, x.CreatedAt });
        modelBuilder.Entity<AuthEvent>().HasIndex(x => x.CreatedAt);
        modelBuilder.Entity<AuthEvent>().HasIndex(x => new { x.Provider, x.EventType, x.CreatedAt });
        modelBuilder.Entity<AuthEvent>().HasIndex(x => new { x.UserId, x.CreatedAt });
        modelBuilder.Entity<ProductView>().HasIndex(x => new { x.ProductId, x.ViewerKey, x.DayKey }).IsUnique();
        modelBuilder.Entity<ProductView>().HasIndex(x => new { x.ProductId, x.LastViewedAt });
        modelBuilder.Entity<SiteVisit>().HasIndex(x => new { x.ViewerKey, x.DayKey }).IsUnique();
        modelBuilder.Entity<SiteVisit>().HasIndex(x => x.LastVisitedAt);
        modelBuilder.Entity<SiteVisit>().HasIndex(x => x.DayKey);
        modelBuilder.Entity<CookieConsentEvent>().HasIndex(x => x.CreatedAt);
        modelBuilder.Entity<CookieConsentEvent>().HasIndex(x => new { x.Decision, x.CreatedAt });
        modelBuilder.Entity<CookieConsentEvent>().HasIndex(x => new { x.ViewerKey, x.CreatedAt });
        modelBuilder.Entity<CookieConsentEvent>().HasIndex(x => new { x.UserId, x.CreatedAt });
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
        modelBuilder.Entity<CollectionDictionary>().HasIndex(x => x.Name).IsUnique();
        modelBuilder.Entity<CollectionDictionary>().HasIndex(x => x.Slug).IsUnique();
        modelBuilder.Entity<ProductSizeStock>().HasIndex(x => new { x.ProductId, x.SizeId }).IsUnique();
        modelBuilder.Entity<StockChangeHistory>().HasIndex(x => x.ChangedAt);
        modelBuilder.Entity<PriceChangeHistory>().HasIndex(x => x.ChangedAt);
        modelBuilder.Entity<TelegramBot>().HasIndex(x => x.Username);
        modelBuilder.Entity<TelegramBotSubscriber>().HasIndex(x => new { x.BotId, x.ChatId }).IsUnique();
        modelBuilder.Entity<TelegramAuthRequest>().HasIndex(x => x.State).IsUnique();
        modelBuilder.Entity<ContactChangeRequest>().HasIndex(x => new { x.UserId, x.Kind, x.Status });
        modelBuilder.Entity<ContactChangeRequest>().HasIndex(x => x.State);
        modelBuilder.Entity<UserExternalIdentity>().HasIndex(x => new { x.Provider, x.ProviderUserId }).IsUnique();
        modelBuilder.Entity<UserExternalIdentity>().HasIndex(x => new { x.UserId, x.Provider }).IsUnique();
        modelBuilder.Entity<UserExternalIdentity>().HasIndex(x => x.UserId);
        modelBuilder.Entity<ExternalAuthRequest>().HasIndex(x => x.State).IsUnique();
        modelBuilder.Entity<ExternalAuthRequest>().HasIndex(x => new { x.Provider, x.Status });
        modelBuilder.Entity<GalleryImage>().HasIndex(x => x.Name);
        modelBuilder.Entity<Order>().HasIndex(x => x.OrderNumber).IsUnique();
        modelBuilder.Entity<Order>().HasIndex(x => x.YandexRequestId);
        modelBuilder.Entity<Order>().HasIndex(x => x.ShippingProviderOrderId);
        modelBuilder.Entity<OrderPayment>().HasIndex(x => x.OrderId);
        modelBuilder.Entity<OrderPayment>().HasIndex(x => x.Label).IsUnique();
        modelBuilder.Entity<OrderPayment>().HasIndex(x => x.OperationId).IsUnique();
        modelBuilder.Entity<OrderPayment>().HasIndex(x => x.Status);
        modelBuilder.Entity<OrderPayment>().HasIndex(x => x.CreatedAt);
        modelBuilder.Entity<Order>()
            .Property(x => x.OrderNumber)
            .HasDefaultValueSql("nextval('orders_order_number_seq')")
            .ValueGeneratedOnAdd();

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

        modelBuilder.Entity<UserExternalIdentity>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ExternalAuthRequest>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Order>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<OrderPayment>()
            .HasOne<Order>()
            .WithMany()
            .HasForeignKey(x => x.OrderId)
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

        modelBuilder.Entity<FavoriteEvent>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<FavoriteEvent>()
            .HasOne<Product>()
            .WithMany()
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<AuthEvent>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProductView>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<ProductView>()
            .HasOne<Product>()
            .WithMany()
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<SiteVisit>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<CookieConsentEvent>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.SetNull);

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
