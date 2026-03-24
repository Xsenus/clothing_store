using System.Globalization;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

internal static class AdminAnalyticsSupport
{
    internal sealed class AnalyticsBucket
    {
        public AnalyticsBucket(string key)
        {
            Key = key;
        }

        public string Key { get; }

        public int Count { get; set; }

        public int Units { get; set; }

        public double RevenueAmount { get; set; }

        public double ShippingAmount { get; set; }
    }

    internal sealed class AnalyticsProductMetric
    {
        public AnalyticsProductMetric(string productId)
        {
            ProductId = productId;
        }

        public string ProductId { get; }

        public string Name { get; set; } = string.Empty;

        public string? ImageUrl { get; set; }

        public bool IsHidden { get; set; }

        public int CurrentStock { get; set; }

        public int FavoritesCount { get; set; }

        public int FavoriteAddsCount { get; set; }

        public int FavoriteRemovalsCount { get; set; }

        public int UniqueViewers { get; set; }

        public int TotalViews { get; set; }

        public int SoldUnits { get; set; }

        public double RevenueAmount { get; set; }

        public int OrdersCount { get; set; }
    }

    internal sealed class AnalyticsTimelinePoint
    {
        public int DayKey { get; init; }

        public string Date { get; init; } = string.Empty;

        public string Label { get; init; } = string.Empty;

        public int OrdersCount { get; set; }

        public int SuccessfulOrdersCount { get; set; }

        public int SoldUnits { get; set; }

        public double RevenueAmount { get; set; }

        public double ShippingRevenueAmount { get; set; }

        public int NewUsersCount { get; set; }

        public int FavoritesAddedCount { get; set; }

        public int FavoritesRemovedCount { get; set; }

        public int TotalViewEvents { get; set; }

        public int UniqueViewers { get; set; }

        public int LoginsCount { get; set; }

        public int SiteVisitorsCount { get; set; }

        public int SiteVisitEventsCount { get; set; }

        public int UniquePurchasersCount { get; set; }

        public double PurchaseConversionRate { get; set; }
    }

    internal static (string DateFrom, string DateTo, long FromTimestamp, long ToTimestamp, int PeriodDays) ResolveRange(string? dateFrom, string? dateTo)
    {
        var utcToday = DateTime.UtcNow.Date;
        var defaultDateTo = DateOnly.FromDateTime(utcToday);
        var defaultDateFrom = DateOnly.FromDateTime(utcToday.AddDays(-29));

        var resolvedDateFrom = DateOnly.TryParseExact(dateFrom?.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDateFrom)
            ? parsedDateFrom
            : defaultDateFrom;
        var resolvedDateTo = DateOnly.TryParseExact(dateTo?.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDateTo)
            ? parsedDateTo
            : defaultDateTo;

        if (resolvedDateTo < resolvedDateFrom)
        {
            (resolvedDateFrom, resolvedDateTo) = (resolvedDateTo, resolvedDateFrom);
        }

        var fromTimestamp = new DateTimeOffset(resolvedDateFrom.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
        var toTimestamp = new DateTimeOffset(resolvedDateTo.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
        var periodDays = Math.Max(1, resolvedDateTo.DayNumber - resolvedDateFrom.DayNumber + 1);

        return (
            resolvedDateFrom.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            resolvedDateTo.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            fromTimestamp,
            toTimestamp,
            periodDays);
    }

    internal static (string DateFrom, string DateTo, long FromTimestamp, long ToTimestamp, int PeriodDays) ResolvePreviousRange(long currentFromTimestamp, int periodDays)
    {
        var currentFromDate = DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeMilliseconds(currentFromTimestamp).UtcDateTime);
        var resolvedPeriodDays = Math.Max(1, periodDays);
        var previousDateTo = currentFromDate.AddDays(-1);
        var previousDateFrom = previousDateTo.AddDays(-(resolvedPeriodDays - 1));

        var fromTimestamp = new DateTimeOffset(previousDateFrom.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
        var toTimestamp = new DateTimeOffset(previousDateTo.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc)).ToUnixTimeMilliseconds();

        return (
            previousDateFrom.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            previousDateTo.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            fromTimestamp,
            toTimestamp,
            resolvedPeriodDays);
    }

    internal static bool IsSuccessfulOrderStatus(string? status)
    {
        var normalized = NormalizeOrderStatus(status);
        return normalized is "paid" or "in_transit" or "delivered" or "completed";
    }

    internal static string NormalizeOrderStatus(string? status)
    {
        var normalized = status?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "processing" : normalized;
    }

    internal static string NormalizePaymentMethod(string? paymentMethod)
    {
        var normalized = paymentMethod?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "cod" : normalized;
    }

    internal static string NormalizeShippingMethod(string? shippingMethod)
    {
        var normalized = shippingMethod?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "self_pickup" : normalized;
    }

    internal static string NormalizePurchaseChannel(string? purchaseChannel)
    {
        var normalized = purchaseChannel?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "web" : normalized;
    }

    internal static string NormalizeExternalProviderKey(string? provider)
    {
        var normalized = provider?.Trim().ToLowerInvariant() ?? string.Empty;
        return normalized switch
        {
            "telegram" => "telegram",
            "google" => "google",
            "yandex" => "yandex",
            _ => "other"
        };
    }

    internal static string NormalizeAuthProviderKey(string? provider)
    {
        var normalized = provider?.Trim().ToLowerInvariant() ?? string.Empty;
        return normalized switch
        {
            "email" or "password" => "email",
            "telegram" => "telegram",
            "google" => "google",
            "yandex" => "yandex",
            _ => "other"
        };
    }

    internal static string NormalizeFavoriteEventType(string? eventType)
    {
        var normalized = eventType?.Trim().ToLowerInvariant() ?? string.Empty;
        return normalized switch
        {
            "removed" or "remove" or "deleted" => "removed",
            _ => "added"
        };
    }

    internal static string ResolvePaymentProviderKey(OrderPayment? payment, string normalizedPaymentMethod)
    {
        var provider = payment?.Provider?.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(provider))
        {
            return provider!;
        }

        return normalizedPaymentMethod switch
        {
            var method when method.StartsWith("yoomoney", StringComparison.Ordinal) => "yoomoney",
            var method when method.StartsWith("yookassa", StringComparison.Ordinal) => "yookassa",
            "card" or "sbp" or "cash" or "cod" => "manual",
            _ => "unknown"
        };
    }

