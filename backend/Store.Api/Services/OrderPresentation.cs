using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Store.Api.Models;

namespace Store.Api.Services;

public sealed record StoredOrderItemSnapshot(
    string ProductId,
    string Size,
    int Quantity,
    string? ProductName = null,
    string? ProductImageUrl = null,
    double? UnitPrice = null);

public sealed record ProductOrderSnapshot(
    string ProductId,
    string Name,
    string? ImageUrl,
    double UnitPrice);

public static class OrderPresentation
{
    public static string FormatOrderNumber(int orderNumber)
        => orderNumber > 0 ? orderNumber.ToString("D7", CultureInfo.InvariantCulture) : string.Empty;

    public static string FormatRubles(double amount)
        => $"{amount.ToString("N2", CultureInfo.GetCultureInfo("ru-RU"))} ₽";

    public static IReadOnlyList<StoredOrderItemSnapshot> ParseStoredOrderItems(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Array)
                return [];

            var parsedItems = new List<StoredOrderItemSnapshot>();
            foreach (var element in document.RootElement.EnumerateArray())
            {
                var productId = element.TryGetProperty("productId", out var productIdElement)
                    ? productIdElement.GetString()?.Trim()
                    : null;
                var size = element.TryGetProperty("size", out var sizeElement)
                    ? sizeElement.GetString()?.Trim()
                    : null;
                var quantity = element.TryGetProperty("quantity", out var quantityElement) && quantityElement.TryGetInt32(out var parsedQuantity)
                    ? parsedQuantity
                    : 0;
                var productName = element.TryGetProperty("productName", out var productNameElement)
                    ? productNameElement.GetString()?.Trim()
                    : null;
                var productImageUrl = element.TryGetProperty("productImageUrl", out var productImageUrlElement)
                    ? productImageUrlElement.GetString()?.Trim()
                    : null;
                var unitPrice = TryGetDouble(element, "unitPrice");

                if (string.IsNullOrWhiteSpace(productId) || quantity <= 0)
                    continue;

                parsedItems.Add(new StoredOrderItemSnapshot(
                    productId!,
                    size ?? string.Empty,
                    quantity,
                    string.IsNullOrWhiteSpace(productName) ? null : productName,
                    string.IsNullOrWhiteSpace(productImageUrl) ? null : productImageUrl,
                    unitPrice));
            }

            return parsedItems
                .GroupBy(item => $"{item.ProductId}\u001f{item.Size.Trim().ToLowerInvariant()}", StringComparer.Ordinal)
                .Select(group =>
                {
                    var first = group.First();
                    return new StoredOrderItemSnapshot(
                        first.ProductId,
                        first.Size,
                        group.Sum(item => item.Quantity),
                        first.ProductName,
                        first.ProductImageUrl,
                        first.UnitPrice);
                })
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public static ProductOrderSnapshot BuildProductSnapshot(Product product)
    {
        JsonObject? json = null;
        try
        {
            json = JsonNode.Parse(product.Data) as JsonObject;
        }
        catch (JsonException)
        {
        }

        var name = ResolveProductName(product.Slug, json);
        var imageUrl = ResolveProductPreviewImageUrl(json);
        var unitPrice = ResolveProductPrice(json);
        return new ProductOrderSnapshot(product.Id, name, imageUrl, unitPrice);
    }

    private static string ResolveProductName(string fallbackSlug, JsonObject? json)
    {
        var name = json?["name"]?.ToString()?.Trim();
        return string.IsNullOrWhiteSpace(name) ? fallbackSlug : name;
    }

    private static string? ResolveProductPreviewImageUrl(JsonObject? json)
    {
        var catalogImageUrl = json?["catalogImageUrl"]?.ToString()?.Trim();
        if (!string.IsNullOrWhiteSpace(catalogImageUrl))
            return catalogImageUrl;

        if (json?["images"] is JsonArray images)
        {
            foreach (var image in images)
            {
                var value = image?.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(value))
                    return value;
            }
        }

        if (json?["media"] is JsonArray media)
        {
            foreach (var mediaItem in media.OfType<JsonObject>())
            {
                var mediaType = mediaItem["type"]?.ToString()?.Trim();
                if (!string.Equals(mediaType, "image", StringComparison.OrdinalIgnoreCase))
                    continue;

                var url = mediaItem["url"]?.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(url))
                    return url;
            }
        }

        return null;
    }

    private static double ResolveProductPrice(JsonObject? json)
    {
        return TryGetDouble(json, "price")
            ?? TryGetDouble(json, "discountedPrice")
            ?? TryGetDouble(json, "basePrice")
            ?? 0d;
    }

    private static double? TryGetDouble(JsonObject? json, string propertyName)
        => json is null ? null : TryGetDouble(json[propertyName]);

    private static double? TryGetDouble(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
            return null;

        return TryGetDouble(property);
    }

    private static double? TryGetDouble(JsonNode? node)
        => node is null ? null : TryGetDouble(node.ToJsonString());

    private static double? TryGetDouble(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.Number when element.TryGetDouble(out var parsed) => parsed,
            JsonValueKind.String => TryGetDouble(element.GetString()),
            _ => null
        };
    }

    private static double? TryGetDouble(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        return double.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var invariantParsed)
            ? invariantParsed
            : double.TryParse(raw, NumberStyles.Any, CultureInfo.GetCultureInfo("ru-RU"), out var ruParsed)
                ? ruParsed
                : null;
    }
}
