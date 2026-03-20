using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddExternalAuthIntentForLinking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "intent",
                table: "telegram_auth_requests",
                type: "text",
                nullable: false,
                defaultValue: "signin");

            migrationBuilder.AddColumn<string>(
                name: "intent",
                table: "external_auth_requests",
                type: "text",
                nullable: false,
                defaultValue: "signin");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "intent",
                table: "telegram_auth_requests");

            migrationBuilder.DropColumn(
                name: "intent",
                table: "external_auth_requests");
        }
    }
}
