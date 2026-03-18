using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDictionaryShowColorInCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "show_color_in_catalog",
                table: "size_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "show_color_in_catalog",
                table: "material_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "show_color_in_catalog",
                table: "color_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "show_color_in_catalog",
                table: "collection_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "show_color_in_catalog",
                table: "category_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "show_color_in_catalog",
                table: "size_dictionaries");

            migrationBuilder.DropColumn(
                name: "show_color_in_catalog",
                table: "material_dictionaries");

            migrationBuilder.DropColumn(
                name: "show_color_in_catalog",
                table: "color_dictionaries");

            migrationBuilder.DropColumn(
                name: "show_color_in_catalog",
                table: "collection_dictionaries");

            migrationBuilder.DropColumn(
                name: "show_color_in_catalog",
                table: "category_dictionaries");
        }
    }
}
