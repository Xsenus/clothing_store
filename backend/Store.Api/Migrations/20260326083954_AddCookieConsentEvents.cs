using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCookieConsentEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "cookie_consent_events",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    user_id = table.Column<string>(type: "text", nullable: true),
                    visitor_id = table.Column<string>(type: "text", nullable: true),
                    viewer_key = table.Column<string>(type: "text", nullable: false),
                    decision = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_cookie_consent_events", x => x.id);
                    table.ForeignKey(
                        name: "FK_cookie_consent_events_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_cookie_consent_events_created_at",
                table: "cookie_consent_events",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "IX_cookie_consent_events_decision_created_at",
                table: "cookie_consent_events",
                columns: new[] { "decision", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_cookie_consent_events_user_id_created_at",
                table: "cookie_consent_events",
                columns: new[] { "user_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_cookie_consent_events_viewer_key_created_at",
                table: "cookie_consent_events",
                columns: new[] { "viewer_key", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "cookie_consent_events");
        }
    }
}
