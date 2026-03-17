using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProductReviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "product_reviews",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    product_id = table.Column<string>(type: "text", nullable: false),
                    user_id = table.Column<string>(type: "text", nullable: false),
                    author_name = table.Column<string>(type: "text", nullable: false),
                    text = table.Column<string>(type: "text", nullable: false),
                    media_json = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<long>(type: "bigint", nullable: false),
                    edited_at = table.Column<long>(type: "bigint", nullable: true),
                    is_hidden = table.Column<bool>(type: "boolean", nullable: false),
                    hidden_at = table.Column<long>(type: "bigint", nullable: true),
                    hidden_by_user_id = table.Column<string>(type: "text", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<long>(type: "bigint", nullable: true),
                    deleted_by_user_id = table.Column<string>(type: "text", nullable: true),
                    deleted_by_role = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_product_reviews", x => x.id);
                    table.ForeignKey(
                        name: "FK_product_reviews_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_product_reviews_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_product_reviews_product_id_created_at",
                table: "product_reviews",
                columns: new[] { "product_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_product_reviews_product_id_user_id",
                table: "product_reviews",
                columns: new[] { "product_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_product_reviews_user_id",
                table: "product_reviews",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "product_reviews");
        }
    }
}
