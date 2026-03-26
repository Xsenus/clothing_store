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
        var confirmedEmail = NormalizeConfirmedEmail(profile.Email, profile.EmailVerified);

        var identity = await _db.UserExternalIdentities
            .FirstOrDefaultAsync(
                x => x.Provider == provider && x.ProviderUserId == providerUserId,
                cancellationToken);

        User? user = null;
        if (identity is not null)
        {
            user = await _db.Users.FirstOrDefaultAsync(x => x.Id == identity.UserId, cancellationToken);
            if (user?.IsDeleted == true)
                user = null;
        }

        User? legacyUser = null;
        if (string.Equals(provider, "telegram", StringComparison.Ordinal))
        {
            var legacyTelegramEmail = TechnicalEmailHelper.BuildTechnicalEmail(provider, providerUserId);
            legacyUser = await _db.Users.FirstOrDefaultAsync(x => x.Email == legacyTelegramEmail, cancellationToken);
            if (legacyUser?.IsDeleted == true)
                legacyUser = null;
            user ??= legacyUser;
        }

        if (!string.IsNullOrWhiteSpace(confirmedEmail))
        {
            var preferredEmailUser = await FindUserByConfirmedEmailAsync(
                confirmedEmail,
                user?.Id,
                cancellationToken);

            if (preferredEmailUser is not null)
            {
                if (user is not null && !string.Equals(user.Id, preferredEmailUser.Id, StringComparison.Ordinal))
                {
                    var consolidated = await TryConsolidateUserIntoTargetAsync(
                        user.Id,
                        preferredEmailUser.Id,
                        cancellationToken);

                    if (consolidated)
                    {
                        user = preferredEmailUser;
                        identity = await _db.UserExternalIdentities
                            .FirstOrDefaultAsync(
                                x => x.Provider == provider && x.ProviderUserId == providerUserId,
                                cancellationToken);
                    }
                }

                user ??= preferredEmailUser;
            }
        }

        if (user is null)
            user = legacyUser;

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

        var userProfile = await EnsureUserProfileAsync(user, cancellationToken);

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

        ApplyExternalPhoneToProfile(userProfile, profile.Phone, profile.PhoneVerified);

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
            if (user is not null
                && !user.IsDeleted
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

    public async Task<string?> GetConfirmedPhoneAsync(
        string? userId,
        string? fallbackPhone = null,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(userId))
        {
            var profile = await _db.Profiles
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.UserId == userId, cancellationToken);
            if (profile is not null
                && profile.PhoneVerified
                && !string.IsNullOrWhiteSpace(profile.Phone))
            {
                return NormalizePhone(profile.Phone);
            }
        }

        return NormalizePhone(fallbackPhone);
    }

    public async Task<bool> HasConfirmedContactAsync(
        string? userId,
        string? fallbackEmail = null,
        string? fallbackPhone = null,
        CancellationToken cancellationToken = default)
    {
        var confirmedEmail = await GetConfirmedEmailAsync(userId, fallbackEmail, cancellationToken);
        if (!string.IsNullOrWhiteSpace(confirmedEmail))
            return true;

        var confirmedPhone = await GetConfirmedPhoneAsync(userId, fallbackPhone, cancellationToken);
        return !string.IsNullOrWhiteSpace(confirmedPhone);
    }

    public async Task<User?> FindUserByConfirmedEmailAsync(
        string? email,
        string? preferredUserId = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedEmail = NormalizeConfirmedEmail(email, emailVerified: true);
        if (string.IsNullOrWhiteSpace(normalizedEmail))
            return null;

        var candidates = await LoadEmailCandidatesAsync(normalizedEmail, cancellationToken);
        return SelectPreferredEmailCandidate(candidates, preferredUserId)?.User;
    }

    public Task<User?> FindUserForEmailAuthAsync(
        string? email,
        CancellationToken cancellationToken = default)
        => FindUserByConfirmedEmailAsync(email, preferredUserId: null, cancellationToken);

    public async Task<User?> FindUserByConfirmedPhoneAsync(
        string? phone,
        string? preferredUserId = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedPhone = NormalizePhone(phone);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
            return null;

        var candidates = await LoadPhoneCandidatesAsync(normalizedPhone, cancellationToken);
        return SelectPreferredPhoneCandidate(candidates, preferredUserId)?.User;
    }

    public async Task<bool> HasOtherUserWithConfirmedEmailAsync(
        string? email,
        string? excludedUserId = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedEmail = NormalizeConfirmedEmail(email, emailVerified: true);
        if (string.IsNullOrWhiteSpace(normalizedEmail))
            return false;

        var normalizedExcludedUserId = (excludedUserId ?? string.Empty).Trim();
        return await _db.Users.AnyAsync(
            user =>
                user.Id != normalizedExcludedUserId
                && !user.IsDeleted
                && ((user.Verified && user.Email == normalizedEmail)
                    || _db.Profiles.Any(profile =>
                        profile.UserId == user.Id
                        && profile.EmailVerified
                        && profile.Email == normalizedEmail)),
            cancellationToken);
    }

    public async Task<User> ConsolidateUsersByConfirmedEmailAsync(
        string userId,
        string? email,
        CancellationToken cancellationToken = default)
    {
        var normalizedUserId = (userId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedUserId))
            throw new InvalidOperationException("User is required for account consolidation.");

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == normalizedUserId, cancellationToken);
        if (user is null)
            throw new InvalidOperationException("Пользователь не найден.");

        var normalizedEmail = NormalizeConfirmedEmail(email, emailVerified: true);
        if (string.IsNullOrWhiteSpace(normalizedEmail))
            return user;

        var candidates = await LoadEmailCandidatesAsync(normalizedEmail, cancellationToken);
        var mergedAny = false;

        foreach (var sourceUserId in candidates
                     .Select(x => x.User.Id)
                     .Where(x => !string.Equals(x, normalizedUserId, StringComparison.Ordinal))
                     .Distinct(StringComparer.Ordinal))
        {
            mergedAny |= await TryConsolidateUserIntoTargetAsync(sourceUserId, normalizedUserId, cancellationToken);
        }

        if (mergedAny)
            await _db.SaveChangesAsync(cancellationToken);

        return user;
    }

    public async Task<User> MergeUsersAsync(
        string sourceUserId,
        string targetUserId,
        string? preferredEmail = null,
        string? preferredPhone = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedSourceUserId = (sourceUserId ?? string.Empty).Trim();
        var normalizedTargetUserId = (targetUserId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedSourceUserId) || string.IsNullOrWhiteSpace(normalizedTargetUserId))
            throw new InvalidOperationException("Для объединения нужно выбрать основной профиль и хотя бы один аккаунт-источник.");
        if (string.Equals(normalizedSourceUserId, normalizedTargetUserId, StringComparison.Ordinal))
            throw new InvalidOperationException("Нельзя объединить аккаунт сам с собой. Выберите другой источник.");

        return await MergeUsersAsync(
            new[] { normalizedSourceUserId },
            normalizedTargetUserId,
            preferredEmail,
            preferredPhone,
            cancellationToken);
    }

    public async Task<User> MergeUsersAsync(
        IEnumerable<string> sourceUserIds,
        string targetUserId,
        string? preferredEmail = null,
        string? preferredPhone = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedTargetUserId = (targetUserId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedTargetUserId))
            throw new InvalidOperationException("Для объединения нужно выбрать основной профиль.");

        var normalizedSourceUserIds = (sourceUserIds ?? Array.Empty<string>())
            .Select(userId => (userId ?? string.Empty).Trim())
            .Where(userId => !string.IsNullOrWhiteSpace(userId))
            .Distinct(StringComparer.Ordinal)
            .Where(userId => !string.Equals(userId, normalizedTargetUserId, StringComparison.Ordinal))
            .ToList();

        if (normalizedSourceUserIds.Count == 0)
            throw new InvalidOperationException("Выберите хотя бы один аккаунт-источник для объединения.");

        var allUserIds = normalizedSourceUserIds
            .Append(normalizedTargetUserId)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        var users = await _db.Users
            .Where(x => allUserIds.Contains(x.Id))
            .ToListAsync(cancellationToken);
        var usersById = users.ToDictionary(x => x.Id, StringComparer.Ordinal);

        if (!usersById.TryGetValue(normalizedTargetUserId, out var targetUser))
            throw new InvalidOperationException("Один из выбранных пользователей не найден.");

        var sourceUsers = new List<User>(normalizedSourceUserIds.Count);
        foreach (var normalizedSourceUserId in normalizedSourceUserIds)
        {
            if (!usersById.TryGetValue(normalizedSourceUserId, out var sourceUser))
                throw new InvalidOperationException("Один из выбранных пользователей не найден.");

            sourceUsers.Add(sourceUser);
        }

        if (targetUser.IsSystem || sourceUsers.Any(sourceUser => sourceUser.IsSystem))
            throw new InvalidOperationException("Системных пользователей объединять нельзя.");
        if (!await CanSafelyConsolidateUsersIntoTargetAsync(normalizedSourceUserIds, normalizedTargetUserId, cancellationToken))
        {
            throw new InvalidOperationException(
                "Нельзя объединить выбранные аккаунты: у них есть конфликтующие внешние привязки одного провайдера.");
        }

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            foreach (var sourceUser in sourceUsers)
            {
                await MergeUserIntoTargetAsync(
                    sourceUser,
                    targetUser,
                    preferredEmail,
                    preferredPhone,
                    cancellationToken);
            }

            await transaction.CommitAsync(cancellationToken);
            return targetUser;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private async Task MergeUserIntoTargetAsync(
        User sourceUser,
        User targetUser,
        string? preferredEmail,
        string? preferredPhone,
        CancellationToken cancellationToken)
    {
        var normalizedSourceUserId = sourceUser.Id;
        var normalizedTargetUserId = targetUser.Id;
        var sourceProfile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == normalizedSourceUserId, cancellationToken);
        var targetProfile = await EnsureUserProfileAsync(targetUser, cancellationToken);

        MergeUserCore(targetUser, sourceUser);
        MergeProfileCore(targetProfile, sourceProfile);
        MergeProfileAddressBook(targetProfile, sourceProfile);

        await ApplyMergedContactSelectionAsync(
            sourceUser,
            targetUser,
            sourceProfile,
            targetProfile,
            preferredEmail,
            preferredPhone,
            cancellationToken);

        await MergeCartItemsAsync(normalizedSourceUserId, normalizedTargetUserId, cancellationToken);

        var affectedProductIds = await MergeLikesAsync(normalizedSourceUserId, normalizedTargetUserId, cancellationToken);

        await MergeProductReviewsAsync(
            normalizedSourceUserId,
            normalizedTargetUserId,
            resolveConflicts: true,
            cancellationToken);

        await MergeExternalIdentitiesAsync(normalizedSourceUserId, normalizedTargetUserId, cancellationToken);
        await ReassignUserReferencesAsync(normalizedSourceUserId, normalizedTargetUserId, cancellationToken);
        await RecalculateLikesCountAsync(affectedProductIds, cancellationToken);

        await _db.SaveChangesAsync(cancellationToken);

        if (sourceProfile is not null)
            _db.Profiles.Remove(sourceProfile);
        _db.Users.Remove(sourceUser);

        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<bool> CanSafelyConsolidateUsersIntoTargetAsync(
        IEnumerable<string> sourceUserIds,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        var userIds = (sourceUserIds ?? Array.Empty<string>())
            .Append(targetUserId)
            .Select(userId => (userId ?? string.Empty).Trim())
            .Where(userId => !string.IsNullOrWhiteSpace(userId))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var identities = await _db.UserExternalIdentities
            .AsNoTracking()
            .Where(x => userIds.Contains(x.UserId))
            .ToListAsync(cancellationToken);

        return identities
            .GroupBy(identity => identity.Provider, StringComparer.Ordinal)
            .All(group => group
                .Select(identity => (identity.ProviderUserId ?? string.Empty).Trim())
                .Distinct(StringComparer.Ordinal)
                .Count() <= 1);
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
            throw new InvalidOperationException("Пользователь не найден.");

        if (user.IsDeleted)
            throw new InvalidOperationException("Deleted user cannot link external accounts.");

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var confirmedEmail = NormalizeConfirmedEmail(profile.Email, profile.EmailVerified);
        var currentConfirmedEmail = await GetConfirmedEmailAsync(normalizedUserId, user.Email, cancellationToken);

        var conflictingIdentity = await _db.UserExternalIdentities
            .FirstOrDefaultAsync(
                x => x.Provider == provider && x.ProviderUserId == providerUserId,
                cancellationToken);

        if (conflictingIdentity is not null
            && !string.Equals(conflictingIdentity.UserId, normalizedUserId, StringComparison.Ordinal))
        {
            var canConsolidate = await CanSafelyReassignIdentityAsync(
                normalizedUserId,
                conflictingIdentity.UserId,
                currentConfirmedEmail,
                confirmedEmail,
                cancellationToken);

            if (!canConsolidate
                || !await TryConsolidateUserIntoTargetAsync(
                    conflictingIdentity.UserId,
                    normalizedUserId,
                    cancellationToken))
            {
                throw new InvalidOperationException("Этот способ входа уже привязан к другому аккаунту.");
            }

            conflictingIdentity = await _db.UserExternalIdentities
                .FirstOrDefaultAsync(
                    x => x.Provider == provider && x.ProviderUserId == providerUserId,
                    cancellationToken);
        }

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

        var userProfile = await EnsureUserProfileAsync(user, cancellationToken);

        if (!string.IsNullOrWhiteSpace(confirmedEmail))
        {
            var currentProfileConfirmedEmail = userProfile.EmailVerified && TechnicalEmailHelper.IsValidRealEmail(userProfile.Email)
                ? TechnicalEmailHelper.NormalizeRealEmail(userProfile.Email)
                : null;

            if (string.IsNullOrWhiteSpace(currentProfileConfirmedEmail)
                || string.Equals(currentProfileConfirmedEmail, confirmedEmail, StringComparison.OrdinalIgnoreCase))
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

        ApplyExternalPhoneToProfile(userProfile, profile.Phone, profile.PhoneVerified);

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

        if (!string.IsNullOrWhiteSpace(confirmedEmail))
            await ConsolidateUsersByConfirmedEmailAsync(normalizedUserId, confirmedEmail, cancellationToken);
        else if (!string.IsNullOrWhiteSpace(currentConfirmedEmail))
            await ConsolidateUsersByConfirmedEmailAsync(normalizedUserId, currentConfirmedEmail, cancellationToken);

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
            throw new InvalidOperationException("Пользователь не найден.");

        if (user.IsDeleted)
            throw new InvalidOperationException("Deleted user cannot unlink external accounts.");

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
        var hasPassword = HasPassword(user);
        if (!hasVerifiedRealEmail && !hasPassword && remainingProviders.Count == 0)
        {
            throw new InvalidOperationException(
                "Нельзя отвязать последний способ входа. Сначала подтвердите email или привяжите другой аккаунт.");
        }

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
                telegramRequest.UserId = null;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<List<UserEmailCandidate>> LoadEmailCandidatesAsync(
        string normalizedEmail,
        CancellationToken cancellationToken)
    {
        return await (
            from user in _db.Users
            join profile in _db.Profiles on user.Id equals profile.UserId into profileGroup
            from profile in profileGroup.DefaultIfEmpty()
            let matchesUserEmail = user.Email == normalizedEmail
            let matchesProfileEmail = profile != null
                                      && profile.EmailVerified
                                      && profile.Email == normalizedEmail
            where !user.IsDeleted
                  && (matchesUserEmail || matchesProfileEmail)
            select new UserEmailCandidate(
                user,
                profile,
                matchesUserEmail,
                matchesProfileEmail))
            .ToListAsync(cancellationToken);
    }

    private async Task<List<UserPhoneCandidate>> LoadPhoneCandidatesAsync(
        string normalizedPhone,
        CancellationToken cancellationToken)
    {
        return await (
            from user in _db.Users
            join profile in _db.Profiles on user.Id equals profile.UserId into profileGroup
            from profile in profileGroup.DefaultIfEmpty()
            let matchesProfilePhone = profile != null
                                      && profile.PhoneVerified
                                      && profile.Phone == normalizedPhone
            let matchesVerifiedRequest = _db.ContactChangeRequests.Any(request =>
                request.UserId == user.Id
                && request.Kind == "phone"
                && request.VerifiedAt.HasValue
                && request.TargetValue == normalizedPhone)
            let matchesTelegramPhone = _db.TelegramAuthRequests.Any(request =>
                request.UserId == user.Id
                && request.PhoneNumber == normalizedPhone
                && (request.CompletedAt.HasValue
                    || request.ConsumedAt.HasValue
                    || request.Status == "completed"
                    || request.Status == "consumed"))
            where !user.IsDeleted
                  && (matchesProfilePhone || matchesVerifiedRequest || matchesTelegramPhone)
            select new UserPhoneCandidate(
                user,
                profile,
                matchesProfilePhone,
                matchesVerifiedRequest,
                matchesTelegramPhone))
            .ToListAsync(cancellationToken);
    }

    private static UserEmailCandidate? SelectPreferredEmailCandidate(
        IEnumerable<UserEmailCandidate> candidates,
        string? preferredUserId)
    {
        return candidates
            .OrderByDescending(candidate => GetEmailCandidateScore(candidate, preferredUserId))
            .ThenBy(candidate => candidate.User.CreatedAt)
            .FirstOrDefault();
    }

    private static UserPhoneCandidate? SelectPreferredPhoneCandidate(
        IEnumerable<UserPhoneCandidate> candidates,
        string? preferredUserId)
    {
        return candidates
            .OrderByDescending(candidate => GetPhoneCandidateScore(candidate, preferredUserId))
            .ThenBy(candidate => candidate.User.CreatedAt)
            .FirstOrDefault();
    }

    private static int GetEmailCandidateScore(UserEmailCandidate candidate, string? preferredUserId)
    {
        var score = 0;

        if (candidate.MatchesUserEmail)
            score += 64;
        if (candidate.MatchesProfileEmail)
            score += 32;
        if (!TechnicalEmailHelper.IsTechnicalEmail(candidate.User.Email)
            && TechnicalEmailHelper.IsValidRealEmail(candidate.User.Email))
        {
            score += 16;
        }
        if (HasPassword(candidate.User))
            score += 8;
        if (candidate.User.Verified)
            score += 4;
        if (candidate.Profile?.EmailVerified == true)
            score += 2;
        if (!string.IsNullOrWhiteSpace(preferredUserId)
            && string.Equals(candidate.User.Id, preferredUserId, StringComparison.Ordinal))
        {
            score += 1;
        }

        return score;
    }

    private static int GetPhoneCandidateScore(UserPhoneCandidate candidate, string? preferredUserId)
    {
        var score = 0;

        if (!candidate.User.IsBlocked)
            score += 128;
        if (candidate.MatchesProfilePhone)
            score += 64;
        if (candidate.MatchesVerifiedRequest)
            score += 32;
        if (candidate.MatchesTelegramPhone)
            score += 16;
        if (candidate.Profile?.PhoneVerified == true)
            score += 8;
        if (!TechnicalEmailHelper.IsTechnicalEmail(candidate.User.Email)
            && TechnicalEmailHelper.IsValidRealEmail(candidate.User.Email))
        {
            score += 4;
        }
        if (HasPassword(candidate.User))
            score += 2;
        if (candidate.User.Verified)
            score += 1;
        if (!string.IsNullOrWhiteSpace(preferredUserId)
            && string.Equals(candidate.User.Id, preferredUserId, StringComparison.Ordinal))
        {
            score += 1;
        }

        return score;
    }

    private async Task<bool> CanSafelyReassignIdentityAsync(
        string targetUserId,
        string sourceUserId,
        string? targetConfirmedEmail,
        string? providerConfirmedEmail,
        CancellationToken cancellationToken)
    {
        if (string.Equals(targetUserId, sourceUserId, StringComparison.Ordinal))
            return true;

        var sourceConfirmedEmail = await GetConfirmedEmailAsync(sourceUserId, cancellationToken: cancellationToken);

        if (!string.IsNullOrWhiteSpace(targetConfirmedEmail)
            && !string.IsNullOrWhiteSpace(sourceConfirmedEmail)
            && string.Equals(targetConfirmedEmail, sourceConfirmedEmail, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(providerConfirmedEmail)
            || string.IsNullOrWhiteSpace(targetConfirmedEmail)
            || !string.Equals(targetConfirmedEmail, providerConfirmedEmail, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return string.IsNullOrWhiteSpace(sourceConfirmedEmail)
               || string.Equals(sourceConfirmedEmail, providerConfirmedEmail, StringComparison.OrdinalIgnoreCase);
    }

    private async Task<bool> TryConsolidateUserIntoTargetAsync(
        string sourceUserId,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        if (string.Equals(sourceUserId, targetUserId, StringComparison.Ordinal))
            return false;

        var sourceUser = await _db.Users.FirstOrDefaultAsync(x => x.Id == sourceUserId, cancellationToken);
        var targetUser = await _db.Users.FirstOrDefaultAsync(x => x.Id == targetUserId, cancellationToken);
        if (sourceUser is null || targetUser is null)
            return false;

        if (!await CanSafelyConsolidateUserIntoTargetAsync(sourceUserId, targetUserId, cancellationToken))
            return false;

        var sourceProfile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == sourceUserId, cancellationToken);
        var targetProfile = await EnsureUserProfileAsync(targetUser, cancellationToken);

        MergeUserCore(targetUser, sourceUser);
        MergeProfileCore(targetProfile, sourceProfile);

        await MergeCartItemsAsync(sourceUserId, targetUserId, cancellationToken);

        var affectedProductIds = await MergeLikesAsync(sourceUserId, targetUserId, cancellationToken);
        await RecalculateLikesCountAsync(affectedProductIds, cancellationToken);

        await MergeProductReviewsAsync(sourceUserId, targetUserId, resolveConflicts: false, cancellationToken);
        await MergeExternalIdentitiesAsync(sourceUserId, targetUserId, cancellationToken);
        await ReassignUserReferencesAsync(sourceUserId, targetUserId, cancellationToken);

        return true;
    }

    private async Task<bool> CanSafelyConsolidateUserIntoTargetAsync(
        string sourceUserId,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        var sourceIdentities = await _db.UserExternalIdentities
            .AsNoTracking()
            .Where(x => x.UserId == sourceUserId)
            .ToListAsync(cancellationToken);
        if (sourceIdentities.Count == 0)
            return true;

        var targetIdentities = await _db.UserExternalIdentities
            .AsNoTracking()
            .Where(x => x.UserId == targetUserId)
            .ToListAsync(cancellationToken);

        foreach (var sourceIdentity in sourceIdentities)
        {
            var conflictingTargetIdentity = targetIdentities.FirstOrDefault(x => x.Provider == sourceIdentity.Provider);
            if (conflictingTargetIdentity is null)
                continue;

            if (!string.Equals(
                    conflictingTargetIdentity.ProviderUserId,
                    sourceIdentity.ProviderUserId,
                    StringComparison.Ordinal))
            {
                return false;
            }
        }

        return true;
    }

    private async Task<Profile> EnsureUserProfileAsync(User user, CancellationToken cancellationToken)
    {
        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == user.Id, cancellationToken);
        if (profile is not null)
            return profile;

        profile = new Profile
        {
            UserId = user.Id,
            Email = TechnicalEmailHelper.IsTechnicalEmail(user.Email) ? string.Empty : user.Email,
            EmailVerified = user.Verified && TechnicalEmailHelper.IsValidRealEmail(user.Email)
        };

        _db.Profiles.Add(profile);
        return profile;
    }

    private static void MergeUserCore(User targetUser, User sourceUser)
    {
        if (!HasPassword(targetUser) && HasPassword(sourceUser))
        {
            targetUser.PasswordHash = sourceUser.PasswordHash;
            targetUser.Salt = sourceUser.Salt;
        }

        if ((TechnicalEmailHelper.IsTechnicalEmail(targetUser.Email)
                || !TechnicalEmailHelper.IsValidRealEmail(targetUser.Email))
            && TechnicalEmailHelper.IsValidRealEmail(sourceUser.Email))
        {
            targetUser.Email = TechnicalEmailHelper.NormalizeRealEmail(sourceUser.Email);
        }

        targetUser.Verified |= sourceUser.Verified;
        targetUser.IsAdmin |= sourceUser.IsAdmin;
        targetUser.IsBlocked |= sourceUser.IsBlocked;
        targetUser.IsSystem |= sourceUser.IsSystem;
        targetUser.CreatedAt = Math.Min(targetUser.CreatedAt, sourceUser.CreatedAt);
    }

    private static void MergeProfileCore(Profile targetProfile, Profile? sourceProfile)
    {
        if (sourceProfile is null)
            return;

        if (!targetProfile.EmailVerified
            && sourceProfile.EmailVerified
            && TechnicalEmailHelper.IsValidRealEmail(sourceProfile.Email))
        {
            targetProfile.Email = TechnicalEmailHelper.NormalizeRealEmail(sourceProfile.Email);
            targetProfile.EmailVerified = true;
        }

        if (string.IsNullOrWhiteSpace(targetProfile.Name) && !string.IsNullOrWhiteSpace(sourceProfile.Name))
            targetProfile.Name = sourceProfile.Name.Trim();

        if ((!targetProfile.PhoneVerified || string.IsNullOrWhiteSpace(targetProfile.Phone))
            && !string.IsNullOrWhiteSpace(sourceProfile.Phone))
        {
            targetProfile.Phone = sourceProfile.Phone.Trim();
            targetProfile.PhoneVerified |= sourceProfile.PhoneVerified;
        }

        if (string.IsNullOrWhiteSpace(targetProfile.ShippingAddress)
            && !string.IsNullOrWhiteSpace(sourceProfile.ShippingAddress))
        {
            targetProfile.ShippingAddress = sourceProfile.ShippingAddress;
        }

        if ((string.IsNullOrWhiteSpace(targetProfile.ShippingAddressesJson)
                || targetProfile.ShippingAddressesJson == "[]")
            && !string.IsNullOrWhiteSpace(sourceProfile.ShippingAddressesJson))
        {
            targetProfile.ShippingAddressesJson = sourceProfile.ShippingAddressesJson;
        }

        if (string.IsNullOrWhiteSpace(targetProfile.Nickname)
            && !string.IsNullOrWhiteSpace(sourceProfile.Nickname))
        {
            targetProfile.Nickname = sourceProfile.Nickname.Trim();
            sourceProfile.Nickname = null;
        }

        if (string.IsNullOrWhiteSpace(targetProfile.AdminPreferencesJson)
            && !string.IsNullOrWhiteSpace(sourceProfile.AdminPreferencesJson))
        {
            targetProfile.AdminPreferencesJson = sourceProfile.AdminPreferencesJson;
        }
    }

    private static void MergeProfileAddressBook(Profile targetProfile, Profile? sourceProfile)
    {
        if (sourceProfile is null)
            return;

        var targetAddresses = ProfileAddressBook.Parse(targetProfile.ShippingAddressesJson, targetProfile.ShippingAddress);
        var sourceAddresses = ProfileAddressBook.Parse(sourceProfile.ShippingAddressesJson, sourceProfile.ShippingAddress);
        if (sourceAddresses.Count == 0)
            return;

        var defaultAddress = ProfileAddressBook.GetDefaultAddress(targetAddresses, targetProfile.ShippingAddress);
        if (string.IsNullOrWhiteSpace(defaultAddress))
            defaultAddress = ProfileAddressBook.GetDefaultAddress(sourceAddresses, sourceProfile.ShippingAddress);

        var merged = new List<ProfileAddressEntry>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var address in targetAddresses.Concat(sourceAddresses))
        {
            var value = NormalizeOptional(address.Value);
            if (string.IsNullOrWhiteSpace(value) || !seen.Add(value))
                continue;

            merged.Add(new ProfileAddressEntry(
                string.IsNullOrWhiteSpace(address.Id) ? Guid.NewGuid().ToString("N") : address.Id.Trim(),
                value,
                false));
        }

        if (merged.Count == 0)
            return;

        var normalizedDefaultAddress = NormalizeOptional(defaultAddress);
        var defaultIndex = !string.IsNullOrWhiteSpace(normalizedDefaultAddress)
            ? merged.FindIndex(address => string.Equals(address.Value, normalizedDefaultAddress, StringComparison.OrdinalIgnoreCase))
            : -1;
        if (defaultIndex < 0)
            defaultIndex = 0;

        var normalizedMerged = merged
            .Select((address, index) => address with { IsDefault = index == defaultIndex })
            .ToList();

        targetProfile.ShippingAddressesJson = ProfileAddressBook.Serialize(normalizedMerged);
        targetProfile.ShippingAddress = ProfileAddressBook.GetDefaultAddress(normalizedMerged);
    }

    private async Task ApplyMergedContactSelectionAsync(
        User sourceUser,
        User targetUser,
        Profile? sourceProfile,
        Profile targetProfile,
        string? preferredEmail,
        string? preferredPhone,
        CancellationToken cancellationToken)
    {
        var verifiedEmails = await LoadVerifiedEmailCandidatesAsync(
            sourceUser,
            targetUser,
            sourceProfile,
            targetProfile,
            cancellationToken);

        var normalizedPreferredEmail = NormalizeOptional(preferredEmail);
        if (!string.IsNullOrWhiteSpace(normalizedPreferredEmail))
        {
            normalizedPreferredEmail = TechnicalEmailHelper.IsValidRealEmail(normalizedPreferredEmail)
                ? TechnicalEmailHelper.NormalizeRealEmail(normalizedPreferredEmail)
                : null;
            if (string.IsNullOrWhiteSpace(normalizedPreferredEmail) || !verifiedEmails.Contains(normalizedPreferredEmail))
                throw new InvalidOperationException("The selected email is not confirmed in the merged accounts.");
        }

        var selectedEmail = !string.IsNullOrWhiteSpace(normalizedPreferredEmail)
            ? normalizedPreferredEmail
            : SelectMergedVerifiedEmail(targetUser, targetProfile, verifiedEmails);

        if (!string.IsNullOrWhiteSpace(selectedEmail))
        {
            targetUser.Email = selectedEmail;
            targetUser.Verified = true;
            targetProfile.Email = selectedEmail;
            targetProfile.EmailVerified = true;
        }

        var knownPhoneCandidates = CollectKnownPhoneCandidates(targetProfile, sourceProfile);
        var verifiedPhoneCandidates = await LoadVerifiedPhoneCandidatesAsync(
            sourceUser.Id,
            targetUser.Id,
            targetProfile,
            sourceProfile,
            cancellationToken);
        foreach (var verifiedPhone in verifiedPhoneCandidates)
            knownPhoneCandidates.Add(verifiedPhone);

        var normalizedPreferredPhone = NormalizeOptional(preferredPhone);
        if (!string.IsNullOrWhiteSpace(normalizedPreferredPhone)
            && !knownPhoneCandidates.Contains(normalizedPreferredPhone))
        {
            throw new InvalidOperationException("The selected phone is not available in the merged accounts.");
        }

        var selectedPhone = !string.IsNullOrWhiteSpace(normalizedPreferredPhone)
            ? normalizedPreferredPhone
            : SelectMergedPhone(targetProfile, knownPhoneCandidates, verifiedPhoneCandidates);

        if (string.IsNullOrWhiteSpace(selectedPhone))
            return;

        targetProfile.Phone = selectedPhone;
        targetProfile.PhoneVerified = verifiedPhoneCandidates.Contains(selectedPhone);
    }

    private async Task MergeCartItemsAsync(
        string sourceUserId,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        var sourceItems = await _db.CartItems
            .Where(x => x.UserId == sourceUserId)
            .ToListAsync(cancellationToken);
        if (sourceItems.Count == 0)
            return;

        var targetItems = await _db.CartItems
            .Where(x => x.UserId == targetUserId)
            .ToListAsync(cancellationToken);
        var targetLookup = targetItems.ToDictionary(
            item => BuildCartKey(item.ProductId, item.Size),
            item => item,
            StringComparer.Ordinal);

        foreach (var sourceItem in sourceItems)
        {
            var key = BuildCartKey(sourceItem.ProductId, sourceItem.Size);
            if (targetLookup.TryGetValue(key, out var targetItem))
            {
                targetItem.Quantity += sourceItem.Quantity;
                _db.CartItems.Remove(sourceItem);
                continue;
            }

            sourceItem.UserId = targetUserId;
            targetLookup[key] = sourceItem;
        }
    }

    private async Task<HashSet<string>> MergeLikesAsync(
        string sourceUserId,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        var sourceLikes = await _db.Likes
            .Where(x => x.UserId == sourceUserId)
            .ToListAsync(cancellationToken);
        var affectedProductIds = sourceLikes
            .Select(x => x.ProductId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToHashSet(StringComparer.Ordinal);

        if (sourceLikes.Count == 0)
            return affectedProductIds;

        var targetProductIds = await _db.Likes
            .Where(x => x.UserId == targetUserId)
            .Select(x => x.ProductId)
            .ToListAsync(cancellationToken);
        var targetLikeSet = targetProductIds.ToHashSet(StringComparer.Ordinal);

        foreach (var sourceLike in sourceLikes)
        {
            if (targetLikeSet.Contains(sourceLike.ProductId))
            {
                _db.Likes.Remove(sourceLike);
                continue;
            }

            sourceLike.UserId = targetUserId;
            targetLikeSet.Add(sourceLike.ProductId);
        }

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

    private async Task MergeProductReviewsAsync(
        string sourceUserId,
        string targetUserId,
        bool resolveConflicts,
        CancellationToken cancellationToken)
    {
        var sourceReviews = await _db.ProductReviews
            .Where(x => x.UserId == sourceUserId)
            .ToListAsync(cancellationToken);
        if (sourceReviews.Count == 0)
            return;

        var targetReviews = await _db.ProductReviews
            .Where(x => x.UserId == targetUserId)
            .ToListAsync(cancellationToken);
        var targetReviewsByProduct = targetReviews.ToDictionary(x => x.ProductId, x => x, StringComparer.Ordinal);
        var sourceReviewsToRemove = new List<ProductReview>();
        var targetReviewsToRemove = new List<ProductReview>();
        var sourceReviewsToMove = new List<ProductReview>();

        foreach (var sourceReview in sourceReviews)
        {
            if (!targetReviewsByProduct.TryGetValue(sourceReview.ProductId, out var targetReview))
            {
                sourceReviewsToMove.Add(sourceReview);
                targetReviewsByProduct[sourceReview.ProductId] = sourceReview;
                continue;
            }

            if (!resolveConflicts || ShouldKeepTargetReview(targetReview, sourceReview))
            {
                sourceReviewsToRemove.Add(sourceReview);
                continue;
            }

            targetReviewsToRemove.Add(targetReview);
            targetReviewsByProduct[sourceReview.ProductId] = sourceReview;
            sourceReviewsToMove.Add(sourceReview);
        }

        if (sourceReviewsToRemove.Count > 0)
            _db.ProductReviews.RemoveRange(sourceReviewsToRemove);

        if (targetReviewsToRemove.Count > 0)
        {
            _db.ProductReviews.RemoveRange(targetReviewsToRemove);
            await _db.SaveChangesAsync(cancellationToken);
        }

        foreach (var sourceReview in sourceReviewsToMove)
            sourceReview.UserId = targetUserId;
    }

    private async Task MergeExternalIdentitiesAsync(
        string sourceUserId,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        var sourceIdentities = await _db.UserExternalIdentities
            .Where(x => x.UserId == sourceUserId)
            .ToListAsync(cancellationToken);
        if (sourceIdentities.Count == 0)
            return;

        var targetIdentities = await _db.UserExternalIdentities
            .Where(x => x.UserId == targetUserId)
            .ToListAsync(cancellationToken);
        var targetByProvider = targetIdentities.ToDictionary(x => x.Provider, x => x, StringComparer.Ordinal);

        foreach (var sourceIdentity in sourceIdentities)
        {
            if (!targetByProvider.TryGetValue(sourceIdentity.Provider, out var targetIdentity))
            {
                sourceIdentity.UserId = targetUserId;
                targetByProvider[sourceIdentity.Provider] = sourceIdentity;
                continue;
            }

            if (!string.Equals(targetIdentity.ProviderUserId, sourceIdentity.ProviderUserId, StringComparison.Ordinal))
                continue;

            targetIdentity.ProviderEmail = NormalizeOptional(sourceIdentity.ProviderEmail) ?? targetIdentity.ProviderEmail;
            targetIdentity.ProviderUsername = NormalizeOptional(sourceIdentity.ProviderUsername) ?? targetIdentity.ProviderUsername;
            targetIdentity.DisplayName = NormalizeOptional(sourceIdentity.DisplayName) ?? targetIdentity.DisplayName;
            targetIdentity.AvatarUrl = NormalizeOptional(sourceIdentity.AvatarUrl) ?? targetIdentity.AvatarUrl;
            targetIdentity.BotId = NormalizeOptional(sourceIdentity.BotId) ?? targetIdentity.BotId;
            targetIdentity.ChatId ??= sourceIdentity.ChatId;
            targetIdentity.VerifiedAt = MinNullable(targetIdentity.VerifiedAt, sourceIdentity.VerifiedAt);
            targetIdentity.LastUsedAt = MaxNullable(targetIdentity.LastUsedAt, sourceIdentity.LastUsedAt);
            targetIdentity.CreatedAt = Math.Min(targetIdentity.CreatedAt, sourceIdentity.CreatedAt);
            targetIdentity.UpdatedAt = Math.Max(targetIdentity.UpdatedAt, sourceIdentity.UpdatedAt);

            _db.UserExternalIdentities.Remove(sourceIdentity);
        }
    }

    private async Task ReassignUserReferencesAsync(
        string sourceUserId,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        await ReassignSessionsAsync(_db.Sessions.Where(x => x.UserId == sourceUserId), targetUserId, cancellationToken);
        await ReassignRefreshSessionsAsync(_db.RefreshSessions.Where(x => x.UserId == sourceUserId), targetUserId, cancellationToken);
        await ReassignAdminSessionsAsync(_db.AdminSessions.Where(x => x.UserId == sourceUserId), targetUserId, cancellationToken);
        await ReassignTelegramAuthRequestsAsync(_db.TelegramAuthRequests.Where(x => x.UserId == sourceUserId), targetUserId, cancellationToken);
        await ReassignContactChangeRequestsAsync(_db.ContactChangeRequests.Where(x => x.UserId == sourceUserId), targetUserId, cancellationToken);
        await ReassignExternalAuthRequestsAsync(_db.ExternalAuthRequests.Where(x => x.UserId == sourceUserId), targetUserId, cancellationToken);
        await ReassignOrdersAsync(_db.Orders.Where(x => x.UserId == sourceUserId), targetUserId, cancellationToken);
        await ReassignFavoriteEventsAsync(_db.FavoriteEvents.Where(x => x.UserId == sourceUserId), targetUserId, cancellationToken);
        await ReassignAuthEventsAsync(_db.AuthEvents.Where(x => x.UserId == sourceUserId), targetUserId, cancellationToken);
        await ReassignProductViewsAsync(_db.ProductViews.Where(x => x.UserId == sourceUserId), targetUserId, cancellationToken);
        await ReassignSiteVisitsAsync(_db.SiteVisits.Where(x => x.UserId == sourceUserId), targetUserId, cancellationToken);
    }

    private static async Task ReassignSessionsAsync(
        IQueryable<Session> query,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        foreach (var session in await query.ToListAsync(cancellationToken))
            session.UserId = targetUserId;
    }

    private static async Task ReassignRefreshSessionsAsync(
        IQueryable<RefreshSession> query,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        foreach (var session in await query.ToListAsync(cancellationToken))
            session.UserId = targetUserId;
    }

    private static async Task ReassignAdminSessionsAsync(
        IQueryable<AdminSession> query,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        foreach (var session in await query.ToListAsync(cancellationToken))
            session.UserId = targetUserId;
    }

    private static async Task ReassignTelegramAuthRequestsAsync(
        IQueryable<TelegramAuthRequest> query,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        foreach (var request in await query.ToListAsync(cancellationToken))
            request.UserId = targetUserId;
    }

    private static async Task ReassignContactChangeRequestsAsync(
        IQueryable<ContactChangeRequest> query,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        foreach (var request in await query.ToListAsync(cancellationToken))
            request.UserId = targetUserId;
    }

    private static async Task ReassignExternalAuthRequestsAsync(
        IQueryable<ExternalAuthRequest> query,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        foreach (var request in await query.ToListAsync(cancellationToken))
            request.UserId = targetUserId;
    }

    private static async Task ReassignOrdersAsync(
        IQueryable<Order> query,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        foreach (var order in await query.ToListAsync(cancellationToken))
            order.UserId = targetUserId;
    }

    private static async Task ReassignFavoriteEventsAsync(
        IQueryable<FavoriteEvent> query,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        foreach (var entity in await query.ToListAsync(cancellationToken))
            entity.UserId = targetUserId;
    }

    private static async Task ReassignAuthEventsAsync(
        IQueryable<AuthEvent> query,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        foreach (var entity in await query.ToListAsync(cancellationToken))
            entity.UserId = targetUserId;
    }

    private static async Task ReassignProductViewsAsync(
        IQueryable<ProductView> query,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        foreach (var entity in await query.ToListAsync(cancellationToken))
            entity.UserId = targetUserId;
    }

    private static async Task ReassignSiteVisitsAsync(
        IQueryable<SiteVisit> query,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        foreach (var entity in await query.ToListAsync(cancellationToken))
            entity.UserId = targetUserId;
    }

    private static string BuildCartKey(string productId, string size)
        => $"{productId}::{size}";

    private static bool HasPassword(User user)
        => !string.IsNullOrWhiteSpace(user.PasswordHash) && !string.IsNullOrWhiteSpace(user.Salt);

    private static string? NormalizeConfirmedEmail(string? email, bool emailVerified)
        => emailVerified && TechnicalEmailHelper.IsValidRealEmail(email)
            ? TechnicalEmailHelper.NormalizeRealEmail(email)
            : null;

    private static long? MinNullable(long? left, long? right)
    {
        if (!left.HasValue)
            return right;
        if (!right.HasValue)
            return left;
        return Math.Min(left.Value, right.Value);
    }

    private static long? MaxNullable(long? left, long? right)
    {
        if (!left.HasValue)
            return right;
        if (!right.HasValue)
            return left;
        return Math.Max(left.Value, right.Value);
    }

    private static string? NormalizeOptional(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static string? NormalizePhone(string? phone)
    {
        var trimmed = (phone ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return null;

        var chars = trimmed.Where(c => char.IsDigit(c) || c == '+').ToArray();
        var normalized = new string(chars);
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        if (!normalized.StartsWith('+') && normalized.All(char.IsDigit))
            normalized = $"+{normalized}";

        return normalized;
    }

    private static void ApplyExternalPhoneToProfile(Profile userProfile, string? phone, bool phoneVerified)
    {
        var normalizedPhone = NormalizeOptional(phone);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
            return;

        var currentPhone = NormalizeOptional(userProfile.Phone);
        if (string.IsNullOrWhiteSpace(currentPhone))
        {
            userProfile.Phone = normalizedPhone;
            userProfile.PhoneVerified = phoneVerified;
            return;
        }

        if (string.Equals(currentPhone, normalizedPhone, StringComparison.Ordinal))
        {
            userProfile.PhoneVerified |= phoneVerified;
            return;
        }

        if (phoneVerified && !userProfile.PhoneVerified)
        {
            userProfile.Phone = normalizedPhone;
            userProfile.PhoneVerified = true;
        }
    }

    private async Task<HashSet<string>> LoadVerifiedEmailCandidatesAsync(
        User sourceUser,
        User targetUser,
        Profile? sourceProfile,
        Profile targetProfile,
        CancellationToken cancellationToken)
    {
        var emails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        AddVerifiedEmailCandidate(emails, targetUser.Email, targetUser.Verified);
        AddVerifiedEmailCandidate(emails, sourceUser.Email, sourceUser.Verified);
        AddVerifiedEmailCandidate(emails, targetProfile.Email, targetProfile.EmailVerified);
        AddVerifiedEmailCandidate(emails, sourceProfile?.Email, sourceProfile?.EmailVerified ?? false);

        var userIds = new[] { sourceUser.Id, targetUser.Id };
        var providerEmails = await _db.UserExternalIdentities
            .AsNoTracking()
            .Where(x =>
                userIds.Contains(x.UserId)
                && x.VerifiedAt.HasValue
                && !string.IsNullOrWhiteSpace(x.ProviderEmail))
            .Select(x => x.ProviderEmail!)
            .ToListAsync(cancellationToken);

        foreach (var providerEmail in providerEmails)
            AddVerifiedEmailCandidate(emails, providerEmail, isVerified: true);

        return emails;
    }

    private async Task<HashSet<string>> LoadVerifiedPhoneCandidatesAsync(
        string sourceUserId,
        string targetUserId,
        Profile targetProfile,
        Profile? sourceProfile,
        CancellationToken cancellationToken)
    {
        var phones = new HashSet<string>(StringComparer.Ordinal);

        AddPhoneCandidate(phones, targetProfile.Phone, targetProfile.PhoneVerified);
        AddPhoneCandidate(phones, sourceProfile?.Phone, sourceProfile?.PhoneVerified ?? false);

        var userIds = new[] { sourceUserId, targetUserId };
        var verifiedContactPhones = await _db.ContactChangeRequests
            .AsNoTracking()
            .Where(x =>
                userIds.Contains(x.UserId)
                && x.Kind == "phone"
                && x.VerifiedAt.HasValue
                && !string.IsNullOrWhiteSpace(x.TargetValue))
            .Select(x => x.TargetValue)
            .ToListAsync(cancellationToken);

        foreach (var verifiedPhone in verifiedContactPhones)
            AddPhoneCandidate(phones, verifiedPhone, isVerified: true);

        var telegramPhones = await _db.TelegramAuthRequests
            .AsNoTracking()
            .Where(x =>
                x.UserId != null
                && userIds.Contains(x.UserId)
                && !string.IsNullOrWhiteSpace(x.PhoneNumber)
                && (x.CompletedAt.HasValue || x.ConsumedAt.HasValue || x.Status == "completed" || x.Status == "consumed"))
            .Select(x => x.PhoneNumber!)
            .ToListAsync(cancellationToken);

        foreach (var telegramPhone in telegramPhones)
            AddPhoneCandidate(phones, telegramPhone, isVerified: true);

        return phones;
    }

    private static HashSet<string> CollectKnownPhoneCandidates(Profile targetProfile, Profile? sourceProfile)
    {
        var phones = new HashSet<string>(StringComparer.Ordinal);
        AddPhoneOption(phones, targetProfile.Phone);
        AddPhoneOption(phones, sourceProfile?.Phone);
        return phones;
    }

    private static void AddVerifiedEmailCandidate(HashSet<string> target, string? email, bool isVerified)
    {
        if (!isVerified || !TechnicalEmailHelper.IsValidRealEmail(email))
            return;

        target.Add(TechnicalEmailHelper.NormalizeRealEmail(email));
    }

    private static void AddPhoneCandidate(HashSet<string> target, string? phone, bool isVerified)
    {
        if (!isVerified)
            return;

        AddPhoneOption(target, phone);
    }

    private static void AddPhoneOption(HashSet<string> target, string? phone)
    {
        var normalizedPhone = NormalizeOptional(phone);
        if (!string.IsNullOrWhiteSpace(normalizedPhone))
            target.Add(normalizedPhone);
    }

    private static string? SelectMergedVerifiedEmail(
        User targetUser,
        Profile targetProfile,
        HashSet<string> verifiedEmails)
    {
        if (targetProfile.EmailVerified && TechnicalEmailHelper.IsValidRealEmail(targetProfile.Email))
            return TechnicalEmailHelper.NormalizeRealEmail(targetProfile.Email);

        if (targetUser.Verified && TechnicalEmailHelper.IsValidRealEmail(targetUser.Email))
            return TechnicalEmailHelper.NormalizeRealEmail(targetUser.Email);

        return verifiedEmails.FirstOrDefault();
    }

    private static string? SelectMergedPhone(
        Profile targetProfile,
        HashSet<string> knownPhoneCandidates,
        HashSet<string> verifiedPhoneCandidates)
    {
        var currentPhone = NormalizeOptional(targetProfile.Phone);
        if (!string.IsNullOrWhiteSpace(currentPhone)
            && (targetProfile.PhoneVerified
                || verifiedPhoneCandidates.Count == 0
                || verifiedPhoneCandidates.Contains(currentPhone)))
        {
            return currentPhone;
        }

        return verifiedPhoneCandidates.FirstOrDefault()
               ?? currentPhone
               ?? knownPhoneCandidates.FirstOrDefault();
    }

    private static bool ShouldKeepTargetReview(ProductReview targetReview, ProductReview sourceReview)
    {
        if (targetReview.IsDeleted != sourceReview.IsDeleted)
            return !targetReview.IsDeleted;

        var targetActivityAt = targetReview.EditedAt ?? targetReview.CreatedAt;
        var sourceActivityAt = sourceReview.EditedAt ?? sourceReview.CreatedAt;
        if (targetActivityAt != sourceActivityAt)
            return targetActivityAt >= sourceActivityAt;

        var targetTextLength = NormalizeOptional(targetReview.Text)?.Length ?? 0;
        var sourceTextLength = NormalizeOptional(sourceReview.Text)?.Length ?? 0;
        if (targetTextLength != sourceTextLength)
            return targetTextLength >= sourceTextLength;

        return string.CompareOrdinal(targetReview.Id, sourceReview.Id) <= 0;
    }

    private sealed record UserEmailCandidate(
        User User,
        Profile? Profile,
        bool MatchesUserEmail,
        bool MatchesProfileEmail);

    private sealed record UserPhoneCandidate(
        User User,
        Profile? Profile,
        bool MatchesProfilePhone,
        bool MatchesVerifiedRequest,
        bool MatchesTelegramPhone);
}
