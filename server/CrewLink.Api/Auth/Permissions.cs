using CrewLink.Api.Domain;

namespace CrewLink.Api.Auth;

/// <summary>How much of an entity a role may touch — a plain boolean can't express "own records only".</summary>
public enum Scope
{
    None,
    Own,
    All,
}

public enum PermissionAction
{
    DashboardView,
    VesselRead,
    VesselWrite,
    VesselMarkReadyToSail,
    CrewRead,
    CrewWrite,
    AssignmentRead,
    AssignmentWrite,
    CertificationRead,
    CertificationWrite,

    /// <summary>
    /// Split from <see cref="CertificationWrite"/>: uploading can only add
    /// information, but deleting could hide an expired cert from the compliance view.
    /// </summary>
    CertificationDelete,
}

/// <summary>
/// A port of <c>src/auth/permissions.ts</c>. The client's copy decides which
/// buttons to render; this one decides what the server actually does.
/// </summary>
public static class Permissions
{
    private static readonly Dictionary<Role, Dictionary<PermissionAction, Scope>> RolePermissions = new()
    {
        [Role.FleetManager] = new Dictionary<PermissionAction, Scope>
        {
            [PermissionAction.DashboardView] = Scope.All,
            [PermissionAction.VesselRead] = Scope.All,
            [PermissionAction.VesselWrite] = Scope.All,
            [PermissionAction.VesselMarkReadyToSail] = Scope.All,
            [PermissionAction.CrewRead] = Scope.All,
            [PermissionAction.CrewWrite] = Scope.All,
            [PermissionAction.AssignmentRead] = Scope.All,
            [PermissionAction.AssignmentWrite] = Scope.All,
            [PermissionAction.CertificationRead] = Scope.All,
            [PermissionAction.CertificationWrite] = Scope.All,
            [PermissionAction.CertificationDelete] = Scope.All,
        },
        [Role.CrewingOfficer] = new Dictionary<PermissionAction, Scope>
        {
            [PermissionAction.DashboardView] = Scope.All,
            [PermissionAction.VesselRead] = Scope.All,
            [PermissionAction.VesselWrite] = Scope.None,
            [PermissionAction.VesselMarkReadyToSail] = Scope.None,
            [PermissionAction.CrewRead] = Scope.All,
            [PermissionAction.CrewWrite] = Scope.All,
            [PermissionAction.AssignmentRead] = Scope.All,
            [PermissionAction.AssignmentWrite] = Scope.All,
            [PermissionAction.CertificationRead] = Scope.All,
            [PermissionAction.CertificationWrite] = Scope.All,
            [PermissionAction.CertificationDelete] = Scope.All,
        },
        [Role.CrewMember] = new Dictionary<PermissionAction, Scope>
        {
            [PermissionAction.DashboardView] = Scope.None,
            [PermissionAction.VesselRead] = Scope.None,
            [PermissionAction.VesselWrite] = Scope.None,
            [PermissionAction.VesselMarkReadyToSail] = Scope.None,
            [PermissionAction.CrewRead] = Scope.Own,
            [PermissionAction.CrewWrite] = Scope.None,
            [PermissionAction.AssignmentRead] = Scope.Own,
            [PermissionAction.AssignmentWrite] = Scope.None,
            [PermissionAction.CertificationRead] = Scope.Own,
            [PermissionAction.CertificationWrite] = Scope.Own,
            // Upload yes, delete no: a crew member removing their own expired
            // certificate is exactly how non-compliance would be hidden.
            [PermissionAction.CertificationDelete] = Scope.None,
        },
    };

    public static Scope ScopeFor(Role role, PermissionAction action) => RolePermissions[role][action];

    /// <summary>
    /// Whether <paramref name="role"/> may perform <paramref name="action"/> on a
    /// record owned by <paramref name="ownerCrewId"/>. Omit the owner for a
    /// capability check not about a specific record — an <see cref="Scope.Own"/>
    /// permission then correctly answers <c>false</c> rather than silently passing.
    /// </summary>
    public static bool Can(
        Role role,
        PermissionAction action,
        string? viewerCrewId = null,
        string? ownerCrewId = null)
    {
        var scope = ScopeFor(role, action);
        return scope switch
        {
            Scope.All => true,
            Scope.None => false,
            _ => viewerCrewId is not null && string.Equals(viewerCrewId, ownerCrewId, StringComparison.Ordinal),
        };
    }

    /// <summary>The authorization policy name for an action, e.g. <c>vessel:read</c>.</summary>
    public static string PolicyName(PermissionAction action) => action switch
    {
        PermissionAction.DashboardView => "dashboard:view",
        PermissionAction.VesselRead => "vessel:read",
        PermissionAction.VesselWrite => "vessel:write",
        PermissionAction.VesselMarkReadyToSail => "vessel:markReadyToSail",
        PermissionAction.CrewRead => "crew:read",
        PermissionAction.CrewWrite => "crew:write",
        PermissionAction.AssignmentRead => "assignment:read",
        PermissionAction.AssignmentWrite => "assignment:write",
        PermissionAction.CertificationRead => "certification:read",
        PermissionAction.CertificationWrite => "certification:write",
        PermissionAction.CertificationDelete => "certification:delete",
        _ => throw new ArgumentOutOfRangeException(nameof(action)),
    };

    public static IEnumerable<PermissionAction> AllActions => Enum.GetValues<PermissionAction>();
}
