using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGenericShippingProviderFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "shipping_data_json",
                table: "orders",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_last_sync_error",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_provider",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_provider_order_id",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_status",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_status_description",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "shipping_status_updated_at",
                table: "orders",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_tariff",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_tracking_number",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_tracking_url",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_orders_shipping_provider_order_id",
                table: "orders",
                column: "shipping_provider_order_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_orders_shipping_provider_order_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_data_json",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_last_sync_error",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_provider",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_provider_order_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_status",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_status_description",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_status_updated_at",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_tariff",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_tracking_number",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_tracking_url",
                table: "orders");
        }
    }
}
