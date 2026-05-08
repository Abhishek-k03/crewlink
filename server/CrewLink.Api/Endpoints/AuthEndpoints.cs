using System.Security.Claims;

using CrewLink.Api.Auth;
using CrewLink.Api.Contracts;
using CrewLink.Api.Data;
using CrewLink.Api.Infrastructure;

using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CrewLink.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/login", LoginAsync).AllowAnonymous();
        group.MapGet("/me", GetMeAsync).RequireAuthorization();
    }

    private static async Task<IResult> LoginAsync(
        HttpRequest request,
        CrewLinkDbContext db,
        TokenService tokens,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var (credentials, error) = await RequestJson.ReadAsync<LoginRequest>(request, cancellationToken);
        if (error is not null) return error;

        var email = credentials!.Email?.Trim().ToLowerInvariant();
        var user = email is null
            ? null
            : await db.Users.FirstOrDefaultAsync(candidate => candidate.Email == email, cancellationToken);

        // Same message and code for "no such account" and "wrong password" —
        // distinguishing them would make the form an oracle for registered emails.
        var invalid = Results.Json(
            new MessageResponse("Incorrect email or password."),
            statusCode: StatusCodes.Status401Unauthorized);

        if (user is null || credentials.Password is null) return invalid;

        var hasher = new PasswordHasher<UserAccount>();
        var verification = hasher.VerifyHashedPassword(user, user.PasswordHash, credentials.Password);
        if (verification == PasswordVerificationResult.Failed) return invalid;

        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            // Hashed with older parameters — re-hash on successful login so the
            // store upgrades without asking anyone to change their password.
            user.PasswordHash = hasher.HashPassword(user, credentials.Password);
            await db.SaveChangesAsync(cancellationToken);
        }

        var (token, expiresAt) = tokens.Issue(user);

        loggerFactory
            .CreateLogger(typeof(AuthEndpoints))
            .LogInformation("Issued a token for {Email} as {Role}.", user.Email, user.Role);

        return Results.Ok(new LoginResponse(
            token,
            expiresAt,
            new SessionUser(user.Id, user.Name, user.Email, user.Role, user.CrewId)));
    }

    /// <summary>Lets the client confirm a stored token is still valid rather than trusting localStorage.</summary>
    private static async Task<IResult> GetMeAsync(
        ClaimsPrincipal principal,
        CrewLinkDbContext db,
        CancellationToken cancellationToken)
    {
        var id = principal.GetUserId();
        var user = id is null
            ? null
            : await db.Users.AsNoTracking()
                .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        return user is null
            ? Results.Unauthorized()
            : Results.Ok(new SessionUser(user.Id, user.Name, user.Email, user.Role, user.CrewId));
    }
}
