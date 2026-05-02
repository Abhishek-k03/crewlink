using System.Globalization;
using System.Security.Cryptography;
using System.Text;

using CrewLink.Api.Domain;

namespace CrewLink.Api.Data;

/// <summary>
/// A canonical fingerprint of a generated dataset, used to prove the C# and
/// TypeScript generators produce the same fleet.
/// </summary>
/// <remarks>
/// A single reordered random draw would break "byte-identical seed data across
/// two languages" silently, and the result would still look plausible. Rather
/// than committing a multi-megabyte fixture, both sides render the dataset to
/// canonical text and hash it; the matching test in each language asserts the
/// same constant.
/// </remarks>
public static class SeedDigest
{
    public static string Compute(SeedDataset data)
    {
        var builder = new StringBuilder();

        foreach (var vessel in data.Vessels)
        {
            builder.Append("V|")
                .Append(vessel.Id).Append('|')
                .Append(vessel.Name).Append('|')
                .Append(vessel.ImoNumber).Append('|')
                .Append(vessel.Flag).Append('|')
                .Append(EnumNames<VesselType>.Name(vessel.Type)).Append('|')
                .Append(EnumNames<VesselStatus>.Name(vessel.Status)).Append('|')
                .Append(Manning(vessel.MinimumSafeManning)).Append('|')
                .Append(vessel.ReadyToSail ? "true" : "false")
                .Append('\n');
        }

        foreach (var member in data.Crew)
        {
            builder.Append("C|")
                .Append(member.Id).Append('|')
                .Append(member.Name).Append('|')
                .Append(EnumNames<Rank>.Name(member.Rank)).Append('|')
                .Append(member.Nationality).Append('|')
                .Append(Iso(member.DateOfBirth)).Append('|')
                .Append(EnumNames<CrewStatus>.Name(member.Status)).Append('|')
                .Append(member.Email).Append('|')
                .Append(member.Phone)
                .Append('\n');
        }

        foreach (var assignment in data.Assignments)
        {
            builder.Append("A|")
                .Append(assignment.Id).Append('|')
                .Append(assignment.CrewId).Append('|')
                .Append(assignment.VesselId).Append('|')
                .Append(EnumNames<Rank>.Name(assignment.RankOnboard)).Append('|')
                .Append(Iso(assignment.SignOnDate)).Append('|')
                .Append(Iso(assignment.SignOffDate)).Append('|')
                .Append(assignment.Port).Append('|')
                .Append(EnumNames<AssignmentStatus>.Name(assignment.Status))
                .Append('\n');
        }

        foreach (var certification in data.Certifications)
        {
            builder.Append("X|")
                .Append(certification.Id).Append('|')
                .Append(certification.CrewId).Append('|')
                .Append(EnumNames<CertificationType>.Name(certification.Type)).Append('|')
                .Append(Iso(certification.IssueDate)).Append('|')
                .Append(Iso(certification.ExpiryDate)).Append('|')
                .Append(certification.IssuingAuthority)
                .Append('\n');
        }

        return Convert.ToHexStringLower(
            SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString())));
    }

    private static string Iso(DateOnly date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string Manning(Dictionary<Rank, int> manning) =>
        string.Join(',', Ranks.All
            .Where(manning.ContainsKey)
            .Select(rank => $"{EnumNames<Rank>.Name(rank)}={manning[rank].ToString(CultureInfo.InvariantCulture)}"));
}
