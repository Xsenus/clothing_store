using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Net.Mail;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

/// <summary>
/// Контроллер аутентификации администратора и загрузки файлов.
/// </summary>
[ApiController]
[Route("admin")]
public class AdminController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly StoreDbContext _db;
    private readonly AuthService _auth;
    private readonly ITelegramBotManager _telegramBotManager;
    private readonly TransactionalEmailService _emailService;
    private readonly IOrderEmailQueue _orderEmailQueue;
    private readonly IOrderInventoryService _orderInventoryService;
    private readonly IOrderPaymentService _orderPaymentService;
    private readonly IYooMoneyPaymentService _yooMoneyPaymentService;
    private readonly IYooKassaPaymentService _yooKassaPaymentService;
    private readonly IYandexDeliveryQuoteService _yandexDeliveryQuoteService;
    private readonly IYandexDeliveryTrackingService _yandexDeliveryTrackingService;
    private readonly DatabaseBackupService _databaseBackupService;

    /// <summary>
    /// Инициализирует новый экземпляр класса <see cref="AdminController"/>.
    /// </summary>
    public AdminController(
        IConfiguration configuration,
        StoreDbContext db,
        AuthService auth,
        ITelegramBotManager telegramBotManager,
        TransactionalEmailService emailService,
        IOrderEmailQueue orderEmailQueue,
        IOrderInventoryService orderInventoryService,
        IOrderPaymentService orderPaymentService,
        IYooMoneyPaymentService yooMoneyPaymentService,
        IYooKassaPaymentService yooKassaPaymentService,
        IYandexDeliveryQuoteService yandexDeliveryQuoteService,
        IYandexDeliveryTrackingService yandexDeliveryTrackingService,
        DatabaseBackupService databaseBackupService)
    {
        _configuration = configuration;
        _db = db;
        _auth = auth;
        _telegramBotManager = telegramBotManager;
        _emailService = emailService;
        _orderEmailQueue = orderEmailQueue;
        _orderInventoryService = orderInventoryService;
        _orderPaymentService = orderPaymentService;
        _yooMoneyPaymentService = yooMoneyPaymentService;
        _yooKassaPaymentService = yooKassaPaymentService;
        _yandexDeliveryQuoteService = yandexDeliveryQuoteService;
        _yandexDeliveryTrackingService = yandexDeliveryTrackingService;
        _databaseBackupService = databaseBackupService;
    }

    /// <summary>
    /// Аутентифицирует администратора.
    /// </summary>
    [HttpPost("login")]
    public async Task<IResult> Login([FromBody] AuthPayload payload)
    {
        var email = payload.Email.Trim().ToLowerInvariant();
        var admin = await _db.Users.FirstOrDefaultAsync(x => x.Email == email);
        var iterations = _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000;

        if (admin is null || !admin.IsAdmin || admin.IsBlocked || !AuthService.VerifyPassword(payload.Password, admin.PasswordHash, admin.Salt, iterations))
            return Results.BadRequest(new { detail = "Invalid credentials" });

        var token = AuthService.GenerateToken();
        _db.AdminSessions.Add(new AdminSession
        {
            Token = token,
            UserId = admin.Id,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
        await _db.SaveChangesAsync();
        return Results.Ok(new { token, user = new { id = admin.Id, email = admin.Email } });
    }

    /// <summary>
    /// Возвращает состояние текущей админской сессии.
    /// </summary>
    [HttpGet("me")]
    public async Task<IResult> Me()
    {
        var admin = await RequireAdminUserAsync();
        return admin is null ? Results.Unauthorized() : Results.Ok(new { ok = true, user = new { id = admin.Id, email = admin.Email } });
    }

    /// <summary>
    /// Выполняет выход администратора.
    /// </summary>
    [HttpPost("logout")]
    public async Task<IResult> Logout()
    {
        var token = Request.Headers["X-Admin-Token"].ToString().Trim();
        var session = await _db.AdminSessions.FirstOrDefaultAsync(x => x.Token == token);
        if (session is not null)
        {
            _db.AdminSessions.Remove(session);
            await _db.SaveChangesAsync();
        }

        return Results.Ok(new { ok = true });
    }

    [HttpGet("orders")]
    public async Task<IResult> Orders(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? search = null,
        [FromQuery] string? status = null,
        [FromQuery] string? dateFrom = null,
        [FromQuery] string? dateTo = null,
        [FromQuery] string? userId = null)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        var resolvedPageSize = Math.Clamp(pageSize, 5, 100);
        IQueryable<Order> query = _db.Orders;

        if (!string.IsNullOrWhiteSpace(userId))
        {
            var normalizedUserId = userId.Trim();
            query = query.Where(x => x.UserId == normalizedUserId);
        }

        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status.Trim(), "all", StringComparison.OrdinalIgnoreCase))
        {
            var normalizedStatus = NormalizeOrderStatus(status);
            if (normalizedStatus == "canceled")
            {
                query = query.Where(x => x.Status.ToLower() == "canceled" || x.Status.ToLower() == "cancelled");
            }
            else
            {
                query = query.Where(x => x.Status.ToLower() == normalizedStatus);
            }
        }

        if (TryParseOrderFilterDate(dateFrom, isEndOfDay: false, out var fromTimestamp))
        {
            query = query.Where(x => x.CreatedAt >= fromTimestamp);
        }

        if (TryParseOrderFilterDate(dateTo, isEndOfDay: true, out var toTimestamp))
        {
            query = query.Where(x => x.CreatedAt <= toTimestamp);
        }

        var trimmedSearch = search?.Trim();
        if (!string.IsNullOrWhiteSpace(trimmedSearch))
        {
            var pattern = $"%{trimmedSearch}%";
            var orderNumberSearch = TryParseOrderNumberSearch(trimmedSearch);
            var matchingUserIds = _db.Users
                .AsNoTracking()
                .Where(x => EF.Functions.ILike(x.Email, pattern))
                .Select(x => x.Id);
            var matchingProfileUserIds = _db.Profiles
                .AsNoTracking()
                .Where(x =>
                    EF.Functions.ILike(x.Email, pattern) ||
                    EF.Functions.ILike(x.Name ?? string.Empty, pattern) ||
                    EF.Functions.ILike(x.Phone ?? string.Empty, pattern) ||
                    EF.Functions.ILike(x.Nickname ?? string.Empty, pattern) ||
                    EF.Functions.ILike(x.ShippingAddress ?? string.Empty, pattern))
                .Select(x => x.UserId);

            query = query.Where(x =>
                EF.Functions.ILike(x.Id, pattern) ||
                (orderNumberSearch.HasValue && x.OrderNumber == orderNumberSearch.Value) ||
                EF.Functions.ILike(x.UserId, pattern) ||
                EF.Functions.ILike(x.CustomerName, pattern) ||
                EF.Functions.ILike(x.CustomerEmail, pattern) ||
                EF.Functions.ILike(x.CustomerPhone, pattern) ||
                EF.Functions.ILike(x.ShippingAddress, pattern) ||
                EF.Functions.ILike(x.Status, pattern) ||
                EF.Functions.ILike(x.PaymentMethod, pattern) ||
                EF.Functions.ILike(x.PurchaseChannel, pattern) ||
                EF.Functions.ILike(x.ItemsJson, pattern) ||
                matchingUserIds.Contains(x.UserId) ||
                matchingProfileUserIds.Contains(x.UserId));
        }

        var totalItems = await query.CountAsync();
        var totalPages = Math.Max(1, (int)Math.Ceiling(totalItems / (double)resolvedPageSize));
        var resolvedPage = Math.Clamp(page, 1, totalPages);

        var orders = await query
            .OrderByDescending(x => x.CreatedAt)
            .Skip((resolvedPage - 1) * resolvedPageSize)
            .Take(resolvedPageSize)
            .ToListAsync();
        await _yandexDeliveryTrackingService.SyncOrderStatusesAsync(
            orders.Select(order => order.Id),
            HttpContext.RequestAborted);

        var userIds = orders.Select(x => x.UserId).Distinct().ToList();
        var users = userIds.Count == 0
            ? new Dictionary<string, User>()
            : await _db.Users.AsNoTracking().Where(x => userIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
        var profiles = userIds.Count == 0
            ? new Dictionary<string, Profile>()
            : await _db.Profiles.AsNoTracking().Where(x => userIds.Contains(x.UserId)).ToDictionaryAsync(x => x.UserId);

        var storedItemsByOrderId = orders.ToDictionary(
            x => x.Id,
            x => OrderPresentation.ParseStoredOrderItems(x.ItemsJson),
            StringComparer.Ordinal);
        var productIds = storedItemsByOrderId.Values
            .SelectMany(x => x)
            .Select(x => x.ProductId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct()
            .ToList();
        var productSnapshots = productIds.Count == 0
            ? new Dictionary<string, ProductOrderSnapshot>(StringComparer.Ordinal)
            : (await _db.Products
                .AsNoTracking()
                .Where(x => productIds.Contains(x.Id))
                .ToListAsync())
                .Select(OrderPresentation.BuildProductSnapshot)
                .ToDictionary(x => x.ProductId, StringComparer.Ordinal);
        var latestPaymentsByOrderId = await _orderPaymentService.GetLatestPaymentsByOrderIdAsync(
            orders.Select(order => order.Id),
            HttpContext.RequestAborted);
        var manualRefreshProviders = await _orderPaymentService.GetManualRefreshAvailableProvidersAsync(HttpContext.RequestAborted);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        return Results.Ok(new
        {
            items = orders.Select(o =>
            {
                var user = users.GetValueOrDefault(o.UserId);
                var profile = profiles.GetValueOrDefault(o.UserId);
                var storedItems = storedItemsByOrderId.GetValueOrDefault(o.Id) ?? [];
                return new
                {
                    o.Id,
                    o.OrderNumber,
                    displayOrderNumber = OrderPresentation.FormatOrderNumber(o.OrderNumber),
                    o.UserId,
                    userEmail = user?.Email,
                    userProfile = profile is null
                        ? null
                        : new
                        {
                            profile.Name,
                            profile.Phone,
                            profile.Nickname,
                            profile.ShippingAddress,
                            profile.PhoneVerified
                        },
                    o.TotalAmount,
                    o.ShippingAmount,
                    o.Status,
                    o.PaymentMethod,
                    o.PurchaseChannel,
                    o.ShippingMethod,
                    o.PickupPointId,
                    o.YandexRequestId,
                    o.YandexDeliveryStatus,
                    o.YandexDeliveryStatusDescription,
                    o.YandexDeliveryStatusReason,
                    o.YandexDeliveryStatusUpdatedAt,
                    o.YandexDeliveryStatusSyncedAt,
                    o.YandexDeliveryTrackingUrl,
                    o.YandexPickupCode,
                    o.YandexDeliveryLastSyncError,
                    o.ShippingAddress,
                    o.CustomerName,
                    o.CustomerEmail,
                    o.CustomerPhone,
                    o.StatusHistoryJson,
                    o.CreatedAt,
                    o.UpdatedAt,
                    o.ItemsJson,
                    payment = OrderPaymentPresentation.BuildSummary(
                        latestPaymentsByOrderId.GetValueOrDefault(o.Id),
                        manualRefreshProviders,
                        now,
                        o.Status),
                    items = storedItems.Select(item =>
                    {
                        var productSnapshot = productSnapshots.GetValueOrDefault(item.ProductId);
                        var unitPrice = Math.Round(item.UnitPrice ?? productSnapshot?.UnitPrice ?? 0d, 2, MidpointRounding.AwayFromZero);
                        return new
                        {
                            item.ProductId,
                            productName = item.ProductName ?? productSnapshot?.Name ?? item.ProductId,
                            productImageUrl = item.ProductImageUrl ?? productSnapshot?.ImageUrl,
                            item.Size,
                            item.Quantity,
                            unitPrice,
                            lineTotal = Math.Round(unitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero)
                        };
                    })
                };
            }),
            page = resolvedPage,
            pageSize = resolvedPageSize,
            totalItems,
            totalPages
        });
    }

    [HttpPatch("orders/{orderId}")]
    public async Task<IResult> UpdateOrder(string orderId, [FromBody] AdminOrderPatchPayload payload)
    {
        var admin = await RequireAdminUserAsync();
        if (admin is null) return Results.Unauthorized();

        var order = await _db.Orders.FirstOrDefaultAsync(x => x.Id == orderId);
        if (order is null) return Results.NotFound(new { detail = "Order not found" });

        var currentStatus = NormalizeOrderStatus(order.Status);
        var nextStatus = string.IsNullOrWhiteSpace(payload.Status)
            ? currentStatus
            : NormalizeOrderStatus(payload.Status);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (IsInventoryReleasedStatus(currentStatus) && !IsInventoryReleasedStatus(nextStatus))
            return Results.BadRequest(new { detail = "Нельзя вернуть отмененный или возвращенный заказ в активный статус из этого интерфейса" });

        var nextShippingAddress = payload.ShippingAddress is null ? order.ShippingAddress : payload.ShippingAddress.Trim();
        var nextPaymentMethod = payload.PaymentMethod is null ? NormalizePaymentMethod(order.PaymentMethod) : NormalizePaymentMethod(payload.PaymentMethod);
        var nextCustomerName = payload.CustomerName is null ? order.CustomerName : payload.CustomerName.Trim();
        var nextCustomerEmail = payload.CustomerEmail is null ? order.CustomerEmail : payload.CustomerEmail.Trim();
        var nextCustomerPhone = payload.CustomerPhone is null ? order.CustomerPhone : payload.CustomerPhone.Trim();
        var nextYandexRequestId = payload.YandexRequestId is null
            ? order.YandexRequestId
            : NormalizeOptionalText(payload.YandexRequestId);
        var fieldChanges = BuildOrderFieldChanges(order, nextStatus, nextShippingAddress, nextPaymentMethod, nextCustomerName, nextCustomerEmail, nextCustomerPhone, nextYandexRequestId);

        if (fieldChanges.Count == 0)
            return Results.Ok(new { ok = true, noChanges = true });

        await using var tx = await _db.Database.BeginTransactionAsync();

        if (!IsInventoryReleasedStatus(currentStatus) && IsInventoryReleasedStatus(nextStatus))
        {
            await _orderInventoryService.ReleaseOrderStockAsync(order, admin.Id, now, nextStatus == "returned" ? "order_return" : "order_cancel", HttpContext.RequestAborted);
            await _orderPaymentService.CancelPendingPaymentsForOrderAsync(order.Id, "Заказ переведен в терминальный статус администратором.", HttpContext.RequestAborted);
        }

        order.Status = nextStatus;
        order.ShippingAddress = nextShippingAddress;
        order.PaymentMethod = nextPaymentMethod;
        order.CustomerName = nextCustomerName;
        order.CustomerEmail = nextCustomerEmail;
        order.CustomerPhone = nextCustomerPhone;
        if (!string.Equals(order.YandexRequestId, nextYandexRequestId, StringComparison.Ordinal))
        {
            order.YandexRequestId = nextYandexRequestId;
            order.YandexDeliveryStatus = null;
            order.YandexDeliveryStatusDescription = null;
            order.YandexDeliveryStatusReason = null;
            order.YandexDeliveryStatusUpdatedAt = null;
            order.YandexDeliveryStatusSyncedAt = null;
            order.YandexDeliveryTrackingUrl = null;
            order.YandexPickupCode = null;
            order.YandexDeliveryLastSyncError = null;
        }
        order.UpdatedAt = now;

        var history = ParseOrderHistory(order.StatusHistoryJson);
        history.Add(new Dictionary<string, object?>
        {
            ["kind"] = IsInventoryReleasedStatus(nextStatus) && !IsInventoryReleasedStatus(currentStatus) ? "canceled" : "updated",
            ["status"] = nextStatus,
            ["changedAt"] = now,
            ["changedBy"] = admin.Email,
            ["comment"] = string.IsNullOrWhiteSpace(payload.ManagerComment)
                ? "Заказ обновлен администратором"
                : payload.ManagerComment.Trim(),
            ["fieldChanges"] = fieldChanges
        });
        order.StatusHistoryJson = JsonSerializer.Serialize(history);

        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        if (!string.Equals(currentStatus, nextStatus, StringComparison.Ordinal))
            _orderEmailQueue.QueueOrderStatusChangedEmail(order, currentStatus, payload.ManagerComment);

        return Results.Ok(new { ok = true });
    }

    [HttpDelete("orders/{orderId}")]
    public async Task<IResult> DeleteOrder(string orderId)
    {
        var admin = await RequireAdminUserAsync();
        if (admin is null) return Results.Unauthorized();

        var order = await _db.Orders.FirstOrDefaultAsync(x => x.Id == orderId);
        if (order is null) return Results.NotFound(new { detail = "Order not found" });

        await using var tx = await _db.Database.BeginTransactionAsync();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var latestPayment = await _orderPaymentService.GetLatestPaymentAsync(order.Id, HttpContext.RequestAborted);
        if (latestPayment is not null && string.Equals(latestPayment.Status, "pending", StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest(new { detail = "Нельзя удалить заказ с активным онлайн-платежом. Сначала отмените заказ или дождитесь завершения оплаты." });

        if (!IsInventoryReleasedStatus(order.Status))
        {
            await _orderInventoryService.ReleaseOrderStockAsync(order, admin.Id, now, "order_delete", HttpContext.RequestAborted);
        }

        _db.Orders.Remove(order);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Results.Ok(new { ok = true });
    }

    [HttpPost("orders/{orderId}/payment/refresh")]
    public async Task<IResult> RefreshOrderPayment(string orderId, CancellationToken cancellationToken)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        var order = await _db.Orders.FirstOrDefaultAsync(x => x.Id == orderId, cancellationToken);
        if (order is null) return Results.NotFound(new { detail = "Order not found" });

        try
        {
            var payment = await _orderPaymentService.RefreshOrderPaymentAsync(order, cancellationToken);
            return Results.Ok(new
            {
                payment = OrderPaymentPresentation.BuildSummary(
                    payment,
                    await _orderPaymentService.GetManualRefreshAvailableProvidersAsync(cancellationToken),
                    DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    order.Status)
            });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpGet("analytics")]
    public async Task<IResult> Analytics(
        [FromQuery] string? dateFrom = null,
        [FromQuery] string? dateTo = null)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        var (resolvedDateFrom, resolvedDateTo, fromTimestamp, toTimestamp, periodDays) =
            AdminAnalyticsSupport.ResolveRange(dateFrom, dateTo);
        var (previousDateFrom, previousDateTo, previousFromTimestamp, previousToTimestamp, previousPeriodDays) =
            AdminAnalyticsSupport.ResolvePreviousRange(fromTimestamp, periodDays);

        var products = await _db.Products
            .AsNoTracking()
            .ToListAsync();
        var productSnapshots = products
            .Select(OrderPresentation.BuildProductSnapshot)
            .ToDictionary(x => x.ProductId, StringComparer.Ordinal);
        var productsById = products.ToDictionary(x => x.Id, StringComparer.Ordinal);

        var stockRows = await _db.ProductSizeStocks
            .AsNoTracking()
            .ToListAsync();
        var stockByProductId = stockRows
            .GroupBy(x => x.ProductId, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group.Sum(item => Math.Max(0, item.Stock)),
                StringComparer.Ordinal);

        var likes = await _db.Likes
            .AsNoTracking()
            .ToListAsync();
        var likeCountsByProduct = likes
            .GroupBy(x => x.ProductId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        var favoriteEventsInPeriod = await _db.FavoriteEvents
            .AsNoTracking()
            .Where(x => x.CreatedAt >= fromTimestamp && x.CreatedAt <= toTimestamp)
            .ToListAsync();
        var previousFavoriteEventsInPeriod = await _db.FavoriteEvents
            .AsNoTracking()
            .Where(x => x.CreatedAt >= previousFromTimestamp && x.CreatedAt <= previousToTimestamp)
            .ToListAsync();
        var authEventsInPeriod = await _db.AuthEvents
            .AsNoTracking()
            .Where(x =>
                x.EventType == "login"
                && x.CreatedAt >= fromTimestamp
                && x.CreatedAt <= toTimestamp)
            .ToListAsync();
        var previousAuthEventsInPeriod = await _db.AuthEvents
            .AsNoTracking()
            .Where(x =>
                x.EventType == "login"
                && x.CreatedAt >= previousFromTimestamp
                && x.CreatedAt <= previousToTimestamp)
            .ToListAsync();

        var orders = await _db.Orders
            .AsNoTracking()
            .Where(x => x.CreatedAt >= fromTimestamp && x.CreatedAt <= toTimestamp)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();
        var previousOrders = await _db.Orders
            .AsNoTracking()
            .Where(x => x.CreatedAt >= previousFromTimestamp && x.CreatedAt <= previousToTimestamp)
            .ToListAsync();
        var latestPaymentsByOrderId = await _orderPaymentService.GetLatestPaymentsByOrderIdAsync(
            orders.Select(x => x.Id),
            HttpContext.RequestAborted);

        var usersInPeriod = await _db.Users
            .AsNoTracking()
            .Where(x => x.CreatedAt >= fromTimestamp && x.CreatedAt <= toTimestamp)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();
        var previousUsersInPeriod = await _db.Users
            .AsNoTracking()
            .Where(x => x.CreatedAt >= previousFromTimestamp && x.CreatedAt <= previousToTimestamp)
            .ToListAsync();
        var periodUserIds = usersInPeriod
            .Select(x => x.Id)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        var userIdentitiesInPeriod = periodUserIds.Count == 0
            ? []
            : await _db.UserExternalIdentities
                .AsNoTracking()
                .Where(x => periodUserIds.Contains(x.UserId))
                .ToListAsync();
        var identitiesByUserId = userIdentitiesInPeriod
            .GroupBy(x => x.UserId, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<UserExternalIdentity>)group
                    .OrderBy(item => item.CreatedAt)
                    .ThenBy(item => item.Provider)
                    .ToList(),
                StringComparer.Ordinal);

        var activeExternalProviders = await _db.UserExternalIdentities
            .AsNoTracking()
            .Where(x => x.LastUsedAt.HasValue && x.LastUsedAt.Value >= fromTimestamp && x.LastUsedAt.Value <= toTimestamp)
            .Select(x => new { x.UserId, x.Provider })
            .Distinct()
            .ToListAsync();
        var connectedExternalProviders = await _db.UserExternalIdentities
            .AsNoTracking()
            .Select(x => new { x.UserId, x.Provider })
            .Distinct()
            .ToListAsync();
        var productViewRows = await _db.ProductViews
            .AsNoTracking()
            .Where(x => x.LastViewedAt >= fromTimestamp && x.LastViewedAt <= toTimestamp)
            .ToListAsync();
        var previousProductViewRows = await _db.ProductViews
            .AsNoTracking()
            .Where(x => x.LastViewedAt >= previousFromTimestamp && x.LastViewedAt <= previousToTimestamp)
            .ToListAsync();
        var timeline = AdminAnalyticsSupport.CreateTimeline(fromTimestamp, toTimestamp);

        var productMetrics = new Dictionary<string, AdminAnalyticsSupport.AnalyticsProductMetric>(StringComparer.Ordinal);
        foreach (var pair in likeCountsByProduct)
        {
            if (string.IsNullOrWhiteSpace(pair.Key))
                continue;

            var metric = AdminAnalyticsSupport.GetOrCreateProductMetric(
                productMetrics,
                pair.Key,
                productSnapshots,
                productsById,
                stockByProductId);
            metric.FavoritesCount = pair.Value;
        }

        foreach (var group in favoriteEventsInPeriod.GroupBy(x => x.ProductId, StringComparer.Ordinal))
        {
            if (string.IsNullOrWhiteSpace(group.Key))
                continue;

            var metric = AdminAnalyticsSupport.GetOrCreateProductMetric(
                productMetrics,
                group.Key,
                productSnapshots,
                productsById,
                stockByProductId);
            metric.FavoriteAddsCount = group.Count(item => AdminAnalyticsSupport.NormalizeFavoriteEventType(item.EventType) == "added");
            metric.FavoriteRemovalsCount = group.Count(item => AdminAnalyticsSupport.NormalizeFavoriteEventType(item.EventType) == "removed");
        }

        foreach (var group in productViewRows.GroupBy(x => x.ProductId, StringComparer.Ordinal))
        {
            if (string.IsNullOrWhiteSpace(group.Key))
                continue;

            var metric = AdminAnalyticsSupport.GetOrCreateProductMetric(
                productMetrics,
                group.Key,
                productSnapshots,
                productsById,
                stockByProductId);
            metric.UniqueViewers = group
                .Select(item => item.ViewerKey)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.Ordinal)
                .Count();
            metric.TotalViews = group.Sum(item => Math.Max(0, item.ViewCount));
        }

        var ordersByStatus = new Dictionary<string, AdminAnalyticsSupport.AnalyticsBucket>(StringComparer.Ordinal);
        var ordersByShippingMethod = new Dictionary<string, AdminAnalyticsSupport.AnalyticsBucket>(StringComparer.Ordinal);
        var ordersByPaymentMethod = new Dictionary<string, AdminAnalyticsSupport.AnalyticsBucket>(StringComparer.Ordinal);
        var ordersByPaymentGroup = new Dictionary<string, AdminAnalyticsSupport.AnalyticsBucket>(StringComparer.Ordinal);
        var ordersByPaymentProvider = new Dictionary<string, AdminAnalyticsSupport.AnalyticsBucket>(StringComparer.Ordinal);
        var ordersByPurchaseChannel = new Dictionary<string, AdminAnalyticsSupport.AnalyticsBucket>(StringComparer.Ordinal);

        var successfulOrdersCount = 0;
        var deliveredOrdersCount = 0;
        var canceledOrdersCount = 0;
        var soldUnits = 0;
        var revenueAmount = 0d;
        var shippingRevenueAmount = 0d;
        var previousSuccessfulOrdersCount = 0;
        var previousDeliveredOrdersCount = 0;
        var previousCanceledOrdersCount = 0;
        var previousSoldUnits = 0;
        var previousRevenueAmount = 0d;
        var previousShippingRevenueAmount = 0d;

        foreach (var order in orders)
        {
            var normalizedStatus = AdminAnalyticsSupport.NormalizeOrderStatus(order.Status);
            var normalizedShippingMethod = AdminAnalyticsSupport.NormalizeShippingMethod(order.ShippingMethod);
            var normalizedPaymentMethod = AdminAnalyticsSupport.NormalizePaymentMethod(order.PaymentMethod);
            var normalizedPurchaseChannel = AdminAnalyticsSupport.NormalizePurchaseChannel(order.PurchaseChannel);
            var timelinePoint = timeline[AdminAnalyticsSupport.ToDayKey(order.CreatedAt)];
            var paymentProviderKey = AdminAnalyticsSupport.ResolvePaymentProviderKey(
                latestPaymentsByOrderId.GetValueOrDefault(order.Id),
                normalizedPaymentMethod);
            var paymentGroupKey = AdminAnalyticsSupport.ResolvePaymentGroupKey(normalizedPaymentMethod);
            var statusBucket = AdminAnalyticsSupport.GetOrCreateBucket(ordersByStatus, normalizedStatus);
            statusBucket.Count++;
            AdminAnalyticsSupport.GetOrCreateBucket(ordersByPurchaseChannel, normalizedPurchaseChannel).Count++;
            timelinePoint.OrdersCount++;

            if (!AdminAnalyticsSupport.IsSuccessfulOrderStatus(normalizedStatus))
            {
                if (normalizedStatus is "delivered" or "completed")
                    deliveredOrdersCount++;

                if (normalizedStatus is "canceled" or "returned")
                    canceledOrdersCount++;

                continue;
            }

            successfulOrdersCount++;
            if (normalizedStatus is "delivered" or "completed")
                deliveredOrdersCount++;

            timelinePoint.SuccessfulOrdersCount++;
            revenueAmount += order.TotalAmount;
            shippingRevenueAmount += order.ShippingAmount;
            timelinePoint.RevenueAmount = Math.Round(timelinePoint.RevenueAmount + order.TotalAmount, 2, MidpointRounding.AwayFromZero);
            timelinePoint.ShippingRevenueAmount = Math.Round(timelinePoint.ShippingRevenueAmount + order.ShippingAmount, 2, MidpointRounding.AwayFromZero);

            AdminAnalyticsSupport.AccumulateBucket(statusBucket, 0, order.TotalAmount, order.ShippingAmount);
            AdminAnalyticsSupport.AccumulateBucket(
                AdminAnalyticsSupport.GetOrCreateBucket(ordersByShippingMethod, normalizedShippingMethod),
                0,
                order.TotalAmount,
                order.ShippingAmount);
            AdminAnalyticsSupport.AccumulateBucket(
                AdminAnalyticsSupport.GetOrCreateBucket(ordersByPaymentMethod, normalizedPaymentMethod),
                0,
                order.TotalAmount,
                order.ShippingAmount);
            AdminAnalyticsSupport.AccumulateBucket(
                AdminAnalyticsSupport.GetOrCreateBucket(ordersByPaymentGroup, paymentGroupKey),
                0,
                order.TotalAmount,
                order.ShippingAmount);
            AdminAnalyticsSupport.AccumulateBucket(
                AdminAnalyticsSupport.GetOrCreateBucket(ordersByPaymentProvider, paymentProviderKey),
                0,
                order.TotalAmount,
                order.ShippingAmount);

            var orderItems = OrderPresentation.ParseStoredOrderItems(order.ItemsJson);
            var aggregatedOrderItems = new Dictionary<string, (int Units, double Revenue, string Name, string? ImageUrl)>(StringComparer.Ordinal);
            foreach (var item in orderItems)
            {
                if (string.IsNullOrWhiteSpace(item.ProductId) || item.Quantity <= 0)
                    continue;

                var snapshot = productSnapshots.GetValueOrDefault(item.ProductId);
                var resolvedName = !string.IsNullOrWhiteSpace(item.ProductName)
                    ? item.ProductName!.Trim()
                    : snapshot?.Name ?? item.ProductId;
                var resolvedImageUrl = !string.IsNullOrWhiteSpace(item.ProductImageUrl)
                    ? item.ProductImageUrl!.Trim()
                    : snapshot?.ImageUrl;
                var unitPrice = Math.Round(
                    item.UnitPrice ?? snapshot?.UnitPrice ?? 0d,
                    2,
                    MidpointRounding.AwayFromZero);
                var lineRevenue = Math.Round(unitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero);

                if (aggregatedOrderItems.TryGetValue(item.ProductId, out var current))
                {
                    aggregatedOrderItems[item.ProductId] = (
                        current.Units + item.Quantity,
                        Math.Round(current.Revenue + lineRevenue, 2, MidpointRounding.AwayFromZero),
                        current.Name,
                        current.ImageUrl ?? resolvedImageUrl);
                }
                else
                {
                    aggregatedOrderItems[item.ProductId] = (item.Quantity, lineRevenue, resolvedName, resolvedImageUrl);
                }

                soldUnits += item.Quantity;
                timelinePoint.SoldUnits += item.Quantity;
            }

            foreach (var aggregatedItem in aggregatedOrderItems)
            {
                var metric = AdminAnalyticsSupport.GetOrCreateProductMetric(
                    productMetrics,
                    aggregatedItem.Key,
                    productSnapshots,
                    productsById,
                    stockByProductId,
                    aggregatedItem.Value.Name,
                    aggregatedItem.Value.ImageUrl);
                metric.SoldUnits += aggregatedItem.Value.Units;
                metric.RevenueAmount = Math.Round(metric.RevenueAmount + aggregatedItem.Value.Revenue, 2, MidpointRounding.AwayFromZero);
                metric.OrdersCount++;

                AdminAnalyticsSupport.AccumulateBucket(
                    AdminAnalyticsSupport.GetOrCreateBucket(ordersByShippingMethod, normalizedShippingMethod),
                    aggregatedItem.Value.Units,
                    0,
                    0);
                AdminAnalyticsSupport.AccumulateBucket(
                    AdminAnalyticsSupport.GetOrCreateBucket(ordersByPaymentMethod, normalizedPaymentMethod),
                    aggregatedItem.Value.Units,
                    0,
                    0);
                AdminAnalyticsSupport.AccumulateBucket(
                    AdminAnalyticsSupport.GetOrCreateBucket(ordersByPaymentGroup, paymentGroupKey),
                    aggregatedItem.Value.Units,
                    0,
                    0);
                AdminAnalyticsSupport.AccumulateBucket(
                    AdminAnalyticsSupport.GetOrCreateBucket(ordersByPaymentProvider, paymentProviderKey),
                    aggregatedItem.Value.Units,
                    0,
                    0);
                AdminAnalyticsSupport.AccumulateBucket(statusBucket, aggregatedItem.Value.Units, 0, 0);
            }
        }

        foreach (var previousOrder in previousOrders)
        {
            var normalizedStatus = AdminAnalyticsSupport.NormalizeOrderStatus(previousOrder.Status);
            if (!AdminAnalyticsSupport.IsSuccessfulOrderStatus(normalizedStatus))
            {
                if (normalizedStatus is "delivered" or "completed")
                    previousDeliveredOrdersCount++;

                if (normalizedStatus is "canceled" or "returned")
                    previousCanceledOrdersCount++;

                continue;
            }

            previousSuccessfulOrdersCount++;
            if (normalizedStatus is "delivered" or "completed")
                previousDeliveredOrdersCount++;

            previousRevenueAmount += previousOrder.TotalAmount;
            previousShippingRevenueAmount += previousOrder.ShippingAmount;

            foreach (var item in OrderPresentation.ParseStoredOrderItems(previousOrder.ItemsJson))
            {
                if (string.IsNullOrWhiteSpace(item.ProductId) || item.Quantity <= 0)
                    continue;

                previousSoldUnits += item.Quantity;
            }
        }

        var registrationChannels = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var user in usersInPeriod)
        {
            var channelKey = AdminAnalyticsSupport.ResolveRegistrationChannel(user, identitiesByUserId.GetValueOrDefault(user.Id) ?? []);
            registrationChannels[channelKey] = registrationChannels.TryGetValue(channelKey, out var currentCount)
                ? currentCount + 1
                : 1;
            timeline[AdminAnalyticsSupport.ToDayKey(user.CreatedAt)].NewUsersCount++;
        }

        var activeExternalUsersByProvider = activeExternalProviders
            .GroupBy(x => AdminAnalyticsSupport.NormalizeExternalProviderKey(x.Provider), StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        var connectedExternalUsersByProvider = connectedExternalProviders
            .GroupBy(x => AdminAnalyticsSupport.NormalizeExternalProviderKey(x.Provider), StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        var loginCounts = authEventsInPeriod
            .GroupBy(x => AdminAnalyticsSupport.NormalizeAuthProviderKey(x.Provider), StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);

        var totalProducts = products.Count;
        var visibleProducts = products.Count(x => !x.IsHidden);
        var hiddenProducts = totalProducts - visibleProducts;
        var currentStockUnits = stockRows.Sum(x => Math.Max(0, x.Stock));
        var visibleInStockProducts = products.Count(x => !x.IsHidden && stockByProductId.GetValueOrDefault(x.Id) > 0);
        var outOfStockVisibleProducts = visibleProducts - visibleInStockProducts;
        var lowStockVisibleProducts = products.Count(x => !x.IsHidden && stockByProductId.GetValueOrDefault(x.Id) is > 0 and <= 3);
        var totalFavorites = likes.Count;
        var uniqueFavoriteUsers = likes
            .Select(x => x.UserId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .Count();
        var favoritesAddedCount = favoriteEventsInPeriod.Count(x => AdminAnalyticsSupport.NormalizeFavoriteEventType(x.EventType) == "added");
        var favoritesRemovedCount = favoriteEventsInPeriod.Count - favoritesAddedCount;
        var favoriteUsersCount = favoriteEventsInPeriod
            .Select(x => x.UserId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .Count();
        var loginEventsCount = authEventsInPeriod.Count;
        var totalViewEvents = productViewRows.Sum(x => Math.Max(0, x.ViewCount));
        var totalUniqueViewers = productViewRows
            .Select(x => x.ViewerKey)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .Count();
        foreach (var favoriteGroup in favoriteEventsInPeriod.GroupBy(x => AdminAnalyticsSupport.ToDayKey(x.CreatedAt)))
        {
            if (!timeline.TryGetValue(favoriteGroup.Key, out var favoriteTimelinePoint))
                continue;

            favoriteTimelinePoint.FavoritesAddedCount += favoriteGroup.Count(item => AdminAnalyticsSupport.NormalizeFavoriteEventType(item.EventType) == "added");
            favoriteTimelinePoint.FavoritesRemovedCount += favoriteGroup.Count(item => AdminAnalyticsSupport.NormalizeFavoriteEventType(item.EventType) == "removed");
        }
        foreach (var viewGroup in productViewRows.GroupBy(
                     x => x.DayKey > 0 ? x.DayKey : AdminAnalyticsSupport.ToDayKey(x.LastViewedAt)))
        {
            if (!timeline.TryGetValue(viewGroup.Key, out var timelinePoint))
                continue;

            timelinePoint.TotalViewEvents = viewGroup.Sum(item => Math.Max(0, item.ViewCount));
            timelinePoint.UniqueViewers = viewGroup
                .Select(item => item.ViewerKey)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.Ordinal)
                .Count();
        }
        var viewedProductsCount = productViewRows
            .Select(x => x.ProductId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .Count();
        foreach (var authGroup in authEventsInPeriod.GroupBy(x => AdminAnalyticsSupport.ToDayKey(x.CreatedAt)))
        {
            if (!timeline.TryGetValue(authGroup.Key, out var authTimelinePoint))
                continue;

            authTimelinePoint.LoginsCount += authGroup.Count();
        }
        var previousFavoritesAddedCount = previousFavoriteEventsInPeriod.Count(x => AdminAnalyticsSupport.NormalizeFavoriteEventType(x.EventType) == "added");
        var previousFavoritesRemovedCount = previousFavoriteEventsInPeriod.Count - previousFavoritesAddedCount;
        var previousFavoriteUsersCount = previousFavoriteEventsInPeriod
            .Select(x => x.UserId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .Count();
        var previousLoginEventsCount = previousAuthEventsInPeriod.Count;
        var previousTotalViewEvents = previousProductViewRows.Sum(x => Math.Max(0, x.ViewCount));
        var previousTotalUniqueViewers = previousProductViewRows
            .Select(x => x.ViewerKey)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .Count();
        var previousViewedProductsCount = previousProductViewRows
            .Select(x => x.ProductId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .Count();
        var averageOrderValue = successfulOrdersCount > 0
            ? Math.Round(revenueAmount / successfulOrdersCount, 2, MidpointRounding.AwayFromZero)
            : 0d;
        var averageItemsPerOrder = successfulOrdersCount > 0
            ? Math.Round((double)soldUnits / successfulOrdersCount, 2, MidpointRounding.AwayFromZero)
            : 0d;
        var previousAverageOrderValue = previousSuccessfulOrdersCount > 0
            ? Math.Round(previousRevenueAmount / previousSuccessfulOrdersCount, 2, MidpointRounding.AwayFromZero)
            : 0d;
        var previousAverageItemsPerOrder = previousSuccessfulOrdersCount > 0
            ? Math.Round((double)previousSoldUnits / previousSuccessfulOrdersCount, 2, MidpointRounding.AwayFromZero)
            : 0d;

        return Results.Ok(new
        {
            period = new
            {
                dateFrom = resolvedDateFrom,
                dateTo = resolvedDateTo,
                fromTimestamp,
                toTimestamp,
                days = periodDays
            },
            comparison = new
            {
                previousPeriod = new
                {
                    dateFrom = previousDateFrom,
                    dateTo = previousDateTo,
                    fromTimestamp = previousFromTimestamp,
                    toTimestamp = previousToTimestamp,
                    days = previousPeriodDays
                },
                previousSummary = new
                {
                    ordersCount = previousOrders.Count,
                    successfulOrdersCount = previousSuccessfulOrdersCount,
                    deliveredOrdersCount = previousDeliveredOrdersCount,
                    canceledOrdersCount = previousCanceledOrdersCount,
                    soldUnits = previousSoldUnits,
                    revenueAmount = Math.Round(previousRevenueAmount, 2, MidpointRounding.AwayFromZero),
                    shippingRevenueAmount = Math.Round(previousShippingRevenueAmount, 2, MidpointRounding.AwayFromZero),
                    averageOrderValue = previousAverageOrderValue,
                    averageItemsPerOrder = previousAverageItemsPerOrder,
                    newUsersCount = previousUsersInPeriod.Count,
                    favoritesAddedCount = previousFavoritesAddedCount,
                    favoritesRemovedCount = previousFavoritesRemovedCount,
                    favoriteUsersCount = previousFavoriteUsersCount,
                    loginEventsCount = previousLoginEventsCount,
                    totalViewEvents = previousTotalViewEvents,
                    totalUniqueViewers = previousTotalUniqueViewers,
                    viewedProductsCount = previousViewedProductsCount
                }
            },
            snapshot = new
            {
                totalProducts,
                visibleProducts,
                hiddenProducts,
                currentStockUnits,
                visibleInStockProducts,
                outOfStockVisibleProducts,
                lowStockVisibleProducts,
                totalFavorites,
                uniqueFavoriteUsers,
                totalUsers = await _db.Users.AsNoTracking().CountAsync()
            },
            periodSummary = new
            {
                ordersCount = orders.Count,
                successfulOrdersCount,
                deliveredOrdersCount,
                canceledOrdersCount,
                soldUnits,
                revenueAmount = Math.Round(revenueAmount, 2, MidpointRounding.AwayFromZero),
                shippingRevenueAmount = Math.Round(shippingRevenueAmount, 2, MidpointRounding.AwayFromZero),
                averageOrderValue,
                averageItemsPerOrder,
                newUsersCount = usersInPeriod.Count,
                favoritesAddedCount,
                favoritesRemovedCount,
                favoriteUsersCount,
                loginEventsCount,
                totalViewEvents,
                totalUniqueViewers,
                viewedProductsCount
            },
            orders = new
            {
                byStatus = AdminAnalyticsSupport.BuildBucketPayload(
                    ordersByStatus,
                    AdminAnalyticsSupport.GetOrderStatusLabel,
                    "status"),
                byPurchaseChannel = AdminAnalyticsSupport.BuildBucketPayload(
                    ordersByPurchaseChannel,
                    AdminAnalyticsSupport.GetPurchaseChannelLabel,
                    "purchaseChannel"),
                byShippingMethod = AdminAnalyticsSupport.BuildBucketPayload(
                    ordersByShippingMethod,
                    AdminAnalyticsSupport.GetShippingMethodLabel,
                    "shippingMethod")
            },
            payments = new
            {
                byMethod = AdminAnalyticsSupport.BuildBucketPayload(
                    ordersByPaymentMethod,
                    AdminAnalyticsSupport.GetPaymentMethodLabel,
                    "paymentMethod"),
                byGroup = AdminAnalyticsSupport.BuildBucketPayload(
                    ordersByPaymentGroup,
                    AdminAnalyticsSupport.GetPaymentGroupLabel,
                    "paymentGroup"),
                byProvider = AdminAnalyticsSupport.BuildBucketPayload(
                    ordersByPaymentProvider,
                    AdminAnalyticsSupport.GetPaymentProviderLabel,
                    "paymentProvider")
            },
            users = new
            {
                registrationsByChannel = AdminAnalyticsSupport.BuildCountPayload(
                    registrationChannels,
                    AdminAnalyticsSupport.GetRegistrationChannelLabel,
                    "registrationChannel"),
                externalActiveUsersByProvider = AdminAnalyticsSupport.BuildCountPayload(
                    activeExternalUsersByProvider,
                    AdminAnalyticsSupport.GetExternalProviderLabel,
                    "externalProvider"),
                connectedExternalUsersByProvider = AdminAnalyticsSupport.BuildCountPayload(
                    connectedExternalUsersByProvider,
                    AdminAnalyticsSupport.GetExternalProviderLabel,
                    "externalProvider"),
                loginsByProvider = AdminAnalyticsSupport.BuildCountPayload(
                    loginCounts,
                    AdminAnalyticsSupport.GetAuthProviderLabel,
                    "authProvider")
            },
            products = new
            {
                topPopular = productMetrics.Values
                    .Where(x => x.UniqueViewers > 0)
                    .OrderByDescending(x => x.UniqueViewers)
                    .ThenByDescending(x => x.TotalViews)
                    .ThenByDescending(x => x.FavoritesCount)
                    .ThenBy(x => x.Name)
                    .Take(10)
                    .Select(AdminAnalyticsSupport.BuildProductMetricPayload),
                topSold = productMetrics.Values
                    .Where(x => x.SoldUnits > 0)
                    .OrderByDescending(x => x.SoldUnits)
                    .ThenByDescending(x => x.RevenueAmount)
                    .ThenByDescending(x => x.OrdersCount)
                    .ThenBy(x => x.Name)
                    .Take(10)
                    .Select(AdminAnalyticsSupport.BuildProductMetricPayload),
                topWishlisted = productMetrics.Values
                    .Where(x => x.FavoriteAddsCount > 0)
                    .OrderByDescending(x => x.FavoriteAddsCount)
                    .ThenByDescending(x => x.FavoritesCount)
                    .ThenByDescending(x => x.UniqueViewers)
                    .ThenBy(x => x.Name)
                    .Take(10)
                    .Select(AdminAnalyticsSupport.BuildProductMetricPayload)
            },
            trends = new
            {
                daily = AdminAnalyticsSupport.BuildTimelinePayload(timeline)
            }
        });
    }

    [HttpGet("users")]
    public async Task<IResult> Users()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var profiles = await _db.Profiles.ToDictionaryAsync(x => x.UserId, x => x);
        var orderCounts = await _db.Orders
            .AsNoTracking()
            .GroupBy(x => x.UserId)
            .Select(x => new { UserId = x.Key, Count = x.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count);
        var users = await _db.Users.OrderBy(x => x.CreatedAt).ToListAsync();

        return Results.Ok(users.Select(u => new
        {
            u.Id,
            Email = TechnicalEmailHelper.HideIfTechnical(profiles.GetValueOrDefault(u.Id)?.Email) is { Length: > 0 } visibleProfileEmail
                ? visibleProfileEmail
                : TechnicalEmailHelper.HideIfTechnical(u.Email),
            u.Verified,
            u.IsAdmin,
            u.IsBlocked,
            u.IsSystem,
            u.CreatedAt,
            ordersCount = orderCounts.GetValueOrDefault(u.Id),
            profile = profiles.TryGetValue(u.Id, out var p)
                ? new { p.Name, p.Phone, p.Nickname, p.ShippingAddress, p.PhoneVerified, p.EmailVerified }
                : null
        }));
    }

    [HttpPatch("users/{userId}")]
    public async Task<IResult> UpdateUser(string userId, [FromBody] AdminUserPatchPayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return Results.NotFound(new { detail = "User not found" });
        if (user.IsSystem)
        {
            if (payload.IsAdmin.HasValue && payload.IsAdmin.Value != user.IsAdmin)
                return Results.BadRequest(new { detail = "System user role cannot be changed" });
        }

        if (payload.IsBlocked.HasValue)
            user.IsBlocked = payload.IsBlocked.Value;
        if (payload.IsAdmin.HasValue && !user.IsSystem)
            user.IsAdmin = payload.IsAdmin.Value;

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == userId);
        if (profile is null)
        {
            profile = new Profile
            {
                UserId = userId,
                Email = TechnicalEmailHelper.IsTechnicalEmail(user.Email) ? string.Empty : user.Email,
                EmailVerified = user.Verified && TechnicalEmailHelper.IsValidRealEmail(user.Email)
            };
            _db.Profiles.Add(profile);
        }

        if (!string.IsNullOrWhiteSpace(payload.Email))
        {
            var normalizedEmail = payload.Email.Trim().ToLowerInvariant();
            if (!IsValidEmail(normalizedEmail))
                return Results.BadRequest(new { detail = "Invalid email" });

            var currentEmail = (user.Email ?? string.Empty).Trim().ToLowerInvariant();
            if (!string.Equals(normalizedEmail, currentEmail, StringComparison.Ordinal))
            {
                if (await _db.Users.AnyAsync(x => x.Email == normalizedEmail && x.Id != userId))
                    return Results.BadRequest(new { detail = "Email already in use" });

                user.Email = normalizedEmail;
                user.Verified = true;
                profile.Email = normalizedEmail;
                profile.EmailVerified = true;
            }
        }

        if (payload.Name is not null)
            profile.Name = NormalizeOptionalText(payload.Name);

        if (payload.Nickname is not null)
            profile.Nickname = NormalizeOptionalText(payload.Nickname);

        if (payload.ShippingAddress is not null)
        {
            profile.ShippingAddress = NormalizeOptionalText(payload.ShippingAddress);
            profile.ShippingAddressesJson = ProfileAddressBook.Serialize(null, profile.ShippingAddress);
        }

        if (payload.Phone is not null)
        {
            var normalizedPhone = NormalizeOptionalText(payload.Phone);
            var currentPhone = NormalizeOptionalText(profile.Phone);
            if (!string.Equals(normalizedPhone, currentPhone, StringComparison.Ordinal))
            {
                profile.Phone = normalizedPhone;
                profile.PhoneVerified = false;
            }
        }

        if (!string.IsNullOrWhiteSpace(payload.Password))
        {
            var trimmedPassword = payload.Password.Trim();
            if (!IsStrongPassword(trimmedPassword))
                return Results.BadRequest(new { detail = "Password is too weak" });

            var iterations = _configuration.GetValue<int?>("Security:PasswordHashIterations") ?? 100_000;
            var (hash, salt) = AuthService.HashPassword(trimmedPassword, iterations);
            user.PasswordHash = hash;
            user.Salt = salt;

            _db.Sessions.RemoveRange(_db.Sessions.Where(x => x.UserId == userId));
            _db.RefreshSessions.RemoveRange(_db.RefreshSessions.Where(x => x.UserId == userId));
        }

        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    [HttpDelete("users/{userId}")]
    public async Task<IResult> DeleteUser(string userId)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return Results.Ok(new { ok = true });
        if (user.IsSystem)
            return Results.BadRequest(new { detail = "System user cannot be deleted" });

        _db.Sessions.RemoveRange(_db.Sessions.Where(x => x.UserId == userId));
        _db.AdminSessions.RemoveRange(_db.AdminSessions.Where(x => x.UserId == userId));
        _db.RefreshSessions.RemoveRange(_db.RefreshSessions.Where(x => x.UserId == userId));
        _db.CartItems.RemoveRange(_db.CartItems.Where(x => x.UserId == userId));
        _db.Likes.RemoveRange(_db.Likes.Where(x => x.UserId == userId));
        _db.Orders.RemoveRange(_db.Orders.Where(x => x.UserId == userId));
        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == userId);
        if (profile is not null)
            _db.Profiles.Remove(profile);
        _db.Users.Remove(user);

        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }


    [HttpPost("telegram-bots/validate")]
    [HttpPost("telegram-bots/check")]
    public async Task<IResult> ValidateTelegramBot([FromBody] TelegramBotValidatePayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            var info = await _telegramBotManager.ValidateTokenAsync(payload.Token);
            return Results.Ok(info);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpGet("telegram-bots")]
    public async Task<IResult> TelegramBots()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        return Results.Ok(await _telegramBotManager.GetBotsAsync());
    }

    [HttpPost("telegram-bots")]
    public async Task<IResult> CreateTelegramBot([FromBody] TelegramBotPayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            return Results.Ok(await _telegramBotManager.CreateBotAsync(payload));
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPatch("telegram-bots/{id}")]
    public async Task<IResult> UpdateTelegramBot(string id, [FromBody] TelegramBotPatchPayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            var bot = await _telegramBotManager.UpdateBotAsync(id, payload);
            return bot is null ? Results.NotFound(new { detail = "Bot not found" }) : Results.Ok(bot);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpDelete("telegram-bots/{id}")]
    public async Task<IResult> DeleteTelegramBot(string id)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        await _telegramBotManager.DeleteBotAsync(id);
        return Results.Ok(new { ok = true });
    }

    [HttpPost("telegram-bots/{id}/check")]
    public async Task<IResult> CheckTelegramBot(string id)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            var bot = await _telegramBotManager.CheckBotAsync(id);
            return bot is null ? Results.NotFound(new { detail = "Bot not found" }) : Results.Ok(bot);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpGet("settings")]
    public async Task<IResult> Settings()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var all = await _db.AppSettings.ToListAsync();
        return Results.Ok(all.ToDictionary(x => x.Key, x => x.Value));
    }

    [HttpGet("preferences")]
    public async Task<IResult> Preferences()
    {
        var admin = await RequireAdminUserAsync();
        if (admin is null) return Results.Unauthorized();

        var profile = await _db.Profiles
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.UserId == admin.Id);

        return Results.Ok(ParseAdminPreferences(profile?.AdminPreferencesJson));
    }

    [HttpPost("preferences")]
    public async Task<IResult> SavePreferences([FromBody] Dictionary<string, string> payload)
    {
        var admin = await RequireAdminUserAsync();
        if (admin is null) return Results.Unauthorized();

        var profile = await _db.Profiles.FirstOrDefaultAsync(x => x.UserId == admin.Id);
        if (profile is null)
        {
            profile = new Profile
            {
                UserId = admin.Id,
                Email = admin.Email,
            };
            _db.Profiles.Add(profile);
        }

        var preferences = ParseAdminPreferences(profile.AdminPreferencesJson);
        foreach (var (key, value) in payload)
        {
            var normalizedKey = key?.Trim();
            if (string.IsNullOrWhiteSpace(normalizedKey))
                continue;

            preferences[normalizedKey] = value ?? string.Empty;
        }

        profile.AdminPreferencesJson = JsonSerializer.Serialize(preferences);
        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    [HttpPost("settings")]
    public async Task<IResult> SaveSettings([FromBody] Dictionary<string, string> payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        foreach (var (key, value) in payload)
        {
            var row = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == key);
            if (row is null)
            {
                _db.AppSettings.Add(new AppSetting { Key = key, Value = value ?? string.Empty });
                continue;
            }

            row.Value = value ?? string.Empty;
        }

        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    [HttpGet("database-backups")]
    public async Task<IResult> GetDatabaseBackups(CancellationToken cancellationToken)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        var overview = await _databaseBackupService.GetOverviewAsync(cancellationToken);
        return Results.Ok(new
        {
            automaticEnabled = overview.AutomaticEnabled,
            scheduleLocal = overview.ScheduleLocal,
            retentionDays = overview.RetentionDays,
            rootDirectory = overview.RootDirectory,
            timeZone = overview.TimeZone,
            pgDumpCommand = overview.PgDumpCommand,
            items = overview.Items.Select(item => new
            {
                item.FileName,
                item.RelativePath,
                item.SizeBytes,
                item.CreatedAt,
                item.Trigger,
                downloadUrl = $"/admin/database-backups/download?relativePath={Uri.EscapeDataString(item.RelativePath)}"
            })
        });
    }

    [HttpPost("database-backups")]
    public async Task<IResult> CreateDatabaseBackup(CancellationToken cancellationToken)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            var createdBackup = await _databaseBackupService.CreateManualBackupAsync(cancellationToken);
            return Results.Ok(new
            {
                backup = new
                {
                    createdBackup.Backup.FileName,
                    createdBackup.Backup.RelativePath,
                    createdBackup.Backup.SizeBytes,
                    createdBackup.Backup.CreatedAt,
                    createdBackup.Backup.Trigger
                },
                downloadUrl = createdBackup.DownloadPath
            });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpGet("database-backups/download")]
    public async Task<IResult> DownloadDatabaseBackup([FromQuery] string? relativePath)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        var resolvedPath = _databaseBackupService.ResolveBackupPath(relativePath);
        if (string.IsNullOrWhiteSpace(resolvedPath))
            return Results.NotFound(new { detail = "Backup file not found" });

        var fileName = Path.GetFileName(resolvedPath);
        return Results.File(
            resolvedPath,
            "application/octet-stream",
            fileName,
            enableRangeProcessing: true);
    }

    [HttpPost("settings/smtp/test-email")]
    public async Task<IResult> SendSmtpTestEmail([FromBody] SmtpTestEmailPayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        var result = await _emailService.SendTestEmailAsync(payload);
        if (!result.Success)
            return Results.BadRequest(new { detail = result.Detail });

        return Results.Ok(new { ok = true, detail = result.Detail });
    }

    [HttpPost("settings/yoomoney/test")]
    public async Task<IResult> TestYooMoney([FromBody] YooMoneyAdminTestPayload payload, CancellationToken cancellationToken)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            var result = await _yooMoneyPaymentService.TestIntegrationAsync(
                new YooMoneyIntegrationOverrides(
                    Enabled: payload.Enabled,
                    WalletNumber: payload.WalletNumber,
                    NotificationSecret: payload.NotificationSecret,
                    AccessToken: payload.AccessToken,
                    LabelPrefix: payload.LabelPrefix,
                    PaymentTimeoutMinutes: payload.PaymentTimeoutMinutes,
                    AllowBankCards: payload.AllowBankCards,
                    AllowWallet: payload.AllowWallet),
                payload.PaymentMethod,
                payload.Amount,
                payload.ReturnUrl,
                cancellationToken);

            return Results.Ok(new
            {
                provider = "yoomoney",
                paymentMethod = result.PaymentMethod,
                paymentType = result.PaymentType,
                requestedAmount = result.RequestedAmount,
                chargeAmount = result.ChargeAmount,
                expectedReceivedAmount = result.ExpectedReceivedAmount,
                walletNumber = result.WalletNumber,
                checkoutAction = result.CheckoutAction,
                checkoutMethod = result.CheckoutMethod,
                checkoutFields = result.CheckoutFields,
                tokenValid = result.TokenValid,
                tokenDetail = result.TokenDetail,
                lastOperation = result.LastOperation is null
                    ? null
                    : new
                    {
                        operationId = result.LastOperation.OperationId,
                        status = result.LastOperation.Status,
                        dateTime = result.LastOperation.DateTime,
                        amount = result.LastOperation.Amount,
                        type = result.LastOperation.Type
                    },
                note = result.Note
            });
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPost("settings/yookassa/test")]
    public async Task<IResult> TestYooKassa([FromBody] YooKassaAdminTestPayload payload, CancellationToken cancellationToken)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            var result = await _yooKassaPaymentService.TestIntegrationAsync(
                new YooKassaIntegrationOverrides(
                    Enabled: payload.Enabled,
                    ShopId: payload.ShopId,
                    SecretKey: payload.SecretKey,
                    TestMode: payload.TestMode,
                    LabelPrefix: payload.LabelPrefix,
                    PaymentTimeoutMinutes: payload.PaymentTimeoutMinutes,
                    AllowBankCards: payload.AllowBankCards,
                    AllowSbp: payload.AllowSbp,
                    AllowYooMoney: payload.AllowYooMoney),
                payload.PaymentMethod,
                payload.Amount,
                payload.ReturnUrl,
                cancellationToken);

            return Results.Ok(new
            {
                provider = "yookassa",
                mode = result.Mode,
                testMode = result.TestMode,
                paymentMethod = result.PaymentMethod,
                paymentType = result.PaymentType,
                amount = result.Amount,
                currency = result.Currency,
                status = result.Status,
                detail = result.Detail,
                paymentId = result.PaymentId,
                confirmationUrl = result.ConfirmationUrl,
                createdAt = result.CreatedAt,
                paid = result.Paid
            });
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPost("settings/yandex-delivery/test")]
    public async Task<IResult> TestYandexDelivery([FromBody] YandexDeliveryAdminTestPayload payload, CancellationToken cancellationToken)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();

        try
        {
            var overrides = new YandexDeliveryIntegrationOverrides(
                Enabled: payload.Enabled,
                UseTestEnvironment: payload.UseTestEnvironment,
                ApiToken: payload.ApiToken,
                SourceStationId: payload.SourceStationId,
                PackageLengthCm: payload.PackageLengthCm,
                PackageHeightCm: payload.PackageHeightCm,
                PackageWidthCm: payload.PackageWidthCm);

            var quote = await _yandexDeliveryQuoteService.CalculateAsync(
                new YandexDeliveryCalculatePayload(
                    ToAddress: payload.ToAddress,
                    WeightKg: payload.WeightKg,
                    DeclaredCost: payload.DeclaredCost),
                overrides,
                cancellationToken);

            var pickupPoints = await _yandexDeliveryQuoteService.ListPickupPointsAsync(
                new YandexDeliveryPickupPointsPayload(
                    ToAddress: payload.ToAddress,
                    Limit: 3,
                    WeightKg: payload.WeightKg,
                    DeclaredCost: payload.DeclaredCost),
                overrides,
                cancellationToken);
            var firstPickupPoint = pickupPoints.FirstOrDefault();
            var pickupPointQuote = firstPickupPoint is null
                ? null
                : await _yandexDeliveryQuoteService.CalculateAsync(
                    new YandexDeliveryCalculatePayload(
                        ToAddress: payload.ToAddress,
                        WeightKg: payload.WeightKg,
                        DeclaredCost: payload.DeclaredCost,
                        PickupPointId: firstPickupPoint.Id),
                    overrides,
                    cancellationToken);

            return Results.Ok(new
            {
                provider = quote.Provider,
                currency = quote.Currency,
                toAddress = quote.DestinationAddress,
                homeDelivery = new
                {
                    available = quote.HomeDelivery.Available,
                    estimatedCost = quote.HomeDelivery.EstimatedCost,
                    deliveryDays = quote.HomeDelivery.DeliveryDays,
                    tariff = quote.HomeDelivery.Tariff,
                    error = quote.HomeDelivery.Error
                },
                pickupPointDelivery = pickupPointQuote is null
                    ? null
                    : new
                    {
                        available = pickupPointQuote.NearestPickupPointDelivery.Available,
                        estimatedCost = pickupPointQuote.NearestPickupPointDelivery.EstimatedCost,
                        deliveryDays = pickupPointQuote.NearestPickupPointDelivery.DeliveryDays,
                        tariff = pickupPointQuote.NearestPickupPointDelivery.Tariff,
                        error = pickupPointQuote.NearestPickupPointDelivery.Error,
                        point = pickupPointQuote.NearestPickupPointDelivery.Point is null
                            ? null
                            : new
                            {
                                id = pickupPointQuote.NearestPickupPointDelivery.Point.Id,
                                name = pickupPointQuote.NearestPickupPointDelivery.Point.Name,
                                address = pickupPointQuote.NearestPickupPointDelivery.Point.Address,
                                instruction = pickupPointQuote.NearestPickupPointDelivery.Point.Instruction,
                                distanceKm = pickupPointQuote.NearestPickupPointDelivery.Point.DistanceKm
                            }
                    },
                pickupPoints = pickupPoints.Select(point => new
                {
                    id = point.Id,
                    name = point.Name,
                    address = point.Address,
                    instruction = point.Instruction,
                    distanceKm = point.DistanceKm,
                    available = point.Available,
                    estimatedCost = point.EstimatedCost,
                    deliveryDays = point.DeliveryDays,
                    error = point.Error
                }),
                details = new
                {
                    testEnvironment = quote.Details.TestEnvironment,
                    sourceStationId = quote.Details.SourceStationId,
                    requestedWeightKg = quote.Details.RequestedWeightKg,
                    declaredCost = quote.Details.DeclaredCost
                }
            });
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            return Results.BadRequest(new { detail = ex.Message });
        }
    }



    [HttpGet("dictionaries")]
    public async Task<IResult> GetDictionaries()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        return Results.Ok(new
        {
            sizes = await GetOrderedDictionaryItemsAsync(_db.SizeDictionaries),
            materials = await GetOrderedDictionaryItemsAsync(_db.MaterialDictionaries),
            colors = await GetOrderedDictionaryItemsAsync(_db.ColorDictionaries),
            categories = await GetOrderedDictionaryItemsAsync(_db.CategoryDictionaries),
            collections = await GetOrderedDictionaryItemsAsync(_db.CollectionDictionaries)
        });
    }

    [HttpPost("dictionaries/{kind}")]
    public async Task<IResult> CreateDictionaryItem(string kind, [FromBody] DictionaryItemPayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var name = payload.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name))
            return Results.BadRequest(new { detail = "Название обязательно" });

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var description = NormalizeOptionalText(payload.Description);
        var color = NormalizeOptionalColor(payload.Color);
        var imageUrl = NormalizeOptionalText(payload.ImageUrl);
        var previewMode = NormalizeCollectionPreviewMode(payload.PreviewMode);
        var isActive = payload.IsActive ?? true;
        var showInCatalogFilter = payload.ShowInCatalogFilter ?? true;
        var showColorInCatalog = payload.ShowColorInCatalog ?? true;
        object createdItem;
        string duplicateNameMessage;
        const string duplicateSlugMessage = "Slug уже существует";

        switch (kind.ToLowerInvariant())
        {
            case "sizes":
                duplicateNameMessage = "Размер уже существует";
                var sizeSlug = await ResolveDictionarySlugAsync(_db.SizeDictionaries, payload.Slug, name);
                if (string.IsNullOrWhiteSpace(sizeSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.SizeDictionaries, name))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.SizeDictionaries, sizeSlug))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                var size = new SizeDictionary
                {
                    Name = name,
                    Slug = sizeSlug,
                    Description = description,
                    Color = color,
                    IsActive = isActive,
                    ShowInCatalogFilter = showInCatalogFilter,
                    ShowColorInCatalog = showColorInCatalog,
                    SortOrder = NormalizeSortOrder(payload.SortOrder, await GetNextDictionarySortOrderAsync(_db.SizeDictionaries)),
                    CreatedAt = now
                };
                _db.SizeDictionaries.Add(size);
                createdItem = size;
                break;
            case "materials":
                duplicateNameMessage = "Материал уже существует";
                var materialSlug = await ResolveDictionarySlugAsync(_db.MaterialDictionaries, payload.Slug, name);
                if (string.IsNullOrWhiteSpace(materialSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.MaterialDictionaries, name))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.MaterialDictionaries, materialSlug))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                var material = new MaterialDictionary
                {
                    Name = name,
                    Slug = materialSlug,
                    Description = description,
                    Color = color,
                    IsActive = isActive,
                    ShowInCatalogFilter = showInCatalogFilter,
                    ShowColorInCatalog = showColorInCatalog,
                    SortOrder = NormalizeSortOrder(payload.SortOrder, await GetNextDictionarySortOrderAsync(_db.MaterialDictionaries)),
                    CreatedAt = now
                };
                _db.MaterialDictionaries.Add(material);
                createdItem = material;
                break;
            case "colors":
                duplicateNameMessage = "Цвет уже существует";
                var colorSlug = await ResolveDictionarySlugAsync(_db.ColorDictionaries, payload.Slug, name);
                if (string.IsNullOrWhiteSpace(colorSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.ColorDictionaries, name))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.ColorDictionaries, colorSlug))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                var colorDictionary = new ColorDictionary
                {
                    Name = name,
                    Slug = colorSlug,
                    Description = description,
                    Color = color,
                    IsActive = isActive,
                    ShowInCatalogFilter = showInCatalogFilter,
                    ShowColorInCatalog = showColorInCatalog,
                    SortOrder = NormalizeSortOrder(payload.SortOrder, await GetNextDictionarySortOrderAsync(_db.ColorDictionaries)),
                    CreatedAt = now
                };
                _db.ColorDictionaries.Add(colorDictionary);
                createdItem = colorDictionary;
                break;
            case "categories":
                duplicateNameMessage = "Категория уже существует";
                var categorySlug = await ResolveDictionarySlugAsync(_db.CategoryDictionaries, payload.Slug, name);
                if (string.IsNullOrWhiteSpace(categorySlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.CategoryDictionaries, name))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.CategoryDictionaries, categorySlug))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                var category = new CategoryDictionary
                {
                    Name = name,
                    Slug = categorySlug,
                    Description = description,
                    Color = color,
                    IsActive = isActive,
                    ShowInCatalogFilter = showInCatalogFilter,
                    ShowColorInCatalog = showColorInCatalog,
                    SortOrder = NormalizeSortOrder(payload.SortOrder, await GetNextDictionarySortOrderAsync(_db.CategoryDictionaries)),
                    CreatedAt = now
                };
                _db.CategoryDictionaries.Add(category);
                createdItem = category;
                break;
            case "collections":
                duplicateNameMessage = "Коллекция уже существует";
                var collectionSlug = await ResolveDictionarySlugAsync(_db.CollectionDictionaries, payload.Slug, name);
                if (string.IsNullOrWhiteSpace(collectionSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.CollectionDictionaries, name))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.CollectionDictionaries, collectionSlug))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                var collection = new CollectionDictionary
                {
                    Name = name,
                    Slug = collectionSlug,
                    Description = description,
                    Color = color,
                    ImageUrl = imageUrl,
                    PreviewMode = previewMode,
                    IsActive = isActive,
                    ShowInCatalogFilter = false,
                    ShowColorInCatalog = showColorInCatalog,
                    SortOrder = NormalizeSortOrder(payload.SortOrder, await GetNextDictionarySortOrderAsync(_db.CollectionDictionaries)),
                    CreatedAt = now
                };
                _db.CollectionDictionaries.Add(collection);
                createdItem = collection;
                break;
            default:
                return Results.BadRequest(new { detail = "Неизвестный словарь" });
        }

        var createSaveResult = await TrySaveDictionaryChangesAsync(duplicateNameMessage, duplicateSlugMessage);
        if (createSaveResult is not null)
            return createSaveResult;

        return Results.Ok(createdItem);
    }



    [HttpPatch("dictionaries/{kind}/{id}")]
    public async Task<IResult> UpdateDictionaryItem(string kind, string id, [FromBody] DictionaryItemPatchPayload payload)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var name = payload.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name))
            return Results.BadRequest(new { detail = "Название обязательно" });

        var description = NormalizeOptionalText(payload.Description);
        var colorValue = NormalizeOptionalColor(payload.Color);
        var imageUrl = NormalizeOptionalText(payload.ImageUrl);
        var previewMode = NormalizeCollectionPreviewMode(payload.PreviewMode);
        var isActive = payload.IsActive ?? true;
        var showInCatalogFilter = payload.ShowInCatalogFilter ?? true;
        var showColorInCatalog = payload.ShowColorInCatalog ?? true;
        string duplicateNameMessage;
        const string duplicateSlugMessage = "Slug уже существует";

        switch (kind.ToLowerInvariant())
        {
            case "sizes":
                duplicateNameMessage = "Размер уже существует";
                var size = await _db.SizeDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (size is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                var previousSizeName = size.Name;
                var previousSizeSlug = size.Slug;
                var resolvedSizeSlug = await ResolveDictionarySlugAsync(_db.SizeDictionaries, payload.Slug ?? size.Slug, name, id);
                if (string.IsNullOrWhiteSpace(resolvedSizeSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.SizeDictionaries, name, id))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.SizeDictionaries, resolvedSizeSlug, id))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                size.Name = name;
                size.Slug = resolvedSizeSlug;
                size.Description = description;
                size.Color = colorValue;
                size.IsActive = isActive;
                size.ShowInCatalogFilter = showInCatalogFilter;
                size.ShowColorInCatalog = showColorInCatalog;
                size.SortOrder = NormalizeSortOrder(payload.SortOrder, size.SortOrder);
                if (ReferenceValueChanged(previousSizeName, size.Name, previousSizeSlug, size.Slug))
                {
                    await UpdateProductSizeReferencesAsync(size.Name, previousSizeName, previousSizeSlug);
                }
                break;
            case "materials":
                duplicateNameMessage = "Материал уже существует";
                var material = await _db.MaterialDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (material is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                var previousMaterialName = material.Name;
                var previousMaterialSlug = material.Slug;
                var resolvedMaterialSlug = await ResolveDictionarySlugAsync(_db.MaterialDictionaries, payload.Slug ?? material.Slug, name, id);
                if (string.IsNullOrWhiteSpace(resolvedMaterialSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.MaterialDictionaries, name, id))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.MaterialDictionaries, resolvedMaterialSlug, id))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                material.Name = name;
                material.Slug = resolvedMaterialSlug;
                material.Description = description;
                material.Color = colorValue;
                material.IsActive = isActive;
                material.ShowInCatalogFilter = showInCatalogFilter;
                material.ShowColorInCatalog = showColorInCatalog;
                material.SortOrder = NormalizeSortOrder(payload.SortOrder, material.SortOrder);
                if (ReferenceValueChanged(previousMaterialName, material.Name, previousMaterialSlug, material.Slug))
                {
                    await UpdateProductLookupReferencesAsync("material", material.Name, previousMaterialName, previousMaterialSlug);
                }
                break;
            case "colors":
                duplicateNameMessage = "Цвет уже существует";
                var color = await _db.ColorDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (color is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                var previousColorName = color.Name;
                var previousColorSlug = color.Slug;
                var resolvedColorSlug = await ResolveDictionarySlugAsync(_db.ColorDictionaries, payload.Slug ?? color.Slug, name, id);
                if (string.IsNullOrWhiteSpace(resolvedColorSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.ColorDictionaries, name, id))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.ColorDictionaries, resolvedColorSlug, id))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                color.Name = name;
                color.Slug = resolvedColorSlug;
                color.Description = description;
                color.Color = colorValue;
                color.IsActive = isActive;
                color.ShowInCatalogFilter = showInCatalogFilter;
                color.ShowColorInCatalog = showColorInCatalog;
                color.SortOrder = NormalizeSortOrder(payload.SortOrder, color.SortOrder);
                if (ReferenceValueChanged(previousColorName, color.Name, previousColorSlug, color.Slug))
                {
                    await UpdateProductLookupReferencesAsync("color", color.Name, previousColorName, previousColorSlug);
                }
                break;
            case "categories":
                duplicateNameMessage = "Категория уже существует";
                var category = await _db.CategoryDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (category is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                var previousCategoryName = category.Name;
                var previousCategorySlug = category.Slug;
                var resolvedCategorySlug = await ResolveDictionarySlugAsync(_db.CategoryDictionaries, payload.Slug ?? category.Slug, name, id);
                if (string.IsNullOrWhiteSpace(resolvedCategorySlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.CategoryDictionaries, name, id))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.CategoryDictionaries, resolvedCategorySlug, id))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                category.Name = name;
                category.Slug = resolvedCategorySlug;
                category.Description = description;
                category.Color = colorValue;
                category.IsActive = isActive;
                category.ShowInCatalogFilter = showInCatalogFilter;
                category.ShowColorInCatalog = showColorInCatalog;
                category.SortOrder = NormalizeSortOrder(payload.SortOrder, category.SortOrder);
                if (ReferenceValueChanged(previousCategoryName, category.Name, previousCategorySlug, category.Slug))
                {
                    await UpdateProductLookupReferencesAsync("category", category.Name, previousCategoryName, previousCategorySlug);
                }
                break;
            case "collections":
                duplicateNameMessage = "Коллекция уже существует";
                var collection = await _db.CollectionDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (collection is null) return Results.NotFound(new { detail = "Элемент словаря не найден" });
                var previousCollectionName = collection.Name;
                var previousCollectionSlug = collection.Slug;
                var resolvedCollectionSlug = await ResolveDictionarySlugAsync(_db.CollectionDictionaries, payload.Slug ?? collection.Slug, name, id);
                if (string.IsNullOrWhiteSpace(resolvedCollectionSlug))
                    return Results.BadRequest(new { detail = "Slug должен быть латиницей" });
                if (await DictionaryNameExistsAsync(_db.CollectionDictionaries, name, id))
                    return Results.BadRequest(new { detail = duplicateNameMessage });
                if (await DictionarySlugExistsAsync(_db.CollectionDictionaries, resolvedCollectionSlug, id))
                    return Results.BadRequest(new { detail = duplicateSlugMessage });
                collection.Name = name;
                collection.Slug = resolvedCollectionSlug;
                collection.Description = description;
                collection.Color = colorValue;
                collection.ImageUrl = imageUrl;
                collection.PreviewMode = previewMode;
                collection.IsActive = isActive;
                collection.ShowInCatalogFilter = false;
                collection.ShowColorInCatalog = showColorInCatalog;
                collection.SortOrder = NormalizeSortOrder(payload.SortOrder, collection.SortOrder);
                if (ReferenceValueChanged(previousCollectionName, collection.Name, previousCollectionSlug, collection.Slug))
                {
                    await UpdateProductLookupReferencesAsync("collection", collection.Name, previousCollectionName, previousCollectionSlug);
                }
                break;
            default:
                return Results.BadRequest(new { detail = "Неизвестный словарь" });
        }

        var updateSaveResult = await TrySaveDictionaryChangesAsync(duplicateNameMessage, duplicateSlugMessage);
        if (updateSaveResult is not null)
            return updateSaveResult;

        return Results.Ok(new { ok = true });
    }

    [HttpDelete("dictionaries/{kind}/{id}")]
    public async Task<IResult> DeleteDictionaryItem(string kind, string id)
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        switch (kind.ToLowerInvariant())
        {
            case "sizes":
                if (await _db.ProductSizeStocks.AnyAsync(x => x.SizeId == id))
                    return Results.BadRequest(new { detail = "Размер используется в товарах, удаление запрещено" });
                var size = await _db.SizeDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (size is not null) _db.SizeDictionaries.Remove(size);
                break;
            case "materials":
                var material = await _db.MaterialDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (material is not null)
                {
                    var used = await IsProductDataValueInUseAsync("material", material.Name, material.Slug);
                    if (used) return Results.BadRequest(new { detail = "Материал используется в товарах, удаление запрещено" });
                    _db.MaterialDictionaries.Remove(material);
                }
                break;
            case "colors":
                var color = await _db.ColorDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (color is not null)
                {
                    var used = await IsProductDataValueInUseAsync("color", color.Name, color.Slug);
                    if (used) return Results.BadRequest(new { detail = "Цвет используется в товарах, удаление запрещено" });
                    _db.ColorDictionaries.Remove(color);
                }
                break;
            case "categories":
                var category = await _db.CategoryDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (category is not null)
                {
                    var used = await IsProductCategoryInUseAsync(category.Name, category.Slug);
                    if (used) return Results.BadRequest(new { detail = "Категория используется в товарах, удаление запрещено" });
                    _db.CategoryDictionaries.Remove(category);
                }
                break;
            case "collections":
                var collection = await _db.CollectionDictionaries.FirstOrDefaultAsync(x => x.Id == id);
                if (collection is not null)
                {
                    var used = await IsProductCollectionInUseAsync(collection.Name, collection.Slug);
                    if (used) return Results.BadRequest(new { detail = "Коллекция используется в товарах, удаление запрещено" });
                    _db.CollectionDictionaries.Remove(collection);
                }
                break;
            default:
                return Results.BadRequest(new { detail = "Неизвестный словарь" });
        }

        await _db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    }

    [HttpGet("history/stocks")]
    public async Task<IResult> GetStockHistory()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var users = await _db.Users.ToDictionaryAsync(x => x.Id, x => x.Email);
        var products = await _db.Products.ToDictionaryAsync(x => x.Id, x => x.Slug);
        var sizes = await _db.SizeDictionaries.ToDictionaryAsync(x => x.Id, x => x.Name);
        var history = await _db.StockChangeHistories.OrderByDescending(x => x.ChangedAt).Take(500).ToListAsync();
        return Results.Ok(history.Select(x =>
        {
            var reason = string.IsNullOrWhiteSpace(x.Reason) ? "admin_manual" : x.Reason;
            var changedById = x.ChangedByUserId;
            return new
            {
                x.Id,
                x.ProductId,
                product = products.GetValueOrDefault(x.ProductId),
                x.SizeId,
                size = sizes.GetValueOrDefault(x.SizeId),
                x.OldValue,
                x.NewValue,
                x.ChangedAt,
                changedByUserId = changedById,
                changedBy = users.GetValueOrDefault(changedById),
                reason,
                x.OrderId
            };
        }));
    }

    [HttpGet("history/prices")]
    public async Task<IResult> GetPriceHistory()
    {
        if (await RequireAdminUserAsync() is null) return Results.Unauthorized();
        var users = await _db.Users.ToDictionaryAsync(x => x.Id, x => x.Email);
        var products = await _db.Products.ToDictionaryAsync(x => x.Id, x => x.Slug);
        var history = await _db.PriceChangeHistories.OrderByDescending(x => x.ChangedAt).Take(500).ToListAsync();
        return Results.Ok(history.Select(x => new
        {
            x.Id,
            x.ProductId,
            product = products.GetValueOrDefault(x.ProductId),
            x.FieldName,
            x.OldValue,
            x.NewValue,
            x.ChangedAt,
            x.ChangedByUserId,
            changedBy = users.GetValueOrDefault(x.ChangedByUserId)
        }));
    }




    private async Task<bool> IsProductDataValueInUseAsync(string field, params string?[] values)
    {
        var normalizedValues = values
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => NormalizeLookupValue(x!))
            .ToHashSet();

        if (normalizedValues.Count == 0)
            return false;

        var productsData = await _db.Products.AsNoTracking().Select(x => x.Data).ToListAsync();
        foreach (var data in productsData)
        {
            if (ProductDataContainsValue(data, GetProductDataAliases(field), normalizedValues))
            {
                return true;
            }
        }

        return false;
    }

    private async Task<bool> IsProductCategoryInUseAsync(params string?[] categoryValues)
    {
        var normalizedCategories = categoryValues
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => NormalizeLookupValue(x!))
            .ToHashSet();

        if (normalizedCategories.Count == 0)
            return false;

        var products = await _db.Products
            .AsNoTracking()
            .Select(x => new { x.Category, x.Data })
            .ToListAsync();

        return products.Any(product =>
            (!string.IsNullOrWhiteSpace(product.Category)
             && normalizedCategories.Contains(NormalizeLookupValue(product.Category!)))
            || ProductDataContainsValue(product.Data, GetProductDataAliases("category"), normalizedCategories));
    }

    private Task<bool> IsProductCollectionInUseAsync(params string?[] collectionValues)
        => IsProductDataValueInUseAsync("collection", collectionValues);

    private async Task UpdateProductLookupReferencesAsync(string field, string nextValue, params string?[] previousValues)
    {
        var normalizedPreviousValues = previousValues
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => NormalizeLookupValue(x!))
            .ToHashSet();

        if (normalizedPreviousValues.Count == 0 || string.IsNullOrWhiteSpace(nextValue))
            return;

        var products = await _db.Products.ToListAsync();
        foreach (var product in products)
        {
            if (string.Equals(field, "category", StringComparison.OrdinalIgnoreCase))
            {
                var currentCategory = product.Category?.Trim();
                if (!string.IsNullOrWhiteSpace(currentCategory) &&
                    normalizedPreviousValues.Contains(NormalizeLookupValue(currentCategory)))
                {
                    product.Category = nextValue;
                }
            }

            JsonObject? json;
            try
            {
                json = JsonNode.Parse(product.Data)?.AsObject();
            }
            catch
            {
                continue;
            }

            if (json is null)
                continue;

            if (ReplaceLookupReferencesInJson(json, GetProductDataAliases(field), normalizedPreviousValues, nextValue))
            {
                product.Data = json.ToJsonString();
            }
        }
    }

    private async Task UpdateProductSizeReferencesAsync(string nextValue, params string?[] previousValues)
    {
        var normalizedPreviousValues = previousValues
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => NormalizeLookupValue(x!))
            .ToHashSet();

        if (normalizedPreviousValues.Count == 0 || string.IsNullOrWhiteSpace(nextValue))
            return;

        var products = await _db.Products.ToListAsync();
        foreach (var product in products)
        {
            JsonObject? json;
            try
            {
                json = JsonNode.Parse(product.Data)?.AsObject();
            }
            catch
            {
                continue;
            }

            if (json is null)
                continue;

            var updatedSizes = ReplaceLookupReferencesInJson(json, ["sizes"], normalizedPreviousValues, nextValue);
            var updatedSizeStock = ReplaceSizeStockReferences(json, normalizedPreviousValues, nextValue);
            if (updatedSizes || updatedSizeStock)
            {
                product.Data = json.ToJsonString();
            }
        }
    }

    private static bool ReplaceLookupReferencesInJson(
        JsonObject json,
        IReadOnlyList<string> fields,
        ISet<string> normalizedPreviousValues,
        string nextValue)
    {
        var changed = false;

        foreach (var field in fields)
        {
            if (!json.TryGetPropertyValue(field, out var property) || property is null)
                continue;

            if (property is JsonArray array)
            {
                var nextValues = ReplaceLookupArrayValues(array, normalizedPreviousValues, nextValue, out var arrayChanged);
                if (arrayChanged)
                {
                    json[field] = new JsonArray(nextValues.Select(value => JsonValue.Create(value)).ToArray());
                    changed = true;
                }

                continue;
            }

            var currentValue = property.ToString()?.Trim();
            if (string.IsNullOrWhiteSpace(currentValue) ||
                !normalizedPreviousValues.Contains(NormalizeLookupValue(currentValue)))
            {
                continue;
            }

            json[field] = nextValue;
            changed = true;
        }

        return changed;
    }

    private static List<string> ReplaceLookupArrayValues(
        JsonArray array,
        ISet<string> normalizedPreviousValues,
        string nextValue,
        out bool changed)
    {
        changed = false;
        var result = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in array)
        {
            var currentValue = item?.ToString()?.Trim();
            if (string.IsNullOrWhiteSpace(currentValue))
            {
                changed = true;
                continue;
            }

            var replacementValue = normalizedPreviousValues.Contains(NormalizeLookupValue(currentValue))
                ? nextValue
                : currentValue;
            if (!string.Equals(currentValue, replacementValue, StringComparison.Ordinal))
            {
                changed = true;
            }

            if (!seen.Add(replacementValue))
            {
                changed = true;
                continue;
            }

            result.Add(replacementValue);
        }

        return result;
    }

    private static bool ReplaceSizeStockReferences(JsonObject json, ISet<string> normalizedPreviousValues, string nextValue)
    {
        if (json["sizeStock"] is not JsonObject sizeStock)
            return false;

        var changed = false;
        var rewritten = new JsonObject();
        foreach (var item in sizeStock)
        {
            var currentKey = item.Key?.Trim();
            if (string.IsNullOrWhiteSpace(currentKey))
            {
                changed = true;
                continue;
            }

            var rewrittenKey = normalizedPreviousValues.Contains(NormalizeLookupValue(currentKey))
                ? nextValue
                : currentKey;
            if (!string.Equals(currentKey, rewrittenKey, StringComparison.Ordinal))
            {
                changed = true;
            }

            if (!rewritten.TryGetPropertyValue(rewrittenKey, out _))
            {
                rewritten[rewrittenKey] = item.Value?.DeepClone();
            }
            else
            {
                changed = true;
            }
        }

        if (!changed)
            return false;

        json["sizeStock"] = rewritten;
        return true;
    }

    private static bool ReferenceValueChanged(string previousName, string nextName, string? previousSlug, string? nextSlug)
        => !string.Equals(previousName?.Trim(), nextName?.Trim(), StringComparison.Ordinal)
           || !string.Equals(previousSlug?.Trim(), nextSlug?.Trim(), StringComparison.Ordinal);

    private async Task<bool> DictionaryNameExistsAsync<T>(DbSet<T> set, string name, string? excludeId = null) where T : class
    {
        var normalizedName = NormalizeLookupValue(name);
        IQueryable<T> query = set.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(excludeId))
        {
            query = query.Where(x => EF.Property<string>(x, "Id") != excludeId);
        }

        return await query.AnyAsync(x => EF.Property<string>(x, "Name").Trim().ToLower() == normalizedName);
    }

    private async Task<bool> DictionarySlugExistsAsync<T>(DbSet<T> set, string slug, string? excludeId = null) where T : class
    {
        var normalizedSlug = NormalizeLookupValue(slug);
        IQueryable<T> query = set.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(excludeId))
        {
            query = query.Where(x => EF.Property<string>(x, "Id") != excludeId);
        }

        return await query.AnyAsync(x => EF.Property<string>(x, "Slug").Trim().ToLower() == normalizedSlug);
    }

    private async Task<List<T>> GetOrderedDictionaryItemsAsync<T>(DbSet<T> set) where T : class
    {
        return await set
            .AsNoTracking()
            .OrderBy(x => EF.Property<int>(x, "SortOrder"))
            .ThenBy(x => EF.Property<string>(x, "Name"))
            .ToListAsync();
    }

    private async Task<int> GetNextDictionarySortOrderAsync<T>(DbSet<T> set) where T : class
    {
        var currentMaxSortOrder = await set
            .AsNoTracking()
            .Select(x => (int?)EF.Property<int>(x, "SortOrder"))
            .MaxAsync();

        return Math.Max(0, currentMaxSortOrder ?? 0) + 1;
    }

    private async Task<string> ResolveDictionarySlugAsync<T>(DbSet<T> set, string? slugSource, string name, string? excludeId = null) where T : class
    {
        var baseSlug = string.IsNullOrWhiteSpace(slugSource)
            ? DictionarySlugService.Normalize(name)
            : NormalizeSlug(slugSource);

        if (string.IsNullOrWhiteSpace(baseSlug))
            return string.Empty;

        var slug = baseSlug;
        var suffix = 2;
        while (await DictionarySlugExistsAsync(set, slug, excludeId))
        {
            slug = $"{baseSlug}-{suffix}";
            suffix++;
        }

        return slug;
    }

    private async Task<IResult?> TrySaveDictionaryChangesAsync(string duplicateNameMessage, string duplicateSlugMessage)
    {
        try
        {
            await _db.SaveChangesAsync();
            return null;
        }
        catch (DbUpdateException ex) when (IsUniqueDictionaryNameViolation(ex))
        {
            return Results.BadRequest(new { detail = duplicateNameMessage });
        }
        catch (DbUpdateException ex) when (IsUniqueDictionarySlugViolation(ex))
        {
            return Results.BadRequest(new { detail = duplicateSlugMessage });
        }
    }

    private static List<Dictionary<string, object?>> ParseOrderHistory(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<Dictionary<string, object?>>>(raw) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static List<Dictionary<string, object?>> BuildOrderFieldChanges(
        Order order,
        string nextStatus,
        string nextShippingAddress,
        string nextPaymentMethod,
        string nextCustomerName,
        string nextCustomerEmail,
        string nextCustomerPhone,
        string? nextYandexRequestId)
    {
        var changes = new List<Dictionary<string, object?>>();

        AddOrderFieldChange(changes, "status", NormalizeOrderStatus(order.Status), nextStatus);
        AddOrderFieldChange(changes, "shippingAddress", order.ShippingAddress, nextShippingAddress);
        AddOrderFieldChange(changes, "paymentMethod", NormalizePaymentMethod(order.PaymentMethod), nextPaymentMethod);
        AddOrderFieldChange(changes, "customerName", order.CustomerName, nextCustomerName);
        AddOrderFieldChange(changes, "customerEmail", order.CustomerEmail, nextCustomerEmail);
        AddOrderFieldChange(changes, "customerPhone", order.CustomerPhone, nextCustomerPhone);
        AddOrderFieldChange(changes, "yandexRequestId", order.YandexRequestId, nextYandexRequestId);

        return changes;
    }

    private static void AddOrderFieldChange(List<Dictionary<string, object?>> changes, string field, object? oldValue, object? newValue)
    {
        var oldText = oldValue?.ToString()?.Trim() ?? string.Empty;
        var newText = newValue?.ToString()?.Trim() ?? string.Empty;
        if (string.Equals(oldText, newText, StringComparison.Ordinal))
            return;

        changes.Add(new Dictionary<string, object?>
        {
            ["field"] = field,
            ["oldValue"] = string.IsNullOrWhiteSpace(oldText) ? null : oldText,
            ["newValue"] = string.IsNullOrWhiteSpace(newText) ? null : newText
        });
    }

    private static bool TryParseOrderFilterDate(string? value, bool isEndOfDay, out long timestamp)
    {
        timestamp = 0;
        if (string.IsNullOrWhiteSpace(value))
            return false;

        if (!DateOnly.TryParseExact(value.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
            return false;

        var parsedDateTime = parsedDate.ToDateTime(isEndOfDay ? TimeOnly.MaxValue : TimeOnly.MinValue, DateTimeKind.Utc);
        timestamp = new DateTimeOffset(parsedDateTime).ToUnixTimeMilliseconds();
        return true;
    }

    private static int? TryParseOrderNumberSearch(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var digits = new string(value.Where(char.IsDigit).ToArray()).TrimStart('0');
        if (string.IsNullOrWhiteSpace(digits))
            return null;

        return int.TryParse(digits, out var parsed) && parsed > 0
            ? parsed
            : null;
    }

    private static bool IsInventoryReleasedStatus(string? status)
    {
        var normalized = NormalizeOrderStatus(status);
        return normalized is "canceled" or "returned";
    }

    private static string NormalizeOrderStatus(string? status)
    {
        var normalized = status?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "processing" : normalized;
    }

    private static string NormalizePaymentMethod(string? paymentMethod)
    {
        var normalized = paymentMethod?.Trim().ToLowerInvariant() ?? string.Empty;
        return string.IsNullOrWhiteSpace(normalized) ? "cod" : normalized;
    }

    private static bool IsUniqueDictionaryNameViolation(DbUpdateException ex)
        => ex.InnerException is PostgresException
        {
            SqlState: "23505",
            ConstraintName: "IX_size_dictionaries_name" or
                            "IX_material_dictionaries_name" or
                            "IX_color_dictionaries_name" or
                            "IX_category_dictionaries_name" or
                            "IX_collection_dictionaries_name"
        };

    private static bool IsUniqueDictionarySlugViolation(DbUpdateException ex)
        => ex.InnerException is PostgresException
        {
            SqlState: "23505",
            ConstraintName: "IX_size_dictionaries_slug" or
                            "IX_material_dictionaries_slug" or
                            "IX_color_dictionaries_slug" or
                            "IX_category_dictionaries_slug" or
                            "IX_collection_dictionaries_slug"
        };

    private static IReadOnlyList<string> GetProductDataAliases(string field) => field.ToLowerInvariant() switch
    {
        "category" => ["category", "categories"],
        "collection" => ["collection", "collections"],
        "material" => ["material", "materials"],
        "color" => ["color", "colors"],
        _ => [field]
    };

    private static bool ProductDataContainsValue(string data, IReadOnlyList<string> fields, ISet<string> normalizedValues)
    {
        if (normalizedValues.Count == 0)
            return false;

        if (string.IsNullOrWhiteSpace(data))
            return false;

        try
        {
            using var document = JsonDocument.Parse(data);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
                return false;

            foreach (var field in fields)
            {
                if (!document.RootElement.TryGetProperty(field, out var property))
                    continue;

                if (property.ValueKind == JsonValueKind.String)
                {
                    var value = property.GetString();
                    if (!string.IsNullOrWhiteSpace(value)
                        && normalizedValues.Contains(NormalizeLookupValue(value)))
                    {
                        return true;
                    }
                }

                if (property.ValueKind != JsonValueKind.Array)
                    continue;

                foreach (var item in property.EnumerateArray())
                {
                    if (item.ValueKind != JsonValueKind.String)
                        continue;

                    var value = item.GetString();
                    if (!string.IsNullOrWhiteSpace(value)
                        && normalizedValues.Contains(NormalizeLookupValue(value)))
                    {
                        return true;
                    }
                }
            }

            return false;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string NormalizeLookupValue(string value)
        => value.Trim().ToLowerInvariant();

    private static string NormalizeSlug(string? value)
    {
        var trimmed = value?.Trim().ToLowerInvariant() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(trimmed))
            return string.Empty;

        return Regex.IsMatch(trimmed, "^[a-z0-9]+(?:-[a-z0-9]+)*$") ? trimmed : string.Empty;
    }

    private static string? NormalizeOptionalText(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static string? NormalizeOptionalColor(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return null;

        if (trimmed.StartsWith("#") && trimmed.Length is 7 or 4)
            return trimmed.ToLowerInvariant();

        return null;
    }

    private static string NormalizeCollectionPreviewMode(string? value)
    {
        return value?.Trim().ToLowerInvariant() switch
        {
            "products" => "products",
            _ => "gallery"
        };
    }

    private static int NormalizeSortOrder(int? value, int fallback)
    {
        var normalizedValue = value ?? fallback;
        return normalizedValue < 0 ? 0 : normalizedValue;
    }

    private static bool IsValidEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        try
        {
            var address = new MailAddress(email);
            return string.Equals(address.Address, email, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static bool IsStrongPassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 10) return false;
        return password.Any(char.IsUpper)
               && password.Any(char.IsLower)
               && password.Any(char.IsDigit);
    }

    private static Dictionary<string, string> ParseAdminPreferences(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return new Dictionary<string, string>(StringComparer.Ordinal);

        try
        {
            var parsed = JsonSerializer.Deserialize<Dictionary<string, string>>(raw);
            return parsed is null
                ? new Dictionary<string, string>(StringComparer.Ordinal)
                : new Dictionary<string, string>(parsed, StringComparer.Ordinal);
        }
        catch
        {
            return new Dictionary<string, string>(StringComparer.Ordinal);
        }
    }

    private Task<User?> RequireAdminUserAsync() => _auth.RequireAdminUserAsync(Request);
}

public class AdminUserPatchPayload
{
    public bool? IsAdmin { get; set; }
    public bool? IsBlocked { get; set; }
    public string? Email { get; set; }
    public string? Name { get; set; }
    public string? Phone { get; set; }
    public string? Nickname { get; set; }
    public string? ShippingAddress { get; set; }
    public string? Password { get; set; }
}
