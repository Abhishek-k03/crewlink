using System.Security.Claims;

using CrewLink.Api.Auth;
using CrewLink.Api.Contracts;
using CrewLink.Api.Data;
using CrewLink.Api.Domain;
using CrewLink.Api.Infrastructure;

using FluentValidation;

using Microsoft.EntityFrameworkCore;

namespace CrewLink.Api.Endpoints;

public static class CrewEndpoints
{
    public static void MapCrewEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/crew").WithTags("Crew");

        group.MapGet("/", ListAsync).RequirePermission(PermissionAction.CrewRead);
        group.MapGet("/{id}", GetAsync).RequirePermission(PermissionAction.CrewRead);
        group.MapPost("/", CreateAsync).RequirePermission(PermissionAction.CrewWrite);
        group.MapPatch("/{id}", UpdateAsync).RequirePermission(PermissionAction.CrewWrite);
        group.MapDelete("/{id}", DeleteAsync).RequirePermission(PermissionAction.CrewWrite);
    }

    private static async Task<IResult> ListAsync(
        ClaimsPrincipal user,
        CrewLinkDbContext db,
        CancellationToken cancellationToken,
        string? search = null,
        string? status = null,
        string? rank = null,
        string? nationality = null,
        int? page = null,
        int? pageSize = null,
        string? sort = null,
        string? order = null)
    {
        var query = db.Crew.AsNoTracking();

        // The client hides the directory from this role, but hiding a link isn't
        // a control — narrowing the query is what stops enumerating colleagues directly.
        if (Permissions.ScopeFor(user.GetRole(), PermissionAction.CrewRead) == Scope.Own)
        {
            var ownCrewId = user.GetCrewId();
            query = query.Where(member => member.Id == ownCrewId);
        }

        if (status is not null)
        {
            if (!EnumNames<CrewStatus>.TryParse(status, out var parsed))
            {
                return ApiResults.MalformedBody($"'{status}' is not a known crew status.");
            }
            query = query.Where(member => member.Status == parsed);
        }

        if (rank is not null)
        {
            if (!EnumNames<Rank>.TryParse(rank, out var parsed))
            {
                return ApiResults.MalformedBody($"'{rank}' is not a known rank.");
            }
            query = query.Where(member => member.Rank == parsed);
        }

        if (nationality is not null)
        {
            query = query.Where(member => member.Nationality == nationality);
        }

        if (Search.ToLikePattern(search) is { } pattern)
        {
            query = query.Where(member =>
                EF.Functions.Like(member.Name, pattern, Search.EscapeCharacter) ||
                EF.Functions.Like(member.Nationality, pattern, Search.EscapeCharacter) ||
                EF.Functions.Like(member.Email, pattern, Search.EscapeCharacter));
        }

        var (resolvedPage, resolvedPageSize) = PagedQuery.Resolve(page, pageSize);
        return Results.Ok(await PagedQuery.ToPageAsync(
            ApplySort(query, sort, order),
            resolvedPage,
            resolvedPageSize,
            cancellationToken));
    }

    private static IQueryable<CrewMember> ApplySort(
        IQueryable<CrewMember> query,
        string? sort,
        string? order)
    {
        var descending = SortHelpers.IsDescending(order);

        query = sort switch
        {
            "name" => query.OrderByField(member => member.Name, descending),
            "rank" => query.OrderByField(member => member.Rank, descending),
            "nationality" => query.OrderByField(member => member.Nationality, descending),
            "status" => query.OrderByField(member => member.Status, descending),
            "dateOfBirth" => query.OrderByField(member => member.DateOfBirth, descending),
            // The virtualised directory pages by scroll position, so a stable
            // default order matters — an unstable one shows duplicate rows.
            _ => query.OrderByField(member => member.Name, descending),
        };

        return query.ThenById(member => member.Id);
    }

    private static async Task<IResult> GetAsync(
        string id,
        ClaimsPrincipal user,
        CrewLinkDbContext db,
        CancellationToken cancellationToken)
    {
        if (!Permissions.Can(user.GetRole(), PermissionAction.CrewRead, user.GetCrewId(), id))
        {
            return ApiResults.Forbidden("You can only view your own profile.");
        }

        var member = await db.Crew.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        return member is null ? ApiResults.NotFound("Crew member") : Results.Ok(member);
    }

    private static async Task<IResult> CreateAsync(
        HttpRequest request,
        CrewLinkDbContext db,
        IValidator<CrewInput> validator,
        CancellationToken cancellationToken)
    {
        var (input, error) = await RequestJson.ReadAsync<CrewInput>(request, cancellationToken);
        if (error is not null) return error;

        var validation = await validator.ValidateAsync(input!.Normalise(), cancellationToken);
        if (!validation.IsValid) return ApiResults.ValidationError(validation);

        var member = input.ToCrewMember(Guid.NewGuid().ToString());
        db.Crew.Add(member);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Json(member, statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> UpdateAsync(
        string id,
        HttpRequest request,
        CrewLinkDbContext db,
        IValidator<CrewInput> validator,
        CancellationToken cancellationToken)
    {
        var member = await db.Crew.FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);
        if (member is null) return ApiResults.NotFound("Crew member");

        var (patch, error) = await RequestJson.ReadAsync<CrewPatch>(request, cancellationToken);
        if (error is not null) return error;

        var merged = patch!.ApplyTo(CrewInput.From(member)).Normalise();

        var validation = await validator.ValidateAsync(merged, cancellationToken);
        if (!validation.IsValid) return ApiResults.ValidationError(validation);

        merged.ApplyTo(member);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(member);
    }

    private static async Task<IResult> DeleteAsync(
        string id,
        CrewLinkDbContext db,
        CancellationToken cancellationToken)
    {
        var member = await db.Crew.FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);
        if (member is null) return ApiResults.NotFound("Crew member");

        var active = await db.Assignments.CountAsync(
            assignment => assignment.CrewId == id && assignment.Status == AssignmentStatus.Active,
            cancellationToken);

        if (active > 0)
        {
            return ApiResults.RuleViolation(
                "This crew member is currently onboard and cannot be deleted.",
                Array.Empty<object>());
        }

        // Rotations and certificates go with the person — the foreign keys
        // cascade, so this is one statement, not three, and can't half-succeed.
        db.Crew.Remove(member);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }
}
