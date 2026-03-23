using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

[ApiController]
[Route("products")]
public class ProductsController : ControllerBase
{
    private sealed record DictionaryOrderMaps(
        IReadOnlyDictionary<string, int> Categories,
        IReadOnlyDictionary<string, int> Sizes,
        IReadOnlyDictionary<string, int> Materials,
        IReadOnlyDictionary<string, int> Colors,
        IReadOnlyDictionary<string, int> Collections);

    private sealed record ProductPopularityStats(int Score, long? LastViewedAt);

    private const int PopularityLookbackDays = 30;

    private readonly StoreDbContext _db;
    private readonly AuthService _auth;

    public ProductsController(StoreDbContext db, AuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    private static IQueryable<Product> ApplyProductVisibility(IQueryable<Product> query, bool includeHidden)
        => includeHidden ? query : query.Where(x => !x.IsHidden);

    private async Task<Product?> FindProductByIdAsync(string productId, bool includeHidden)
        => await ApplyProductVisibility(_db.Products, includeHidden).FirstOrDefaultAsync(x => x.Id == productId);

    private async Task<Product?> FindProductBySlugAsync(string slug, bool includeHidden)
        => await ApplyProductVisibility(_db.Products, includeHidden).FirstOrDefaultAsync(x => x.Slug == slug);

    [HttpGet]
    public async Task<IResult> List()
    {
        var includeHidden = await _auth.RequireAdminAsync(Request);
        var products = await ApplyProductVisibility(_db.Products, includeHidden).ToListAsync();
        var productIds = products.Select(x => x.Id).ToList();
        var sizeDictionaries = await _db.SizeDictionaries
            .AsNoTracking()
            .Select(x => new { x.Id, x.Name, x.SortOrder })
            .ToListAsync();
        var sizeMap = sizeDictionaries.ToDictionary(x => x.Id, x => x.Name);
        var dictionaryOrderMaps = await LoadDictionaryOrderMapsAsync();
        var stock = productIds.Count == 0
            ? new List<ProductSizeStock>()
            : await _db.ProductSizeStocks.Where(x => productIds.Contains(x.ProductId)).ToListAsync();
        var stockByProduct = stock.GroupBy(x => x.ProductId).ToDictionary(
            g => g.Key,
            g => g.ToDictionary(x => sizeMap.GetValueOrDefault(x.SizeId, x.SizeId), x => x.Stock));
        var popularityByProduct = await LoadProductPopularityStatsAsync(productIds);

        return Results.Json(products.Select(product =>
        {
            var json = ProductJsonService.Parse(product);
            if (stockByProduct.TryGetValue(product.Id, out var stockPayload))
            {
                var sizes = stockPayload.Keys.Select(s => JsonValue.Create(s)).ToArray();
                json["sizes"] = new JsonArray(sizes);
                var stockObject = new JsonObject();
                foreach (var (size, value) in stockPayload)
                    stockObject[size] = value;
                json["sizeStock"] = stockObject;
            }

            ApplyDictionaryOrdering(json, dictionaryOrderMaps);
            AppendProductVisibilityFields(json, product);
            AppendProductPopularityFields(json, popularityByProduct.GetValueOrDefault(product.Id));
            return json;
        }));
    }

    [HttpGet("new")]
    public async Task<IResult> ListNew()
    {
        var includeHidden = await _auth.RequireAdminAsync(Request);
        return Results.Json(await BuildOrderedProductPayloadsAsync(ApplyProductVisibility(_db.Products.Where(p => p.IsNew), includeHidden), includeHidden));
    }

    [HttpGet("popular")]
    public async Task<IResult> ListPopular()
    {
        var includeHidden = await _auth.RequireAdminAsync(Request);
        return Results.Json(await BuildOrderedProductPayloadsAsync(
            ApplyProductVisibility(_db.Products, includeHidden),
            appendVisibilityFields: includeHidden,
            sortByPopularity: true));
    }

    [HttpGet("filters")]
    public async Task<IResult> GetCatalogFilters()
    {
        var visibleProducts = _db.Products.Where(p => !p.IsHidden);
        var usedCategoryNames = await visibleProducts
            .Where(p => p.Category != null && p.Category != string.Empty)
            .Select(p => p.Category!)
            .Distinct()
            .ToListAsync();
        var usedCategories = usedCategoryNames
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var usedSizes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var usedMaterials = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var usedColors = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var usedCollections = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var collectionUsageCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var collectionPreviewImages = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        var visibleProductData = await visibleProducts
            .Select(p => new { p.Id, p.Data })
            .ToListAsync();
        foreach (var entry in visibleProductData)
        {
            try
            {
                var json = JsonNode.Parse(entry.Data)?.AsObject();
                foreach (var category in NormalizeLookupValues(json?["categories"] as JsonArray, json?["category"]?.ToString()))
                {
                    usedCategories.Add(category);
                }

                foreach (var size in NormalizeLookupValues(json?["sizes"] as JsonArray))
                {
                    usedSizes.Add(size);
                }

                foreach (var material in NormalizeLookupValues(json?["materials"] as JsonArray, json?["material"]?.ToString()))
                {
                    usedMaterials.Add(material);
                }

                foreach (var color in NormalizeLookupValues(json?["colors"] as JsonArray, json?["color"]?.ToString()))
                {
                    usedColors.Add(color);
                }

                foreach (var collection in NormalizeLookupValues(json?["collections"] as JsonArray, json?["collection"]?.ToString()))
                {
                    usedCollections.Add(collection);
                    var collectionKey = NormalizeLookupKey(collection);
                    collectionUsageCounts[collectionKey] = collectionUsageCounts.GetValueOrDefault(collectionKey) + 1;

                    if (!collectionPreviewImages.TryGetValue(collectionKey, out var previewImages))
                    {
                        previewImages = [];
                        collectionPreviewImages[collectionKey] = previewImages;
                    }

                    foreach (var previewImageUrl in ResolveProductPreviewImageUrls(json))
                    {
                        if (previewImages.Count >= 18)
                            break;

                        if (previewImages.Any(value => string.Equals(value, previewImageUrl, StringComparison.OrdinalIgnoreCase)))
                            continue;

                        previewImages.Add(previewImageUrl);
                    }
                }
            }
            catch
            {
                // ignore invalid legacy payload and continue
            }
        }

        var visibleProductIds = visibleProductData.Select(x => x.Id).ToList();
        var sizeMap = await _db.SizeDictionaries.ToDictionaryAsync(x => x.Id, x => x.Name);
        var stockSizes = visibleProductIds.Count == 0
            ? new List<string>()
            : await _db.ProductSizeStocks
                .Where(x => visibleProductIds.Contains(x.ProductId))
            .Select(x => x.SizeId)
            .Distinct()
            .ToListAsync();
        foreach (var sizeId in stockSizes)
        {
            var sizeName = sizeMap.GetValueOrDefault(sizeId)?.Trim();
            if (!string.IsNullOrWhiteSpace(sizeName))
                usedSizes.Add(sizeName!);
        }

        var categoryDictionaryItems = await _db.CategoryDictionaries
            .Where(x => x.IsActive)
            .ToListAsync();
        var materialDictionaryItems = await _db.MaterialDictionaries
            .Where(x => x.IsActive)
            .ToListAsync();
        var colorDictionaryItems = await _db.ColorDictionaries
            .Where(x => x.IsActive)
            .ToListAsync();
        var collectionDictionaryItems = await _db.CollectionDictionaries
            .Where(x => x.IsActive)
            .ToListAsync();

        var settingKeys = new[]
        {
            "catalog_filter_categories_enabled",
            "catalog_filter_sizes_enabled",
            "catalog_filter_materials_enabled",
            "catalog_filter_colors_enabled",
            "catalog_filter_collections_enabled",
            "catalog_filter_categories_show_color",
            "catalog_filter_sizes_show_color",
            "catalog_filter_materials_show_color",
            "catalog_filter_colors_show_color",
            "catalog_filter_collections_show_color",
            "catalog_filter_categories_order",
            "catalog_filter_sizes_order",
            "catalog_filter_materials_order",
            "catalog_filter_colors_order",
            "catalog_filter_collections_order",
            "catalog_collections_slider_enabled",
            "catalog_collections_slider_title",
            "catalog_collections_slider_description"
        };
        var settingsRows = await _db.AppSettings
            .Where(x => settingKeys.Contains(x.Key))
            .ToListAsync();
        var settings = settingsRows.ToDictionary(x => x.Key, x => x.Value, StringComparer.OrdinalIgnoreCase);
        var showCategoryColors = ParseBooleanSetting(settings, "catalog_filter_categories_show_color", true);
        var showSizeColors = ParseBooleanSetting(settings, "catalog_filter_sizes_show_color", true);
        var showMaterialColors = ParseBooleanSetting(settings, "catalog_filter_materials_show_color", true);
        var showCatalogColors = ParseBooleanSetting(settings, "catalog_filter_colors_show_color", true);
        var showCollectionColors = ParseBooleanSetting(settings, "catalog_filter_collections_show_color", true);

        var categories = categoryDictionaryItems
            .Where(x => usedCategories.Contains(x.Name))
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .Select(x => new
            {
                value = x.Name,
                label = ResolveCategoryLabel(x.Name, x.Description),
                color = showCategoryColors && x.ShowColorInCatalog ? x.Color : null,
                showColorInCatalog = showCategoryColors && x.ShowColorInCatalog
            })
            .ToList();

        var sizeDictionaryItems = await _db.SizeDictionaries
            .Where(x => x.IsActive)
            .ToListAsync();
        var sizes = sizeDictionaryItems
            .Where(x => usedSizes.Contains(x.Name))
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .Select(x => new
            {
                value = x.Name,
                label = x.Name,
                color = showSizeColors && x.ShowColorInCatalog ? x.Color : null,
                showColorInCatalog = showSizeColors && x.ShowColorInCatalog
            })
            .ToList();

        var materials = materialDictionaryItems
            .Where(x => usedMaterials.Contains(x.Name))
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .Select(x => new
            {
                value = x.Name,
                label = x.Name,
                color = showMaterialColors && x.ShowColorInCatalog ? x.Color : null,
                showColorInCatalog = showMaterialColors && x.ShowColorInCatalog
            })
            .ToList();

        var colors = colorDictionaryItems
            .Where(x => usedColors.Contains(x.Name))
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .Select(x => new
            {
                value = x.Name,
                label = x.Name,
                color = showCatalogColors && x.ShowColorInCatalog ? x.Color : null,
                showColorInCatalog = showCatalogColors && x.ShowColorInCatalog
            })
            .ToList();

        var collections = collectionDictionaryItems
            .Where(x => usedCollections.Contains(x.Name))
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .Select(x => new
            {
                value = x.Name,
                label = x.Name,
                slug = x.Slug,
                imageUrl = x.ImageUrl,
                previewMode = NormalizeCollectionPreviewMode(x.PreviewMode),
                previewImages = collectionPreviewImages.GetValueOrDefault(NormalizeLookupKey(x.Name), new List<string>()).Take(18).ToList(),
                description = x.Description,
                color = showCollectionColors && x.ShowColorInCatalog ? x.Color : null,
                showColorInCatalog = showCollectionColors && x.ShowColorInCatalog
            })
            .ToList();

        var collectionSliderItems = collectionDictionaryItems
            .Where(x => usedCollections.Contains(x.Name))
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .Select(x => new
            {
                value = x.Name,
                label = x.Name,
                slug = x.Slug,
                imageUrl = x.ImageUrl,
                previewMode = NormalizeCollectionPreviewMode(x.PreviewMode),
                previewImages = collectionPreviewImages.GetValueOrDefault(NormalizeLookupKey(x.Name), new List<string>()).Take(18).ToList(),
                description = x.Description,
                color = x.Color,
                productCount = collectionUsageCounts.GetValueOrDefault(NormalizeLookupKey(x.Name), 0)
            })
            .Where(x => x.productCount > 0)
            .ToList();

        return Results.Ok(new
        {
            categories,
            sizes,
            materials,
            colors,
            collections,
            collectionSlider = new
            {
                enabled = ParseBooleanSetting(settings, "catalog_collections_slider_enabled", true),
                title = GetTextSetting(settings, "catalog_collections_slider_title", "Коллекции"),
                description = GetTextSetting(settings, "catalog_collections_slider_description", string.Empty),
                items = collectionSliderItems
            },
            visibility = new
            {
                categories = ParseBooleanSetting(settings, "catalog_filter_categories_enabled", true),
                sizes = ParseBooleanSetting(settings, "catalog_filter_sizes_enabled", true),
                materials = ParseBooleanSetting(settings, "catalog_filter_materials_enabled", true),
                colors = ParseBooleanSetting(settings, "catalog_filter_colors_enabled", true),
                collections = ParseBooleanSetting(settings, "catalog_filter_collections_enabled", true)
            },
            order = new
            {
                categories = ParseIntegerSetting(settings, "catalog_filter_categories_order", 10),
                sizes = ParseIntegerSetting(settings, "catalog_filter_sizes_order", 20),
                materials = ParseIntegerSetting(settings, "catalog_filter_materials_order", 30),
                colors = ParseIntegerSetting(settings, "catalog_filter_colors_order", 40),
                collections = ParseIntegerSetting(settings, "catalog_filter_collections_order", 50)
            }
        });
    }

    [HttpGet("category/{category}/new")]
    public async Task<IResult> CategoryNew(string category)
    {
        var includeHidden = await _auth.RequireAdminAsync(Request);
        return Results.Json(await BuildOrderedProductPayloadsAsync(
            ApplyProductVisibility(_db.Products.Where(p => p.Category == category && p.IsNew), includeHidden),
            includeHidden));
    }

    [HttpGet("category/{category}/popular")]
    public async Task<IResult> CategoryPopular(string category)
    {
        var includeHidden = await _auth.RequireAdminAsync(Request);
        return Results.Json(await BuildOrderedProductPayloadsAsync(
            ApplyProductVisibility(_db.Products.Where(p => p.Category == category), includeHidden),
            appendVisibilityFields: includeHidden,
            sortByPopularity: true));
    }

    [HttpGet("{slug}/collections")]
    public async Task<IResult> GetCollectionGroups(string slug)
    {
        var includeHidden = await _auth.RequireAdminAsync(Request);
        var product = await ApplyProductVisibility(_db.Products.AsNoTracking(), includeHidden)
            .FirstOrDefaultAsync(x => x.Slug == slug);
        if (product is null)
            return Results.NotFound(new { detail = "Product not found" });

        var dictionaryOrderMaps = await LoadDictionaryOrderMapsAsync();
        var productJson = ProductJsonService.Parse(product);
        ApplyDictionaryOrdering(productJson, dictionaryOrderMaps);

        var collectionNames = NormalizeLookupValues(
            productJson["collections"] as JsonArray,
            productJson["collection"]?.ToString());
        if (collectionNames.Count == 0)
            return Results.Ok(Array.Empty<object>());

        var collectionMetadata = await _db.CollectionDictionaries
            .AsNoTracking()
            .ToListAsync();
        var collectionMetadataByName = collectionMetadata.ToDictionary(
            x => x.Name.Trim().ToLowerInvariant(),
            x => x,
            StringComparer.OrdinalIgnoreCase);

        var relatedProducts = await BuildOrderedProductPayloadsAsync(
            ApplyProductVisibility(_db.Products.Where(x => x.Id != product.Id), includeHidden)
                .OrderByDescending(x => x.CreationTime),
            includeHidden);
        var groups = collectionNames
            .Select(collectionName =>
            {
                var normalizedCollectionName = collectionName.Trim().ToLowerInvariant();
                var collectionInfo = collectionMetadataByName.GetValueOrDefault(normalizedCollectionName);
                var products = relatedProducts
                    .Where(candidate =>
                    {
                        var candidateCollections = NormalizeLookupValues(
                            candidate["collections"] as JsonArray,
                            candidate["collection"]?.ToString());
                        return candidateCollections.Any(value =>
                            string.Equals(value, collectionName, StringComparison.OrdinalIgnoreCase));
                    })
                    .Take(8)
                    .ToList();

                return new
                {
                    name = collectionInfo?.Name ?? collectionName,
                    slug = collectionInfo?.Slug,
                    description = collectionInfo?.Description,
                    color = collectionInfo?.Color,
                    products
                };
            })
            .Where(group => group.products.Count > 0)
            .ToList();

        return Results.Ok(groups);
    }

    [HttpGet("{slug}")]
    public async Task<IResult> GetBySlug(string slug)
    {
        var includeHidden = await _auth.RequireAdminAsync(Request);
        var p = await FindProductBySlugAsync(slug, includeHidden);
        if (p is null)
            return Results.NotFound(new { detail = "Product not found" });

        var json = ProductJsonService.Parse(p);
        var sizeDictionaries = await _db.SizeDictionaries
            .AsNoTracking()
            .Select(x => new { x.Id, x.Name, x.SortOrder })
            .ToListAsync();
        var sizeMap = sizeDictionaries.ToDictionary(x => x.Id, x => x.Name);
        var dictionaryOrderMaps = await LoadDictionaryOrderMapsAsync();
        var stock = await _db.ProductSizeStocks.Where(x => x.ProductId == p.Id).ToListAsync();
        if (stock.Count > 0)
        {
            var stockObject = new JsonObject();
            var sizes = new List<JsonNode?>();
            foreach (var item in stock)
            {
                var name = sizeMap.GetValueOrDefault(item.SizeId, item.SizeId);
                sizes.Add(JsonValue.Create(name));
                stockObject[name] = item.Stock;
            }

            json["sizes"] = new JsonArray(sizes.ToArray());
            json["sizeStock"] = stockObject;
        }

        ApplyDictionaryOrdering(json, dictionaryOrderMaps);
        AppendProductVisibilityFields(json, p);
        AppendProductPopularityFields(json, (await LoadProductPopularityStatsAsync([p.Id])).GetValueOrDefault(p.Id));
        return Results.Json(json);
    }

    [HttpPost("{productId}/view")]
    public async Task<IResult> RegisterView(string productId, [FromBody] ProductViewPayload? payload)
    {
        var includeHidden = await _auth.RequireAdminAsync(Request);
        var product = await FindProductByIdAsync(productId, includeHidden);
        if (product is null)
            return Results.NotFound(new { detail = "Product not found" });

        var user = await _auth.RequireUserAsync(Request);
        var visitorId = NormalizeVisitorId(payload?.VisitorId);
        var viewerKey = user is not null
            ? $"user:{user.Id}"
            : (visitorId is { Length: > 0 } ? $"visitor:{visitorId}" : null);

        if (string.IsNullOrWhiteSpace(viewerKey))
            return Results.Ok(new { tracked = false });

        var now = DateTimeOffset.UtcNow;
        var nowUnix = now.ToUnixTimeMilliseconds();
        var dayKey = int.Parse(now.ToString("yyyyMMdd"));

        var existing = await _db.ProductViews.FirstOrDefaultAsync(x =>
            x.ProductId == productId
            && x.ViewerKey == viewerKey
            && x.DayKey == dayKey);

        if (existing is null)
        {
            _db.ProductViews.Add(new ProductView
            {
                ProductId = productId,
                UserId = user?.Id,
                VisitorId = user is null ? visitorId : null,
                ViewerKey = viewerKey,
                DayKey = dayKey,
                ViewCount = 1,
                FirstViewedAt = nowUnix,
                LastViewedAt = nowUnix
            });
        }
        else
        {
            existing.ViewCount += 1;
            existing.LastViewedAt = nowUnix;
            if (user is not null && string.IsNullOrWhiteSpace(existing.UserId))
            {
                existing.UserId = user.Id;
                existing.VisitorId = null;
            }
        }

        await _db.SaveChangesAsync();
        return Results.Ok(new { tracked = true });
    }

    private static bool ParseBooleanSetting(IDictionary<string, string> settings, string key, bool fallback)
    {
        if (!settings.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value))
            return fallback;

        return value.Trim().ToLowerInvariant() switch
        {
            "1" => true,
            "true" => true,
            "on" => true,
            "yes" => true,
            "0" => false,
            "false" => false,
            "off" => false,
            "no" => false,
            _ => fallback
        };
    }

