using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderShippingFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "pickup_point_id",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "shipping_amount",
                table: "orders",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<string>(
                name: "shipping_method",
                table: "orders",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "pickup_point_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_amount",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_method",
                table: "orders");
        }
    }
}
