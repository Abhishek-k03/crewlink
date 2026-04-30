using System.Collections.Frozen;
using System.Text.Json.Serialization;

namespace CrewLink.Api.Domain;

/// <summary>
/// The four business rules, as pure functions: no I/O, <c>today</c> always passed
/// in explicitly, results are structured detail rather than booleans.
/// </summary>
/// <remarks>
/// A deliberate second implementation of <c>src/domain/rules.ts</c> — the browser
/// build has to work with no backend, so the logic exists twice, guarded against
/// drift by <c>RulesTests.cs</c> porting <c>rules.test.ts</c> case for case.
/// </remarks>
public static class Rules
{
    /// <summary>
    /// Certificates required per rank for an assignment to be legal (rule 3).
    /// Policy, not spec-derived — the spec never defines "any required
    /// certification", so this fills the gap explicitly.
    /// </summary>
    public static readonly FrozenDictionary<Rank, CertificationType[]> RequiredCertificationsByRank =
        new Dictionary<Rank, CertificationType[]>
        {
            [Rank.Master] =
            [
                CertificationType.Stcw, CertificationType.MedicalFitness, CertificationType.Gmdss,
                CertificationType.SeamansBook, CertificationType.Passport,
            ],
            [Rank.ChiefOfficer] =
            [
                CertificationType.Stcw, CertificationType.MedicalFitness, CertificationType.Gmdss,
                CertificationType.SeamansBook, CertificationType.Passport,
            ],
            [Rank.ChiefEngineer] =
            [
                CertificationType.Stcw, CertificationType.MedicalFitness,
                CertificationType.SeamansBook, CertificationType.Passport,
            ],
            [Rank.SecondEngineer] =
            [
                CertificationType.Stcw, CertificationType.MedicalFitness,
                CertificationType.SeamansBook, CertificationType.Passport,
            ],
            [Rank.AB] =
            [
                CertificationType.Stcw, CertificationType.MedicalFitness, CertificationType.SeamansBook,
            ],
            [Rank.Oiler] =
            [
                CertificationType.Stcw, CertificationType.MedicalFitness, CertificationType.SeamansBook,
            ],
            [Rank.Cook] = [CertificationType.MedicalFitness, CertificationType.SeamansBook],
        }.ToFrozenDictionary();

    /// <summary>
    /// Half-open <c>[start, end)</c>: a same-day handover is legal. A closed
    /// interval is equally defensible — this is a judgment call, pinned by a test.
    /// </summary>
    private static bool RangesOverlap(DateOnly aStart, DateOnly aEnd, DateOnly bStart, DateOnly bEnd) =>
        !(aEnd <= bStart || bEnd <= aStart);

    /// <summary>
    /// Rule 1. Existing assignments that conflict with <paramref name="candidate"/>:
    /// same crew member, Planned or Active, not the candidate itself, overlapping dates.
    /// </summary>
    public static List<Assignment> FindConflictingAssignments(
        Assignment candidate,
        IEnumerable<Assignment> existing)
    {
        var conflicts = new List<Assignment>();
        foreach (var assignment in existing)
        {
            var sameCrewMember = candidate.CrewId == assignment.CrewId;
            var isNotCandidateItself = candidate.Id != assignment.Id;
            var occupiesCalendar = assignment.Status is AssignmentStatus.Active or AssignmentStatus.Planned;
            var datesConflict = RangesOverlap(
                candidate.SignOnDate, candidate.SignOffDate,
                assignment.SignOnDate, assignment.SignOffDate);

            if (sameCrewMember && isNotCandidateItself && occupiesCalendar && datesConflict)
            {
                conflicts.Add(assignment);
            }
        }
        return conflicts;
    }