    private static int ParseIntegerSetting(IDictionary<string, string> settings, string key, int fallback)
    {
        if (!settings.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value))
            return fallback;

        return int.TryParse(value.Trim(), out var parsedValue) && parsedValue >= 0
            ? parsedValue
            : fallback;
    }

    private static string GetTextSetting(IDictionary<string, string> settings, string key, string fallback)
    {
        if (!settings.TryGetValue(key, out var value))
            return fallback;

        return value?.Trim() ?? fallback;
    }

    private static string ResolveCategoryLabel(string value, string? description)
    {
        var customLabel = description?.Trim();
        if (!string.IsNullOrWhiteSpace(customLabel))
            return customLabel;

        return value.Trim().ToLowerInvariant() switch
        {
            "outerwear" => "Верхняя одежда",
            "hoodie" => "Толстовки (худи)",
            "sweatshirt" => "Кофты",
            "shirt" => "Рубашки",
            "t-shirt" => "Футболки",
            "top" => "Топы",
            "suit" => "Костюмы",
            "pants" => "Штаны",
            "shorts" => "Шорты",
            "skirt" => "Юбки",
            "underwear" => "Нижнее бельё",
            "shoes" => "Обувь",
            "bags" => "Сумки",
            "accessories" => "Аксессуары",
            "mystery-box" => "Мистери боксы",
            _ => value
        };
    }

    [HttpPost]
    public async Task<IResult> Create([FromBody] JsonObject payload)
    {
        var admin = await _auth.RequireAdminUserAsync(Request);
        if (admin is null) return Results.Unauthorized();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var id = payload["id"]?.ToString() ?? Guid.NewGuid().ToString("N");
        var isHidden = payload["isHidden"]?.GetValue<bool>() ?? false;
        payload["id"] = id;
        EnsureProductDefaults(payload);
        NormalizePriceFields(payload);
        ApplyDictionaryOrdering(payload, await LoadDictionaryOrderMapsAsync());
        RemoveProductVisibilityFields(payload);

        var product = new Product
        {
            Id = id,
            Slug = payload["slug"]?.ToString() ?? id,
            Category = payload["category"]?.ToString() ?? (payload["categories"] as JsonArray)?[0]?.ToString(),
            IsNew = payload["isNew"]?.GetValue<bool>() ?? false,
            IsPopular = payload["isPopular"]?.GetValue<bool>() ?? false,
            LikesCount = payload["likesCount"]?.GetValue<int>() ?? 0,
            CreationTime = payload["creationTime"]?.GetValue<long>() ?? now,
            IsHidden = isHidden,
            HiddenAt = isHidden ? now : null,
            HiddenByUserId = isHidden ? admin.Id : null,
            Data = payload.ToJsonString()
        };
        _db.Products.Add(product);
        await _db.SaveChangesAsync();
        await SyncSizeStockAsync(id, payload["sizeStock"] as JsonObject, payload["sizes"] as JsonArray, admin.Id);
        AppendProductVisibilityFields(payload, product);
        return Results.Json(payload);
    }

    [HttpPatch("{productId}")]
    public async Task<IResult> Update(string productId, [FromBody] JsonObject payload)
    {
        var admin = await _auth.RequireAdminUserAsync(Request);
        if (admin is null) return Results.Unauthorized();
        var product = await _db.Products.FirstOrDefaultAsync(x => x.Id == productId);
        if (product is null) return Results.NotFound(new { detail = "Product not found" });

        var before = ProductJsonService.Parse(product);
        var json = ProductJsonService.Merge(before.DeepClone().AsObject(), payload);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var isHidden = json["isHidden"]?.GetValue<bool>() ?? product.IsHidden;
        EnsureProductDefaults(json);
        NormalizePriceFields(json);
        ApplyDictionaryOrdering(json, await LoadDictionaryOrderMapsAsync());
        RemoveProductVisibilityFields(json);

        product.Slug = json["slug"]?.ToString() ?? product.Slug;
        product.Category = json["category"]?.ToString() ?? (json["categories"] as JsonArray)?[0]?.ToString();
        product.IsNew = json["isNew"]?.GetValue<bool>() ?? false;
        product.IsPopular = json["isPopular"]?.GetValue<bool>() ?? false;
        product.LikesCount = json["likesCount"]?.GetValue<int>() ?? product.LikesCount;
        if (isHidden)
        {
            if (!product.IsHidden)
            {
                product.HiddenAt = now;
                product.HiddenByUserId = admin.Id;
            }

            product.IsHidden = true;
        }
        else
        {
            product.IsHidden = false;
            product.HiddenAt = null;
            product.HiddenByUserId = null;
        }
        product.Data = json.ToJsonString();

        await _db.SaveChangesAsync();
        await SyncSizeStockAsync(product.Id, json["sizeStock"] as JsonObject, json["sizes"] as JsonArray, admin.Id);
        await SavePriceHistoryAsync(product.Id, before, json, admin.Id);

        AppendProductVisibilityFields(json, product);
        return Results.Json(json);
    }

    [HttpDelete("{productId}")]
    public async Task<IResult> Delete(string productId)
    {
        if (!await _auth.RequireAdminAsync(Request)) return Results.Unauthorized();
        var product = await _db.Products.FirstOrDefaultAsync(x => x.Id == productId);
        if (product is not null)
        {
            _db.Products.Remove(product);
            await _db.SaveChangesAsync();
        }

        return Results.Ok(new { ok = true });
    }

    [HttpGet("{productId}/reviews")]
    public async Task<IResult> GetReviews(string productId, [FromQuery] int page = 1, [FromQuery] int pageSize = 10)
    {
        var includeHidden = await _auth.RequireAdminAsync(Request);
        var product = await FindProductByIdAsync(productId, includeHidden);
        if (product is null) return Results.NotFound(new { detail = "Product not found" });

        var currentUser = await _auth.RequireUserAsync(Request);
        var productJson = ProductJsonService.Parse(product);
        var reviewsEnabled = IsReviewsEnabled(productJson);
        var normalizedPageSize = Math.Clamp(pageSize <= 0 ? 10 : pageSize, 1, 10);

        var visibleQuery = _db.ProductReviews
            .AsNoTracking()
            .Where(x => x.ProductId == productId && !x.IsDeleted && !x.IsHidden);

        var total = await visibleQuery.CountAsync();
        var totalPages = total == 0 ? 1 : (int)Math.Ceiling(total / (double)normalizedPageSize);
        var normalizedPage = Math.Clamp(page <= 0 ? 1 : page, 1, totalPages);

        var items = total == 0
            ? new List<ProductReview>()
            : await visibleQuery
                .OrderByDescending(x => x.CreatedAt)
                .Skip((normalizedPage - 1) * normalizedPageSize)
                .Take(normalizedPageSize)
                .ToListAsync();

        ProductReview? myReview = null;
        if (currentUser is not null)
        {
            myReview = await _db.ProductReviews
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.ProductId == productId && x.UserId == currentUser.Id);
        }

        return Results.Ok(new
        {
            reviewsEnabled,
            page = normalizedPage,
            pageSize = normalizedPageSize,
            total,
            totalPages,
            items = items.Select(x => MapReviewResponse(x, currentUser?.Id)),
            myReview = myReview is null ? null : MapReviewResponse(myReview, currentUser?.Id)
        });
    }

    [HttpGet("{productId}/reviews/admin")]
    public async Task<IResult> GetAdminReviews(string productId)
    {
        var admin = await _auth.RequireAdminUserAsync(Request);
        if (admin is null) return Results.Unauthorized();

        var product = await FindProductByIdAsync(productId, includeHidden: true);
        if (product is null) return Results.NotFound(new { detail = "Product not found" });

        var productJson = ProductJsonService.Parse(product);
        var reviews = await _db.ProductReviews
            .AsNoTracking()
            .Where(x => x.ProductId == productId)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();

        return Results.Ok(new
        {
            reviewsEnabled = IsReviewsEnabled(productJson),
            items = reviews.Select(x => MapReviewResponse(x, admin.Id))
        });
    }

    [HttpPost("{productId}/reviews")]
    public async Task<IResult> AddOrUpdateReview(string productId, [FromBody] ReviewPayload payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();

        var includeHidden = await _auth.RequireAdminAsync(Request);
        var product = await FindProductByIdAsync(productId, includeHidden);
        if (product is null) return Results.NotFound(new { detail = "Product not found" });

        var productJson = ProductJsonService.Parse(product);
        var existingReview = await _db.ProductReviews.FirstOrDefaultAsync(x => x.ProductId == productId && x.UserId == user.Id);
        var reviewsEnabled = IsReviewsEnabled(productJson);
        if (!reviewsEnabled && (existingReview is null || existingReview.IsDeleted))
            return Results.BadRequest(new { detail = "Reviews are disabled for this product" });

        if (existingReview?.IsDeleted == true && string.Equals(existingReview.DeletedByRole, "admin", StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest(new { detail = "This review was deleted by an administrator" });

        var normalizedText = NormalizeReviewText(payload.Text);
        if (string.IsNullOrWhiteSpace(normalizedText))
            return Results.BadRequest(new { detail = "Review text is required" });

        var normalizedMedia = NormalizeReviewMedia(payload.Media);
        var serializedMedia = JsonSerializer.Serialize(normalizedMedia);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var authorName = await ResolveReviewAuthorNameAsync(user);

        ProductReview review;
        if (existingReview is null)
        {
            review = new ProductReview
            {
                ProductId = productId,
                UserId = user.Id,
                AuthorName = authorName,
                Text = normalizedText,
                MediaJson = serializedMedia,
                CreatedAt = now
            };
            _db.ProductReviews.Add(review);
        }
        else
        {
            review = existingReview;
            var contentChanged =
                !string.Equals(review.Text, normalizedText, StringComparison.Ordinal)
                || !string.Equals(review.MediaJson, serializedMedia, StringComparison.Ordinal)
                || !string.Equals(review.AuthorName, authorName, StringComparison.Ordinal);

            review.AuthorName = authorName;
            review.Text = normalizedText;
            review.MediaJson = serializedMedia;

            if (review.IsDeleted)
            {
                review.IsDeleted = false;
                review.DeletedAt = null;
                review.DeletedByUserId = null;
                review.DeletedByRole = null;
                review.EditedAt = now;
            }
            else if (contentChanged)
            {
                review.EditedAt = now;
            }
        }

        await _db.SaveChangesAsync();
        return Results.Ok(MapReviewResponse(review, user.Id));
    }

    [HttpDelete("{productId}/reviews/mine")]
    public async Task<IResult> DeleteOwnReview(string productId)
    {
        var user = await _auth.RequireUserAsync(Request);
        if (user is null) return Results.Unauthorized();
        if (await FindProductByIdAsync(productId, includeHidden: false) is null)
            return Results.NotFound(new { detail = "Product not found" });

        var review = await _db.ProductReviews.FirstOrDefaultAsync(x => x.ProductId == productId && x.UserId == user.Id);
        if (review is null || review.IsDeleted)
            return Results.Ok(new { ok = true });

        review.IsDeleted = true;
        review.DeletedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        review.DeletedByUserId = user.Id;
        review.DeletedByRole = "user";
        await _db.SaveChangesAsync();

        return Results.Ok(new { ok = true });
    }

    [HttpPatch("{productId}/reviews/{reviewId}")]
    public async Task<IResult> ModerateReview(string productId, string reviewId, [FromBody] ReviewModerationPayload payload)
    {
        var admin = await _auth.RequireAdminUserAsync(Request);
        if (admin is null) return Results.Unauthorized();

        var review = await _db.ProductReviews.FirstOrDefaultAsync(x => x.ProductId == productId && x.Id == reviewId);
        if (review is null) return Results.NotFound(new { detail = "Review not found" });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var action = (payload.Action ?? string.Empty).Trim().ToLowerInvariant();
        switch (action)
        {
            case "hide":
                if (review.IsDeleted)
                    return Results.BadRequest(new { detail = "Deleted review cannot be hidden" });
                review.IsHidden = true;
                review.HiddenAt = now;
                review.HiddenByUserId = admin.Id;
                break;

            case "show":
                if (review.IsDeleted)
                    return Results.BadRequest(new { detail = "Deleted review cannot be shown" });
                review.IsHidden = false;
                review.HiddenAt = null;
                review.HiddenByUserId = null;
                break;

            case "delete":
                review.IsDeleted = true;
                review.DeletedAt = now;
                review.DeletedByUserId = admin.Id;
                review.DeletedByRole = "admin";
                break;

            case "restore":
                review.IsDeleted = false;
                review.DeletedAt = null;
                review.DeletedByUserId = null;
                review.DeletedByRole = null;
                break;

            default:
                return Results.BadRequest(new { detail = "Unsupported moderation action" });
        }

        await _db.SaveChangesAsync();
        return Results.Ok(MapReviewResponse(review, admin.Id));
    }

    private async Task<string> ResolveReviewAuthorNameAsync(User user)
    {
        var profile = await _db.Profiles
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.UserId == user.Id);

        var preferredName = profile?.Nickname?.Trim();
        if (!string.IsNullOrWhiteSpace(preferredName))
            return preferredName!;

        preferredName = profile?.Name?.Trim();
        if (!string.IsNullOrWhiteSpace(preferredName))
            return preferredName!;

        var email = user.Email?.Trim();
        if (!string.IsNullOrWhiteSpace(email))
            return email!;

        return "Покупатель";
    }

    private static object MapReviewResponse(ProductReview review, string? currentUserId)
    {
        return new
        {
            id = review.Id,
            productId = review.ProductId,
            userId = review.UserId,
            author = string.IsNullOrWhiteSpace(review.AuthorName) ? "Покупатель" : review.AuthorName,
            text = review.Text,
            media = DeserializeReviewMedia(review.MediaJson),
            createdAt = review.CreatedAt,
            editedAt = review.EditedAt,
            isHidden = review.IsHidden,
            hiddenAt = review.HiddenAt,
            isDeleted = review.IsDeleted,
            deletedAt = review.DeletedAt,
            deletedByRole = review.DeletedByRole,
            isMine = !string.IsNullOrWhiteSpace(currentUserId) && string.Equals(review.UserId, currentUserId, StringComparison.Ordinal)
        };
    }

    private static List<string> DeserializeReviewMedia(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];

        try
        {
            var items = JsonSerializer.Deserialize<List<string>>(json) ?? [];
            return items
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        catch
        {
            return [];
        }
    }

    private static List<string> NormalizeReviewMedia(IEnumerable<string>? media)
    {
        return (media ?? [])
            .Select(x => x?.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Cast<string>()
            .ToList();
    }

    private static string NormalizeReviewText(string? value) => value?.Trim() ?? string.Empty;

    private static bool IsReviewsEnabled(JsonObject productJson) => productJson["reviewsEnabled"]?.GetValue<bool>() ?? true;

    private static void EnsureProductDefaults(JsonObject payload)
    {
        if (payload["reviewsEnabled"] is null)
            payload["reviewsEnabled"] = true;
    }

    private static void NormalizePriceFields(JsonObject payload)
    {
        var basePrice = payload["basePrice"]?.GetValue<decimal?>() ?? payload["price"]?.GetValue<decimal?>() ?? 0;
        var discountPercent = payload["discountPercent"]?.GetValue<decimal?>() ?? 0;
        if (discountPercent < 0) discountPercent = 0;
        if (discountPercent > 100) discountPercent = 100;

        var discountedPriceNode = payload["discountedPrice"];
        decimal discountedPrice;
        if (discountedPriceNode is null || !decimal.TryParse(discountedPriceNode.ToString(), out discountedPrice))
        {
            discountedPrice = Math.Round(basePrice * (1 - discountPercent / 100m), 2);
        }

        if (discountPercent <= 0)
            discountedPrice = basePrice;

        payload["basePrice"] = basePrice;
        payload["discountPercent"] = discountPercent;
        payload["discountedPrice"] = discountedPrice;
        payload["price"] = discountPercent > 0 ? discountedPrice : basePrice;
    }

    private async Task SyncSizeStockAsync(string productId, JsonObject? sizeStock, JsonArray? sizes, string? changedByUserId)
    {
        var existing = await _db.ProductSizeStocks.Where(x => x.ProductId == productId).ToListAsync();
        var dictionaries = await _db.SizeDictionaries.ToDictionaryAsync(x => x.Name.ToLowerInvariant(), x => x);
        var occupiedSlugs = (await _db.SizeDictionaries
                .Select(x => x.Slug)
                .Where(x => x != null && x != string.Empty)
                .ToListAsync())
            .Select(x => x.Trim().ToLowerInvariant())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var nextSortOrder = Math.Max(0, dictionaries.Values.Select(x => x.SortOrder).DefaultIfEmpty(0).Max()) + 1;

        var requested = new Dictionary<string, int>();
        if (sizeStock is not null)
        {
            foreach (var item in sizeStock)
            {
                var key = item.Key.Trim();
                if (string.IsNullOrWhiteSpace(key))
                    continue;
                var stockValue = Math.Max(0, item.Value?.GetValue<int>() ?? 0);
                requested[key] = stockValue;
            }
        }

        if (sizes is not null)
        {
            foreach (var size in sizes)
            {
                var name = size?.ToString()?.Trim();
                if (string.IsNullOrWhiteSpace(name))
                    continue;
                if (!requested.ContainsKey(name))
                    requested[name] = 0;
            }
        }

        foreach (var (sizeName, stock) in requested)
        {
            var normalized = sizeName.ToLowerInvariant();
            if (!dictionaries.TryGetValue(normalized, out var dictionary))
            {
                dictionary = new SizeDictionary
                {
                    Name = sizeName,
                    Slug = DictionarySlugService.EnsureUnique(sizeName, occupiedSlugs),
                    ShowInCatalogFilter = true,
                    SortOrder = nextSortOrder++,
                    CreatedAt = now
                };
                _db.SizeDictionaries.Add(dictionary);
                await _db.SaveChangesAsync();
                dictionaries[normalized] = dictionary;
            }

            var row = existing.FirstOrDefault(x => x.SizeId == dictionary.Id);
            if (row is null)
            {
                _db.ProductSizeStocks.Add(new ProductSizeStock
                {
                    ProductId = productId,
                    SizeId = dictionary.Id,
                    Stock = stock
                });

                if (!string.IsNullOrWhiteSpace(changedByUserId))
                {
                    _db.StockChangeHistories.Add(new StockChangeHistory
                    {
                        ProductId = productId,
                        SizeId = dictionary.Id,
                        ChangedByUserId = changedByUserId,
                        Reason = "admin_manual",
                        OldValue = 0,
                        NewValue = stock,
                        ChangedAt = now
                    });
                }
                continue;
            }

            if (row.Stock == stock)
                continue;

            var old = row.Stock;
            row.Stock = stock;
            if (!string.IsNullOrWhiteSpace(changedByUserId))
            {
                _db.StockChangeHistories.Add(new StockChangeHistory
                {
                    ProductId = productId,
                    SizeId = dictionary.Id,
                    ChangedByUserId = changedByUserId,
                    Reason = "admin_manual",
                    OldValue = old,
                    NewValue = stock,
                    ChangedAt = now
                });
            }
        }

        var requiredSizeIds = requested.Keys
            .Select(name => dictionaries[name.ToLowerInvariant()].Id)
            .ToHashSet();
        var toDelete = existing.Where(x => !requiredSizeIds.Contains(x.SizeId)).ToList();
        if (toDelete.Count > 0)
        {
            if (!string.IsNullOrWhiteSpace(changedByUserId))
            {
                foreach (var row in toDelete)
                {
                    _db.StockChangeHistories.Add(new StockChangeHistory
                    {
                        ProductId = productId,
                        SizeId = row.SizeId,
                        ChangedByUserId = changedByUserId,
                        Reason = "admin_manual",
                        OldValue = row.Stock,
                        NewValue = 0,
                        ChangedAt = now
                    });
                }
            }

            _db.ProductSizeStocks.RemoveRange(toDelete);
        }

        await _db.SaveChangesAsync();
    }

    private async Task<DictionaryOrderMaps> LoadDictionaryOrderMapsAsync()
    {
        var categories = await _db.CategoryDictionaries
            .AsNoTracking()
            .Select(x => new { x.Name, x.SortOrder })
            .ToListAsync();
        var sizes = await _db.SizeDictionaries
            .AsNoTracking()
            .Select(x => new { x.Name, x.SortOrder })
            .ToListAsync();
        var materials = await _db.MaterialDictionaries
            .AsNoTracking()
            .Select(x => new { x.Name, x.SortOrder })
            .ToListAsync();
        var colors = await _db.ColorDictionaries
            .AsNoTracking()
            .Select(x => new { x.Name, x.SortOrder })
            .ToListAsync();
        var collections = await _db.CollectionDictionaries
            .AsNoTracking()
            .Select(x => new { x.Name, x.SortOrder })
            .ToListAsync();

        return new DictionaryOrderMaps(
            categories.ToDictionary(x => x.Name.Trim().ToLowerInvariant(), x => x.SortOrder, StringComparer.OrdinalIgnoreCase),
            sizes.ToDictionary(x => x.Name.Trim().ToLowerInvariant(), x => x.SortOrder, StringComparer.OrdinalIgnoreCase),
            materials.ToDictionary(x => x.Name.Trim().ToLowerInvariant(), x => x.SortOrder, StringComparer.OrdinalIgnoreCase),
            colors.ToDictionary(x => x.Name.Trim().ToLowerInvariant(), x => x.SortOrder, StringComparer.OrdinalIgnoreCase),
            collections.ToDictionary(x => x.Name.Trim().ToLowerInvariant(), x => x.SortOrder, StringComparer.OrdinalIgnoreCase));
    }

    private async Task<List<JsonObject>> BuildOrderedProductPayloadsAsync(
        IQueryable<Product> query,
        bool appendVisibilityFields = false,
        bool sortByPopularity = false)
    {
        var products = await query.ToListAsync();
        var dictionaryOrderMaps = await LoadDictionaryOrderMapsAsync();
        var popularityByProduct = await LoadProductPopularityStatsAsync(products.Select(product => product.Id));

        if (sortByPopularity)
        {
            products = products
                .OrderByDescending(product => popularityByProduct.GetValueOrDefault(product.Id)?.Score ?? 0)
                .ThenByDescending(product => popularityByProduct.GetValueOrDefault(product.Id)?.LastViewedAt ?? 0)
                .ThenByDescending(product => product.CreationTime)
                .ToList();
        }

        return products.Select(product =>
        {
            var json = ProductJsonService.Parse(product);
            ApplyDictionaryOrdering(json, dictionaryOrderMaps);
            if (appendVisibilityFields)
                AppendProductVisibilityFields(json, product);
            AppendProductPopularityFields(json, popularityByProduct.GetValueOrDefault(product.Id));
            return json;
        }).ToList();
    }

    private static void RemoveProductVisibilityFields(JsonObject json)
    {
        json.Remove("isHidden");
        json.Remove("hiddenAt");
        json.Remove("popularityScore");
        json.Remove("popularityUpdatedAt");
    }

    private static void AppendProductVisibilityFields(JsonObject json, Product product)
    {
        json["isHidden"] = product.IsHidden;
        json["hiddenAt"] = product.HiddenAt.HasValue ? JsonValue.Create(product.HiddenAt.Value) : null;
    }

    private static void AppendProductPopularityFields(JsonObject json, ProductPopularityStats? stats)
    {
        json["popularityScore"] = stats?.Score ?? 0;
        json["popularityUpdatedAt"] = stats?.LastViewedAt.HasValue == true
            ? JsonValue.Create(stats.LastViewedAt.Value)
            : null;
    }

    private async Task<Dictionary<string, ProductPopularityStats>> LoadProductPopularityStatsAsync(IEnumerable<string> productIds)
    {
        var ids = productIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (ids.Count == 0)
            return [];

        var since = DateTimeOffset.UtcNow.AddDays(-PopularityLookbackDays).ToUnixTimeMilliseconds();
        var views = await _db.ProductViews
            .AsNoTracking()
            .Where(x => ids.Contains(x.ProductId) && x.LastViewedAt >= since)
            .Select(x => new { x.ProductId, x.ViewerKey, x.LastViewedAt })
            .ToListAsync();

        return views
            .GroupBy(x => x.ProductId, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => new ProductPopularityStats(
                    group.Select(item => item.ViewerKey).Distinct(StringComparer.Ordinal).Count(),
                    group.Max(item => (long?)item.LastViewedAt)),
                StringComparer.Ordinal);
    }

    private static string? NormalizeVisitorId(string? visitorId)
    {
        var normalized = visitorId?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        return normalized.Length > 120
            ? normalized[..120]
            : normalized;
    }

    private static void ApplyDictionaryOrdering(JsonObject json, DictionaryOrderMaps maps)
    {
        SortProductLookupValues(json, "categories", "category", maps.Categories);
        SortProductLookupValues(json, "materials", "material", maps.Materials);
        SortProductLookupValues(json, "colors", "color", maps.Colors);
        SortProductLookupValues(json, "collections", null, maps.Collections);
        SortProductSizeValues(json, maps.Sizes);
    }

    private static void SortProductLookupValues(
        JsonObject json,
        string arrayField,
        string? singularField,
        IReadOnlyDictionary<string, int> orderMap)
    {
        var fallbackValue = string.IsNullOrWhiteSpace(singularField)
            ? null
            : json[singularField]?.ToString();
        var values = NormalizeLookupValues(json[arrayField] as JsonArray, fallbackValue);
        if (values.Count == 0)
            return;

        var orderedValues = values
            .OrderBy(value => ResolveDictionarySortOrder(orderMap, value))
            .ThenBy(value => value, StringComparer.OrdinalIgnoreCase)
            .ToList();

        json[arrayField] = new JsonArray(orderedValues.Select(value => JsonValue.Create(value)).ToArray());
        if (!string.IsNullOrWhiteSpace(singularField))
        {
            json[singularField] = orderedValues[0];
        }
    }

    private static void SortProductSizeValues(JsonObject json, IReadOnlyDictionary<string, int> orderMap)
    {
        var sizeStock = json["sizeStock"] as JsonObject;
        var values = NormalizeLookupValues(json["sizes"] as JsonArray);
        if (sizeStock is not null)
        {
            foreach (var entry in sizeStock)
            {
                var sizeName = entry.Key.Trim();
                if (string.IsNullOrWhiteSpace(sizeName))
                    continue;

                if (values.All(existing => !string.Equals(existing, sizeName, StringComparison.OrdinalIgnoreCase)))
                {
                    values.Add(sizeName);
                }
            }
        }

        if (values.Count == 0)
            return;

        var orderedValues = values
            .OrderBy(value => ResolveDictionarySortOrder(orderMap, value))
            .ThenBy(value => value, StringComparer.OrdinalIgnoreCase)
            .ToList();

        json["sizes"] = new JsonArray(orderedValues.Select(value => JsonValue.Create(value)).ToArray());

        if (sizeStock is null)
            return;

        var orderedStock = new JsonObject();
        foreach (var sizeName in orderedValues)
        {
            if (sizeStock.TryGetPropertyValue(sizeName, out var stockValue))
            {
                orderedStock[sizeName] = stockValue?.DeepClone();
            }
        }

        json["sizeStock"] = orderedStock;
    }

    private static List<string> NormalizeLookupValues(JsonArray? values, string? fallbackValue = null)
    {
        var result = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (values is not null)
        {
            foreach (var value in values)
            {
                var normalizedValue = value?.ToString()?.Trim();
                if (string.IsNullOrWhiteSpace(normalizedValue) || !seen.Add(normalizedValue))
                    continue;

                result.Add(normalizedValue);
            }
        }

        var normalizedFallbackValue = fallbackValue?.Trim();
        if (!string.IsNullOrWhiteSpace(normalizedFallbackValue) && seen.Add(normalizedFallbackValue))
        {
            result.Add(normalizedFallbackValue);
        }

        return result;
    }

    private static string NormalizeLookupKey(string value)
        => value.Trim().ToLowerInvariant();

    private static string NormalizeCollectionPreviewMode(string? value)
        => value?.Trim().ToLowerInvariant() == "products" ? "products" : "gallery";

    private static IReadOnlyList<string> ResolveProductPreviewImageUrls(JsonObject? json)
    {
        var result = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void AddCandidate(string? value)
        {
            var normalizedValue = value?.Trim();
            if (string.IsNullOrWhiteSpace(normalizedValue))
                return;

            if (seen.Add(normalizedValue))
                result.Add(normalizedValue);
        }

        var catalogImageUrl = json?["catalogImageUrl"]?.ToString()?.Trim();
        AddCandidate(catalogImageUrl);

        if (json?["images"] is JsonArray images)
        {
            foreach (var image in images)
            {
                AddCandidate(image?.ToString());
            }
        }

        if (json?["media"] is JsonArray media)
        {
            foreach (var mediaItem in media.OfType<JsonObject>())
            {
                var mediaType = mediaItem["type"]?.ToString()?.Trim();
                if (!string.Equals(mediaType, "image", StringComparison.OrdinalIgnoreCase))
                    continue;

                AddCandidate(mediaItem["url"]?.ToString());
            }
        }

        return result;
    }

    private static int ResolveDictionarySortOrder(IReadOnlyDictionary<string, int> orderMap, string value)
    {
        if (orderMap.TryGetValue(value.Trim().ToLowerInvariant(), out var sortOrder))
            return sortOrder;

        return int.MaxValue;
    }

    private async Task SavePriceHistoryAsync(string productId, JsonObject before, JsonObject after, string changedByUserId)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var fields = new[] { "basePrice", "discountPercent", "discountedPrice" };
        foreach (var field in fields)
        {
            var oldValue = before[field]?.GetValue<decimal?>();
            var newValue = after[field]?.GetValue<decimal?>();
            if (oldValue == newValue)
                continue;

            _db.PriceChangeHistories.Add(new PriceChangeHistory
            {
                ProductId = productId,
                ChangedByUserId = changedByUserId,
                FieldName = field,
                OldValue = oldValue,
                NewValue = newValue,
                ChangedAt = now
            });
        }

        await _db.SaveChangesAsync();
    }
}
