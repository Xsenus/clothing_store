using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddExtendedDictionaryFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "color",
                table: "size_dictionaries",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "size_dictionaries",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_active",
                table: "size_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "color",
                table: "material_dictionaries",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "material_dictionaries",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_active",
                table: "material_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "color",
                table: "color_dictionaries",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "color_dictionaries",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_active",
                table: "color_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "color",
                table: "category_dictionaries",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "category_dictionaries",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_active",
                table: "category_dictionaries",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "color",
                table: "size_dictionaries");

            migrationBuilder.DropColumn(
                name: "description",
                table: "size_dictionaries");

            migrationBuilder.DropColumn(
                name: "is_active",
                table: "size_dictionaries");

            migrationBuilder.DropColumn(
                name: "color",
                table: "material_dictionaries");

            migrationBuilder.DropColumn(
                name: "description",
                table: "material_dictionaries");

            migrationBuilder.DropColumn(
                name: "is_active",
                table: "material_dictionaries");

            migrationBuilder.DropColumn(
                name: "color",
                table: "color_dictionaries");

            migrationBuilder.DropColumn(
                name: "description",
                table: "color_dictionaries");

            migrationBuilder.DropColumn(
                name: "is_active",
                table: "color_dictionaries");

            migrationBuilder.DropColumn(
                name: "color",
                table: "category_dictionaries");

            migrationBuilder.DropColumn(
                name: "description",
                table: "category_dictionaries");

            migrationBuilder.DropColumn(
                name: "is_active",
                table: "category_dictionaries");
        }
    }
}
