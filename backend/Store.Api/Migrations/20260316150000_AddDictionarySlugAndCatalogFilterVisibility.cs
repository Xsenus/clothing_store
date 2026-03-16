using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Store.Api.Migrations;

public partial class AddDictionarySlugAndCatalogFilterVisibility : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        AddColumns(migrationBuilder, "size_dictionaries");
        AddColumns(migrationBuilder, "material_dictionaries");
        AddColumns(migrationBuilder, "color_dictionaries");
        AddColumns(migrationBuilder, "category_dictionaries");

        ApplyKnownSlugs(migrationBuilder);

        BackfillUniqueSlug(migrationBuilder, "size_dictionaries");
        BackfillUniqueSlug(migrationBuilder, "material_dictionaries");
        BackfillUniqueSlug(migrationBuilder, "color_dictionaries");
        BackfillUniqueSlug(migrationBuilder, "category_dictionaries");

        MakeSlugRequiredAndIndexed(migrationBuilder, "size_dictionaries", "IX_size_dictionaries_slug");
        MakeSlugRequiredAndIndexed(migrationBuilder, "material_dictionaries", "IX_material_dictionaries_slug");
        MakeSlugRequiredAndIndexed(migrationBuilder, "color_dictionaries", "IX_color_dictionaries_slug");
        MakeSlugRequiredAndIndexed(migrationBuilder, "category_dictionaries", "IX_category_dictionaries_slug");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_size_dictionaries_slug", table: "size_dictionaries");
        migrationBuilder.DropIndex(name: "IX_material_dictionaries_slug", table: "material_dictionaries");
        migrationBuilder.DropIndex(name: "IX_color_dictionaries_slug", table: "color_dictionaries");
        migrationBuilder.DropIndex(name: "IX_category_dictionaries_slug", table: "category_dictionaries");

        DropColumns(migrationBuilder, "size_dictionaries");
        DropColumns(migrationBuilder, "material_dictionaries");
        DropColumns(migrationBuilder, "color_dictionaries");
        DropColumns(migrationBuilder, "category_dictionaries");
    }

    private static void AddColumns(MigrationBuilder migrationBuilder, string table)
    {
        migrationBuilder.AddColumn<string>(
            name: "slug",
            table: table,
            type: "text",
            nullable: true);

        migrationBuilder.AddColumn<bool>(
            name: "show_in_catalog_filter",
            table: table,
            type: "boolean",
            nullable: false,
            defaultValue: true);
    }

    private static void DropColumns(MigrationBuilder migrationBuilder, string table)
    {
        migrationBuilder.DropColumn(name: "slug", table: table);
        migrationBuilder.DropColumn(name: "show_in_catalog_filter", table: table);
    }

    private static void MakeSlugRequiredAndIndexed(MigrationBuilder migrationBuilder, string table, string indexName)
    {
        migrationBuilder.AlterColumn<string>(
            name: "slug",
            table: table,
            type: "text",
            nullable: false,
            oldClrType: typeof(string),
            oldType: "text",
            oldNullable: true);

        migrationBuilder.CreateIndex(
            name: indexName,
            table: table,
            column: "slug",
            unique: true);
    }

    private static void ApplyKnownSlugs(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(@"
UPDATE size_dictionaries SET slug = 'xs' WHERE slug IS NULL AND lower(trim(name)) = 'xs';
UPDATE size_dictionaries SET slug = 's' WHERE slug IS NULL AND lower(trim(name)) = 's';
UPDATE size_dictionaries SET slug = 'm' WHERE slug IS NULL AND lower(trim(name)) = 'm';
UPDATE size_dictionaries SET slug = 'l' WHERE slug IS NULL AND lower(trim(name)) = 'l';
UPDATE size_dictionaries SET slug = 'xl' WHERE slug IS NULL AND lower(trim(name)) = 'xl';
UPDATE size_dictionaries SET slug = 'xxl' WHERE slug IS NULL AND lower(trim(name)) = 'xxl';

UPDATE material_dictionaries SET slug = 'cotton' WHERE slug IS NULL AND lower(trim(name)) IN ('хлопок', 'cotton');
UPDATE material_dictionaries SET slug = 'polyester' WHERE slug IS NULL AND lower(trim(name)) IN ('полиэстер', 'polyester');
UPDATE material_dictionaries SET slug = 'french-terry' WHERE slug IS NULL AND lower(trim(name)) IN ('футер', 'french terry', 'french-terry');
UPDATE material_dictionaries SET slug = 'denim' WHERE slug IS NULL AND lower(trim(name)) IN ('деним', 'denim');

UPDATE color_dictionaries SET slug = 'black' WHERE slug IS NULL AND lower(trim(name)) IN ('черный', 'чёрный', 'black');
UPDATE color_dictionaries SET slug = 'white' WHERE slug IS NULL AND lower(trim(name)) IN ('белый', 'white');
UPDATE color_dictionaries SET slug = 'gray' WHERE slug IS NULL AND lower(trim(name)) IN ('серый', 'grey', 'gray');
UPDATE color_dictionaries SET slug = 'beige' WHERE slug IS NULL AND lower(trim(name)) IN ('бежевый', 'beige');

UPDATE category_dictionaries SET slug = 'outerwear' WHERE slug IS NULL AND lower(trim(name)) IN ('outerwear', 'верхняя одежда');
UPDATE category_dictionaries SET slug = 'hoodie' WHERE slug IS NULL AND lower(trim(name)) IN ('hoodie', 'толстовки (худи)');
UPDATE category_dictionaries SET slug = 'sweatshirt' WHERE slug IS NULL AND lower(trim(name)) IN ('sweatshirt', 'кофты');
UPDATE category_dictionaries SET slug = 'shirt' WHERE slug IS NULL AND lower(trim(name)) IN ('shirt', 'рубашки');
UPDATE category_dictionaries SET slug = 't-shirt' WHERE slug IS NULL AND lower(trim(name)) IN ('t-shirt', 'футболки');
UPDATE category_dictionaries SET slug = 'top' WHERE slug IS NULL AND lower(trim(name)) IN ('top', 'топы');
UPDATE category_dictionaries SET slug = 'suit' WHERE slug IS NULL AND lower(trim(name)) IN ('suit', 'костюмы');
UPDATE category_dictionaries SET slug = 'pants' WHERE slug IS NULL AND lower(trim(name)) IN ('pants', 'штаны');
UPDATE category_dictionaries SET slug = 'shorts' WHERE slug IS NULL AND lower(trim(name)) IN ('shorts', 'шорты');
UPDATE category_dictionaries SET slug = 'skirt' WHERE slug IS NULL AND lower(trim(name)) IN ('skirt', 'юбки');
UPDATE category_dictionaries SET slug = 'underwear' WHERE slug IS NULL AND lower(trim(name)) IN ('underwear', 'нижнее бельё', 'нижнее белье');
UPDATE category_dictionaries SET slug = 'shoes' WHERE slug IS NULL AND lower(trim(name)) IN ('shoes', 'обувь');
UPDATE category_dictionaries SET slug = 'bags' WHERE slug IS NULL AND lower(trim(name)) IN ('bags', 'сумки');
UPDATE category_dictionaries SET slug = 'accessories' WHERE slug IS NULL AND lower(trim(name)) IN ('accessories', 'аксессуары');
UPDATE category_dictionaries SET slug = 'mystery-box' WHERE slug IS NULL AND lower(trim(name)) IN ('mystery-box', 'мистери боксы');
");
    }

    private static void BackfillUniqueSlug(MigrationBuilder migrationBuilder, string table)
    {
        migrationBuilder.Sql($@"
WITH normalized AS (
    SELECT id,
           trim(both '-' from regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '-', 'g')) AS slug_base
    FROM {table}
), fallback AS (
    SELECT id,
           CASE
               WHEN slug_base IS NULL OR slug_base = '' THEN 'item'
               ELSE slug_base
           END AS slug_base
    FROM normalized
), numbered AS (
    SELECT id,
           slug_base,
           row_number() OVER (PARTITION BY slug_base ORDER BY id) AS row_num
    FROM fallback
)
UPDATE {table} AS target
SET slug = CASE
    WHEN numbered.row_num = 1 THEN numbered.slug_base
    ELSE numbered.slug_base || '-' || numbered.row_num
END
FROM numbered
WHERE target.id = numbered.id
  AND (target.slug IS NULL OR target.slug = '');
");
    }
}
