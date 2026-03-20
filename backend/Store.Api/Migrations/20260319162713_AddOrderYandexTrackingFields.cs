using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderYandexTrackingFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "yandex_delivery_last_sync_error",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "yandex_delivery_status",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "yandex_delivery_status_description",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "yandex_delivery_status_reason",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "yandex_delivery_status_synced_at",
                table: "orders",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "yandex_delivery_status_updated_at",
                table: "orders",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "yandex_delivery_tracking_url",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "yandex_pickup_code",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "yandex_request_id",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_orders_yandex_request_id",
                table: "orders",
                column: "yandex_request_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_orders_yandex_request_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "yandex_delivery_last_sync_error",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "yandex_delivery_status",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "yandex_delivery_status_description",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "yandex_delivery_status_reason",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "yandex_delivery_status_synced_at",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "yandex_delivery_status_updated_at",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "yandex_delivery_tracking_url",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "yandex_pickup_code",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "yandex_request_id",
                table: "orders");
        }
    }
}
