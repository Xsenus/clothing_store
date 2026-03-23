using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProductViews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "product_views",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    product_id = table.Column<string>(type: "text", nullable: false),
                    user_id = table.Column<string>(type: "text", nullable: true),
                    visitor_id = table.Column<string>(type: "text", nullable: true),
                    viewer_key = table.Column<string>(type: "text", nullable: false),
                    day_key = table.Column<int>(type: "integer", nullable: false),
                    view_count = table.Column<int>(type: "integer", nullable: false),
                    first_viewed_at = table.Column<long>(type: "bigint", nullable: false),
                    last_viewed_at = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_product_views", x => x.id);
                    table.ForeignKey(
                        name: "FK_product_views_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_product_views_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_product_views_product_id_last_viewed_at",
                table: "product_views",
                columns: new[] { "product_id", "last_viewed_at" });

            migrationBuilder.CreateIndex(
                name: "IX_product_views_product_id_viewer_key_day_key",
                table: "product_views",
                columns: new[] { "product_id", "viewer_key", "day_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_product_views_user_id",
                table: "product_views",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "product_views");
        }
    }
}
