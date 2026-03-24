using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderPromoCodeFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "promo_code",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "promo_discount_amount",
                table: "orders",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "promo_code",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "promo_discount_amount",
                table: "orders");
        }
    }
}
