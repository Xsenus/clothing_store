using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

public sealed class UserAccountLifecycleService
{
    private readonly StoreDbContext _db;

    public UserAccountLifecycleService(StoreDbContext db)
    {
        _db = db;
    }

    public async Task SoftDeleteUserAsync(
        User user,
        string? deletedByUserId,
        string deletedByRole,
        CancellationToken cancellationToken = default)
    {
        if (user.IsSystem)
            throw new InvalidOperationException("System user cannot be deleted.");

        if (user.IsDeleted)
            return;

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var normalizedDeletedByRole = string.IsNullOrWhiteSpace(deletedByRole)
            ? "user"
            : deletedByRole.Trim().ToLowerInvariant();
        var normalizedDeletedByUserId = string.IsNullOrWhiteSpace(deletedByUserId)
            ? user.Id
            : deletedByUserId.Trim();

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id, cancellationToken);
        var affectedProductIds = await RemoveLikesAsync(user.Id, cancellationToken);

        _db.Sessions.RemoveRange(_db.Sessions.Where(x => x.UserId == user.Id));
        _db.RefreshSessions.RemoveRange(_db.RefreshSessions.Where(x => x.UserId == user.Id));
        _db.AdminSessions.RemoveRange(_db.AdminSessions.Where(x => x.UserId == user.Id));
        _db.CartItems.RemoveRange(_db.CartItems.Where(x => x.UserId == user.Id));
        _db.UserExternalIdentities.RemoveRange(_db.UserExternalIdentities.Where(x => x.UserId == user.Id));
        _db.ContactChangeRequests.RemoveRange(_db.ContactChangeRequests.Where(x => x.UserId == user.Id));
        _db.ExternalAuthRequests.RemoveRange(_db.ExternalAuthRequests.Where(x => x.UserId == user.Id));
        _db.TelegramAuthRequests.RemoveRange(_db.TelegramAuthRequests.Where(x => x.UserId == user.Id));

        user.Email = TechnicalEmailHelper.BuildDeletedEmail(user.Id);
        user.PasswordHash = string.Empty;
        user.Salt = string.Empty;
        user.Verified = false;
        user.IsAdmin = false;
        user.IsBlocked = true;
        user.IsDeleted = true;
        user.DeletedAt = now;
        user.DeletedByUserId = normalizedDeletedByUserId;
        user.DeletedByRole = normalizedDeletedByRole;

        if (profile is not null)
        {
            profile.Email = string.Empty;
            profile.EmailVerified = false;
            profile.Name = null;
            profile.Phone = null;
            profile.PhoneVerified = false;
            profile.ShippingAddress = null;
            profile.ShippingAddressesJson = "[]";
            profile.Nickname = null;
            profile.AdminPreferencesJson = null;
        }

        await RecalculateLikesCountAsync(affectedProductIds, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<HashSet<string>> RemoveLikesAsync(string userId, CancellationToken cancellationToken)
    {
        var likes = await _db.Likes
            .Where(x => x.UserId == userId)
            .ToListAsync(cancellationToken);

        var affectedProductIds = likes
            .Select(x => x.ProductId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToHashSet(StringComparer.Ordinal);

        if (likes.Count > 0)
            _db.Likes.RemoveRange(likes);

        return affectedProductIds;
    }

    private async Task RecalculateLikesCountAsync(
        IReadOnlyCollection<string> productIds,
        CancellationToken cancellationToken)
    {
        if (productIds.Count == 0)
            return;

        var normalizedIds = productIds
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (normalizedIds.Count == 0)
            return;

        var counts = await _db.Likes
            .Where(x => normalizedIds.Contains(x.ProductId))
            .GroupBy(x => x.ProductId)
            .Select(group => new { ProductId = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);
        var countByProductId = counts.ToDictionary(x => x.ProductId, x => x.Count, StringComparer.Ordinal);

        var products = await _db.Products
            .Where(x => normalizedIds.Contains(x.Id))
            .ToListAsync(cancellationToken);

        foreach (var product in products)
        {
            product.LikesCount = countByProductId.GetValueOrDefault(product.Id);
            var json = ProductJsonService.Parse(product);
            json["likesCount"] = product.LikesCount;
            product.Data = json.ToJsonString();
        }
    }
}