    internal static string ResolvePaymentGroupKey(string normalizedPaymentMethod)
    {
        return normalizedPaymentMethod switch
        {
            var method when method.StartsWith("yoomoney", StringComparison.Ordinal) => "yoomoney",
            var method when method.StartsWith("yookassa", StringComparison.Ordinal) => "yookassa",
            "card" or "sbp" => "transfer",
            "cash" or "cod" => "upon_receipt",
            _ => "other"
        };
    }

    internal static string ResolveRegistrationChannel(User user, IReadOnlyList<UserExternalIdentity> identities)
    {
        var technicalProvider = TryGetExternalProviderFromTechnicalEmail(user.Email);
        if (!string.IsNullOrWhiteSpace(technicalProvider))
            return technicalProvider!;

        var firstIdentity = identities
            .OrderBy(x => x.CreatedAt)
            .ThenBy(x => x.Provider)
            .FirstOrDefault();
        if (firstIdentity is null)
            return "email";

        var createdAtDelta = Math.Abs(firstIdentity.CreatedAt - user.CreatedAt);
        if (createdAtDelta <= 5 * 60 * 1000L)
            return NormalizeExternalProviderKey(firstIdentity.Provider);

        return "email";
    }

    internal static AnalyticsBucket GetOrCreateBucket(IDictionary<string, AnalyticsBucket> source, string key)
    {
        var normalizedKey = string.IsNullOrWhiteSpace(key) ? "unknown" : key.Trim().ToLowerInvariant();
        if (source.TryGetValue(normalizedKey, out var bucket))
            return bucket;

        bucket = new AnalyticsBucket(normalizedKey);
        source[normalizedKey] = bucket;
        return bucket;
    }

    internal static void AccumulateBucket(AnalyticsBucket bucket, int units, double revenueAmount, double shippingAmount)
    {
        bucket.Units += Math.Max(0, units);
        bucket.RevenueAmount = Math.Round(bucket.RevenueAmount + revenueAmount, 2, MidpointRounding.AwayFromZero);
        bucket.ShippingAmount = Math.Round(bucket.ShippingAmount + shippingAmount, 2, MidpointRounding.AwayFromZero);
    }

