using CrewLink.Api.Auth;
using CrewLink.Api.Contracts;
using CrewLink.Api.Data;
using CrewLink.Api.Domain;
using CrewLink.Api.Infrastructure;

using FluentValidation;

using Microsoft.EntityFrameworkCore;

namespace CrewLink.Api.Endpoints;

public static class VesselEndpoints
{
    public static void MapVesselEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/vessels").WithTags("Vessels");

        group.MapGet("/", ListAsync).RequirePermission(PermissionAction.VesselRead);

        // Not gated on vessel:read — a crew member has no access to the fleet
        // register but still needs the name of the ship on their own rotation.
        // A narrow projection here is safer than widening vessel:read.
        group.MapGet("/lookup", LookupAsync).RequireAuthorization();

        group.MapGet("/{id}", GetAsync).RequirePermission(PermissionAction.VesselRead);
        group.MapPost("/", CreateAsync).RequirePermission(PermissionAction.VesselWrite);
        group.MapPatch("/{id}", UpdateAsync).RequirePermission(PermissionAction.VesselWrite);
        group.MapDelete("/{id}", DeleteAsync).RequirePermission(PermissionAction.VesselWrite);
    }

    private static async Task<IResult> ListAsync(
        CrewLinkDbContext db,
        CancellationToken cancellationToken,
        string? search = null,
        string? status = null,
        string? type = null,
        int? page = null,
        int? pageSize = null,
        string? sort = null,
        string? order = null)
    {
        var query = db.Vessels.AsNoTracking();

        if (status is not null)
        {
            if (!EnumNames<VesselStatus>.TryParse(status, out var parsed))
            {
                return ApiResults.MalformedBody($"'{status}' is not a known vessel status.");
            }
            query = query.Where(vessel => vessel.Status == parsed);
        }

        if (type is not null)
        {
            if (!EnumNames<VesselType>.TryParse(type, out var parsed))
            {
                return ApiResults.MalformedBody($"'{type}' is not a known vessel type.");
            }
            query = query.Where(vessel => vessel.Type == parsed);
        }

        if (Search.ToLikePattern(search) is { } pattern)
        {
            query = query.Where(vessel =>
                EF.Functions.Like(vessel.Name, pattern, Search.EscapeCharacter) ||
                EF.Functions.Like(vessel.ImoNumber, pattern, Search.EscapeCharacter) ||
                EF.Functions.Like(vessel.Flag, pattern, Search.EscapeCharacter));
        }

        var (resolvedPage, resolvedPageSize) = PagedQuery.Resolve(page, pageSize);
        return Results.Ok(await PagedQuery.ToPageAsync(
            ApplySort(query, sort, order),
            resolvedPage,
            resolvedPageSize,
            cancellationToken));
    }

    /// <summary>An explicit whitelist, not reflection, so only indexed/cheap columns are sortable.</summary>
    private static IQueryable<Vessel> ApplySort(IQueryable<Vessel> query, string? sort, string? order)
    {
        var descending = SortHelpers.IsDescending(order);

        // Always ordered, even with no sort requested — an unordered query can
        // repeat or skip rows across pages.
        query = sort switch
        {
            "name" => query.OrderByField(vessel => vessel.Name, descending),
            "imoNumber" => query.OrderByField(vessel => vessel.ImoNumber, descending),
            "flag" => query.OrderByField(vessel => vessel.Flag, descending),
            "type" => query.OrderByField(vessel => vessel.Type, descending),
            "status" => query.OrderByField(vessel => vessel.Status, descending),
            _ => query.OrderBy(vessel => vessel.Id),
        };

        return query.ThenById(vessel => vessel.Id);
    }

    /// <summary>Id and name only, for resolving the vessel a rotation points at.</summary>
    private static async Task<IResult> LookupAsync(
        CrewLinkDbContext db,
        CancellationToken cancellationToken) =>
        Results.Ok(await db.Vessels.AsNoTracking()
            .OrderBy(vessel => vessel.Name)
            .Select(vessel => new VesselSummary(vessel.Id, vessel.Name))
            .ToListAsync(cancellationToken));

    private static async Task<IResult> GetAsync(
        string id,
        CrewLinkDbContext db,
        CancellationToken cancellationToken)
    {
        var vessel = await db.Vessels.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        return vessel is null ? ApiResults.NotFound("Vessel") : Results.Ok(vessel);
    }

    private static async Task<IResult> CreateAsync(
        HttpRequest request,
        CrewLinkDbContext db,
        IValidator<VesselInput> validator,
        CancellationToken cancellationToken)
    {
        var (input, error) = await RequestJson.ReadAsync<VesselInput>(request, cancellationToken);
        if (error is not null) return error;

        var validation = await validator.ValidateAsync(input!.Normalise(), cancellationToken);
        if (!validation.IsValid) return ApiResults.ValidationError(validation);

        if (await db.Vessels.AnyAsync(v => v.ImoNumber == input.ImoNumber, cancellationToken))
        {
            return ApiResults.RuleViolation(
                "That IMO number is already registered to another vessel.",
                Array.Empty<object>());
        }

        var vessel = input.ToVessel(Guid.NewGuid().ToString());

        db.Vessels.Add(vessel);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Json(vessel, statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> UpdateAsync(
        string id,
        HttpRequest request,
        HttpContext context,
        CrewLinkDbContext db,
        IValidator<VesselInput> validator,
        CancellationToken cancellationToken)
    {
        var vessel = await db.Vessels.FirstOrDefaultAsync(v => v.Id == id, cancellationToken);
        if (vessel is null) return ApiResults.NotFound("Vessel");

        var (patch, error) = await RequestJson.ReadAsync<VesselPatch>(request, cancellationToken);
        if (error is not null) return error;

        // Its own permission — a Crewing Officer may read the fleet but not
        // declare a ship fit to leave port.
        var markingReady = patch!.ReadyToSail is { IsSet: true, Value: true } && !vessel.ReadyToSail;
        if (markingReady &&
            !Permissions.Can(context.User.GetRole(), PermissionAction.VesselMarkReadyToSail))
        {
            return ApiResults.Forbidden("Your role cannot mark a vessel ready to sail.");
        }

        var merged = patch.ApplyTo(VesselInput.From(vessel)).Normalise();

        var validation = await validator.ValidateAsync(merged, cancellationToken);
        if (!validation.IsValid) return ApiResults.ValidationError(validation);

        if (merged.ImoNumber != vessel.ImoNumber &&
            await db.Vessels.AnyAsync(
                other => other.ImoNumber == merged.ImoNumber && other.Id != id,
                cancellationToken))
        {
            return ApiResults.RuleViolation(
                "That IMO number is already registered to another vessel.",
                Array.Empty<object>());
        }

        if (markingReady)
        {
            // Rule 2, checked against a detached copy of the merged vessel, so a
            // refusal can't leave a rejected change sitting in the change tracker.
            var assignments = await db.Assignments.AsNoTracking()
                .Where(assignment => assignment.VesselId == id)
                .ToListAsync(cancellationToken);

            var compliance = Rules.CheckManningCompliance(
                merged.ToVessel(id), assignments, Dates.Today());

            if (!compliance.Compliant)
            {
                return ApiResults.RuleViolation(
                    "This vessel is below minimum safe manning and cannot be marked ready to sail.",
                    compliance.Shortfalls);
            }
        }

        merged.ApplyTo(vessel);
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(vessel);
    }

    private static async Task<IResult> DeleteAsync(
        string id,
        CrewLinkDbContext db,
        CancellationToken cancellationToken)
    {
        var vessel = await db.Vessels.FirstOrDefaultAsync(v => v.Id == id, cancellationToken);
        if (vessel is null) return ApiResults.NotFound("Vessel");

        var active = await db.Assignments.CountAsync(
            assignment => assignment.VesselId == id && assignment.Status == AssignmentStatus.Active,
            cancellationToken);

        if (active > 0)
        {
            return ApiResults.RuleViolation(
                $"This vessel has {active} active rotation{(active == 1 ? "" : "s")} and cannot be deleted.",
                Array.Empty<object>());
        }

        db.Vessels.Remove(vessel);
        await db.SaveChangesAsync(cancellationToken);
        return Results.NoContent();
    }
}
