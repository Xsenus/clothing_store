using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderDetailsAndStatusHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "customer_email",
                table: "orders",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "customer_name",
                table: "orders",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "customer_phone",
                table: "orders",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "payment_method",
                table: "orders",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "purchase_channel",
                table: "orders",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "shipping_address",
                table: "orders",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "status_history_json",
                table: "orders",
                type: "jsonb",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<long>(
                name: "updated_at",
                table: "orders",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "customer_email",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "customer_name",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "customer_phone",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "payment_method",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "purchase_channel",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_address",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "status_history_json",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "orders");
        }
    }
}
