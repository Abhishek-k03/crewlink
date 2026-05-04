using CrewLink.Api.Domain;

namespace CrewLink.Api.Contracts;

// Two shapes per entity: a full input (POST) and a patch (PATCH). Both funnel
// into the same validator, since a patch is validated as the merged record
// rather than on its own — otherwise a sign-on date could move past an
// untouched sign-off date. Strings are trimmed on the way in, matching the
// client's z.string().trim().

public sealed class VesselInput
{
    public string? Name { get; set; }
    public string? ImoNumber { get; set; }
    public string? Flag { get; set; }
    public VesselType? Type { get; set; }
    public VesselStatus? Status { get; set; }
    public Dictionary<Rank, int>? MinimumSafeManning { get; set; }
    public bool? ReadyToSail { get; set; }

    public VesselInput Normalise()
    {
        Name = Name?.Trim();
        ImoNumber = ImoNumber?.Trim();
        Flag = Flag?.Trim();
        return this;
    }

    public static VesselInput From(Vessel vessel) => new()
    {
        Name = vessel.Name,
        ImoNumber = vessel.ImoNumber,
        Flag = vessel.Flag,
        Type = vessel.Type,
        Status = vessel.Status,
        MinimumSafeManning = new Dictionary<Rank, int>(vessel.MinimumSafeManning),
        ReadyToSail = vessel.ReadyToSail,
    };

    /// <summary>Only called after validation — the null-forgiving operators rely on that.</summary>
    public Vessel ToVessel(string id) => new()
    {
        Id = id,
        Name = Name!,
        ImoNumber = ImoNumber!,
        Flag = Flag!,
        Type = Type!.Value,
        Status = Status!.Value,
        // A rank left blank means "no minimum", not zero — drop the key.
        MinimumSafeManning = MinimumSafeManning is null
            ? []
            : MinimumSafeManning.Where(pair => pair.Value > 0).ToDictionary(),
        ReadyToSail = ReadyToSail!.Value,
    };

    public void ApplyTo(Vessel vessel)
    {
        var next = ToVessel(vessel.Id);
        vessel.Name = next.Name;
        vessel.ImoNumber = next.ImoNumber;
        vessel.Flag = next.Flag;
        vessel.Type = next.Type;
        vessel.Status = next.Status;
        vessel.MinimumSafeManning = next.MinimumSafeManning;
        vessel.ReadyToSail = next.ReadyToSail;
    }
}

public sealed class VesselPatch
{
    public Patch<string> Name { get; set; }
    public Patch<string> ImoNumber { get; set; }
    public Patch<string> Flag { get; set; }
    public Patch<VesselType> Type { get; set; }
    public Patch<VesselStatus> Status { get; set; }
    public Patch<Dictionary<Rank, int>> MinimumSafeManning { get; set; }
    public Patch<bool> ReadyToSail { get; set; }

    public VesselInput ApplyTo(VesselInput baseline) => new()
    {
        Name = Name.Or(baseline.Name),
        ImoNumber = ImoNumber.Or(baseline.ImoNumber),
        Flag = Flag.Or(baseline.Flag),
        Type = Type.IsSet ? Type.Value : baseline.Type,
        Status = Status.IsSet ? Status.Value : baseline.Status,
        MinimumSafeManning = MinimumSafeManning.Or(baseline.MinimumSafeManning),
        ReadyToSail = ReadyToSail.IsSet ? ReadyToSail.Value : baseline.ReadyToSail,
    };
}

