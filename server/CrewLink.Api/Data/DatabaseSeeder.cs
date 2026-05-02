using CrewLink.Api.Domain;

using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CrewLink.Api.Data;

/// <summary>
/// Brings the database up to schema and populates it on first run, so the API
/// is useful the moment it starts.
/// </summary>
public static class DatabaseSeeder
{
    /// <summary>
    /// The demo accounts, mirroring <c>src/auth/users.ts</c>. Passwords are
    /// published in the README on purpose; they're still stored hashed.
    /// </summary>
    private static readonly (string Id, string Name, string Email, string Password, Role Role, string? CrewId)[]
        DemoAccounts =
        [
            ("user-manager", "Priya Raghunathan", "manager@crewlink.dev", "manager123", Role.FleetManager, null),
            ("user-crewing", "Tomas Lindqvist", "crewing@crewlink.dev", "crewing123", Role.CrewingOfficer, null),
            ("user-crew", "Ariel Santos", "crew@crewlink.dev", "crew123", Role.CrewMember,
                SeedGenerator.DemoCrewMemberCrewId),
        ];

    public static async Task InitialiseAsync(
        CrewLinkDbContext db,
        ILogger logger,
        bool reseed,
        CancellationToken cancellationToken = default)
    {
        await db.Database.MigrateAsync(cancellationToken);

        if (reseed)
        {
            logger.LogWarning("Reseed requested: clearing all fleet data.");
            await db.Certifications.ExecuteDeleteAsync(cancellationToken);
            await db.Assignments.ExecuteDeleteAsync(cancellationToken);
            await db.Crew.ExecuteDeleteAsync(cancellationToken);
            await db.Vessels.ExecuteDeleteAsync(cancellationToken);
            await db.Users.ExecuteDeleteAsync(cancellationToken);
        }

        await SeedUsersAsync(db, cancellationToken);

        if (await db.Vessels.AnyAsync(cancellationToken))
        {
            logger.LogInformation("Fleet data already present; skipping seed.");
            return;
        }

        var started = TimeProvider.System.GetTimestamp();
        var data = SeedGenerator.Generate();

        // Change tracking over ~6,700 entities is the expensive part of a bulk
        // insert, and none of these need it — they're new and nothing reads them
        // back in this scope.
        db.ChangeTracker.AutoDetectChangesEnabled = false;
        try
        {
            db.Vessels.AddRange(data.Vessels);
            db.Crew.AddRange(data.Crew);
            db.Assignments.AddRange(data.Assignments);
            db.Certifications.AddRange(data.Certifications);
            await db.SaveChangesAsync(cancellationToken);
        }
        finally
        {
            db.ChangeTracker.AutoDetectChangesEnabled = true;
            db.ChangeTracker.Clear();
        }

        logger.LogInformation(
            "Seeded {Vessels} vessels, {Crew} crew, {Assignments} assignments and {Certifications} certifications in {Elapsed}.",
            data.Vessels.Count,
            data.Crew.Count,
            data.Assignments.Count,
            data.Certifications.Count,
            TimeProvider.System.GetElapsedTime(started));
    }

    /// <summary>Internal so integration tests can create demo accounts without the full fleet.</summary>
    internal static async Task SeedUsersAsync(CrewLinkDbContext db, CancellationToken cancellationToken)
    {
        if (await db.Users.AnyAsync(cancellationToken)) return;

        var hasher = new PasswordHasher<UserAccount>();
        foreach (var (id, name, email, password, role, crewId) in DemoAccounts)
        {
            var user = new UserAccount
            {
                Id = id,
                Name = name,
                Email = email,
                PasswordHash = string.Empty,
                Role = role,
                CrewId = crewId,
            };
            user.PasswordHash = hasher.HashPassword(user, password);
            db.Users.Add(user);
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
