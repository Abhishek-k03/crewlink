using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace CrewLink.Api.Data;

/// <summary>
/// Used only by <c>dotnet ef</c> at design time.
/// </summary>
/// <remarks>
/// Without this, the tooling boots the real host to find a DbContext, running
/// the startup migration and seed as a side effect against a database whose
/// schema is mid-change.
/// </remarks>
public sealed class CrewLinkDbContextFactory : IDesignTimeDbContextFactory<CrewLinkDbContext>
{
    public CrewLinkDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<CrewLinkDbContext>()
            .UseSqlite("Data Source=crewlink-design.db")
            .Options;

        return new CrewLinkDbContext(options);
    }
}