    internal static Dictionary<int, AnalyticsTimelinePoint> CreateTimeline(long fromTimestamp, long toTimestamp)
    {
        var fromDate = DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeMilliseconds(fromTimestamp).UtcDateTime);
        var toDate = DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeMilliseconds(toTimestamp).UtcDateTime);
        var timeline = new Dictionary<int, AnalyticsTimelinePoint>();

        for (var current = fromDate; current <= toDate; current = current.AddDays(1))
        {
            var dayKey = ToDayKey(current);
            timeline[dayKey] = new AnalyticsTimelinePoint
            {
                DayKey = dayKey,
                Date = current.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                Label = current.ToString("dd.MM", CultureInfo.InvariantCulture)
            };
        }

        return timeline;
    }

    internal static int ToDayKey(long timestamp)
    {
        var date = DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeMilliseconds(timestamp).UtcDateTime);
        return ToDayKey(date);
    }

    internal static int ToDayKey(DateOnly date)
        => date.Year * 10_000 + date.Month * 100 + date.Day;

    internal static double CalculatePurchaseConversionRate(int uniquePurchasersCount, int uniqueVisitorsCount)
    {
        if (uniqueVisitorsCount <= 0 || uniquePurchasersCount <= 0)
            return 0d;

        return Math.Round(
            uniquePurchasersCount * 100d / uniqueVisitorsCount,
            2,
            MidpointRounding.AwayFromZero);
    }

    internal static IEnumerable<object> BuildTimelinePayload(IReadOnlyDictionary<int, AnalyticsTimelinePoint> timeline)
    {
        return timeline.Values
            .OrderBy(x => x.DayKey)
            .Select(point => new
            {
                point.DayKey,
                point.Date,
                point.Label,
                point.OrdersCount,
                point.SuccessfulOrdersCount,
                point.SoldUnits,
                revenueAmount = Math.Round(point.RevenueAmount, 2, MidpointRounding.AwayFromZero),
                shippingRevenueAmount = Math.Round(point.ShippingRevenueAmount, 2, MidpointRounding.AwayFromZero),
                point.NewUsersCount,
                point.FavoritesAddedCount,
                point.FavoritesRemovedCount,
                point.TotalViewEvents,
                point.UniqueViewers,
                point.LoginsCount,
                point.SiteVisitorsCount,
                point.SiteVisitEventsCount,
                point.UniquePurchasersCount,
                purchaseConversionRate = Math.Round(point.PurchaseConversionRate, 2, MidpointRounding.AwayFromZero)
            });
    }

    internal static AnalyticsProductMetric GetOrCreateProductMetric(
        IDictionary<string, AnalyticsProductMetric> source,
        string productId,
        IReadOnlyDictionary<string, ProductOrderSnapshot> productSnapshots,
        IReadOnlyDictionary<string, Product> productsById,
        IReadOnlyDictionary<string, int> stockByProductId,
        string? fallbackName = null,
        string? fallbackImageUrl = null)
    {
        if (!source.TryGetValue(productId, out var metric))
        {
            metric = new AnalyticsProductMetric(productId);
            source[productId] = metric;
        }

        if (productsById.TryGetValue(productId, out var product))
        {
            metric.IsHidden = product.IsHidden;
            metric.CurrentStock = stockByProductId.GetValueOrDefault(productId);
        }
        else
        {
            metric.CurrentStock = stockByProductId.GetValueOrDefault(productId);
        }

        var snapshot = productSnapshots.GetValueOrDefault(productId);
        if (string.IsNullOrWhiteSpace(metric.Name))
        {
            metric.Name = !string.IsNullOrWhiteSpace(fallbackName)
                ? fallbackName!.Trim()
                : snapshot?.Name ?? productId;
        }

        if (string.IsNullOrWhiteSpace(metric.ImageUrl))
        {
            metric.ImageUrl = !string.IsNullOrWhiteSpace(fallbackImageUrl)
                ? fallbackImageUrl!.Trim()
                : snapshot?.ImageUrl;
        }

        return metric;
    }

    internal static IEnumerable<object> BuildBucketPayload(
        IReadOnlyDictionary<string, AnalyticsBucket> buckets,
        Func<string, string> labelResolver,
        string type)
    {
        return buckets.Values
            .OrderByDescending(x => x.Count)
            .ThenByDescending(x => x.RevenueAmount)
            .ThenBy(x => x.Key)
            .Select(bucket => new
            {
                type,
                key = bucket.Key,
                label = labelResolver(bucket.Key),
                count = bucket.Count,
                units = bucket.Units,
                revenueAmount = Math.Round(bucket.RevenueAmount, 2, MidpointRounding.AwayFromZero),
                shippingAmount = Math.Round(bucket.ShippingAmount, 2, MidpointRounding.AwayFromZero)
            });
    }

    internal static IEnumerable<object> BuildCountPayload(
        IReadOnlyDictionary<string, int> source,
        Func<string, string> labelResolver,
        string type)
    {
        return source
            .OrderByDescending(x => x.Value)
            .ThenBy(x => x.Key)
            .Select(item => new
            {
                type,
                key = item.Key,
                label = labelResolver(item.Key),
                count = item.Value
            });
    }

    internal static object BuildProductMetricPayload(AnalyticsProductMetric metric)
    {
        return new
        {
            productId = metric.ProductId,
            productName = metric.Name,
            imageUrl = metric.ImageUrl,
            isHidden = metric.IsHidden,
            currentStock = metric.CurrentStock,
            favoritesCount = metric.FavoritesCount,
            favoriteAddsCount = metric.FavoriteAddsCount,
            favoriteRemovalsCount = metric.FavoriteRemovalsCount,
            uniqueViewers = metric.UniqueViewers,
            totalViews = metric.TotalViews,
            soldUnits = metric.SoldUnits,
            revenueAmount = Math.Round(metric.RevenueAmount, 2, MidpointRounding.AwayFromZero),
            ordersCount = metric.OrdersCount
        };
    }

    internal static string GetOrderStatusLabel(string key) => key switch
    {
        "processing" => "В обработке",
        "pending_payment" => "Ожидает оплаты",
        "created" => "Оформлен",
        "paid" => "Оплачен",
        "in_transit" => "В пути",
        "delivered" => "Доставлен",
        "completed" => "Завершен",
        "canceled" or "cancelled" => "Отменен",
        "returned" => "Возврат",
        _ => key
    };

    internal static string GetPaymentMethodLabel(string key) => key switch
    {
        "cod" => "Оплата при получении",
        "card" => "Банковская карта",
        "sbp" => "СБП",
        "cash" => "Наличные",
        "yoomoney" => "ЮMoney",
        "yoomoney_card" => "ЮMoney: банковская карта",
        "yoomoney_wallet" => "ЮMoney: кошелек",
        "yookassa" => "YooKassa",
        "yookassa_card" => "YooKassa: банковская карта",
        "yookassa_sbp" => "YooKassa: СБП",
        "yookassa_yoomoney" => "YooKassa: ЮMoney",
        _ => key
    };

    internal static string GetPaymentGroupLabel(string key) => key switch
    {
        "transfer" => "Переводом",
        "upon_receipt" => "При получении",
        "yoomoney" => "ЮMoney",
        "yookassa" => "YooKassa",
        "manual" => "Ручной платеж",
        "other" => "Другое",
        _ => key
    };

    internal static string GetPaymentProviderLabel(string key) => key switch
    {
        "manual" => "Без платежной системы",
        "yoomoney" => "ЮMoney",
        "yookassa" => "YooKassa",
        "unknown" => "Не определено",
        _ => key
    };

    internal static string GetShippingMethodLabel(string key) => key switch
    {
        "home" => "До двери",
        "pickup" => "ПВЗ",
        "self_pickup" => "Самовывоз",
        _ => key
    };

    internal static string GetPurchaseChannelLabel(string key) => key switch
    {
        "web" => "Сайт",
        "mobile" => "Мобильное приложение",
        "admin" => "Администратор",
        _ => key
    };

    internal static string GetRegistrationChannelLabel(string key) => key switch
    {
        "email" => "Email и пароль",
        "telegram" => "Telegram",
        "google" => "Google",
        "yandex" => "Яндекс",
        _ => "Другое"
    };

    internal static string GetExternalProviderLabel(string key) => key switch
    {
        "telegram" => "Telegram",
        "google" => "Google",
        "yandex" => "Яндекс",
        _ => "Другое"
    };

    internal static string GetAuthProviderLabel(string key) => key switch
    {
        "email" => "Email Рё РїР°СЂРѕР»СЊ",
        "telegram" => "Telegram",
        "google" => "Google",
        "yandex" => "РЇРЅРґРµРєСЃ",
        _ => "Р”СЂСѓРіРѕРµ"
    };

    private static string? TryGetExternalProviderFromTechnicalEmail(string? email)
    {
        var normalized = (email ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.StartsWith("telegram_", StringComparison.Ordinal) && normalized.EndsWith("@telegram.local", StringComparison.Ordinal))
            return "telegram";
        if (normalized.StartsWith("google_", StringComparison.Ordinal) && normalized.EndsWith("@auth.local", StringComparison.Ordinal))
            return "google";
        if (normalized.StartsWith("yandex_", StringComparison.Ordinal) && normalized.EndsWith("@auth.local", StringComparison.Ordinal))
            return "yandex";

        return null;
    }
}
