using Microsoft.EntityFrameworkCore;
using Store.Api.Data;
using Store.Api.Models;

namespace Store.Api.Services;

public sealed record ExternalIdentityProfile(
    string Provider,
    string ProviderUserId,
    string? Email,
    bool EmailVerified,
    string? Username,
    string? DisplayName,
    string? AvatarUrl,
    string? BotId = null,
    long? ChatId = null,
    string? Phone = null,
    bool PhoneVerified = false);

public class UserIdentityService
{
    private readonly StoreDbContext _db;

    public UserIdentityService(StoreDbContext db)
    {
        _db = db;
    }

    public async Task<User> ResolveOrCreateExternalUserAsync(
        ExternalIdentityProfile profile,
        CancellationToken cancellationToken = default)
    {
        var provider = TechnicalEmailHelper.NormalizeProvider(profile.Provider);
        var providerUserId = (profile.ProviderUserId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(provider) || string.IsNullOrWhiteSpace(providerUserId))
            throw new InvalidOperationException("External auth provider is invalid.");

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var confirmedEmail = profile.EmailVerified && TechnicalEmailHelper.IsValidRealEmail(profile.Email)
            ? TechnicalEmailHelper.NormalizeRealEmail(profile.Email)
            : null;

        var identity = await _db.UserExternalIdentities
            .FirstOrDefaultAsync(
                x => x.Provider == provider && x.ProviderUserId == providerUserId,
                cancellationToken);

        User? user = null;
        if (identity is not null)
        {
            user = await _db.Users.FirstOrDefaultAsync(x => x.Id == identity.UserId, cancellationToken);
        }

        if (user is null && string.Equals(provider, "telegram", StringComparison.Ordinal))
        {
            var legacyTelegramEmail = TechnicalEmailHelper.BuildTechnicalEmail(provider, providerUserId);
            user = await _db.Users.FirstOrDefaultAsync(x => x.Email == legacyTelegramEmail, cancellationToken);
        }

        if (user is null && !string.IsNullOrWhiteSpace(confirmedEmail))
        {
            user = await _db.Users.FirstOrDefaultAsync(x => x.Email == confirmedEmail, cancellationToken);
        }

        if (user is null)
        {
            user = new User
            {
                Id = Guid.NewGuid().ToString("N"),
                Email = confirmedEmail ?? TechnicalEmailHelper.BuildTechnicalEmail(provider, providerUserId),
                PasswordHash = string.Empty,
                Salt = string.Empty,
                CreatedAt = now,
                Verified = true
            };
            _db.Users.Add(user);
        }
        else if (!user.Verified)
        {
            user.Verified = true;
        }

        var userProfile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id, cancellationToken);
        if (userProfile is null)
        {
            userProfile = new Profile
            {
                UserId = user.Id,
                Email = confirmedEmail ?? string.Empty,
                EmailVerified = !string.IsNullOrWhiteSpace(confirmedEmail)
            };
            _db.Profiles.Add(userProfile);
        }

        if (!string.IsNullOrWhiteSpace(confirmedEmail))
        {
            var currentUserEmail = TechnicalEmailHelper.NormalizeRealEmail(user.Email);
            if (TechnicalEmailHelper.IsTechnicalEmail(currentUserEmail)
                || string.Equals(currentUserEmail, confirmedEmail, StringComparison.OrdinalIgnoreCase))
            {
                user.Email = confirmedEmail;
            }

            userProfile.Email = confirmedEmail;
            userProfile.EmailVerified = true;
        }

        if (!string.IsNullOrWhiteSpace(profile.DisplayName) && string.IsNullOrWhiteSpace(userProfile.Name))
            userProfile.Name = profile.DisplayName.Trim();

        if (!string.IsNullOrWhiteSpace(profile.Username) && string.IsNullOrWhiteSpace(userProfile.Nickname))
            userProfile.Nickname = profile.Username.Trim();

        if (profile.PhoneVerified && !string.IsNullOrWhiteSpace(profile.Phone))
        {
            userProfile.Phone = profile.Phone.Trim();
            userProfile.PhoneVerified = true;
        }

