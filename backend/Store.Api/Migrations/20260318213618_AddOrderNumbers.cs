using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderNumbers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateSequence<int>(
                name: "orders_order_number_seq");

            migrationBuilder.AddColumn<int>(
                name: "order_number",
                table: "orders",
                type: "integer",
                nullable: true,
                defaultValueSql: "nextval('orders_order_number_seq')");

            migrationBuilder.Sql(
                """
                WITH ordered_orders AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS next_number
                    FROM orders
                )
                UPDATE orders AS target
                SET order_number = ordered_orders.next_number
                FROM ordered_orders
                WHERE target.id = ordered_orders.id;
                """);

            migrationBuilder.Sql(
                """
                DO $$
                DECLARE
                    max_order_number integer;
                BEGIN
                    SELECT COALESCE(MAX(order_number), 0) INTO max_order_number FROM orders;
                    IF max_order_number > 0 THEN
                        PERFORM setval('orders_order_number_seq', max_order_number, true);
                    ELSE
                        PERFORM setval('orders_order_number_seq', 1, false);
                    END IF;
                END
                $$;
                """);

            migrationBuilder.AlterColumn<int>(
                name: "order_number",
                table: "orders",
                type: "integer",
                nullable: false,
                defaultValueSql: "nextval('orders_order_number_seq')",
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true,
                oldDefaultValueSql: "nextval('orders_order_number_seq')");

            migrationBuilder.CreateIndex(
                name: "IX_orders_order_number",
                table: "orders",
                column: "order_number",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_orders_order_number",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "order_number",
                table: "orders");

            migrationBuilder.DropSequence(
                name: "orders_order_number_seq");
        }
    }
}
