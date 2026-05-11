using CrewLink.Api.Domain;

using static CrewLink.Api.Tests.TestFactories;

namespace CrewLink.Api.Tests;

/// <summary>A port of <c>src/domain/rules.test.ts</c>, case for case.</summary>
/// <remarks>
/// The business rules exist in two languages because the browser build has to
/// work with no backend. Every boundary the TypeScript suite pins down is
/// pinned here too, so a divergence fails a test instead of quietly shipping
/// two systems that disagree about who is allowed to sail.
/// </remarks>
public class FindConflictingAssignmentsTests
{
    [Fact]
    public void ReturnsNoConflictsWhenTheCrewMemberHasNoOtherAssignments()
    {
        var candidate = Assignment(crewId: "crew-A");

        Assert.Empty(Rules.FindConflictingAssignments(candidate, []));
    }

    [Fact]
    public void FlagsAnAssignmentThatFallsEntirelyInsideAnExistingRotation()
    {
        var existing = Assignment(
            crewId: "crew-A", signOnDate: "2024-01-01", signOffDate: "2024-06-30",
            status: AssignmentStatus.Active);
        var candidate = Assignment(
            crewId: "crew-A", signOnDate: "2024-03-01", signOffDate: "2024-04-01");

        Assert.Equal([existing], Rules.FindConflictingAssignments(candidate, [existing]));
    }

    /* Exclusions */

    [Fact]
    public void IgnoresAssignmentsBelongingToADifferentCrewMember()
    {
        var existing = Assignment(
            crewId: "crew-B", signOnDate: "2024-01-01", signOffDate: "2024-06-30",
            status: AssignmentStatus.Active);
        var candidate = Assignment(
            crewId: "crew-A", signOnDate: "2024-03-01", signOffDate: "2024-04-01");

        Assert.Empty(Rules.FindConflictingAssignments(candidate, [existing]));
    }

    [Fact]
    public void IgnoresCompletedAssignmentsEvenWhenTheDatesOverlap()
    {
        var existing = Assignment(
            crewId: "crew-A", signOnDate: "2024-01-01", signOffDate: "2024-06-30",
            status: AssignmentStatus.Completed);
        var candidate = Assignment(
            crewId: "crew-A", signOnDate: "2024-03-01", signOffDate: "2024-04-01");

        Assert.Empty(Rules.FindConflictingAssignments(candidate, [existing]));
    }

    [Fact]
    public void IgnoresTheCandidateItselfSoAnExistingAssignmentCanBeEdited()
    {
        var candidate = Assignment(
            id: "assignment-being-edited", crewId: "crew-A",
            signOnDate: "2024-01-01", signOffDate: "2024-06-30",
            status: AssignmentStatus.Active);

        // A distinct object with the same id: proves the exclusion is id-based,
        // not reference-based, which a weaker test would let through.
        var sameRecordDifferentObject = Assignment(
            id: "assignment-being-edited", crewId: "crew-A",
            signOnDate: "2024-01-01", signOffDate: "2024-06-30",
            status: AssignmentStatus.Active);

        Assert.Empty(Rules.FindConflictingAssignments(candidate, [sameRecordDifferentObject]));
    }

    /* Overlap shapes */

    [Fact]
    public void FlagsAnExistingRotationThatFallsEntirelyInsideTheCandidate()
    {
        var existing = Assignment(
            crewId: "crew-A", signOnDate: "2024-03-01", signOffDate: "2024-04-01",
            status: AssignmentStatus.Active);
        var candidate = Assignment(
            crewId: "crew-A", signOnDate: "2024-01-01", signOffDate: "2024-06-30");

        Assert.Equal([existing], Rules.FindConflictingAssignments(candidate, [existing]));
    }

    [Fact]
    public void FlagsACandidateThatOverlapsOnlyTheStartOfAnExistingRotation()
    {
        // existing:      |-----------|  (03-01 .. 08-01)
        // candidate: |--------|          (01-01 .. 04-01)
        var existing = Assignment(
            crewId: "crew-A", signOnDate: "2024-03-01", signOffDate: "2024-08-01",
            status: AssignmentStatus.Active);
        var candidate = Assignment(
            crewId: "crew-A", signOnDate: "2024-01-01", signOffDate: "2024-04-01");

        Assert.Equal([existing], Rules.FindConflictingAssignments(candidate, [existing]));
    }

    [Fact]
    public void FlagsACandidateThatOverlapsOnlyTheEndOfAnExistingRotation()
    {
        // existing:  |--------|          (01-01 .. 04-01)
        // candidate:      |-----------|  (03-01 .. 08-01)
        var existing = Assignment(
            crewId: "crew-A", signOnDate: "2024-01-01", signOffDate: "2024-04-01",
            status: AssignmentStatus.Active);
        var candidate = Assignment(
            crewId: "crew-A", signOnDate: "2024-03-01", signOffDate: "2024-08-01");

        Assert.Equal([existing], Rules.FindConflictingAssignments(candidate, [existing]));
    }