        if (identity is null)
        {
            identity = new UserExternalIdentity
            {
                Id = Guid.NewGuid().ToString("N"),
                UserId = user.Id,
                Provider = provider,
                ProviderUserId = providerUserId,
                CreatedAt = now
            };
            _db.UserExternalIdentities.Add(identity);
        }

        identity.UserId = user.Id;
        identity.ProviderEmail = confirmedEmail ?? identity.ProviderEmail;
        identity.ProviderUsername = NormalizeOptional(profile.Username);
        identity.DisplayName = NormalizeOptional(profile.DisplayName);
        identity.AvatarUrl = NormalizeOptional(profile.AvatarUrl);
        identity.BotId = NormalizeOptional(profile.BotId) ?? identity.BotId;
        identity.ChatId = profile.ChatId ?? identity.ChatId;
        identity.VerifiedAt ??= now;
        identity.LastUsedAt = now;
        identity.UpdatedAt = now;

        await _db.SaveChangesAsync(cancellationToken);
        return user;
    }

    public async Task<string?> GetConfirmedEmailAsync(
        string? userId,
        string? fallbackEmail = null,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(userId))
        {
            var profile = await _db.Profiles
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.UserId == userId, cancellationToken);
            if (profile is not null
                && profile.EmailVerified
                && TechnicalEmailHelper.IsValidRealEmail(profile.Email))
            {
                return TechnicalEmailHelper.NormalizeRealEmail(profile.Email);
            }

            var user = await _db.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken);
            if (profile is null
                && user is not null
                && user.Verified
                && TechnicalEmailHelper.IsValidRealEmail(user.Email))
            {
                return TechnicalEmailHelper.NormalizeRealEmail(user.Email);
            }
        }

        return TechnicalEmailHelper.IsValidRealEmail(fallbackEmail)
            ? TechnicalEmailHelper.NormalizeRealEmail(fallbackEmail)
            : null;
    }

    public async Task<UserExternalIdentity?> GetVerifiedTelegramIdentityAsync(
        string? userId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(userId))
            return null;

        var identity = await _db.UserExternalIdentities
            .AsNoTracking()
            .Where(x =>
                x.UserId == userId
                && x.Provider == "telegram"
                && x.VerifiedAt.HasValue
                && x.ChatId.HasValue
                && !string.IsNullOrWhiteSpace(x.BotId))
            .OrderByDescending(x => x.LastUsedAt ?? x.UpdatedAt)
            .ThenByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (identity is not null)
            return identity;

        var latestTelegramAuth = await _db.TelegramAuthRequests
            .AsNoTracking()
            .Where(x =>
                x.UserId == userId
                && x.ChatId.HasValue
                && !string.IsNullOrWhiteSpace(x.TelegramUserId)
                && !string.IsNullOrWhiteSpace(x.BotId))
            .OrderByDescending(x => x.CompletedAt ?? x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (latestTelegramAuth is null)
            return null;

        return new UserExternalIdentity
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = userId!,
            Provider = "telegram",
            ProviderUserId = latestTelegramAuth.TelegramUserId!,
            BotId = latestTelegramAuth.BotId,
            ChatId = latestTelegramAuth.ChatId,
            VerifiedAt = latestTelegramAuth.CompletedAt ?? latestTelegramAuth.CreatedAt,
            LastUsedAt = latestTelegramAuth.CompletedAt ?? latestTelegramAuth.CreatedAt,
            CreatedAt = latestTelegramAuth.CreatedAt,
            UpdatedAt = latestTelegramAuth.CompletedAt ?? latestTelegramAuth.CreatedAt
        };
    }

    public async Task<UserExternalIdentity?> FindExternalIdentityAsync(
        string provider,
        string providerUserId,
        CancellationToken cancellationToken = default)
    {
        var normalizedProvider = TechnicalEmailHelper.NormalizeProvider(provider);
        var normalizedProviderUserId = (providerUserId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedProvider) || string.IsNullOrWhiteSpace(normalizedProviderUserId))
            return null;

        return await _db.UserExternalIdentities
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.Provider == normalizedProvider && x.ProviderUserId == normalizedProviderUserId,
                cancellationToken);
    }

    public async Task<UserExternalIdentity> AttachExternalIdentityAsync(
        string userId,
        ExternalIdentityProfile profile,
        CancellationToken cancellationToken = default)
    {
        var normalizedUserId = (userId ?? string.Empty).Trim();
        var provider = TechnicalEmailHelper.NormalizeProvider(profile.Provider);
        var providerUserId = (profile.ProviderUserId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedUserId))
            throw new InvalidOperationException("User is required for external account linking.");
        if (string.IsNullOrWhiteSpace(provider) || string.IsNullOrWhiteSpace(providerUserId))
            throw new InvalidOperationException("External auth provider is invalid.");

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == normalizedUserId, cancellationToken);
        if (user is null)
            throw new InvalidOperationException("User not found.");

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var confirmedEmail = profile.EmailVerified && TechnicalEmailHelper.IsValidRealEmail(profile.Email)
            ? TechnicalEmailHelper.NormalizeRealEmail(profile.Email)
            : null;

        var conflictingIdentity = await _db.UserExternalIdentities
            .FirstOrDefaultAsync(
                x => x.Provider == provider && x.ProviderUserId == providerUserId,
                cancellationToken);
        if (conflictingIdentity is not null && !string.Equals(conflictingIdentity.UserId, normalizedUserId, StringComparison.Ordinal))
            throw new InvalidOperationException("Этот внешний аккаунт уже привязан к другому пользователю.");

        var identity = await _db.UserExternalIdentities
            .FirstOrDefaultAsync(
                x => x.UserId == normalizedUserId && x.Provider == provider,
                cancellationToken);

        if (identity is null)
        {
            identity = conflictingIdentity ?? new UserExternalIdentity
            {
                Id = Guid.NewGuid().ToString("N"),
                UserId = normalizedUserId,
                Provider = provider,
                ProviderUserId = providerUserId,
                CreatedAt = now
            };

            if (conflictingIdentity is null)
                _db.UserExternalIdentities.Add(identity);
        }

        var userProfile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == normalizedUserId, cancellationToken);
        if (userProfile is null)
        {
            userProfile = new Profile
            {
                UserId = normalizedUserId,
                Email = TechnicalEmailHelper.IsTechnicalEmail(user.Email) ? string.Empty : user.Email,
                EmailVerified = user.Verified && TechnicalEmailHelper.IsValidRealEmail(user.Email)
            };
            _db.Profiles.Add(userProfile);
        }

        if (!string.IsNullOrWhiteSpace(confirmedEmail))
        {
            var currentConfirmedEmail = userProfile.EmailVerified && TechnicalEmailHelper.IsValidRealEmail(userProfile.Email)
                ? TechnicalEmailHelper.NormalizeRealEmail(userProfile.Email)
                : null;

            if (string.IsNullOrWhiteSpace(currentConfirmedEmail)
                || string.Equals(currentConfirmedEmail, confirmedEmail, StringComparison.OrdinalIgnoreCase))
            {
                userProfile.Email = confirmedEmail;
                userProfile.EmailVerified = true;

                if (TechnicalEmailHelper.IsTechnicalEmail(user.Email)
                    || !TechnicalEmailHelper.IsValidRealEmail(user.Email)
                    || string.Equals(user.Email, confirmedEmail, StringComparison.OrdinalIgnoreCase))
                {
                    user.Email = confirmedEmail;
                }

                user.Verified = true;
            }
        }

        if (!string.IsNullOrWhiteSpace(profile.DisplayName) && string.IsNullOrWhiteSpace(userProfile.Name))
            userProfile.Name = profile.DisplayName.Trim();

        if (!string.IsNullOrWhiteSpace(profile.Username) && string.IsNullOrWhiteSpace(userProfile.Nickname))
            userProfile.Nickname = profile.Username.Trim();

        if (profile.PhoneVerified && !string.IsNullOrWhiteSpace(profile.Phone))
        {
            userProfile.Phone = profile.Phone.Trim();
            userProfile.PhoneVerified = true;
        }

        identity.UserId = normalizedUserId;
        identity.Provider = provider;
        identity.ProviderUserId = providerUserId;
        identity.ProviderEmail = confirmedEmail ?? identity.ProviderEmail;
        identity.ProviderUsername = NormalizeOptional(profile.Username);
        identity.DisplayName = NormalizeOptional(profile.DisplayName);
        identity.AvatarUrl = NormalizeOptional(profile.AvatarUrl);
        identity.BotId = NormalizeOptional(profile.BotId) ?? identity.BotId;
        identity.ChatId = profile.ChatId ?? identity.ChatId;
        identity.VerifiedAt ??= now;
        identity.LastUsedAt = now;
        identity.UpdatedAt = now;

        await _db.SaveChangesAsync(cancellationToken);
        return identity;
    }

    public async Task<bool> DetachExternalIdentityAsync(
        string userId,
        string provider,
        CancellationToken cancellationToken = default)
    {
        var normalizedUserId = (userId ?? string.Empty).Trim();
        var normalizedProvider = TechnicalEmailHelper.NormalizeProvider(provider);
        if (string.IsNullOrWhiteSpace(normalizedUserId))
            throw new InvalidOperationException("User is required for external account unlinking.");
        if (string.IsNullOrWhiteSpace(normalizedProvider))
            throw new InvalidOperationException("External auth provider is invalid.");

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == normalizedUserId, cancellationToken);
        if (user is null)
            throw new InvalidOperationException("User not found.");

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == normalizedUserId, cancellationToken);
        var explicitLinkedProviders = await _db.UserExternalIdentities
            .Where(x => x.UserId == normalizedUserId)
            .Select(x => x.Provider)
            .ToListAsync(cancellationToken);

        var hasTelegramFallback = await _db.TelegramAuthRequests.AnyAsync(
            x =>
                x.UserId == normalizedUserId
                && x.ChatId.HasValue
                && !string.IsNullOrWhiteSpace(x.TelegramUserId)
                && !string.IsNullOrWhiteSpace(x.BotId),
            cancellationToken);

        var hadLinkedProvider = explicitLinkedProviders.Contains(normalizedProvider, StringComparer.Ordinal)
            || (normalizedProvider == "telegram" && hasTelegramFallback);

        if (!hadLinkedProvider)
            return false;

        var remainingProviders = explicitLinkedProviders
            .Where(x => !string.Equals(x, normalizedProvider, StringComparison.Ordinal))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (normalizedProvider != "telegram" && hasTelegramFallback)
            remainingProviders.Add("telegram");

        var hasVerifiedRealEmail =
            (profile is not null && profile.EmailVerified && TechnicalEmailHelper.IsValidRealEmail(profile.Email))
            || (user.Verified && TechnicalEmailHelper.IsValidRealEmail(user.Email));
        var hasPassword = !string.IsNullOrWhiteSpace(user.PasswordHash) && !string.IsNullOrWhiteSpace(user.Salt);
        if (!hasVerifiedRealEmail && !hasPassword && remainingProviders.Count == 0)
            throw new InvalidOperationException("Нельзя отвязать последний способ входа. Сначала подтвердите email или привяжите другой аккаунт.");

        var identitiesToRemove = await _db.UserExternalIdentities
            .Where(x => x.UserId == normalizedUserId && x.Provider == normalizedProvider)
            .ToListAsync(cancellationToken);
        if (identitiesToRemove.Count > 0)
            _db.UserExternalIdentities.RemoveRange(identitiesToRemove);

        if (normalizedProvider == "telegram")
        {
            var telegramRequests = await _db.TelegramAuthRequests
                .Where(x => x.UserId == normalizedUserId)
                .ToListAsync(cancellationToken);

            foreach (var telegramRequest in telegramRequests)
            {
                telegramRequest.UserId = null;
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static string? NormalizeOptional(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}
