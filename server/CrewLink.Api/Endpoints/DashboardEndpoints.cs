using CrewLink.Api.Auth;
using CrewLink.Api.Data;
using CrewLink.Api.Domain;

using Microsoft.EntityFrameworkCore;

namespace CrewLink.Api.Endpoints;

public static class DashboardEndpoints
{
    public static void MapDashboardEndpoints(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/dashboard", GetSummaryAsync)
            .WithTags("Dashboard")
            .RequirePermission(PermissionAction.DashboardView);

        routes.MapGet("/api/notifications", GetNotificationsAsync)
            .WithTags("Dashboard")
            // Gated on the dashboard permission — these are fleet-wide alerts
            // about other people's certificates, meaningless without fleet access.
            .RequirePermission(PermissionAction.DashboardView);
    }

    /// <summary>
    /// Aggregation happens here, not in the browser — shipping the whole fleet to
    /// compute four KPIs would be slow.
    /// </summary>
    /// <remarks>
    /// Stays thin: reads, then delegates to a pure function unit-tested without
    /// a database. The figures could move into SQL aggregates, but "below
    /// manning" and "overdue" would then exist twice — once in <c>Rules</c>,
    /// once in a query — risking the dashboard disagreeing with the page it links to.
    /// </remarks>
    private static async Task<IResult> GetSummaryAsync(
        CrewLinkDbContext db,
        CancellationToken cancellationToken)
    {
        var vessels = await db.Vessels.AsNoTracking().ToListAsync(cancellationToken);
        var crew = await db.Crew.AsNoTracking().ToListAsync(cancellationToken);
        var assignments = await db.Assignments.AsNoTracking().ToListAsync(cancellationToken);
        var certifications = await db.Certifications.AsNoTracking()
            // The base64 scans are the largest thing in the table and irrelevant
            // here, so project them away.
            .Select(certification => new Certification
            {
                Id = certification.Id,
                CrewId = certification.CrewId,
                Type = certification.Type,
                IssueDate = certification.IssueDate,
                ExpiryDate = certification.ExpiryDate,
                IssuingAuthority = certification.IssuingAuthority,
            })
            .ToListAsync(cancellationToken);

        return Results.Ok(Reporting.BuildDashboardSummary(
            vessels, crew, assignments, certifications, Dates.Today()));
    }

    private static async Task<IResult> GetNotificationsAsync(
        CrewLinkDbContext db,
        CancellationToken cancellationToken)
    {
        var crew = await db.Crew.AsNoTracking().ToListAsync(cancellationToken);
        var assignments = await db.Assignments.AsNoTracking().ToListAsync(cancellationToken);
        var certifications = await db.Certifications.AsNoTracking()
            .Select(certification => new Certification
            {
                Id = certification.Id,
                CrewId = certification.CrewId,
                Type = certification.Type,
                IssueDate = certification.IssueDate,
                ExpiryDate = certification.ExpiryDate,
                IssuingAuthority = certification.IssuingAuthority,
            })
            .ToListAsync(cancellationToken);

        return Results.Ok(Notifications.Build(assignments, certifications, crew, Dates.Today()));
    }
}
