using CrewLink.Api.Data;
using CrewLink.Api.Domain;

namespace CrewLink.Api.Tests;

/// <summary>
/// The other half of the cross-language contract. <c>src/db/seedParity.test.ts</c>
/// asserts this same constant against the TypeScript generator.
/// </summary>
public class SeedParityTests
{
    /// <summary>Produced by the TypeScript generator, not this one — copying the C# output would defeat the point.</summary>
    private const string ExpectedDigest =
        "c96c50921cc355deeaca486ea12c678866faa303c31e01232b0f89d491747b33";

    private static readonly DateOnly FixedToday = new(2026, 1, 1);

    [Fact]
    public void GeneratesTheSameFleetAsTheBrowser()
    {
        var digest = SeedDigest.Compute(SeedGenerator.Generate(SeedGenerator.DefaultSeed, FixedToday));

        Assert.Equal(ExpectedDigest, digest);
    }

    [Fact]
    public void IsDeterministicForAGivenSeed()
    {
        var first = SeedGenerator.Generate(1234, FixedToday);
        var second = SeedGenerator.Generate(1234, FixedToday);

        Assert.Equal(SeedDigest.Compute(first), SeedDigest.Compute(second));
    }

    [Fact]
    public void SeedsTheCrewRecordTheDemoAccountMapsTo()
    {
        var data = SeedGenerator.Generate(SeedGenerator.DefaultSeed, FixedToday);

        Assert.Contains(data.Crew, member => member.Id == SeedGenerator.DemoCrewMemberCrewId);
    }

    /// <summary>The seed has to satisfy the rules the API enforces, or the app opens already in violation of itself.</summary>
    [Fact]
    public void DoubleBooksNobody()
    {
        var data = SeedGenerator.Generate(SeedGenerator.DefaultSeed, FixedToday);

        foreach (var assignment in data.Assignments)
        {
            Assert.Empty(Rules.FindConflictingAssignments(assignment, data.Assignments));
        }
    }

    [Fact]
    public void GivesEveryLiveRotationTheCertificatesItRequires()
    {
        var data = SeedGenerator.Generate(SeedGenerator.DefaultSeed, FixedToday);
        var crewById = data.Crew.ToDictionary(member => member.Id, StringComparer.Ordinal);

        foreach (var assignment in data.Assignments)
        {
            if (assignment.Status == AssignmentStatus.Completed) continue;

            var blocks = Rules.FindBlockingCertifications(
                crewById[assignment.CrewId],
                data.Certifications,
                assignment.RankOnboard,
                assignment.SignOffDate);

            Assert.Empty(blocks);
        }
    }

    [Fact]
    public void DerivesCrewStatusFromRotationsRatherThanRollingItIndependently()
    {
        var data = SeedGenerator.Generate(SeedGenerator.DefaultSeed, FixedToday);
        var onboardIds = data.Assignments
            .Where(assignment => assignment.Status == AssignmentStatus.Active)
            .Select(assignment => assignment.CrewId)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var member in data.Crew)
        {
            var expected = onboardIds.Contains(member.Id) ? CrewStatus.Onboard : CrewStatus.Available;
            Assert.Equal(expected, member.Status);
        }
    }
}
