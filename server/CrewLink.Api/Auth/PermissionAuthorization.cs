using Microsoft.AspNetCore.Authorization;

namespace CrewLink.Api.Auth;

/// <summary>
/// Endpoint-level gate: does this role have <em>any</em> access to this action?
/// </summary>
/// <remarks>
/// Answers the coarse question only — an <see cref="Scope.Own"/> permission
/// passes here and is narrowed inside the endpoint, the only place that knows
/// which record is being touched.
/// </remarks>
public sealed class PermissionRequirement(PermissionAction action) : IAuthorizationRequirement
{
    public PermissionAction Action { get; } = action;
}

public sealed class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PermissionRequirement requirement)
    {
        if (context.User.Identity?.IsAuthenticated == true &&
            Permissions.ScopeFor(context.User.GetRole(), requirement.Action) != Scope.None)
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}

public static class AuthorizationExtensions
{
    /// <summary>Registers one policy per action, named exactly as the client names it.</summary>
    public static IServiceCollection AddCrewLinkAuthorization(this IServiceCollection services)
    {
        services.AddSingleton<IAuthorizationHandler, PermissionAuthorizationHandler>();

        var builder = services.AddAuthorizationBuilder();
        foreach (var action in Permissions.AllActions)
        {
            builder.AddPolicy(
                Permissions.PolicyName(action),
                policy => policy.AddRequirements(new PermissionRequirement(action)));
        }

        return services;
    }

    /// <summary>Reads better at the call site than a bare policy-name string, and can't be misspelled.</summary>
    public static TBuilder RequirePermission<TBuilder>(this TBuilder builder, PermissionAction action)
        where TBuilder : IEndpointConventionBuilder =>
        builder.RequireAuthorization(Permissions.PolicyName(action));
}
