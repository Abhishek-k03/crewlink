namespace CrewLink.Api.Domain;

// The vocabulary of the domain, mirroring src/domain/types.ts field for field.
// These double as the EF Core entities but carry no EF attributes — mapping
// lives in Data/CrewLinkDbContext.cs, so this folder stays free of persistence
// concerns and testable without a database.

public sealed class Vessel
{
    public required string Id { get; set; }
    public required string Name { get; set; }

    /// <summary>Seven digits, unique across the fleet; carries an IMO check digit.</summary>
    public required string ImoNumber { get; set; }

    public required string Flag { get; set; }
    public VesselType Type { get; set; }
    public VesselStatus Status { get; set; }

    /// <summary>
    /// Minimum crew required per rank. Sparse, like the client's
    /// <c>Partial&lt;Record&lt;Rank, number&gt;&gt;</c> — an absent rank
    /// requires nobody, rather than forcing an explicit zero for all seven.
    /// </summary>
    public Dictionary<Rank, int> MinimumSafeManning { get; set; } = [];

    public bool ReadyToSail { get; set; }
}

public sealed class CrewMember
{
    public required string Id { get; set; }
    public required string Name { get; set; }

    /// <summary>Substantive rank, may differ from the rank sailed on a given contract.</summary>
    public Rank Rank { get; set; }

    public required string Nationality { get; set; }
    public DateOnly DateOfBirth { get; set; }
    public CrewStatus Status { get; set; }
    public required string Email { get; set; }
    public required string Phone { get; set; }
}

public sealed class Assignment
{
    public required string Id { get; set; }
    public required string CrewId { get; set; }
    public required string VesselId { get; set; }

    /// <summary>The rank actually filled on this contract; may exceed the crew member's own.</summary>
    public Rank RankOnboard { get; set; }

    public DateOnly SignOnDate { get; set; }
    public DateOnly SignOffDate { get; set; }
    public required string Port { get; set; }
    public AssignmentStatus Status { get; set; }
}

/// <summary>An uploaded scan. Keeps filename and MIME type alongside the data,
/// unlike a bare base64 string.</summary>
public sealed class CertificationDocument
{
    public required string FileName { get; set; }
    public required string MimeType { get; set; }

    /// <summary>Size of the original file, before base64 inflates it ~33%.</summary>
    public long SizeBytes { get; set; }

    /// <summary>base64-encoded, without the <c>data:</c> URL prefix.</summary>
    public required string Data { get; set; }
}

public sealed class Certification
{
    public required string Id { get; set; }
    public required string CrewId { get; set; }
    public CertificationType Type { get; set; }
    public DateOnly IssueDate { get; set; }
    public DateOnly ExpiryDate { get; set; }
    public required string IssuingAuthority { get; set; }
    public CertificationDocument? Document { get; set; }
}
