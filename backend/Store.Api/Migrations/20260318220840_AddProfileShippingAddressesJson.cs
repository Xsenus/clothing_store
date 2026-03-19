using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProfileShippingAddressesJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "shipping_addresses_json",
                table: "profiles",
                type: "jsonb",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.Sql("""
                UPDATE profiles
                SET shipping_addresses_json = CASE
                    WHEN shipping_address IS NULL OR btrim(shipping_address) = '' THEN '[]'::jsonb
                    ELSE jsonb_build_array(
                        jsonb_build_object(
                            'Id', md5(user_id || '_default_address'),
                            'Value', btrim(shipping_address),
                            'IsDefault', true
                        )
                    )
                END;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "shipping_addresses_json",
                table: "profiles");
        }
    }
}
