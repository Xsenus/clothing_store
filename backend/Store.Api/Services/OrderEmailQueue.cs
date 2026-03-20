using System.Threading.Channels;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Store.Api.Models;

namespace Store.Api.Services;

public interface IOrderEmailQueue
{
    void QueueOrderCreatedEmail(Order order);
    void QueueOrderStatusChangedEmail(Order order, string previousStatus, string? managerComment);
}

public sealed class OrderEmailQueue : BackgroundService, IOrderEmailQueue
{
    private static readonly TimeSpan EmailSendTimeout = TimeSpan.FromSeconds(30);

    private readonly Channel<OrderEmailWorkItem> _queue = Channel.CreateUnbounded<OrderEmailWorkItem>(
        new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false
        });
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OrderEmailQueue> _logger;

    public OrderEmailQueue(IServiceScopeFactory scopeFactory, ILogger<OrderEmailQueue> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public void QueueOrderCreatedEmail(Order order)
        => Enqueue(new OrderEmailWorkItem(OrderEmailWorkItemKind.OrderCreated, CloneOrder(order), PreviousStatus: null, ManagerComment: null));

    public void QueueOrderStatusChangedEmail(Order order, string previousStatus, string? managerComment)
        => Enqueue(new OrderEmailWorkItem(OrderEmailWorkItemKind.OrderStatusChanged, CloneOrder(order), previousStatus, managerComment));

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var item in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var emailService = scope.ServiceProvider.GetRequiredService<TransactionalEmailService>();
                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                timeoutCts.CancelAfter(EmailSendTimeout);

                switch (item.Kind)
                {
                    case OrderEmailWorkItemKind.OrderCreated:
                        await emailService.TrySendOrderCreatedEmailAsync(item.Order, timeoutCts.Token);
                        break;
                    case OrderEmailWorkItemKind.OrderStatusChanged:
                        await emailService.TrySendOrderStatusChangedEmailAsync(
                            item.Order,
                            item.PreviousStatus ?? string.Empty,
                            item.ManagerComment,
                            timeoutCts.Token);
                        break;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to process queued order email for order {OrderId}.", item.Order.Id);
            }
        }
    }

    private void Enqueue(OrderEmailWorkItem item)
    {
        if (!_queue.Writer.TryWrite(item))
            _logger.LogWarning("Failed to enqueue order email for order {OrderId}.", item.Order.Id);
    }

    private static Order CloneOrder(Order order)
    {
        return new Order
        {
            Id = order.Id,
            UserId = order.UserId,
            OrderNumber = order.OrderNumber,
            ItemsJson = order.ItemsJson,
            TotalAmount = order.TotalAmount,
            Status = order.Status,
            PaymentMethod = order.PaymentMethod,
            PurchaseChannel = order.PurchaseChannel,
            ShippingMethod = order.ShippingMethod,
            ShippingAmount = order.ShippingAmount,
            PickupPointId = order.PickupPointId,
            ShippingAddress = order.ShippingAddress,
            CustomerName = order.CustomerName,
            CustomerEmail = order.CustomerEmail,
            CustomerPhone = order.CustomerPhone,
            StatusHistoryJson = order.StatusHistoryJson,
            CreatedAt = order.CreatedAt,
            UpdatedAt = order.UpdatedAt
        };
    }

    private enum OrderEmailWorkItemKind
    {
        OrderCreated,
        OrderStatusChanged
    }

    private sealed record OrderEmailWorkItem(
        OrderEmailWorkItemKind Kind,
        Order Order,
        string? PreviousStatus,
        string? ManagerComment);
}
