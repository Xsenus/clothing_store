using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    public partial class AddTelegramBotWebhookMode : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "update_mode",
                table: "telegram_bots",
                type: "text",
                nullable: false,
                defaultValue: "polling");

            migrationBuilder.AddColumn<string>(
                name: "webhook_secret",
                table: "telegram_bots",
                type: "text",
                nullable: true);

            migrationBuilder.Sql("UPDATE telegram_bots SET update_mode = 'polling' WHERE update_mode IS NULL OR update_mode = '';");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "update_mode",
                table: "telegram_bots");

            migrationBuilder.DropColumn(
                name: "webhook_secret",
                table: "telegram_bots");
        }
    }
}