    [Fact]
    public void FlagsTwoRotationsWithIdenticalDates()
    {
        var existing = Assignment(
            crewId: "crew-A", signOnDate: "2024-01-01", signOffDate: "2024-06-30",
            status: AssignmentStatus.Active);
        var candidate = Assignment(
            crewId: "crew-A", signOnDate: "2024-01-01", signOffDate: "2024-06-30");

        Assert.Equal([existing], Rules.FindConflictingAssignments(candidate, [existing]));
    }

    /* Boundaries */

    [Fact]
    public void DoesNotFlagRotationsSeparatedByAClearGap()
    {
        var existing = Assignment(
            crewId: "crew-A", signOnDate: "2024-01-01", signOffDate: "2024-03-01",
            status: AssignmentStatus.Active);
        var candidate = Assignment(
            crewId: "crew-A", signOnDate: "2024-04-01", signOffDate: "2024-06-01");

        Assert.Empty(Rules.FindConflictingAssignments(candidate, [existing]));
    }

    [Fact]
    public void TreatsASameDayHandoverAsLegal()
    {
        // The documented half-open choice: existing ends 2024-06-01, candidate
        // starts 2024-06-01. A closed-interval reading would call this a clash.
        var existing = Assignment(
            crewId: "crew-A", signOnDate: "2024-01-01", signOffDate: "2024-06-01",
            status: AssignmentStatus.Active);
        var candidate = Assignment(
            crewId: "crew-A", signOnDate: "2024-06-01", signOffDate: "2024-12-01");

        Assert.Empty(Rules.FindConflictingAssignments(candidate, [existing]));
    }

    /* Result shape */

    [Fact]
    public void ReturnsEveryConflictWhenACandidateOverlapsMoreThanOneRotation()
    {
        var existingA = Assignment(
            crewId: "crew-A", signOnDate: "2024-01-01", signOffDate: "2024-03-01",
            status: AssignmentStatus.Planned);
        var existingB = Assignment(
            crewId: "crew-A", signOnDate: "2024-02-15", signOffDate: "2024-05-01",
            status: AssignmentStatus.Active);
        var candidate = Assignment(
            crewId: "crew-A", signOnDate: "2024-01-15", signOffDate: "2024-04-15");

        Assert.Equal(
            [existingA, existingB],
            Rules.FindConflictingAssignments(candidate, [existingA, existingB]));
    }
}

public class CheckManningComplianceTests
{
    [Fact]
    public void IsCompliantWhenEveryRequiredRankIsFullyCrewed()
    {
        var vessel = Vessel(minimumSafeManning: new() { [Rank.Master] = 1, [Rank.AB] = 2 });
        Assignment Crewed(Rank rank) => Assignment(
            vesselId: vessel.Id, rankOnboard: rank, status: AssignmentStatus.Active,
            signOnDate: "2024-01-01", signOffDate: "2024-12-01");

        var result = Rules.CheckManningCompliance(
            vessel, [Crewed(Rank.Master), Crewed(Rank.AB), Crewed(Rank.AB)], On("2024-06-01"));

        Assert.True(result.Compliant);
        Assert.Empty(result.Shortfalls);
    }

    [Fact]
    public void ReportsAShortfallWithTheExactGapWhenARankIsUnderCrewed()
    {
        var vessel = Vessel(minimumSafeManning: new() { [Rank.AB] = 4 });
        var roster = new[]
        {
            Assignment(vesselId: vessel.Id, rankOnboard: Rank.AB, status: AssignmentStatus.Active,
                signOnDate: "2024-01-01", signOffDate: "2024-12-01"),
        };

        var result = Rules.CheckManningCompliance(vessel, roster, On("2024-06-01"));

        Assert.False(result.Compliant);
        Assert.Equal([new ManningShortfall(Rank.AB, 4, 1, 3)], result.Shortfalls);
    }

    [Fact]
    public void IgnoresAssignmentsOnADifferentVessel()
    {
        var vessel = Vessel(minimumSafeManning: new() { [Rank.Master] = 1 });
        var otherVessel = Vessel();
        var roster = new[]
        {
            Assignment(vesselId: otherVessel.Id, rankOnboard: Rank.Master,
                status: AssignmentStatus.Active, signOnDate: "2024-01-01", signOffDate: "2024-12-01"),
        };

        Assert.False(Rules.CheckManningCompliance(vessel, roster, On("2024-06-01")).Compliant);
    }

