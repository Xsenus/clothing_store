using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

public interface IOrderInventoryService
{
    Task ReleaseOrderStockAsync(Order order, string changedByUserId, long changedAt, string reason, CancellationToken cancellationToken = default);
}

public sealed class OrderInventoryService : IOrderInventoryService
{
    private readonly StoreDbContext _db;

    private sealed record NormalizedOrderItem(string ProductId, string Size, string LookupSize, int Quantity);

    public OrderInventoryService(StoreDbContext db)
    {
        _db = db;
    }

    public async Task ReleaseOrderStockAsync(
        Order order,
        string changedByUserId,
        long changedAt,
        string reason,
        CancellationToken cancellationToken = default)
    {
        var normalizedItems = ParseOrderItems(order.ItemsJson);
        if (normalizedItems.Count == 0)
            return;

        var sizeLookups = normalizedItems.Select(x => x.LookupSize).Distinct().ToList();
        var sizeDictionaries = await _db.SizeDictionaries
            .Where(x => sizeLookups.Contains(x.Name.ToLower()))
            .ToListAsync(cancellationToken);
        var sizeMap = sizeDictionaries.ToDictionary(x => x.Name.Trim().ToLowerInvariant(), x => x, StringComparer.OrdinalIgnoreCase);
        if (sizeMap.Count == 0)
            return;

        var requestedSizeIds = sizeMap.Values.Select(x => x.Id).Distinct().ToList();
        var requestedProductIds = normalizedItems.Select(x => x.ProductId).Distinct().ToList();
        var stockRows = await _db.ProductSizeStocks
            .Where(x => requestedProductIds.Contains(x.ProductId) && requestedSizeIds.Contains(x.SizeId))
            .ToListAsync(cancellationToken);
        var stockMap = stockRows.ToDictionary(x => $"{x.ProductId}:{x.SizeId}", x => x, StringComparer.Ordinal);

        foreach (var item in normalizedItems)
        {
            if (!sizeMap.TryGetValue(item.LookupSize, out var sizeDictionary))
                continue;

            var stockKey = $"{item.ProductId}:{sizeDictionary.Id}";
            if (!stockMap.TryGetValue(stockKey, out var row))
            {
                row = new ProductSizeStock
                {
                    ProductId = item.ProductId,
                    SizeId = sizeDictionary.Id,
                    Stock = 0
                };
                _db.ProductSizeStocks.Add(row);
                stockMap[stockKey] = row;
            }

            var oldValue = row.Stock;
            row.Stock += item.Quantity;

            _db.StockChangeHistories.Add(new StockChangeHistory
            {
                ProductId = item.ProductId,
                SizeId = sizeDictionary.Id,
                ChangedByUserId = changedByUserId,
                Reason = reason,
                OrderId = order.Id,
                OldValue = oldValue,
                NewValue = row.Stock,
                ChangedAt = changedAt
            });
        }
    }

    private static List<NormalizedOrderItem> ParseOrderItems(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return [];

        try
        {
            var items = JsonSerializer.Deserialize<List<Dictionary<string, object>>>(raw) ?? [];
            return items
                .Select(item =>
                {
                    var productId = AsString(item.TryGetValue("productId", out var productValue) ? productValue : null).Trim();
                    var size = AsString(item.TryGetValue("size", out var sizeValue) ? sizeValue : null).Trim();
                    var quantity = AsInt(item.TryGetValue("quantity", out var quantityValue) ? quantityValue : null);
                    return new NormalizedOrderItem(productId, size, size.ToLowerInvariant(), quantity);
                })
                .Where(item => !string.IsNullOrWhiteSpace(item.ProductId) && !string.IsNullOrWhiteSpace(item.Size) && item.Quantity > 0)
                .GroupBy(x => $"{x.ProductId}\u001f{x.LookupSize}", StringComparer.Ordinal)
                .Select(group =>
                {
                    var first = group.First();
                    return new NormalizedOrderItem(first.ProductId, first.Size, first.LookupSize, group.Sum(x => x.Quantity));
                })
                .ToList();
        }
        catch
        {
            return [];
        }
    }

    private static string AsString(object? value)
    {
        return value switch
        {
            null => string.Empty,
            JsonElement element when element.ValueKind == JsonValueKind.String => element.GetString() ?? string.Empty,
            JsonElement element => element.ToString(),
            _ => value.ToString() ?? string.Empty
        };
    }

    private static int AsInt(object? value)
    {
        return value switch
        {
            null => 0,
            JsonElement element when element.ValueKind == JsonValueKind.Number => element.GetInt32(),
            JsonElement element when element.ValueKind == JsonValueKind.String && int.TryParse(element.GetString(), out var parsed) => parsed,
            int intValue => intValue,
            long longValue => (int)longValue,
            double doubleValue => (int)doubleValue,
            decimal decimalValue => (int)decimalValue,
            _ when int.TryParse(value.ToString(), out var parsed) => parsed,
            _ => 0
        };
    }
}
