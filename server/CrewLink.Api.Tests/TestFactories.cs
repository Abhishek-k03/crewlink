using System.Globalization;

using CrewLink.Api.Domain;

namespace CrewLink.Api.Tests;

/// <summary>
/// Test data builders mirroring <c>src/test/factories.ts</c>: pass only the
/// fields a test cares about, the rest default.
/// </summary>
public static class TestFactories
{
    private static int _sequence;

    /// <summary>Deterministic, unlike <see cref="Guid.NewGuid"/>.</summary>
    private static string NextId(string prefix) =>
        $"{prefix}-{Interlocked.Increment(ref _sequence)}";

    public static Vessel Vessel(
        string? id = null,
        Dictionary<Rank, int>? minimumSafeManning = null,
        VesselStatus status = VesselStatus.InService,
        bool readyToSail = false,
        // IMO numbers are unique in the schema, so a fixture with two vessels
        // has to say which is which.
        string imoNumber = "9074729") => new()
        {
            Id = id ?? NextId("vessel"),
            Name = "MV Test",
            ImoNumber = imoNumber,
            Flag = "Panama",
            Type = VesselType.BulkCarrier,
            Status = status,
            MinimumSafeManning = minimumSafeManning ?? new Dictionary<Rank, int>
            {
                [Rank.Master] = 1,
                [Rank.ChiefOfficer] = 1,
                [Rank.ChiefEngineer] = 1,
                [Rank.AB] = 4,
            },
            ReadyToSail = readyToSail,
        };

    public static CrewMember CrewMember(
        string? id = null,
        Rank rank = Rank.AB,
        CrewStatus status = CrewStatus.Available) => new()
        {
            Id = id ?? NextId("crew"),
            Name = "Test Seafarer",
            Rank = rank,
            Nationality = "Philippines",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Status = status,
            Email = "test@crewlink.dev",
            Phone = "+63 900 000 0000",
        };

    public static Assignment Assignment(
        string? id = null,
        string crewId = "crew-1",
        string vesselId = "vessel-1",
        Rank rankOnboard = Rank.AB,
        string signOnDate = "2024-01-01",
        string signOffDate = "2024-06-30",
        AssignmentStatus status = AssignmentStatus.Planned) => new()
        {
            Id = id ?? NextId("assignment"),
            CrewId = crewId,
            VesselId = vesselId,
            RankOnboard = rankOnboard,
            SignOnDate = Iso(signOnDate),
            SignOffDate = Iso(signOffDate),
            Port = "Singapore",
            Status = status,
        };

    public static Certification Certification(
        string? id = null,
        string crewId = "crew-1",
        CertificationType type = CertificationType.Stcw,
        string issueDate = "2020-01-01",
        string expiryDate = "2030-01-01") => new()
        {
            Id = id ?? NextId("certification"),
            CrewId = crewId,
            Type = type,
            IssueDate = Iso(issueDate),
            ExpiryDate = Iso(expiryDate),
            IssuingAuthority = "MARINA",
        };

    public static DateOnly On(string iso) => Iso(iso);

    /// <summary>Exact-format parsing, so the tests do not depend on the machine's culture.</summary>
    private static DateOnly Iso(string value) =>
        DateOnly.ParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture);
}
