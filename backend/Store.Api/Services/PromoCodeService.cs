using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

public sealed class PromoCodeService
{
    public const string PromoCodesSettingKey = "promo_codes_json";
    public const string DiscountTypePercent = "percent";
    public const string DiscountTypeFixed = "fixed";

    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);
    private readonly StoreDbContext _db;

    public PromoCodeService(StoreDbContext db)
    {
        _db = db;
    }

    public sealed class PromoCodeDefinition
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Code { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string DiscountType { get; set; } = DiscountTypePercent;
        public double DiscountValue { get; set; }
        public double? MinimumSubtotal { get; set; }
        public double? MaximumDiscountAmount { get; set; }
        public int? UsageLimit { get; set; }
        public int UsedCount { get; set; }
        public bool IsActive { get; set; } = true;
        public long? StartsAt { get; set; }
        public long? ExpiresAt { get; set; }
    }

    public sealed record PromoCodeValidationResult(
        bool IsValid,
        string? Error,
        PromoCodeDefinition? PromoCode,
        double DiscountAmount,
        double DiscountedSubtotal);

    public async Task<List<PromoCodeDefinition>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var row = await _db.AppSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Key == PromoCodesSettingKey, cancellationToken);

        return ParseDefinitions(row?.Value)
            .OrderBy(x => x.Code, StringComparer.Ordinal)
            .ToList();
    }

    public async Task ReplaceAllAsync(
        IReadOnlyCollection<PromoCodeDefinition> promoCodes,
        CancellationToken cancellationToken = default)
    {
        var row = await _db.AppSettings.FirstOrDefaultAsync(
            x => x.Key == PromoCodesSettingKey,
            cancellationToken);

        var normalized = promoCodes
            .Select(NormalizeDefinition)
            .Where(x => !string.IsNullOrWhiteSpace(x.Code))
            .OrderBy(x => x.Code, StringComparer.Ordinal)
            .ToList();

        var serialized = JsonSerializer.Serialize(normalized, SerializerOptions);
        if (row is null)
        {
            _db.AppSettings.Add(new AppSetting
            {
                Key = PromoCodesSettingKey,
                Value = serialized,
            });
        }
        else
        {
            row.Value = serialized;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<PromoCodeValidationResult> ValidateAsync(
        string? rawCode,
        double subtotal,
        long? now = null,
        CancellationToken cancellationToken = default)
    {
        var promoCodes = await GetAllAsync(cancellationToken);
        return ValidateLoadedPromoCodes(promoCodes, rawCode, subtotal, now);
    }

    public async Task<PromoCodeValidationResult> ApplyAsync(
        string? rawCode,
        double subtotal,
        long? now = null,
        CancellationToken cancellationToken = default)
    {
        var row = await _db.AppSettings.FirstOrDefaultAsync(
            x => x.Key == PromoCodesSettingKey,
            cancellationToken);
        var promoCodes = ParseDefinitions(row?.Value);
        var validation = ValidateLoadedPromoCodes(promoCodes, rawCode, subtotal, now);
        if (!validation.IsValid || validation.PromoCode is null)
        {
            return validation;
        }

        var targetPromoCode = promoCodes.FirstOrDefault(x => x.Id == validation.PromoCode.Id);
        if (targetPromoCode is null)
        {
            return new PromoCodeValidationResult(
                false,
                "Промокод не найден.",
                null,
                0d,
                NormalizeMoney(subtotal));
        }

        targetPromoCode.UsedCount = Math.Max(0, targetPromoCode.UsedCount) + 1;

        var serialized = JsonSerializer.Serialize(
            promoCodes.Select(NormalizeDefinition).OrderBy(x => x.Code, StringComparer.Ordinal).ToList(),
            SerializerOptions);

        if (row is null)
        {
            _db.AppSettings.Add(new AppSetting
            {
                Key = PromoCodesSettingKey,
                Value = serialized,
            });
        }
        else
        {
            row.Value = serialized;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return validation;
    }

    public static string NormalizeCode(string? code)
    {
        return string.IsNullOrWhiteSpace(code)
            ? string.Empty
            : code.Trim().ToUpperInvariant();
    }

    public static PromoCodeDefinition NormalizeDefinition(PromoCodeDefinition source)
    {
        var normalizedDiscountType = string.Equals(
            source.DiscountType,
            DiscountTypeFixed,
            StringComparison.OrdinalIgnoreCase)
            ? DiscountTypeFixed
            : DiscountTypePercent;

        return new PromoCodeDefinition
        {
            Id = string.IsNullOrWhiteSpace(source.Id) ? Guid.NewGuid().ToString("N") : source.Id.Trim(),
            Code = NormalizeCode(source.Code),
            Description = (source.Description ?? string.Empty).Trim(),
            DiscountType = normalizedDiscountType,
            DiscountValue = NormalizeMoney(source.DiscountValue),
            MinimumSubtotal = NormalizeOptionalMoney(source.MinimumSubtotal),
            MaximumDiscountAmount = normalizedDiscountType == DiscountTypePercent
                ? NormalizeOptionalMoney(source.MaximumDiscountAmount)
                : null,
            UsageLimit = source.UsageLimit.HasValue && source.UsageLimit.Value > 0
                ? source.UsageLimit.Value
                : null,
            UsedCount = Math.Max(0, source.UsedCount),
            IsActive = source.IsActive,
            StartsAt = NormalizeTimestamp(source.StartsAt),
            ExpiresAt = NormalizeTimestamp(source.ExpiresAt),
        };
    }

    public static PromoCodeValidationResult ValidateLoadedPromoCodes(
        IEnumerable<PromoCodeDefinition> promoCodes,
        string? rawCode,
        double subtotal,
        long? now = null)
    {
        var normalizedCode = NormalizeCode(rawCode);
        var normalizedSubtotal = NormalizeMoney(Math.Max(0d, subtotal));
        if (string.IsNullOrWhiteSpace(normalizedCode))
        {
            return new PromoCodeValidationResult(
                false,
                "Введите промокод.",
                null,
                0d,
                normalizedSubtotal);
        }

        var allPromoCodes = promoCodes
            .Select(NormalizeDefinition)
            .Where(x => !string.IsNullOrWhiteSpace(x.Code))
            .ToList();
        var promoCode = allPromoCodes.FirstOrDefault(x => x.Code == normalizedCode);
        if (promoCode is null)
        {
            return new PromoCodeValidationResult(
                false,
                "Промокод не найден.",
                null,
                0d,
                normalizedSubtotal);
        }

        var currentMoment = now ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var currentDate = GetLocalCalendarDate(currentMoment);
        if (!promoCode.IsActive)
        {
            return new PromoCodeValidationResult(false, "Промокод отключен.", null, 0d, normalizedSubtotal);
        }

        var startsAtDate = GetLocalCalendarDate(promoCode.StartsAt);
        if (startsAtDate.HasValue && startsAtDate.Value > currentDate)
        {
            return new PromoCodeValidationResult(false, "Промокод еще не активен.", null, 0d, normalizedSubtotal);
        }

        var expiresAtDate = GetLocalCalendarDate(promoCode.ExpiresAt);
        if (expiresAtDate.HasValue && expiresAtDate.Value < currentDate)
        {
            return new PromoCodeValidationResult(false, "Срок действия промокода истек.", null, 0d, normalizedSubtotal);
        }

        if (promoCode.UsageLimit.HasValue && promoCode.UsedCount >= promoCode.UsageLimit.Value)
        {
            return new PromoCodeValidationResult(false, "Лимит использований промокода исчерпан.", null, 0d, normalizedSubtotal);
        }

        if (promoCode.MinimumSubtotal.HasValue && normalizedSubtotal < promoCode.MinimumSubtotal.Value)
        {
            return new PromoCodeValidationResult(
                false,
                $"Промокод доступен для заказов от {promoCode.MinimumSubtotal.Value:0.##}.",
                null,
                0d,
                normalizedSubtotal);
        }

        var discountAmount = CalculateDiscountAmount(promoCode, normalizedSubtotal);
        if (discountAmount <= 0)
        {
            return new PromoCodeValidationResult(false, "Промокод не дает скидку для этого заказа.", null, 0d, normalizedSubtotal);
        }

        return new PromoCodeValidationResult(
            true,
            null,
            promoCode,
            discountAmount,
            NormalizeMoney(normalizedSubtotal - discountAmount));
    }

    public static double CalculateDiscountAmount(PromoCodeDefinition promoCode, double subtotal)
    {
        var normalizedSubtotal = NormalizeMoney(Math.Max(0d, subtotal));
        if (normalizedSubtotal <= 0)
        {
            return 0d;
        }

        var normalizedPromoCode = NormalizeDefinition(promoCode);
        double rawDiscount = normalizedPromoCode.DiscountType == DiscountTypeFixed
            ? normalizedPromoCode.DiscountValue
            : normalizedSubtotal * (normalizedPromoCode.DiscountValue / 100d);

        if (normalizedPromoCode.MaximumDiscountAmount.HasValue)
        {
            rawDiscount = Math.Min(rawDiscount, normalizedPromoCode.MaximumDiscountAmount.Value);
        }

        return NormalizeMoney(Math.Clamp(rawDiscount, 0d, normalizedSubtotal));
    }

    private static List<PromoCodeDefinition> ParseDefinitions(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return [];
        }

        try
        {
            return (JsonSerializer.Deserialize<List<PromoCodeDefinition>>(rawValue, SerializerOptions) ?? [])
                .Select(NormalizeDefinition)
                .Where(x => !string.IsNullOrWhiteSpace(x.Code))
                .GroupBy(x => x.Id, StringComparer.Ordinal)
                .Select(group => group.First())
                .ToList();
        }
        catch
        {
            return [];
        }
    }

    private static long? NormalizeTimestamp(long? value)
    {
        var localDate = GetLocalCalendarDate(value);
        if (!localDate.HasValue)
        {
            return null;
        }

        var localMidnight = localDate.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Local);
        return new DateTimeOffset(localMidnight).ToUnixTimeMilliseconds();
    }

    private static DateOnly? GetLocalCalendarDate(long? timestamp)
    {
        if (!timestamp.HasValue || timestamp.Value <= 0)
        {
            return null;
        }

        return DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeMilliseconds(timestamp.Value).LocalDateTime);
    }

    private static double NormalizeMoney(double value)
    {
        return Math.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private static double? NormalizeOptionalMoney(double? value)
    {
        if (!value.HasValue || value.Value <= 0)
        {
            return null;
        }

        return NormalizeMoney(value.Value);
    }
}