public sealed class CrewInput
{
    public string? Name { get; set; }
    public Rank? Rank { get; set; }
    public string? Nationality { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public CrewStatus? Status { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }

    public CrewInput Normalise()
    {
        Name = Name?.Trim();
        Nationality = Nationality?.Trim();
        Email = Email?.Trim();
        Phone = Phone?.Trim();
        return this;
    }

    public static CrewInput From(CrewMember member) => new()
    {
        Name = member.Name,
        Rank = member.Rank,
        Nationality = member.Nationality,
        DateOfBirth = member.DateOfBirth,
        Status = member.Status,
        Email = member.Email,
        Phone = member.Phone,
    };

    public CrewMember ToCrewMember(string id) => new()
    {
        Id = id,
        Name = Name!,
        Rank = Rank!.Value,
        Nationality = Nationality!,
        DateOfBirth = DateOfBirth!.Value,
        Status = Status!.Value,
        Email = Email!,
        Phone = Phone!,
    };

    public void ApplyTo(CrewMember member)
    {
        var next = ToCrewMember(member.Id);
        member.Name = next.Name;
        member.Rank = next.Rank;
        member.Nationality = next.Nationality;
        member.DateOfBirth = next.DateOfBirth;
        member.Status = next.Status;
        member.Email = next.Email;
        member.Phone = next.Phone;
    }
}

public sealed class CrewPatch
{
    public Patch<string> Name { get; set; }
    public Patch<Rank> Rank { get; set; }
    public Patch<string> Nationality { get; set; }
    public Patch<DateOnly> DateOfBirth { get; set; }
    public Patch<CrewStatus> Status { get; set; }
    public Patch<string> Email { get; set; }
    public Patch<string> Phone { get; set; }

    public CrewInput ApplyTo(CrewInput baseline) => new()
    {
        Name = Name.Or(baseline.Name),
        Rank = Rank.IsSet ? Rank.Value : baseline.Rank,
        Nationality = Nationality.Or(baseline.Nationality),
        DateOfBirth = DateOfBirth.IsSet ? DateOfBirth.Value : baseline.DateOfBirth,
        Status = Status.IsSet ? Status.Value : baseline.Status,
        Email = Email.Or(baseline.Email),
        Phone = Phone.Or(baseline.Phone),
    };
}

public sealed class AssignmentInput
{
    public string? CrewId { get; set; }
    public string? VesselId { get; set; }
    public Rank? RankOnboard { get; set; }
    public DateOnly? SignOnDate { get; set; }
    public DateOnly? SignOffDate { get; set; }
    public string? Port { get; set; }
    public AssignmentStatus? Status { get; set; }

    public AssignmentInput Normalise()
    {
        Port = Port?.Trim();
        return this;
    }

    public static AssignmentInput From(Assignment assignment) => new()
    {
        CrewId = assignment.CrewId,
        VesselId = assignment.VesselId,
        RankOnboard = assignment.RankOnboard,
        SignOnDate = assignment.SignOnDate,
        SignOffDate = assignment.SignOffDate,
        Port = assignment.Port,
        Status = assignment.Status,
    };

    public Assignment ToAssignment(string id) => new()
    {
        Id = id,
        CrewId = CrewId!,
        VesselId = VesselId!,
        RankOnboard = RankOnboard!.Value,
        SignOnDate = SignOnDate!.Value,
        SignOffDate = SignOffDate!.Value,
        Port = Port!,
        Status = Status!.Value,
    };

    public void ApplyTo(Assignment assignment)
    {
        var next = ToAssignment(assignment.Id);
        assignment.CrewId = next.CrewId;
        assignment.VesselId = next.VesselId;
        assignment.RankOnboard = next.RankOnboard;
        assignment.SignOnDate = next.SignOnDate;
        assignment.SignOffDate = next.SignOffDate;
        assignment.Port = next.Port;
        assignment.Status = next.Status;
    }
}

public sealed class AssignmentPatch
{
    public Patch<string> CrewId { get; set; }
    public Patch<string> VesselId { get; set; }
    public Patch<Rank> RankOnboard { get; set; }
    public Patch<DateOnly> SignOnDate { get; set; }
    public Patch<DateOnly> SignOffDate { get; set; }
    public Patch<string> Port { get; set; }
    public Patch<AssignmentStatus> Status { get; set; }

