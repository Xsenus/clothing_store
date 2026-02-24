using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Data;

namespace Store.Api.Controllers;

[ApiController]
[Route("settings")]
public class PublicSettingsController : ControllerBase
{
    private static readonly string[] PublicKeys =
    [
        "privacy_policy",
        "user_agreement",
        "public_offer",
        "cookie_consent_text"
    ];

    private readonly StoreDbContext _db;

    public PublicSettingsController(StoreDbContext db)
    {
        _db = db;
    }

    [HttpGet("public")]
    public async Task<IResult> GetPublic()
    {
        var settings = await _db.AppSettings
            .Where(x => PublicKeys.Contains(x.Key))
            .ToListAsync();

        return Results.Ok(settings.ToDictionary(x => x.Key, x => x.Value));
    }
}

