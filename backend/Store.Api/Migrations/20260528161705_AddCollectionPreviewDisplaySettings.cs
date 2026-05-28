using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCollectionPreviewDisplaySettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "preview_rotation_mode",
                table: "collection_dictionaries",
                type: "text",
                nullable: false,
                defaultValue: "sequential");

            migrationBuilder.AddColumn<int>(
                name: "preview_tile_count",
                table: "collection_dictionaries",
                type: "integer",
                nullable: false,
                defaultValue: 3);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "preview_rotation_mode",
                table: "collection_dictionaries");

            migrationBuilder.DropColumn(
                name: "preview_tile_count",
                table: "collection_dictionaries");
        }
    }
}
