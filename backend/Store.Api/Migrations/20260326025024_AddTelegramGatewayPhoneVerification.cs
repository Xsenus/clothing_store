using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTelegramGatewayPhoneVerification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "gateway_delivery_status",
                table: "contact_change_requests",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "gateway_delivery_updated_at",
                table: "contact_change_requests",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "gateway_is_refunded",
                table: "contact_change_requests",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "gateway_request_id",
                table: "contact_change_requests",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "gateway_verification_status",
                table: "contact_change_requests",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "gateway_verification_updated_at",
                table: "contact_change_requests",
                type: "bigint",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "gateway_delivery_status",
                table: "contact_change_requests");

            migrationBuilder.DropColumn(
                name: "gateway_delivery_updated_at",
                table: "contact_change_requests");

            migrationBuilder.DropColumn(
                name: "gateway_is_refunded",
                table: "contact_change_requests");

            migrationBuilder.DropColumn(
                name: "gateway_request_id",
                table: "contact_change_requests");

            migrationBuilder.DropColumn(
                name: "gateway_verification_status",
                table: "contact_change_requests");

            migrationBuilder.DropColumn(
                name: "gateway_verification_updated_at",
                table: "contact_change_requests");
        }
    }
}
