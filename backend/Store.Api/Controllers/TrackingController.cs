using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Store.Api.Contracts;
using Store.Api.Data;
using Store.Api.Models;
using Store.Api.Services;

namespace Store.Api.Controllers;

[ApiController]
[Route("tracking")]
public class TrackingController : ControllerBase
{
    private readonly StoreDbContext _db;
    private readonly AuthService _auth;

    public TrackingController(StoreDbContext db, AuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    [HttpPost("visit")]
    public async Task<IResult> TrackVisit([FromBody] SiteVisitPayload? payload)
    {
        var user = await _auth.RequireUserAsync(Request);
        var visitorId = VisitorTrackingSupport.NormalizeVisitorId(payload?.VisitorId);
        var viewerKey = VisitorTrackingSupport.ResolveViewerKey(user, visitorId);
        if (string.IsNullOrWhiteSpace(viewerKey))
            return Results.Ok(new { tracked = false });

        var normalizedPath = VisitorTrackingSupport.NormalizePath(payload?.Path);
        var now = DateTimeOffset.UtcNow;
        var nowUnix = now.ToUnixTimeMilliseconds();
        var dayKey = int.Parse(now.ToString("yyyyMMdd"));

        var existing = await _db.SiteVisits.FirstOrDefaultAsync(x =>
            x.ViewerKey == viewerKey
            && x.DayKey == dayKey);

        if (existing is null)
        {
            _db.SiteVisits.Add(new SiteVisit
            {
                UserId = user?.Id,
                VisitorId = visitorId,
                ViewerKey = viewerKey,
                DayKey = dayKey,
                VisitCount = 1,
                FirstVisitedAt = nowUnix,
                LastVisitedAt = nowUnix,
                EntryPath = normalizedPath,
                LastPath = normalizedPath
            });
        }
        else
        {
            existing.VisitCount += 1;
            existing.LastVisitedAt = nowUnix;
            if (!string.IsNullOrWhiteSpace(normalizedPath))
                existing.LastPath = normalizedPath;

            if (user is not null && string.IsNullOrWhiteSpace(existing.UserId))
                existing.UserId = user.Id;

            if (!string.IsNullOrWhiteSpace(visitorId) && string.IsNullOrWhiteSpace(existing.VisitorId))
                existing.VisitorId = visitorId;
        }

        await _db.SaveChangesAsync();
        return Results.Ok(new { tracked = true });
    }

    [HttpPost("cookie-consent")]
    public async Task<IResult> TrackCookieConsent([FromBody] CookieConsentPayload? payload)
    {
        var decision = NormalizeCookieConsentDecision(payload?.Decision);
        if (decision is null)
            return Results.BadRequest(new { detail = "Unsupported cookie consent decision" });

        var user = await _auth.RequireUserAsync(Request);
        var visitorId = VisitorTrackingSupport.NormalizeVisitorId(payload?.VisitorId);
        var viewerKey = VisitorTrackingSupport.ResolveViewerKey(user, visitorId);
        if (string.IsNullOrWhiteSpace(viewerKey))
            return Results.Ok(new { tracked = false });

        _db.CookieConsentEvents.Add(new CookieConsentEvent
        {
            UserId = user?.Id,
            VisitorId = visitorId,
            ViewerKey = viewerKey,
            Decision = decision,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });

        await _db.SaveChangesAsync();
        return Results.Ok(new { tracked = true });
    }

    private static string? NormalizeCookieConsentDecision(string? decision)
    {
        var normalized = decision?.Trim().ToLowerInvariant();
        return normalized switch
        {
            "accepted" or "accept" => "accepted",
            "rejected" or "reject" or "declined" or "decline" => "rejected",
            _ => null
        };
    }
}