    public AssignmentInput ApplyTo(AssignmentInput baseline) => new()
    {
        CrewId = CrewId.Or(baseline.CrewId),
        VesselId = VesselId.Or(baseline.VesselId),
        RankOnboard = RankOnboard.IsSet ? RankOnboard.Value : baseline.RankOnboard,
        SignOnDate = SignOnDate.IsSet ? SignOnDate.Value : baseline.SignOnDate,
        SignOffDate = SignOffDate.IsSet ? SignOffDate.Value : baseline.SignOffDate,
        Port = Port.Or(baseline.Port),
        Status = Status.IsSet ? Status.Value : baseline.Status,
    };
}

public sealed class CertificationDocumentInput
{
    public string? FileName { get; set; }
    public string? MimeType { get; set; }
    public long? SizeBytes { get; set; }
    public string? Data { get; set; }

    public CertificationDocument ToDocument() => new()
    {
        FileName = FileName!,
        MimeType = MimeType!,
        SizeBytes = SizeBytes!.Value,
        Data = Data!,
    };

    public static CertificationDocumentInput From(CertificationDocument document) => new()
    {
        FileName = document.FileName,
        MimeType = document.MimeType,
        SizeBytes = document.SizeBytes,
        Data = document.Data,
    };
}

public sealed class CertificationInput
{
    public string? CrewId { get; set; }
    public CertificationType? Type { get; set; }
    public DateOnly? IssueDate { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public string? IssuingAuthority { get; set; }
    public CertificationDocumentInput? Document { get; set; }

    public CertificationInput Normalise()
    {
        IssuingAuthority = IssuingAuthority?.Trim();
        return this;
    }

    public static CertificationInput From(Certification certification) => new()
    {
        CrewId = certification.CrewId,
        Type = certification.Type,
        IssueDate = certification.IssueDate,
        ExpiryDate = certification.ExpiryDate,
        IssuingAuthority = certification.IssuingAuthority,
        Document = certification.Document is null
            ? null
            : CertificationDocumentInput.From(certification.Document),
    };

    public Certification ToCertification(string id) => new()
    {
        Id = id,
        CrewId = CrewId!,
        Type = Type!.Value,
        IssueDate = IssueDate!.Value,
        ExpiryDate = ExpiryDate!.Value,
        IssuingAuthority = IssuingAuthority!,
        Document = Document?.ToDocument(),
    };

    public void ApplyTo(Certification certification)
    {
        var next = ToCertification(certification.Id);
        certification.CrewId = next.CrewId;
        certification.Type = next.Type;
        certification.IssueDate = next.IssueDate;
        certification.ExpiryDate = next.ExpiryDate;
        certification.IssuingAuthority = next.IssuingAuthority;
        certification.Document = next.Document;
    }
}

public sealed class CertificationPatch
{
    public Patch<string> CrewId { get; set; }
    public Patch<CertificationType> Type { get; set; }
    public Patch<DateOnly> IssueDate { get; set; }
    public Patch<DateOnly> ExpiryDate { get; set; }
    public Patch<string> IssuingAuthority { get; set; }

    /// <summary>Absent leaves the existing scan alone; an explicit <c>null</c> removes it.</summary>
    public Patch<CertificationDocumentInput> Document { get; set; }

    public CertificationInput ApplyTo(CertificationInput baseline) => new()
    {
        CrewId = CrewId.Or(baseline.CrewId),
        Type = Type.IsSet ? Type.Value : baseline.Type,
        IssueDate = IssueDate.IsSet ? IssueDate.Value : baseline.IssueDate,
        ExpiryDate = ExpiryDate.IsSet ? ExpiryDate.Value : baseline.ExpiryDate,
        IssuingAuthority = IssuingAuthority.Or(baseline.IssuingAuthority),
        Document = Document.IsSet ? Document.Value : baseline.Document,
    };
}