    /// <summary>
    /// Rule 2. Compares a vessel's currently-crewed ranks against its minimum safe
    /// manning. "Currently crewed" is Active with <paramref name="today"/> inside
    /// the contract dates, inclusive on both ends — unlike rule 1's half-open choice.
    /// </summary>
    public static ManningCompliance CheckManningCompliance(
        Vessel vessel,
        IEnumerable<Assignment> assignments,
        DateOnly today)
    {
        // Counts the rank actually sailed, not the crew member's substantive
        // rank — a Chief Officer sailing as Master fills the Master slot.
        var countByRank = new Dictionary<Rank, int>();
        foreach (var assignment in assignments)
        {
            var validVesselId = assignment.VesselId == vessel.Id;
            var validStatus = assignment.Status == AssignmentStatus.Active;
            var todayValid = assignment.SignOnDate <= today && today <= assignment.SignOffDate;
            if (!validVesselId || !validStatus || !todayValid) continue;

            countByRank[assignment.RankOnboard] = countByRank.GetValueOrDefault(assignment.RankOnboard) + 1;
        }

        var shortfalls = new List<ManningShortfall>();
        foreach (var rank in Ranks.All)
        {
            var required = vessel.MinimumSafeManning.GetValueOrDefault(rank);
            var actual = countByRank.GetValueOrDefault(rank);
            if (actual < required)
            {
                shortfalls.Add(new ManningShortfall(rank, required, actual, required - actual));
            }
        }

        return new ManningCompliance(shortfalls.Count == 0, shortfalls);
    }

    /// <summary>
    /// Rule 3. Certificates blocking this rotation: missing outright, or expiring
    /// before <paramref name="signOffDate"/> — not before "today". Valid up to and
    /// including its expiry date, so expiring exactly on sign-off doesn't block.
    /// </summary>
    public static List<CertificationBlock> FindBlockingCertifications(
        CrewMember crew,
        IEnumerable<Certification> certifications,
        Rank rankOnboard,
        DateOnly signOffDate)
    {
        var held = certifications.Where(certification => certification.CrewId == crew.Id).ToList();
        var blocks = new List<CertificationBlock>();

        foreach (var type in RequiredCertificationsByRank[rankOnboard])
        {
            // Two certificates of the same type can exist (an old one and a
            // renewal) — take whichever expires latest.
            Certification? best = null;
            foreach (var certification in held)
            {
                if (certification.Type != type) continue;
                if (best is null || certification.ExpiryDate > best.ExpiryDate) best = certification;
            }

            if (best is null)
            {
                blocks.Add(new CertificationBlock(type, CertificationBlockReason.Missing));
                continue;
            }

            if (best.ExpiryDate < signOffDate)
            {
                blocks.Add(new CertificationBlock(
                    type,
                    CertificationBlockReason.ExpiresBeforeSignOff,
                    best.ExpiryDate,
                    Dates.DaysBetween(best.ExpiryDate, signOffDate)));
            }
        }

        return blocks;
    }

    /// <summary>
    /// Rule 4. Days an Active assignment has overrun its sign-off date; 0 when not
    /// overdue. A Planned assignment past its dates is a planning error, not an
    /// overrun, and returns 0 rather than conflating the two.
    /// </summary>
    public static int GetOverdueDays(Assignment assignment, DateOnly today)
    {
        if (assignment.Status != AssignmentStatus.Active) return 0;

        var overdueDays = Dates.DaysBetween(assignment.SignOffDate, today);
        return overdueDays > 0 ? overdueDays : 0;
    }
}

public sealed record ManningShortfall(Rank Rank, int Required, int Actual, int Short);

public sealed record ManningCompliance(bool Compliant, IReadOnlyList<ManningShortfall> Shortfalls);

public enum CertificationBlockReason
{
    [JsonStringEnumMemberName("missing")] Missing,
    [JsonStringEnumMemberName("expires-before-sign-off")] ExpiresBeforeSignOff,
}

public sealed record CertificationBlock(
    CertificationType Type,
    CertificationBlockReason Reason,
    DateOnly? ExpiryDate = null,
    int? DaysShort = null);
