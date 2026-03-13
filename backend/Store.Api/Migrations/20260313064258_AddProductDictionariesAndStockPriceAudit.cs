using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProductDictionariesAndStockPriceAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "category_dictionaries",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_category_dictionaries", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "color_dictionaries",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_color_dictionaries", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "material_dictionaries",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_material_dictionaries", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "price_change_history",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    product_id = table.Column<string>(type: "text", nullable: false),
                    changed_by_user_id = table.Column<string>(type: "text", nullable: false),
                    field_name = table.Column<string>(type: "text", nullable: false),
                    old_value = table.Column<decimal>(type: "numeric", nullable: true),
                    new_value = table.Column<decimal>(type: "numeric", nullable: true),
                    changed_at = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_price_change_history", x => x.id);
                    table.ForeignKey(
                        name: "FK_price_change_history_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "size_dictionaries",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_size_dictionaries", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "product_size_stocks",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    product_id = table.Column<string>(type: "text", nullable: false),
                    size_id = table.Column<string>(type: "text", nullable: false),
                    stock = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_product_size_stocks", x => x.id);
                    table.ForeignKey(
                        name: "FK_product_size_stocks_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_product_size_stocks_size_dictionaries_size_id",
                        column: x => x.size_id,
                        principalTable: "size_dictionaries",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "stock_change_history",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    product_id = table.Column<string>(type: "text", nullable: false),
                    size_id = table.Column<string>(type: "text", nullable: false),
                    changed_by_user_id = table.Column<string>(type: "text", nullable: false),
                    old_value = table.Column<int>(type: "integer", nullable: false),
                    new_value = table.Column<int>(type: "integer", nullable: false),
                    changed_at = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_change_history", x => x.id);
                    table.ForeignKey(
                        name: "FK_stock_change_history_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_stock_change_history_size_dictionaries_size_id",
                        column: x => x.size_id,
                        principalTable: "size_dictionaries",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_category_dictionaries_name",
                table: "category_dictionaries",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_color_dictionaries_name",
                table: "color_dictionaries",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_material_dictionaries_name",
                table: "material_dictionaries",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_price_change_history_changed_at",
                table: "price_change_history",
                column: "changed_at");

            migrationBuilder.CreateIndex(
                name: "IX_price_change_history_product_id",
                table: "price_change_history",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_product_size_stocks_product_id_size_id",
                table: "product_size_stocks",
                columns: new[] { "product_id", "size_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_product_size_stocks_size_id",
                table: "product_size_stocks",
                column: "size_id");

            migrationBuilder.CreateIndex(
                name: "IX_size_dictionaries_name",
                table: "size_dictionaries",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_stock_change_history_changed_at",
                table: "stock_change_history",
                column: "changed_at");

            migrationBuilder.CreateIndex(
                name: "IX_stock_change_history_product_id",
                table: "stock_change_history",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_change_history_size_id",
                table: "stock_change_history",
                column: "size_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "category_dictionaries");

            migrationBuilder.DropTable(
                name: "color_dictionaries");

            migrationBuilder.DropTable(
                name: "material_dictionaries");

            migrationBuilder.DropTable(
                name: "price_change_history");

            migrationBuilder.DropTable(
                name: "product_size_stocks");

            migrationBuilder.DropTable(
                name: "stock_change_history");

            migrationBuilder.DropTable(
                name: "size_dictionaries");
        }
    }
}
