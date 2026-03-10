using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using Store.Api.Data;

#nullable disable

namespace Store.Api.Migrations;

[DbContext(typeof(StoreDbContext))]
[Migration("20260310084158_InitialCreate")]
public partial class InitialCreate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
    }
}
