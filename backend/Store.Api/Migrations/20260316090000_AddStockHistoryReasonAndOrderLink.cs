using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddStockHistoryReasonAndOrderLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "order_id",
                table: "stock_change_history",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "reason",
                table: "stock_change_history",
                type: "text",
                nullable: false,
                defaultValue: "admin_manual");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "order_id",
                table: "stock_change_history");

            migrationBuilder.DropColumn(
                name: "reason",
                table: "stock_change_history");
        }
    }
}
