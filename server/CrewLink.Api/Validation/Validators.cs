using CrewLink.Api.Contracts;
using CrewLink.Api.Domain;

using FluentValidation;

namespace CrewLink.Api.Validation;

// These mirror src/domain/schemas.ts, message for message — the client maps a
// 400's fieldErrors straight onto the form with setError. Anything the form
// can't know (a duplicate IMO, a manning shortfall) is a rule violation, 422
// instead.

public sealed class VesselInputValidator : AbstractValidator<VesselInput>
{
    public VesselInputValidator()
    {
        RuleFor(input => input.Name)
            .NotEmpty().WithMessage("Name is required")
            .MaximumLength(80);

        RuleFor(input => input.ImoNumber)
            .Must(Imo.IsValid).WithMessage("Must be 7 digits with a valid IMO check digit");

        RuleFor(input => input.Flag)
            .NotEmpty().WithMessage("Flag is required");

        RuleFor(input => input.Type).NotNull().WithMessage("Type is required");
        RuleFor(input => input.Status).NotNull().WithMessage("Status is required");
        RuleFor(input => input.ReadyToSail).NotNull().WithMessage("Ready to sail is required");

        RuleFor(input => input.MinimumSafeManning)
            .Must(manning => manning is null || manning.Values.All(count => count is >= 0 and <= 50))
            .WithMessage("Each rank requires between 0 and 50 crew");
    }
}

public sealed class CrewInputValidator : AbstractValidator<CrewInput>
{
    public CrewInputValidator()
    {
        RuleFor(input => input.Name)
            .NotEmpty().WithMessage("Name is required")
            .MaximumLength(80);

        RuleFor(input => input.Rank).NotNull().WithMessage("Rank is required");
        RuleFor(input => input.Status).NotNull().WithMessage("Status is required");

        RuleFor(input => input.Nationality)
            .NotEmpty().WithMessage("Nationality is required");

        RuleFor(input => input.DateOfBirth)
            .NotNull().WithMessage("Use the format YYYY-MM-DD");

        RuleFor(input => input.Email)
            .NotEmpty().WithMessage("Enter a valid email address")
            .EmailAddress().WithMessage("Enter a valid email address");

        RuleFor(input => input.Phone)
            .NotNull().MinimumLength(6).WithMessage("Enter a contact number");
    }
}

public sealed class AssignmentInputValidator : AbstractValidator<AssignmentInput>
{
    public AssignmentInputValidator()
    {
        RuleFor(input => input.CrewId).NotEmpty().WithMessage("A crew member is required");
        RuleFor(input => input.VesselId).NotEmpty().WithMessage("A vessel is required");
        RuleFor(input => input.RankOnboard).NotNull().WithMessage("Rank onboard is required");
        RuleFor(input => input.Status).NotNull().WithMessage("Status is required");
        RuleFor(input => input.Port).NotEmpty().WithMessage("Port is required");

        RuleFor(input => input.SignOnDate).NotNull().WithMessage("Use the format YYYY-MM-DD");
        RuleFor(input => input.SignOffDate).NotNull().WithMessage("Use the format YYYY-MM-DD");

        // Reported against sign-off, matching zod's path: ['signOffDate'].
        RuleFor(input => input.SignOffDate)
            .Must((input, signOffDate) => input.SignOnDate < signOffDate)
            .WithMessage("Sign-off must be after sign-on")
            .When(input => input.SignOnDate is not null && input.SignOffDate is not null);
    }
}

public sealed class CertificationInputValidator : AbstractValidator<CertificationInput>
{
    public CertificationInputValidator()
    {
        RuleFor(input => input.CrewId).NotEmpty().WithMessage("A crew member is required");
        RuleFor(input => input.Type).NotNull().WithMessage("Certificate type is required");

        RuleFor(input => input.IssueDate).NotNull().WithMessage("Use the format YYYY-MM-DD");
        RuleFor(input => input.ExpiryDate).NotNull().WithMessage("Use the format YYYY-MM-DD");

        RuleFor(input => input.IssuingAuthority)
            .NotEmpty().WithMessage("Issuing authority is required");

        RuleFor(input => input.ExpiryDate)
            .Must((input, expiryDate) => input.IssueDate < expiryDate)
            .WithMessage("Expiry must be after issue")
            .When(input => input.IssueDate is not null && input.ExpiryDate is not null);

        When(input => input.Document is not null, () =>
        {
            RuleFor(input => input.Document!.FileName).NotEmpty().WithMessage("The file needs a name");
            RuleFor(input => input.Document!.MimeType).NotEmpty().WithMessage("The file needs a type");
            RuleFor(input => input.Document!.Data).NotNull().WithMessage("The file has no content");
            RuleFor(input => input.Document!.SizeBytes)
                .NotNull()
                .GreaterThanOrEqualTo(0)
                .WithMessage("The file size is not valid");

            // The client caps uploads at 2 MB too, but a client-side cap is a
            // courtesy, not a control.
            RuleFor(input => input.Document!.SizeBytes)
                .LessThanOrEqualTo(MaxDocumentBytes)
                .WithMessage("Scans must be 2 MB or smaller");
        });
    }

    private const long MaxDocumentBytes = 2 * 1024 * 1024;
}
