using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDictionarySortOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "sort_order",
                table: "size_dictionaries",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "sort_order",
                table: "material_dictionaries",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "sort_order",
                table: "color_dictionaries",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "sort_order",
                table: "category_dictionaries",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql("""
                WITH ordered AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS sort_order
                    FROM category_dictionaries
                )
                UPDATE category_dictionaries AS target
                SET sort_order = ordered.sort_order
                FROM ordered
                WHERE target.id = ordered.id;
                """);

            migrationBuilder.Sql("""
                WITH ordered AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS sort_order
                    FROM color_dictionaries
                )
                UPDATE color_dictionaries AS target
                SET sort_order = ordered.sort_order
                FROM ordered
                WHERE target.id = ordered.id;
                """);

            migrationBuilder.Sql("""
                WITH ordered AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS sort_order
                    FROM material_dictionaries
                )
                UPDATE material_dictionaries AS target
                SET sort_order = ordered.sort_order
                FROM ordered
                WHERE target.id = ordered.id;
                """);

            migrationBuilder.Sql("""
                WITH ordered AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS sort_order
                    FROM size_dictionaries
                )
                UPDATE size_dictionaries AS target
                SET sort_order = ordered.sort_order
                FROM ordered
                WHERE target.id = ordered.id;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "sort_order",
                table: "size_dictionaries");

            migrationBuilder.DropColumn(
                name: "sort_order",
                table: "material_dictionaries");

            migrationBuilder.DropColumn(
                name: "sort_order",
                table: "color_dictionaries");

            migrationBuilder.DropColumn(
                name: "sort_order",
                table: "category_dictionaries");
        }
    }
}
