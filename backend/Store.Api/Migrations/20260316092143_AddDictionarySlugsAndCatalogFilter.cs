using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDictionarySlugsAndCatalogFilter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "show_in_catalog_filter",
                table: "size_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "slug",
                table: "size_dictionaries",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "show_in_catalog_filter",
                table: "material_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "slug",
                table: "material_dictionaries",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "show_in_catalog_filter",
                table: "color_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "slug",
                table: "color_dictionaries",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "show_in_catalog_filter",
                table: "category_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "slug",
                table: "category_dictionaries",
                type: "text",
                nullable: true);

            migrationBuilder.Sql(
                """
                WITH prepared AS (
                    SELECT
                        id,
                        COALESCE(NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g')), ''), 'item') AS base_slug
                    FROM size_dictionaries
                ),
                numbered AS (
                    SELECT
                        id,
                        base_slug,
                        ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS row_num
                    FROM prepared
                )
                UPDATE size_dictionaries AS target
                SET slug = CASE WHEN numbered.row_num = 1 THEN numbered.base_slug ELSE numbered.base_slug || '-' || numbered.row_num END
                FROM numbered
                WHERE target.id = numbered.id;
                """);

            migrationBuilder.Sql(
                """
                WITH prepared AS (
                    SELECT
                        id,
                        COALESCE(NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g')), ''), 'item') AS base_slug
                    FROM material_dictionaries
                ),
                numbered AS (
                    SELECT
                        id,
                        base_slug,
                        ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS row_num
                    FROM prepared
                )
                UPDATE material_dictionaries AS target
                SET slug = CASE WHEN numbered.row_num = 1 THEN numbered.base_slug ELSE numbered.base_slug || '-' || numbered.row_num END
                FROM numbered
                WHERE target.id = numbered.id;
                """);

            migrationBuilder.Sql(
                """
                WITH prepared AS (
                    SELECT
                        id,
                        COALESCE(NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g')), ''), 'item') AS base_slug
                    FROM color_dictionaries
                ),
                numbered AS (
                    SELECT
                        id,
                        base_slug,
                        ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS row_num
                    FROM prepared
                )
                UPDATE color_dictionaries AS target
                SET slug = CASE WHEN numbered.row_num = 1 THEN numbered.base_slug ELSE numbered.base_slug || '-' || numbered.row_num END
                FROM numbered
                WHERE target.id = numbered.id;
                """);

            migrationBuilder.Sql(
                """
                WITH prepared AS (
                    SELECT
                        id,
                        COALESCE(NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g')), ''), 'item') AS base_slug
                    FROM category_dictionaries
                ),
                numbered AS (
                    SELECT
                        id,
                        base_slug,
                        ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS row_num
                    FROM prepared
                )
                UPDATE category_dictionaries AS target
                SET slug = CASE WHEN numbered.row_num = 1 THEN numbered.base_slug ELSE numbered.base_slug || '-' || numbered.row_num END
                FROM numbered
                WHERE target.id = numbered.id;
                """);

            migrationBuilder.AlterColumn<string>(
                name: "slug",
                table: "size_dictionaries",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "slug",
                table: "material_dictionaries",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "slug",
                table: "color_dictionaries",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "slug",
                table: "category_dictionaries",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_size_dictionaries_slug",
                table: "size_dictionaries",
                column: "slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_material_dictionaries_slug",
                table: "material_dictionaries",
                column: "slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_color_dictionaries_slug",
                table: "color_dictionaries",
                column: "slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_category_dictionaries_slug",
                table: "category_dictionaries",
                column: "slug",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_size_dictionaries_slug",
                table: "size_dictionaries");

            migrationBuilder.DropIndex(
                name: "IX_material_dictionaries_slug",
                table: "material_dictionaries");

            migrationBuilder.DropIndex(
                name: "IX_color_dictionaries_slug",
                table: "color_dictionaries");

            migrationBuilder.DropIndex(
                name: "IX_category_dictionaries_slug",
                table: "category_dictionaries");

            migrationBuilder.DropColumn(
                name: "show_in_catalog_filter",
                table: "size_dictionaries");

            migrationBuilder.DropColumn(
                name: "slug",
                table: "size_dictionaries");

            migrationBuilder.DropColumn(
                name: "show_in_catalog_filter",
                table: "material_dictionaries");

            migrationBuilder.DropColumn(
                name: "slug",
                table: "material_dictionaries");

            migrationBuilder.DropColumn(
                name: "show_in_catalog_filter",
                table: "color_dictionaries");

            migrationBuilder.DropColumn(
                name: "slug",
                table: "color_dictionaries");

            migrationBuilder.DropColumn(
                name: "show_in_catalog_filter",
                table: "category_dictionaries");

            migrationBuilder.DropColumn(
                name: "slug",
                table: "category_dictionaries");
        }
    }
}
