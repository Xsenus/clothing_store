using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Store.Api.Data;

#nullable disable

namespace Store.Api.Migrations;

[DbContext(typeof(StoreDbContext))]
partial class StoreDbContextModelSnapshot : ModelSnapshot
{
    protected override void BuildModel(ModelBuilder modelBuilder)
    {
        modelBuilder
            .HasAnnotation("ProductVersion", "9.0.13");

        modelBuilder.Entity("Store.Api.Models.AdminSession", b =>
        {
            b.Property<string>("Token").HasColumnName("token");
            b.Property<long>("CreatedAt").HasColumnName("created_at");
            b.Property<string>("UserId").HasColumnName("user_id");
            b.HasKey("Token");
            b.ToTable("admin_sessions");
        });

        modelBuilder.Entity("Store.Api.Models.AppSetting", b =>
        {
            b.Property<string>("Key").HasColumnName("key");
            b.Property<string>("Value").HasColumnName("value");
            b.HasKey("Key");
            b.ToTable("app_settings");
        });

        modelBuilder.Entity("Store.Api.Models.CartItem", b =>
        {
            b.Property<string>("Id").HasColumnName("id");
            b.Property<string>("ProductId").HasColumnName("product_id");
            b.Property<int>("Quantity").HasColumnName("quantity");
            b.Property<string>("Size").HasColumnName("size");
            b.Property<string>("UserId").HasColumnName("user_id");
            b.HasKey("Id");
            b.HasIndex("ProductId");
            b.HasIndex("UserId", "ProductId", "Size").IsUnique();
            b.ToTable("cart_items");
        });

        modelBuilder.Entity("Store.Api.Models.Like", b =>
        {
            b.Property<string>("Id").HasColumnName("id");
            b.Property<string>("ProductId").HasColumnName("product_id");
            b.Property<string>("UserId").HasColumnName("user_id");
            b.HasKey("Id");
            b.HasIndex("ProductId");
            b.HasIndex("UserId", "ProductId").IsUnique();
            b.ToTable("likes");
        });

        modelBuilder.Entity("Store.Api.Models.Order", b =>
        {
            b.Property<string>("Id").HasColumnName("id");
            b.Property<long>("CreatedAt").HasColumnName("created_at");
            b.Property<string>("ItemsJson").HasColumnName("items_json").HasColumnType("jsonb");
            b.Property<string>("Status").HasColumnName("status");
            b.Property<double>("TotalAmount").HasColumnName("total_amount");
            b.Property<string>("UserId").HasColumnName("user_id");
            b.HasKey("Id");
            b.HasIndex("UserId");
            b.ToTable("orders");
        });

        modelBuilder.Entity("Store.Api.Models.Product", b =>
        {
            b.Property<string>("Id").HasColumnName("id");
            b.Property<string>("Category").HasColumnName("category");
            b.Property<long>("CreationTime").HasColumnName("creation_time");
            b.Property<string>("Data").HasColumnName("data").HasColumnType("jsonb");
            b.Property<bool>("IsNew").HasColumnName("is_new");
            b.Property<bool>("IsPopular").HasColumnName("is_popular");
            b.Property<int>("LikesCount").HasColumnName("likes_count");
            b.Property<string>("Slug").HasColumnName("slug");
            b.HasKey("Id");
            b.HasIndex("Slug").IsUnique();
            b.ToTable("products");
        });

        modelBuilder.Entity("Store.Api.Models.Profile", b =>
        {
            b.Property<string>("UserId").HasColumnName("user_id");
            b.Property<string>("Email").HasColumnName("email");
            b.Property<string>("Name").HasColumnName("name");
            b.Property<string>("Nickname").HasColumnName("nickname");
            b.Property<string>("Phone").HasColumnName("phone");
            b.Property<string>("ShippingAddress").HasColumnName("shipping_address");
            b.HasKey("UserId");
            b.HasIndex("Nickname").IsUnique();
            b.ToTable("profiles");
        });

        modelBuilder.Entity("Store.Api.Models.RefreshSession", b =>
        {
            b.Property<string>("Token").HasColumnName("token");
            b.Property<long>("CreatedAt").HasColumnName("created_at");
            b.Property<string>("UserId").HasColumnName("user_id");
            b.HasKey("Token");
            b.HasIndex("UserId");
            b.ToTable("refresh_sessions");
        });

        modelBuilder.Entity("Store.Api.Models.Session", b =>
        {
            b.Property<string>("Token").HasColumnName("token");
            b.Property<long>("CreatedAt").HasColumnName("created_at");
            b.Property<string>("UserId").HasColumnName("user_id");
            b.HasKey("Token");
            b.HasIndex("UserId");
            b.ToTable("sessions");
        });

        modelBuilder.Entity("Store.Api.Models.User", b =>
        {
            b.Property<string>("Id").HasColumnName("id");
            b.Property<long>("CreatedAt").HasColumnName("created_at");
            b.Property<string>("Email").HasColumnName("email");
            b.Property<bool>("IsAdmin").HasColumnName("is_admin");
            b.Property<bool>("IsBlocked").HasColumnName("is_blocked");
            b.Property<bool>("IsSystem").HasColumnName("is_system");
            b.Property<string>("PasswordHash").HasColumnName("password_hash");
            b.Property<string>("Salt").HasColumnName("salt");
            b.Property<bool>("Verified").HasColumnName("verified");
            b.HasKey("Id");
            b.HasIndex("Email").IsUnique();
            b.ToTable("users");
        });

        modelBuilder.Entity("Store.Api.Models.VerificationCode", b =>
        {
            b.Property<string>("Email").HasColumnName("email");
            b.Property<string>("Kind").HasColumnName("kind");
            b.Property<string>("Code").HasColumnName("code");
            b.Property<long>("ExpiresAt").HasColumnName("expires_at");
            b.HasKey("Email", "Kind");
            b.ToTable("verification_codes");
        });

        modelBuilder.Entity("Store.Api.Models.CartItem", b =>
        {
            b.HasOne("Store.Api.Models.Product", null)
                .WithMany()
                .HasForeignKey("ProductId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();

            b.HasOne("Store.Api.Models.User", null)
                .WithMany()
                .HasForeignKey("UserId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();
        });

        modelBuilder.Entity("Store.Api.Models.Like", b =>
        {
            b.HasOne("Store.Api.Models.Product", null)
                .WithMany()
                .HasForeignKey("ProductId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();

            b.HasOne("Store.Api.Models.User", null)
                .WithMany()
                .HasForeignKey("UserId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();
        });

        modelBuilder.Entity("Store.Api.Models.Order", b =>
        {
            b.HasOne("Store.Api.Models.User", null)
                .WithMany()
                .HasForeignKey("UserId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();
        });

        modelBuilder.Entity("Store.Api.Models.Profile", b =>
        {
            b.HasOne("Store.Api.Models.User", null)
                .WithOne()
                .HasForeignKey("Store.Api.Models.Profile", "UserId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();
        });

        modelBuilder.Entity("Store.Api.Models.RefreshSession", b =>
        {
            b.HasOne("Store.Api.Models.User", null)
                .WithMany()
                .HasForeignKey("UserId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();
        });

        modelBuilder.Entity("Store.Api.Models.Session", b =>
        {
            b.HasOne("Store.Api.Models.User", null)
                .WithMany()
                .HasForeignKey("UserId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();
        });
    }
}
