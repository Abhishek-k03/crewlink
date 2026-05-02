using System.Globalization;

using CrewLink.Api.Domain;

namespace CrewLink.Api.Data;

public sealed record SeedDataset(
    List<Vessel> Vessels,
    List<CrewMember> Crew,
    List<Assignment> Assignments,
    List<Certification> Certifications);

/// <summary>
/// A port of <c>src/db/seed.ts</c>, faithful down to the order random numbers
/// are drawn — a shared PRNG only reproduces the same data if both
/// implementations consume it in the same sequence, so a moved draw (even one
/// skipped by a short-circuiting ternary) produces a different, still valid, fleet.
/// </summary>
/// <remarks>
/// Also has to satisfy the rules the app enforces: contracts are chained
/// forwards per crew member rather than placed at random, so rule 1 holds by
/// construction, and certificates for anyone under contract are made to
/// outlast it, so rule 3 does too.
/// </remarks>
public static class SeedGenerator
{
    public const uint DefaultSeed = 20260821;

    /// <summary>The crew record the demo Crew Member account maps to.</summary>
    public const string DemoCrewMemberCrewId = "crew-demo-0001";

    private const int VesselCount = 20;
    private const int CrewCount = 1200;
    private const int AssignmentCount = 1500;

    /// <summary>Ratios roughly matching a real crew list: more ratings than officers.</summary>
    private static readonly Rank[] WeightedRanks = BuildWeightedRanks();

    private static Rank[] BuildWeightedRanks()
    {
        var weights = new Dictionary<Rank, int>
        {
            [Rank.Master] = 1,
            [Rank.ChiefOfficer] = 1,
            [Rank.ChiefEngineer] = 1,
            [Rank.SecondEngineer] = 1,
            [Rank.AB] = 5,
            [Rank.Oiler] = 3,
            [Rank.Cook] = 1,
        };

        var weighted = new List<Rank>();
        foreach (var rank in Ranks.All)
        {
            weighted.AddRange(Enumerable.Repeat(rank, weights[rank]));
        }
        return [.. weighted];
    }

    private static string PaddedId(string prefix, int index) =>
        $"{prefix}-{index.ToString("D4", CultureInfo.InvariantCulture)}";

    /// <summary>Builds a 7-digit IMO number whose check digit is correct.</summary>
    private static string MakeImoNumber(SeedRandom random)
    {
        var basis = random.NextInt(900000, 989999).ToString(CultureInfo.InvariantCulture);
        return $"{basis}{Imo.CheckDigit(basis)}";
    }

    public static SeedDataset Generate(uint seed = DefaultSeed) => Generate(seed, Dates.Today());

    /// <param name="today">
    /// Passed in rather than read from the clock so the generated data can be
    /// reproduced for a specific day in tests.
    /// </param>
    public static SeedDataset Generate(uint seed, DateOnly today)
    {
        var random = new SeedRandom(seed);
        var vessels = GenerateVessels(random);
        var crew = GenerateCrew(random);
        var assignments = GenerateAssignments(random, crew, vessels, today);
        // Certificates come last so they can outlast the rotations their
        // holders are already committed to.
        var certifications = GenerateCertifications(random, crew, assignments, today);

        // Crew status is derived from the rotations, so nobody is "On Leave"
        // while holding an active contract.
        var activeCrewIds = assignments
            .Where(assignment => assignment.Status == AssignmentStatus.Active)
            .Select(assignment => assignment.CrewId)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var member in crew)
        {
            member.Status = activeCrewIds.Contains(member.Id) ? CrewStatus.Onboard : CrewStatus.Available;
        }

