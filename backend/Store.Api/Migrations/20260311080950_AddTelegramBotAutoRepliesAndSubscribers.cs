using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTelegramBotAutoRepliesAndSubscribers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "auto_replies_enabled",
                table: "telegram_bots",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "reply_templates_json",
                table: "telegram_bots",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.CreateTable(
                name: "telegram_bot_subscribers",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    bot_id = table.Column<string>(type: "text", nullable: false),
                    chat_id = table.Column<long>(type: "bigint", nullable: false),
                    username = table.Column<string>(type: "text", nullable: true),
                    first_name = table.Column<string>(type: "text", nullable: true),
                    last_name = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<long>(type: "bigint", nullable: false),
                    updated_at = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_telegram_bot_subscribers", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_telegram_bot_subscribers_bot_id_chat_id",
                table: "telegram_bot_subscribers",
                columns: new[] { "bot_id", "chat_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "telegram_bot_subscribers");

            migrationBuilder.DropColumn(
                name: "auto_replies_enabled",
                table: "telegram_bots");

            migrationBuilder.DropColumn(
                name: "reply_templates_json",
                table: "telegram_bots");
        }
    }
}
