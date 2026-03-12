using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddContactChangeRequestsAndContactVerification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "contact_change_requests",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    user_id = table.Column<string>(type: "text", nullable: false),
                    kind = table.Column<string>(type: "text", nullable: false),
                    target_value = table.Column<string>(type: "text", nullable: false),
                    code = table.Column<string>(type: "text", nullable: true),
                    state = table.Column<string>(type: "text", nullable: true),
                    chat_id = table.Column<long>(type: "bigint", nullable: true),
                    telegram_user_id = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<long>(type: "bigint", nullable: false),
                    expires_at = table.Column<long>(type: "bigint", nullable: false),
                    verified_at = table.Column<long>(type: "bigint", nullable: true),
                    consumed_at = table.Column<long>(type: "bigint", nullable: true),
                    last_sent_at = table.Column<long>(type: "bigint", nullable: true),
                    resend_count = table.Column<int>(type: "integer", nullable: false),
                    resend_window_started_at = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_contact_change_requests", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_contact_change_requests_state",
                table: "contact_change_requests",
                column: "state");

            migrationBuilder.CreateIndex(
                name: "IX_contact_change_requests_user_id_kind_status",
                table: "contact_change_requests",
                columns: new[] { "user_id", "kind", "status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "contact_change_requests");
        }
    }
}
