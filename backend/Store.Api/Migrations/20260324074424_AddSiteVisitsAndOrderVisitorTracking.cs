using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSiteVisitsAndOrderVisitorTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "viewer_key",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "visitor_id",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "site_visits",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    user_id = table.Column<string>(type: "text", nullable: true),
                    visitor_id = table.Column<string>(type: "text", nullable: true),
                    viewer_key = table.Column<string>(type: "text", nullable: false),
                    day_key = table.Column<int>(type: "integer", nullable: false),
                    visit_count = table.Column<int>(type: "integer", nullable: false),
                    first_visited_at = table.Column<long>(type: "bigint", nullable: false),
                    last_visited_at = table.Column<long>(type: "bigint", nullable: false),
                    entry_path = table.Column<string>(type: "text", nullable: true),
                    last_path = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_site_visits", x => x.id);
                    table.ForeignKey(
                        name: "FK_site_visits_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_site_visits_day_key",
                table: "site_visits",
                column: "day_key");

            migrationBuilder.CreateIndex(
                name: "IX_site_visits_last_visited_at",
                table: "site_visits",
                column: "last_visited_at");

            migrationBuilder.CreateIndex(
                name: "IX_site_visits_user_id",
                table: "site_visits",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_site_visits_viewer_key_day_key",
                table: "site_visits",
                columns: new[] { "viewer_key", "day_key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "site_visits");

            migrationBuilder.DropColumn(
                name: "viewer_key",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "visitor_id",
                table: "orders");
        }
    }
}
