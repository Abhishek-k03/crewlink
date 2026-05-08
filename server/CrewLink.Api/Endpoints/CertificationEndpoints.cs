using System.Security.Claims;

using CrewLink.Api.Auth;
using CrewLink.Api.Contracts;
using CrewLink.Api.Data;
using CrewLink.Api.Domain;
using CrewLink.Api.Infrastructure;

using FluentValidation;

using Microsoft.EntityFrameworkCore;

namespace CrewLink.Api.Endpoints;

public static class CertificationEndpoints
{
    public static void MapCertificationEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/certifications").WithTags("Certifications");

        group.MapGet("/", ListAsync).RequirePermission(PermissionAction.CertificationRead);
        group.MapGet("/{id}", GetAsync).RequirePermission(PermissionAction.CertificationRead);
        group.MapPost("/", CreateAsync).RequirePermission(PermissionAction.CertificationWrite);
        group.MapPatch("/{id}", UpdateAsync).RequirePermission(PermissionAction.CertificationWrite);
        group.MapDelete("/{id}", DeleteAsync).RequirePermission(PermissionAction.CertificationDelete);
    }

    private static async Task<IResult> ListAsync(
        ClaimsPrincipal user,
        CrewLinkDbContext db,
        CancellationToken cancellationToken,
        string? crewId = null,
        string? type = null,
        DateOnly? expiringBefore = null,
        string? bucket = null,
        string? search = null,
        int? page = null,
        int? pageSize = null,
        string? sort = null,
        string? order = null)
    {
        var query = db.Certifications.AsNoTracking();

        if (Permissions.ScopeFor(user.GetRole(), PermissionAction.CertificationRead) == Scope.Own)
        {
            var ownCrewId = user.GetCrewId();
            query = query.Where(certification => certification.CrewId == ownCrewId);
        }

        if (crewId is not null) query = query.Where(certification => certification.CrewId == crewId);

        if (type is not null)
        {
            if (!EnumNames<CertificationType>.TryParse(type, out var parsed))
            {
                return ApiResults.MalformedBody($"'{type}' is not a known certificate type.");
            }
            query = query.Where(certification => certification.Type == parsed);
        }

        if (expiringBefore is not null)
        {
            query = query.Where(certification => certification.ExpiryDate <= expiringBefore);
        }

        if (bucket is not null)
        {
            if (!EnumNames<ExpiryBucket>.TryParse(bucket, out var parsed))
            {
                return ApiResults.MalformedBody($"'{bucket}' is not a known expiry bucket.");
            }
            query = ApplyBucket(query, parsed, Dates.Today());
        }

        if (Search.ToLikePattern(search) is { } pattern)
        {
            // The column holds a converted enum LIKE can't touch, so resolve the
            // term to a set of matching enum values first — an IN clause instead.
            var term = search!.Trim();
            var matchingTypes = EnumNames<CertificationType>.Values
                .Where(candidate => EnumNames<CertificationType>.Name(candidate)
                    .Contains(term, StringComparison.OrdinalIgnoreCase))
                .ToArray();

            // Searching by crew name joins across tables, which only the server
            // can do — the client only holds one page of certificates at a time.
            query = query.Where(certification =>
                db.Crew.Any(member =>
                    member.Id == certification.CrewId &&
                    EF.Functions.Like(member.Name, pattern, Search.EscapeCharacter)) ||
                EF.Functions.Like(certification.IssuingAuthority, pattern, Search.EscapeCharacter) ||
                matchingTypes.Contains(certification.Type));
        }

        var (resolvedPage, resolvedPageSize) = PagedQuery.Resolve(page, pageSize);
        return Results.Ok(await PagedQuery.ToPageAsync(
            ApplySort(query, sort, order),
            resolvedPage,
            resolvedPageSize,
            cancellationToken));
    }

    /// <summary>
    /// The colour-coded bands as date ranges, so the database answers with an
    /// index seek on <c>ExpiryDate</c> instead of loading every row to compute
    /// the bucket in C#. Matches <see cref="Reporting.GetExpiryBucket"/>, pinned
    /// together by a test.
    /// </summary>
    private static IQueryable<Certification> ApplyBucket(
        IQueryable<Certification> query,
        ExpiryBucket bucket,
        DateOnly today)
    {
        var in30 = today.AddDays(30);
        var in90 = today.AddDays(90);

        return bucket switch
        {
            ExpiryBucket.Expired => query.Where(certification => certification.ExpiryDate < today),
            ExpiryBucket.Within30Days => query.Where(certification =>
                certification.ExpiryDate >= today && certification.ExpiryDate <= in30),
            ExpiryBucket.Within90Days => query.Where(certification =>
                certification.ExpiryDate > in30 && certification.ExpiryDate <= in90),
            _ => query.Where(certification => certification.ExpiryDate > in90),
        };
    }

    private static IQueryable<Certification> ApplySort(
        IQueryable<Certification> query,
        string? sort,
        string? order)
    {
        var descending = SortHelpers.IsDescending(order);

        query = sort switch
        {
            "issueDate" => query.OrderByField(certification => certification.IssueDate, descending),
            "type" => query.OrderByField(certification => certification.Type, descending),
            "issuingAuthority" => query.OrderByField(
                certification => certification.IssuingAuthority, descending),
            // Soonest expiry first by default — the compliance view is about
            // what's about to lapse.
            _ => query.OrderByField(certification => certification.ExpiryDate, descending),
        };

        return query.ThenById(certification => certification.Id);
    }

    private static async Task<IResult> GetAsync(
        string id,
        ClaimsPrincipal user,
        CrewLinkDbContext db,
        CancellationToken cancellationToken)
    {
        var certification = await db.Certifications.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        if (certification is null) return ApiResults.NotFound("Certification");

        if (!Permissions.Can(
                user.GetRole(),
                PermissionAction.CertificationRead,
                user.GetCrewId(),
                certification.CrewId))
        {
            return ApiResults.Forbidden("You can only view your own certifications.");
        }

        return Results.Ok(certification);
    }

    private static async Task<IResult> CreateAsync(
        HttpRequest request,
        ClaimsPrincipal user,
        CrewLinkDbContext db,
        IValidator<CertificationInput> validator,
        CancellationToken cancellationToken)
    {
        var (input, error) = await RequestJson.ReadAsync<CertificationInput>(request, cancellationToken);
        if (error is not null) return error;

        var validation = await validator.ValidateAsync(input!.Normalise(), cancellationToken);
        if (!validation.IsValid) return ApiResults.ValidationError(validation);

        // The owner comes from the token, so a crew member can't upload onto
        // someone else's record by editing crewId in the body.
        if (!Permissions.Can(
                user.GetRole(), PermissionAction.CertificationWrite, user.GetCrewId(), input.CrewId))
        {
            return ApiResults.Forbidden("You can only upload certifications to your own record.");
        }

        if (!await db.Crew.AnyAsync(member => member.Id == input.CrewId, cancellationToken))
        {
            return ApiResults.NotFound("Crew member");
        }

        var certification = input.ToCertification(Guid.NewGuid().ToString());
        db.Certifications.Add(certification);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Json(certification, statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> UpdateAsync(
        string id,
        HttpRequest request,
        ClaimsPrincipal user,
        CrewLinkDbContext db,
        IValidator<CertificationInput> validator,
        CancellationToken cancellationToken)
    {
        var certification = await db.Certifications
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);
        if (certification is null) return ApiResults.NotFound("Certification");

        if (!Permissions.Can(
                user.GetRole(),
                PermissionAction.CertificationWrite,
                user.GetCrewId(),
                certification.CrewId))
        {
            return ApiResults.Forbidden("You can only edit your own certifications.");
        }

        var (patch, error) = await RequestJson.ReadAsync<CertificationPatch>(request, cancellationToken);
        if (error is not null) return error;

        var merged = patch!.ApplyTo(CertificationInput.From(certification)).Normalise();

        var validation = await validator.ValidateAsync(merged, cancellationToken);
        if (!validation.IsValid) return ApiResults.ValidationError(validation);

        // Re-checked after merging — otherwise a patch could move a certificate
        // onto a different crew member's record.
        if (!Permissions.Can(
                user.GetRole(), PermissionAction.CertificationWrite, user.GetCrewId(), merged.CrewId))
        {
            return ApiResults.Forbidden("You cannot move a certification to another crew member.");
        }

        merged.ApplyTo(certification);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(certification);
    }

    private static async Task<IResult> DeleteAsync(
        string id,
        CrewLinkDbContext db,
        CancellationToken cancellationToken)
    {
        var certification = await db.Certifications
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);
        if (certification is null) return ApiResults.NotFound("Certification");

        db.Certifications.Remove(certification);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }
}
