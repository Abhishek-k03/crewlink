using System.Security.Claims;

using CrewLink.Api.Auth;
using CrewLink.Api.Contracts;
using CrewLink.Api.Data;
using CrewLink.Api.Domain;
using CrewLink.Api.Infrastructure;

using FluentValidation;

using Microsoft.EntityFrameworkCore;

namespace CrewLink.Api.Endpoints;

public static class AssignmentEndpoints
{
    public static void MapAssignmentEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/assignments").WithTags("Assignments");

        group.MapGet("/", ListAsync).RequirePermission(PermissionAction.AssignmentRead);
        group.MapGet("/{id}", GetAsync).RequirePermission(PermissionAction.AssignmentRead);
        group.MapPost("/", CreateAsync).RequirePermission(PermissionAction.AssignmentWrite);
        group.MapPatch("/{id}", UpdateAsync).RequirePermission(PermissionAction.AssignmentWrite);
        group.MapDelete("/{id}", DeleteAsync).RequirePermission(PermissionAction.AssignmentWrite);
    }

    private static async Task<IResult> ListAsync(
        ClaimsPrincipal user,
        CrewLinkDbContext db,
        CancellationToken cancellationToken,
        string? crewId = null,
        string? vesselId = null,
        string? status = null,
        DateOnly? from = null,
        DateOnly? to = null,
        int? page = null,
        int? pageSize = null,
        string? sort = null,
        string? order = null)
    {
        var query = db.Assignments.AsNoTracking();

        if (Permissions.ScopeFor(user.GetRole(), PermissionAction.AssignmentRead) == Scope.Own)
        {
            var ownCrewId = user.GetCrewId();
            query = query.Where(assignment => assignment.CrewId == ownCrewId);
        }

        if (crewId is not null) query = query.Where(assignment => assignment.CrewId == crewId);
        if (vesselId is not null) query = query.Where(assignment => assignment.VesselId == vesselId);

        if (status is not null)
        {
            if (!EnumNames<AssignmentStatus>.TryParse(status, out var parsed))
            {
                return ApiResults.MalformedBody($"'{status}' is not a known rotation status.");
            }
            query = query.Where(assignment => assignment.Status == parsed);
        }

        // Overlap against the window, not containment, so the calendar shows a
        // contract spanning the whole month even if neither endpoint falls inside it.
        if (from is not null) query = query.Where(assignment => assignment.SignOffDate >= from);
        if (to is not null) query = query.Where(assignment => assignment.SignOnDate <= to);

        var (resolvedPage, resolvedPageSize) = PagedQuery.Resolve(page, pageSize);
        return Results.Ok(await PagedQuery.ToPageAsync(
            ApplySort(query, sort, order),
            resolvedPage,
            resolvedPageSize,
            cancellationToken));
    }

    private static IQueryable<Assignment> ApplySort(
        IQueryable<Assignment> query,
        string? sort,
        string? order)
    {
        var descending = SortHelpers.IsDescending(order);

        query = sort switch
        {
            "signOnDate" => query.OrderByField(assignment => assignment.SignOnDate, descending),
            "signOffDate" => query.OrderByField(assignment => assignment.SignOffDate, descending),
            "status" => query.OrderByField(assignment => assignment.Status, descending),
            "port" => query.OrderByField(assignment => assignment.Port, descending),
            _ => query.OrderByField(assignment => assignment.SignOnDate, descending),
        };

        return query.ThenById(assignment => assignment.Id);
    }

    private static async Task<IResult> GetAsync(
        string id,
        ClaimsPrincipal user,
        CrewLinkDbContext db,
        CancellationToken cancellationToken)
    {
        var assignment = await db.Assignments.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        if (assignment is null) return ApiResults.NotFound("Assignment");

        if (!Permissions.Can(
                user.GetRole(), PermissionAction.AssignmentRead, user.GetCrewId(), assignment.CrewId))
        {
            return ApiResults.Forbidden("You can only view your own rotations.");
        }

        return Results.Ok(assignment);
    }

    private static async Task<IResult> CreateAsync(
        HttpRequest request,
        CrewLinkDbContext db,
        IValidator<AssignmentInput> validator,
        CancellationToken cancellationToken)
    {
        var (input, error) = await RequestJson.ReadAsync<AssignmentInput>(request, cancellationToken);
        if (error is not null) return error;

        var validation = await validator.ValidateAsync(input!.Normalise(), cancellationToken);
        if (!validation.IsValid) return ApiResults.ValidationError(validation);

        var assignment = input.ToAssignment(Guid.NewGuid().ToString());

        var violation = await CheckRulesAsync(db, assignment, cancellationToken);
        if (violation is not null) return violation;

        db.Assignments.Add(assignment);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Json(assignment, statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> UpdateAsync(
        string id,
        HttpRequest request,
        CrewLinkDbContext db,
        IValidator<AssignmentInput> validator,
        CancellationToken cancellationToken)
    {
        var assignment = await db.Assignments
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);
        if (assignment is null) return ApiResults.NotFound("Assignment");

        var (patch, error) = await RequestJson.ReadAsync<AssignmentPatch>(request, cancellationToken);
        if (error is not null) return error;

        var merged = patch!.ApplyTo(AssignmentInput.From(assignment)).Normalise();

        var validation = await validator.ValidateAsync(merged, cancellationToken);
        if (!validation.IsValid) return ApiResults.ValidationError(validation);

        // Against a detached candidate, so a refusal never leaves a rejected
        // change in the change tracker.
        var candidate = merged.ToAssignment(id);
        var violation = await CheckRulesAsync(db, candidate, cancellationToken);
        if (violation is not null) return violation;

        merged.ApplyTo(assignment);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(assignment);
    }

    private static async Task<IResult> DeleteAsync(
        string id,
        CrewLinkDbContext db,
        CancellationToken cancellationToken)
    {
        var assignment = await db.Assignments
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);
        if (assignment is null) return ApiResults.NotFound("Assignment");

        db.Assignments.Remove(assignment);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>Runs rules 1 and 3 against a proposed rotation.</summary>
    private static async Task<IResult?> CheckRulesAsync(
        CrewLinkDbContext db,
        Assignment candidate,
        CancellationToken cancellationToken)
    {
        if (!await db.Vessels.AnyAsync(vessel => vessel.Id == candidate.VesselId, cancellationToken))
        {
            return ApiResults.NotFound("Vessel");
        }

        var crew = await db.Crew.AsNoTracking()
            .FirstOrDefaultAsync(member => member.Id == candidate.CrewId, cancellationToken);
        if (crew is null) return ApiResults.NotFound("Crew member");

        // Rule 1 — only this crew member's rotations can conflict, so it's an
        // index seek, not a scan of the whole fleet.
        var existing = await db.Assignments.AsNoTracking()
            .Where(assignment => assignment.CrewId == candidate.CrewId)
            .ToListAsync(cancellationToken);

        var conflicts = Rules.FindConflictingAssignments(candidate, existing);
        if (conflicts.Count > 0)
        {
            return ApiResults.RuleViolation(
                "This crew member already has a rotation covering those dates.",
                conflicts
                    .Select(conflict => new AssignmentConflict(
                        conflict.Id, conflict.SignOnDate, conflict.SignOffDate))
                    .ToArray());
        }

        // Rule 3 only gates *taking up* a rotation — closing one out is always
        // allowed, or a lapsed certificate would trap it in Active forever.
        if (candidate.Status == AssignmentStatus.Completed) return null;

        var certifications = await db.Certifications.AsNoTracking()
            .Where(certification => certification.CrewId == candidate.CrewId)
            .ToListAsync(cancellationToken);

        var blocks = Rules.FindBlockingCertifications(
            crew, certifications, candidate.RankOnboard, candidate.SignOffDate);

        return blocks.Count > 0
            ? ApiResults.RuleViolation("Certification requirements are not met for this rotation.", blocks)
            : null;
    }
}
