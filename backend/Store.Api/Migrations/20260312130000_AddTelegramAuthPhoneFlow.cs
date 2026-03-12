using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    public partial class AddTelegramAuthPhoneFlow : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "phone_verified",
                table: "profiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "telegram_auth_requests",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    state = table.Column<string>(type: "text", nullable: false),
                    bot_id = table.Column<string>(type: "text", nullable: false),
                    telegram_user_id = table.Column<string>(type: "text", nullable: true),
                    chat_id = table.Column<long>(type: "bigint", nullable: true),
                    user_id = table.Column<string>(type: "text", nullable: true),
                    phone_number = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<long>(type: "bigint", nullable: false),
                    expires_at = table.Column<long>(type: "bigint", nullable: false),
                    completed_at = table.Column<long>(type: "bigint", nullable: true),
                    consumed_at = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_telegram_auth_requests", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_telegram_auth_requests_state",
                table: "telegram_auth_requests",
                column: "state",
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "telegram_auth_requests");

            migrationBuilder.DropColumn(
                name: "phone_verified",
                table: "profiles");
        }
    }
}
