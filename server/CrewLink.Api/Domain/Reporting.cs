using System.Text.Json.Serialization;

namespace CrewLink.Api.Domain;

public enum ExpiryBucket
{
    [JsonStringEnumMemberName("Expired")] Expired,
    [JsonStringEnumMemberName("Within 30 days")] Within30Days,
    [JsonStringEnumMemberName("Within 90 days")] Within90Days,
    [JsonStringEnumMemberName("Valid")] Valid,
}

public sealed record RankCount(Rank Rank, int Count);

public sealed record RotationsInMonth(string Month, int SignOns, int SignOffs);

public sealed record FleetCompliance(int Compliant, int BelowManning);

public sealed record CertificationStatusCount(ExpiryBucket Bucket, int Count);

public sealed record DashboardSummary(
    int CrewOnboard,
    int VesselsBelowManning,
    int CertificationsExpiringSoon,
    int OverdueRotations,
    IReadOnlyList<RankCount> CrewByRank,
    IReadOnlyList<RotationsInMonth> RotationsOverTime,
    FleetCompliance FleetCompliance,
    IReadOnlyList<CertificationStatusCount> CertificationStatus);

public static class Reporting
{
    public const int ExpiringSoonDays = 30;
    private const int TrendMonths = 12;

    /// <summary>The colour-coding the certification views key off.</summary>
    public static ExpiryBucket GetExpiryBucket(DateOnly expiryDate, DateOnly today)
    {
        var days = Dates.DaysBetween(today, expiryDate);
        if (days < 0) return ExpiryBucket.Expired;
        if (days <= 30) return ExpiryBucket.Within30Days;
        if (days <= 90) return ExpiryBucket.Within90Days;
        return ExpiryBucket.Valid;
    }

    /// <summary>Every dashboard figure, computed in one pass over the data.</summary>
    /// <remarks>
    /// Reuses the business rules rather than reimplementing "below manning" or
    /// "overdue" — two definitions of the same concept is how a dashboard ends
    /// up disagreeing with the page it links to.
    /// </remarks>
    public static DashboardSummary BuildDashboardSummary(
        IReadOnlyList<Vessel> vessels,
        IReadOnlyList<CrewMember> crew,
        IReadOnlyList<Assignment> assignments,
        IReadOnlyList<Certification> certifications,
        DateOnly today)
    {
        // Distinct crew, not active assignments — a data error producing two
        // active rows for one person shouldn't count as two.
        var crewOnboard = assignments
            .Where(assignment =>
                assignment.Status == AssignmentStatus.Active &&
                assignment.SignOnDate <= today &&
                today <= assignment.SignOffDate)
            .Select(assignment => assignment.CrewId)
            .Distinct()
            .Count();

        var belowManning = vessels.Count(vessel =>
            !Rules.CheckManningCompliance(vessel, assignments, today).Compliant);

        var rankCounts = new Dictionary<Rank, int>();
        foreach (var member in crew)
        {
            rankCounts[member.Rank] = rankCounts.GetValueOrDefault(member.Rank) + 1;
        }

        var bucketCounts = new Dictionary<ExpiryBucket, int>();
        var expiringSoon = 0;
        foreach (var certification in certifications)
        {
            var bucket = GetExpiryBucket(certification.ExpiryDate, today);
            bucketCounts[bucket] = bucketCounts.GetValueOrDefault(bucket) + 1;

            var days = Dates.DaysBetween(today, certification.ExpiryDate);
            if (days >= 0 && days <= ExpiringSoonDays) expiringSoon += 1;
        }

        // A fixed window of months, built first and filled after, so a month
        // with no movements is a zero rather than a gap in the line.
        var firstMonth = Dates.StartOfMonth(today.AddMonths(-(TrendMonths - 1)));
        var months = Enumerable
            .Range(0, TrendMonths)
            .Select(offset => Dates.MonthKey(firstMonth.AddMonths(offset)))
            .ToList();

        var signOns = new Dictionary<string, int>(StringComparer.Ordinal);
        var signOffs = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var assignment in assignments)
        {
            var onKey = Dates.MonthKey(assignment.SignOnDate);
            var offKey = Dates.MonthKey(assignment.SignOffDate);
            signOns[onKey] = signOns.GetValueOrDefault(onKey) + 1;
            signOffs[offKey] = signOffs.GetValueOrDefault(offKey) + 1;
        }

        return new DashboardSummary(
            CrewOnboard: crewOnboard,
            VesselsBelowManning: belowManning,
            CertificationsExpiringSoon: expiringSoon,
            OverdueRotations: assignments.Count(assignment => Rules.GetOverdueDays(assignment, today) > 0),
            CrewByRank: Ranks.All
                .Select(rank => new RankCount(rank, rankCounts.GetValueOrDefault(rank)))
                .ToList(),
            RotationsOverTime: months
                .Select(month => new RotationsInMonth(
                    month,
                    signOns.GetValueOrDefault(month),
                    signOffs.GetValueOrDefault(month)))
                .ToList(),
            FleetCompliance: new FleetCompliance(vessels.Count - belowManning, belowManning),
            CertificationStatus: EnumNames<ExpiryBucket>.Values
                .Select(bucket => new CertificationStatusCount(bucket, bucketCounts.GetValueOrDefault(bucket)))
                .ToList());
    }
}
