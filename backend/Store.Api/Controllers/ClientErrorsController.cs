using Microsoft.AspNetCore.Mvc;

namespace Store.Api.Controllers;

[ApiController]
[Route("client-errors")]
public class ClientErrorsController : ControllerBase
{
    private readonly ILogger<ClientErrorsController> _logger;

    public ClientErrorsController(ILogger<ClientErrorsController> logger)
    {
        _logger = logger;
    }

    [HttpPost]
    public IResult Report([FromBody] ClientErrorPayload? payload)
    {
        if (payload is null)
            return Results.Ok(new { logged = false });

        _logger.LogWarning(
            "Client render error. Source={Source}; Name={Name}; Message={Message}; Location={Location}; UserAgent={UserAgent}; ComponentStack={ComponentStack}; Stack={Stack}",
            Trim(payload.Source, 120),
            Trim(payload.Name, 120),
            Trim(payload.Message, 1200),
            Trim(payload.Location, 500),
            Trim(payload.UserAgent, 500),
            Trim(payload.ComponentStack, 2400),
            Trim(payload.Stack, 2400));

        return Results.Ok(new { logged = true });
    }

    private static string Trim(string? value, int maxLength)
    {
        var normalized = value?.Trim() ?? string.Empty;
        return normalized.Length > maxLength
            ? normalized[..maxLength]
            : normalized;
    }
}

public sealed record ClientErrorPayload(
    string? Source,
    string? Name,
    string? Message,
    string? Stack,
    string? ComponentStack,
    string? Location,
    string? UserAgent);