    [Fact]
    public void IgnoresPlannedAssignmentsBecauseOnlyActiveCrewCountTowardManning()
    {
        var vessel = Vessel(minimumSafeManning: new() { [Rank.Master] = 1 });
        var roster = new[]
        {
            Assignment(vesselId: vessel.Id, rankOnboard: Rank.Master,
                status: AssignmentStatus.Planned, signOnDate: "2024-01-01", signOffDate: "2024-12-01"),
        };

        Assert.False(Rules.CheckManningCompliance(vessel, roster, On("2024-06-01")).Compliant);
    }

    [Fact]
    public void IgnoresAnActiveAssignmentWhoseDatesDoNotCoverToday()
    {
        var vessel = Vessel(minimumSafeManning: new() { [Rank.Master] = 1 });
        var roster = new[]
        {
            Assignment(vesselId: vessel.Id, rankOnboard: Rank.Master,
                status: AssignmentStatus.Active, signOnDate: "2024-01-01", signOffDate: "2024-03-01"),
        };

        Assert.False(Rules.CheckManningCompliance(vessel, roster, On("2024-06-01")).Compliant);
    }

    [Fact]
    public void CountsByRankOnboardNotTheCrewMembersSubstantiveRank()
    {
        var vessel = Vessel(minimumSafeManning: new() { [Rank.Master] = 1 });
        var roster = new[]
        {
            Assignment(vesselId: vessel.Id, rankOnboard: Rank.Master,
                status: AssignmentStatus.Active, signOnDate: "2024-01-01", signOffDate: "2024-12-01"),
        };

        Assert.True(Rules.CheckManningCompliance(vessel, roster, On("2024-06-01")).Compliant);
    }

    [Fact]
    public void CountsCrewOnBothTheSignOnDayAndTheSignOffDay()
    {
        // Inclusive on both ends, unlike rule 1's half-open choice: "is this
        // person aboard today" includes the day they arrive and the day they leave.
        var vessel = Vessel(minimumSafeManning: new() { [Rank.AB] = 1 });
        var signsOnToday = Assignment(vesselId: vessel.Id, rankOnboard: Rank.AB,
            status: AssignmentStatus.Active, signOnDate: "2024-06-01", signOffDate: "2024-12-01");
        var signsOffToday = Assignment(vesselId: vessel.Id, rankOnboard: Rank.AB,
            status: AssignmentStatus.Active, signOnDate: "2024-01-01", signOffDate: "2024-06-01");

        Assert.True(Rules.CheckManningCompliance(vessel, [signsOnToday], On("2024-06-01")).Compliant);
        Assert.True(Rules.CheckManningCompliance(vessel, [signsOffToday], On("2024-06-01")).Compliant);
    }

    [Fact]
    public void DoesNotProduceAShortfallEntryForARankWithNoMinimum()
    {
        // Every rank is checked, but a rank with no requirement is not a shortfall.
        var vessel = Vessel(minimumSafeManning: new() { [Rank.Master] = 1 });

        var result = Rules.CheckManningCompliance(vessel, [], On("2024-06-01"));

        Assert.False(result.Compliant);
        Assert.Equal([new ManningShortfall(Rank.Master, 1, 0, 1)], result.Shortfalls);
    }
}

public class FindBlockingCertificationsTests
{
    [Fact]
    public void ClearsACrewMemberWhoHoldsEveryRequiredCertificateWellPastSignOff()
    {
        var crew = CrewMember(rank: Rank.AB);
        var certifications = new[]
        {
            Certification(crewId: crew.Id, type: CertificationType.Stcw, expiryDate: "2030-01-01"),
            Certification(crewId: crew.Id, type: CertificationType.MedicalFitness, expiryDate: "2030-01-01"),
            Certification(crewId: crew.Id, type: CertificationType.SeamansBook, expiryDate: "2030-01-01"),
        };

        Assert.Empty(Rules.FindBlockingCertifications(
            crew, certifications, Rank.AB, On("2024-12-01")));
    }

    [Fact]
    public void ReportsARequiredCertificateTheCrewMemberDoesNotHoldAtAll()
    {
        var crew = CrewMember(rank: Rank.Master);
        var certifications = new[]
        {
            Certification(crewId: crew.Id, type: CertificationType.Stcw, expiryDate: "2030-01-01"),
            Certification(crewId: crew.Id, type: CertificationType.MedicalFitness, expiryDate: "2030-01-01"),
            Certification(crewId: crew.Id, type: CertificationType.SeamansBook, expiryDate: "2030-01-01"),
            Certification(crewId: crew.Id, type: CertificationType.Passport, expiryDate: "2030-01-01"),
            // GMDSS deliberately absent.
        };

        Assert.Equal(
            [new CertificationBlock(CertificationType.Gmdss, CertificationBlockReason.Missing)],
            Rules.FindBlockingCertifications(crew, certifications, Rank.Master, On("2024-12-01")));
    }