        return new SeedDataset(vessels, crew, assignments, certifications);
    }

    private static List<Vessel> GenerateVessels(SeedRandom random)
    {
        var vessels = new List<Vessel>(VesselCount);

        for (var index = 0; index < VesselCount; index += 1)
        {
            // Drawn before the object literal, exactly as in the TypeScript.
            var type = random.Pick(EnumNames<VesselType>.Values);
            var abRequirement = type is VesselType.Container or VesselType.Tanker ? 6 : 4;

            var name = $"MV {random.Pick(SeedPools.VesselPrefixes)} {random.Pick(SeedPools.VesselSuffixes)}";
            var imoNumber = MakeImoNumber(random);
            var flag = random.Pick(SeedPools.Flags);
            // Short-circuits: when the chance lands, no status is drawn.
            var status = random.Chance(0.8)
                ? VesselStatus.InService
                : random.Pick(EnumNames<VesselStatus>.Values);

            vessels.Add(new Vessel
            {
                Id = PaddedId("vessel", index + 1),
                Name = name,
                ImoNumber = imoNumber,
                Flag = flag,
                Type = type,
                Status = status,
                MinimumSafeManning = new Dictionary<Rank, int>
                {
                    [Rank.Master] = 1,
                    [Rank.ChiefOfficer] = 1,
                    [Rank.ChiefEngineer] = 1,
                    [Rank.SecondEngineer] = 1,
                    [Rank.AB] = abRequirement,
                    [Rank.Oiler] = 2,
                    [Rank.Cook] = 1,
                },
                ReadyToSail = false,
            });
        }

        return vessels;
    }

    private static List<CrewMember> GenerateCrew(SeedRandom random)
    {
        var crew = new List<CrewMember>(CrewCount);

        for (var index = 0; index < CrewCount; index += 1)
        {
            // Drawn for every record, including the demo one whose name is
            // overridden below — skipping the draw would shift the sequence.
            var given = random.Pick(SeedPools.GivenNames);
            var family = random.Pick(SeedPools.FamilyNames);
            var birthYear = random.NextInt(1968, 2003);

            var isDemo = index == 0;
            var rank = isDemo ? Rank.ChiefOfficer : random.Pick(WeightedRanks);
            var nationality = random.Pick(SeedPools.Nationalities);
            var dateOfBirth = new DateOnly(birthYear, random.NextInt(1, 12), random.NextInt(1, 28));

            crew.Add(new CrewMember
            {
                // The first record uses the fixed id the demo Crew Member account maps to.
                Id = isDemo ? DemoCrewMemberCrewId : PaddedId("crew", index + 1),
                Name = isDemo ? "Ariel Santos" : $"{given} {family}",
                Rank = rank,
                Nationality = nationality,
                DateOfBirth = dateOfBirth,
                Status = CrewStatus.Available,
                Email = $"{given}.{family}{index}".ToLowerInvariant() + "@crewlink.dev",
                Phone = string.Create(
                    CultureInfo.InvariantCulture,
                    $"+63 9{random.NextInt(10, 99)} {random.NextInt(100, 999)} {random.NextInt(1000, 9999)}"),
            });
        }

        return crew;
    }

    private static List<Assignment> GenerateAssignments(
        SeedRandom random,
        List<CrewMember> crew,
        List<Vessel> vessels,
        DateOnly today)
    {
        var assignments = new List<Assignment>();
        var sequence = 0;

        foreach (var member in crew)
        {
            if (assignments.Count >= AssignmentCount) break;

            var isDemo = member.Id == DemoCrewMemberCrewId;
            // A minority of the pool has never sailed with this operator.
            if (!isDemo && random.Chance(0.1)) continue;

            var contracts = random.NextInt(1, 3);
            // The demo account is anchored so one of its contracts covers today.
            var cursor = isDemo ? today.AddDays(-60) : today.AddDays(-random.NextInt(60, 900));

            for (var index = 0; index < contracts; index += 1)
            {
                if (assignments.Count >= AssignmentCount) break;

                var signOnDate = cursor;
                var signOffDate = signOnDate.AddDays(random.NextInt(120, 240));

                AssignmentStatus status;
                if (signOnDate > today) status = AssignmentStatus.Planned;
                else if (signOffDate < today) status = AssignmentStatus.Completed;
                else status = AssignmentStatus.Active;

                var vesselId = random.Pick(vessels).Id;
                // Occasionally somebody sails one rank above their substantive rank.
                var rankOnboard = random.Chance(0.08) ? random.Pick(WeightedRanks) : member.Rank;
                var port = random.Pick(SeedPools.Ports);

                sequence += 1;
                assignments.Add(new Assignment
                {
                    Id = PaddedId("assignment", sequence),
                    CrewId = member.Id,
                    VesselId = vesselId,
                    RankOnboard = rankOnboard,
                    SignOnDate = signOnDate,
                    SignOffDate = signOffDate,
                    Port = port,
                    Status = status,
                });

                // Shore leave between contracts, keeping the next range clear
                // rather than merely adjacent.
                cursor = signOffDate.AddDays(random.NextInt(21, 150));

                // Stop once the chain runs past the planning horizon.
                if (cursor > today.AddDays(240)) break;
            }
        }

        return assignments;
    }

    private static List<Certification> GenerateCertifications(
        SeedRandom random,
        List<CrewMember> crew,
        List<Assignment> assignments,
        DateOnly today)
    {
        var certifications = new List<Certification>();
        var sequence = 0;

        // The furthest sign-off and every rank each crew member is committed
        // to — rule 3 checks the rank actually sailed, which can exceed their
        // substantive rank.
        var commitmentEnd = new Dictionary<string, DateOnly>(StringComparer.Ordinal);
        var committedRanks = new Dictionary<string, List<Rank>>(StringComparer.Ordinal);

        foreach (var assignment in assignments)
        {
            if (assignment.Status == AssignmentStatus.Completed) continue;

            if (!commitmentEnd.TryGetValue(assignment.CrewId, out var current) ||
                assignment.SignOffDate > current)
            {
                commitmentEnd[assignment.CrewId] = assignment.SignOffDate;
            }

            // A list, not a HashSet: the TypeScript iterates a JS Set, which
            // preserves insertion order — a HashSet doesn't, and would draw
            // random numbers in a different order.
            if (!committedRanks.TryGetValue(assignment.CrewId, out var ranks))
            {
                ranks = [];
                committedRanks[assignment.CrewId] = ranks;
            }
            if (!ranks.Contains(assignment.RankOnboard)) ranks.Add(assignment.RankOnboard);
        }

        foreach (var member in crew)
        {
            var required = new List<CertificationType>(Rules.RequiredCertificationsByRank[member.Rank]);
            if (committedRanks.TryGetValue(member.Id, out var sailedRanks))
            {
                foreach (var rank in sailedRanks)
                {
                    foreach (var type in Rules.RequiredCertificationsByRank[rank])
                    {
                        if (!required.Contains(type)) required.Add(type);
                    }
                }
            }

            var hasCommitment = commitmentEnd.TryGetValue(member.Id, out var mustOutlast);

            foreach (var type in required)
            {
                DateOnly expiryDate;
                if (hasCommitment)
                {
                    // Valid for the whole contract, plus a realistic margin beyond it.
                    expiryDate = mustOutlast.AddDays(random.NextInt(30, 900));
                }
                else
                {
                    // A minority are expired or expiring soon, so the compliance
                    // views have something real to show.
                    var roll = random.Next();
                    int expiryOffset;
                    if (roll < 0.12) expiryOffset = random.NextInt(-400, -1);
                    else if (roll < 0.26) expiryOffset = random.NextInt(1, 30);
                    else if (roll < 0.42) expiryOffset = random.NextInt(31, 90);
                    else expiryOffset = random.NextInt(120, 1500);
                    expiryDate = today.AddDays(expiryOffset);
                }

                var issueDate = expiryDate.AddDays(-random.NextInt(730, 1825));
                var issuingAuthority = random.Pick(SeedPools.IssuingAuthorities);

                sequence += 1;
                certifications.Add(new Certification
                {
                    Id = PaddedId("certification", sequence),
                    CrewId = member.Id,
                    Type = type,
                    IssueDate = issueDate,
                    ExpiryDate = expiryDate,
                    IssuingAuthority = issuingAuthority,
                });
            }

            // A few hold extras beyond what their rank strictly requires.
            if (random.Chance(0.15))
            {
                var extra = random.Pick(EnumNames<CertificationType>.Values);
                if (!required.Contains(extra))
                {
                    var expiryDate = today.AddDays(random.NextInt(200, 1500));
                    var issuingAuthority = random.Pick(SeedPools.IssuingAuthorities);

                    sequence += 1;
                    certifications.Add(new Certification
                    {
                        Id = PaddedId("certification", sequence),
                        CrewId = member.Id,
                        Type = extra,
                        IssueDate = expiryDate.AddDays(-1095),
                        ExpiryDate = expiryDate,
                        IssuingAuthority = issuingAuthority,
                    });
                }
            }
        }

        return certifications;
    }
}
