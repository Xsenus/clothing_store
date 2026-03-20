using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddYooMoneyPayments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "order_payments",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    order_id = table.Column<string>(type: "text", nullable: false),
                    provider = table.Column<string>(type: "text", nullable: false),
                    payment_method = table.Column<string>(type: "text", nullable: false),
                    payment_type = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    currency = table.Column<string>(type: "text", nullable: false),
                    requested_amount = table.Column<double>(type: "double precision", nullable: false),
                    charge_amount = table.Column<double>(type: "double precision", nullable: false),
                    expected_received_amount = table.Column<double>(type: "double precision", nullable: false),
                    received_amount = table.Column<double>(type: "double precision", nullable: true),
                    actual_withdraw_amount = table.Column<double>(type: "double precision", nullable: true),
                    receiver_account = table.Column<string>(type: "text", nullable: false),
                    label = table.Column<string>(type: "text", nullable: false),
                    operation_id = table.Column<string>(type: "text", nullable: true),
                    notification_type = table.Column<string>(type: "text", nullable: true),
                    sender = table.Column<string>(type: "text", nullable: true),
                    return_url = table.Column<string>(type: "text", nullable: true),
                    expires_at = table.Column<long>(type: "bigint", nullable: true),
                    paid_at = table.Column<long>(type: "bigint", nullable: true),
                    last_checked_at = table.Column<long>(type: "bigint", nullable: true),
                    last_error = table.Column<string>(type: "text", nullable: true),
                    last_payload_json = table.Column<string>(type: "jsonb", nullable: true),
                    verification_source = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<long>(type: "bigint", nullable: false),
                    updated_at = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_payments", x => x.id);
                    table.ForeignKey(
                        name: "FK_order_payments_orders_order_id",
                        column: x => x.order_id,
                        principalTable: "orders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_order_payments_created_at",
                table: "order_payments",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "IX_order_payments_label",
                table: "order_payments",
                column: "label",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_order_payments_operation_id",
                table: "order_payments",
                column: "operation_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_order_payments_order_id",
                table: "order_payments",
                column: "order_id");

            migrationBuilder.CreateIndex(
                name: "IX_order_payments_status",
                table: "order_payments",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "order_payments");
        }
    }
}