    [Fact]
    public void BlocksACertificateThatLapsesMidContractEvenThoughItIsValidToday()
    {
        var crew = CrewMember(rank: Rank.AB);
        var certifications = new[]
        {
            Certification(crewId: crew.Id, type: CertificationType.Stcw, expiryDate: "2024-03-01"),
            Certification(crewId: crew.Id, type: CertificationType.MedicalFitness, expiryDate: "2030-01-01"),
            Certification(crewId: crew.Id, type: CertificationType.SeamansBook, expiryDate: "2030-01-01"),
        };

        Assert.Equal(
            [
                new CertificationBlock(
                    CertificationType.Stcw,
                    CertificationBlockReason.ExpiresBeforeSignOff,
                    On("2024-03-01"),
                    153),
            ],
            Rules.FindBlockingCertifications(crew, certifications, Rank.AB, On("2024-08-01")));
    }

    [Fact]
    public void DoesNotBlockWhenTheCertificateExpiresExactlyOnTheSignOffDate()
    {
        // Valid up to and including its expiry date.
        var crew = CrewMember(rank: Rank.Cook);
        var certifications = new[]
        {
            Certification(crewId: crew.Id, type: CertificationType.MedicalFitness, expiryDate: "2024-08-01"),
            Certification(crewId: crew.Id, type: CertificationType.SeamansBook, expiryDate: "2030-01-01"),
        };

        Assert.Empty(Rules.FindBlockingCertifications(
            crew, certifications, Rank.Cook, On("2024-08-01")));
    }

    [Fact]
    public void UsesWhicheverCertificateExpiresLatestWhenDuplicatesOfTheSameTypeExist()
    {
        var crew = CrewMember(rank: Rank.Cook);
        var certifications = new[]
        {
            Certification(crewId: crew.Id, type: CertificationType.MedicalFitness, expiryDate: "2024-01-01"),
            Certification(crewId: crew.Id, type: CertificationType.MedicalFitness, expiryDate: "2030-01-01"),
            Certification(crewId: crew.Id, type: CertificationType.SeamansBook, expiryDate: "2030-01-01"),
        };

        Assert.Empty(Rules.FindBlockingCertifications(
            crew, certifications, Rank.Cook, On("2024-08-01")));
    }

    [Fact]
    public void ChecksOnlyTheCertificatesRequiredForTheRankBeingSailed()
    {
        // Substantive rank AB would require STCW; sailing as Cook does not.
        var crew = CrewMember(rank: Rank.AB);
        var certifications = new[]
        {
            Certification(crewId: crew.Id, type: CertificationType.MedicalFitness, expiryDate: "2030-01-01"),
            Certification(crewId: crew.Id, type: CertificationType.SeamansBook, expiryDate: "2030-01-01"),
        };

        Assert.Empty(Rules.FindBlockingCertifications(
            crew, certifications, Rank.Cook, On("2024-08-01")));
    }
}

public class GetOverdueDaysTests
{
    [Fact]
    public void ReturnsTheExactNumberOfDaysAnActiveAssignmentHasOverrun()
    {
        var assignment = Assignment(status: AssignmentStatus.Active, signOffDate: "2024-01-01");

        Assert.Equal(10, Rules.GetOverdueDays(assignment, On("2024-01-11")));
    }

    [Fact]
    public void ReturnsZeroOnTheSignOffDateItself()
    {
        // Overdue starts the day after.
        var assignment = Assignment(status: AssignmentStatus.Active, signOffDate: "2024-01-01");

        Assert.Equal(0, Rules.GetOverdueDays(assignment, On("2024-01-01")));
    }

    [Fact]
    public void ReturnsZeroForAnActiveAssignmentStillWithinItsDates()
    {
        var assignment = Assignment(status: AssignmentStatus.Active, signOffDate: "2024-06-01");

        Assert.Equal(0, Rules.GetOverdueDays(assignment, On("2024-01-01")));
    }

    [Fact]
    public void ReturnsZeroForAPlannedAssignmentPastItsSignOffDate()
    {
        // A planning error, not an overrun: the two are deliberately not conflated.
        var assignment = Assignment(status: AssignmentStatus.Planned, signOffDate: "2024-01-01");

        Assert.Equal(0, Rules.GetOverdueDays(assignment, On("2024-06-01")));
    }

    [Fact]
    public void ReturnsZeroForACompletedAssignmentRegardlessOfItsDates()
    {
        var assignment = Assignment(status: AssignmentStatus.Completed, signOffDate: "2024-01-01");

        Assert.Equal(0, Rules.GetOverdueDays(assignment, On("2024-06-01")));
    }
}
