using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using CrewLink.Api.Data;
using CrewLink.Api.Domain;

using Microsoft.EntityFrameworkCore;

using static CrewLink.Api.Tests.TestFactories;

namespace CrewLink.Api.Tests;

/// <summary>
/// End-to-end tests through the real pipeline: routing, JWT authentication,
/// authorization, EF Core, SQLite. Asserts on the wire format the React client
/// actually reads, not on C# return types — a response that deserialises
/// happily into a DTO can still be the wrong JSON.
/// </summary>
public class ApiIntegrationTests
{
    private const string ManagerEmail = "manager@crewlink.dev";
    private const string ManagerPassword = "manager123";
    private const string CrewingEmail = "crewing@crewlink.dev";
    private const string CrewingPassword = "crewing123";
    private const string CrewEmail = "crew@crewlink.dev";
    private const string CrewPassword = "crew123";

    private static readonly DateOnly Today = Dates.Today();

    // Authentication

    [Fact]
    public async Task LoginIssuesATokenAndTheSessionUser()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateSeededClientAsync();

        var response = await client.PostAsJsonAsync(
            "/api/auth/login", new { email = ManagerEmail, password = ManagerPassword });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.ReadJsonAsync();
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("token").GetString()));
        Assert.Equal("Fleet Manager", body.GetProperty("user").GetProperty("role").GetString());
    }

    [Fact]
    public async Task LoginRefusesAWrongPasswordWithoutRevealingWhetherTheAccountExists()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateSeededClientAsync();

        var wrongPassword = await client.PostAsJsonAsync(
            "/api/auth/login", new { email = ManagerEmail, password = "not-the-password" });
        var unknownAccount = await client.PostAsJsonAsync(
            "/api/auth/login", new { email = "nobody@crewlink.dev", password = "whatever" });

        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownAccount.StatusCode);

        // Identical messages — distinguishing them would make the form an
        // oracle for registered emails.
        Assert.Equal(
            (await wrongPassword.ReadJsonAsync()).GetProperty("message").GetString(),
            (await unknownAccount.ReadJsonAsync()).GetProperty("message").GetString());
    }

    [Fact]
    public async Task PasswordsAreNotStoredInPlainText()
    {
        using var factory = new CrewLinkApiFactory();
        await factory.CreateSeededClientAsync();

        await factory.WithDbAsync(async db =>
        {
            var user = await db.Users.SingleAsync(candidate => candidate.Email == ManagerEmail);
            Assert.DoesNotContain(ManagerPassword, user.PasswordHash, StringComparison.Ordinal);
        });
    }

    [Fact]
    public async Task AnonymousRequestsAreRejected()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateSeededClientAsync();

        var response = await client.GetAsync("/api/vessels");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // Role-based access control, enforced server-side

    [Fact]
    public async Task CrewMemberCannotReadTheFleet()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(CrewEmail, CrewPassword, SeedFleet);

        var response = await client.GetAsync("/api/vessels");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task CrewMemberSeesOnlyTheirOwnRecordInTheCrewList()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(CrewEmail, CrewPassword, SeedFleet);

        var body = await (await client.GetAsync("/api/crew")).ReadJsonAsync();
        var items = body.GetProperty("items").EnumerateArray().ToList();

        // The client hides the directory from this role; the server narrows
        // the query, which is what actually prevents enumerating colleagues.
        Assert.Single(items);
        Assert.Equal(SeedGenerator.DemoCrewMemberCrewId, items[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task CrewMemberCannotFetchAnotherCrewMembersProfile()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(CrewEmail, CrewPassword, SeedFleet);

        var own = await client.GetAsync($"/api/crew/{SeedGenerator.DemoCrewMemberCrewId}");
        var other = await client.GetAsync("/api/crew/crew-other");

        Assert.Equal(HttpStatusCode.OK, own.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, other.StatusCode);
    }

    [Fact]
    public async Task CrewingOfficerCanEditCrewButNotVessels()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(
            CrewingEmail, CrewingPassword, SeedFleet);

        var crewEdit = await client.PatchAsJsonAsync(
            "/api/crew/crew-other", new { nationality = "Norway" });
        var vesselEdit = await client.PatchAsJsonAsync(
            "/api/vessels/vessel-under", new { flag = "Malta" });

        Assert.Equal(HttpStatusCode.OK, crewEdit.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, vesselEdit.StatusCode);
    }

    [Fact]
    public async Task CrewMemberCanUploadOnlyToTheirOwnRecord()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(CrewEmail, CrewPassword, SeedFleet);

        object Certificate(string crewId) => new
        {
            crewId,
            type = "Passport",
            issueDate = "2024-01-01",
            expiryDate = "2030-01-01",
            issuingAuthority = "MARINA",
        };

        var own = await client.PostAsJsonAsync(
            "/api/certifications", Certificate(SeedGenerator.DemoCrewMemberCrewId));
        var other = await client.PostAsJsonAsync("/api/certifications", Certificate("crew-other"));

        Assert.Equal(HttpStatusCode.Created, own.StatusCode);
        // The owner comes from the token, so editing crewId in the body
        // doesn't move the upload onto someone else's record.
        Assert.Equal(HttpStatusCode.Forbidden, other.StatusCode);
    }

    [Fact]
    public async Task CrewMemberCannotDeleteACertificationEvenTheirOwn()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(CrewEmail, CrewPassword, SeedFleet);

        // Upload and delete are separate permissions — deleting an expired
        // certificate is precisely how non-compliance would be hidden.
        var response = await client.DeleteAsync("/api/certifications/cert-demo-passport");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task CrewMemberCanResolveVesselNamesWithoutReadingTheFleet()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(CrewEmail, CrewPassword, SeedFleet);

        var response = await client.GetAsync("/api/vessels/lookup");
        var items = (await response.ReadJsonAsync()).EnumerateArray().ToList();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEmpty(items);
        // Id and name only — no IMO number, manning requirements, or readiness.
        Assert.Equal(2, items[0].EnumerateObject().Count());
    }

    // Validation and the wire format

    [Fact]
    public async Task AnInvalidImoNumberComesBackAsAFieldErrorTheFormCanAttach()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(ManagerEmail, ManagerPassword);

        var response = await client.PostAsJsonAsync("/api/vessels", new
        {
            name = "MV Test",
            imoNumber = "1234568",
            flag = "Panama",
            type = "Tanker",
            status = "In Service",
            minimumSafeManning = new { },
            readyToSail = false,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var body = await response.ReadJsonAsync();
        // react-hook-form matches on this exact camelCase key to attach the message.
        Assert.True(body.GetProperty("fieldErrors").TryGetProperty("imoNumber", out _));
    }

    [Fact]
    public async Task EnumsAndSparseManningUseTheWireNamesTheClientExpects()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(
            ManagerEmail, ManagerPassword, SeedFleet);

        var body = await (await client.GetAsync("/api/vessels/vessel-under")).ReadJsonAsync();

        Assert.Equal("Bulk Carrier", body.GetProperty("type").GetString());
        Assert.Equal("In Service", body.GetProperty("status").GetString());
        // The dictionary key is the human-readable rank, not the C# identifier
        // "ChiefOfficer" — a wrong key here would fail silently in the UI.
        Assert.Equal(1, body.GetProperty("minimumSafeManning").GetProperty("Chief Officer").GetInt32());
    }

    [Fact]
    public async Task ListsComeBackInThePaginatedShape()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(
            ManagerEmail, ManagerPassword, SeedFleet);

        var body = await (await client.GetAsync("/api/crew?page=1&pageSize=1")).ReadJsonAsync();

        Assert.Equal(1, body.GetProperty("items").GetArrayLength());
        Assert.Equal(2, body.GetProperty("total").GetInt32());
        Assert.Equal(1, body.GetProperty("page").GetInt32());
        Assert.Equal(1, body.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task PatchLeavesFieldsItDoesNotNameAlone()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(
            ManagerEmail, ManagerPassword, SeedFleet);

        var response = await client.PatchAsJsonAsync("/api/crew/crew-other", new { status = "On Leave" });
        var body = await response.ReadJsonAsync();

        Assert.Equal("On Leave", body.GetProperty("status").GetString());
        Assert.Equal("Deck Hand", body.GetProperty("name").GetString());
        Assert.Equal("Philippines", body.GetProperty("nationality").GetString());
    }

    [Fact]
    public async Task AnUnknownEnumValueIsRejectedRatherThanSilentlyIgnored()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(
            ManagerEmail, ManagerPassword, SeedFleet);

        var response = await client.GetAsync("/api/crew?rank=Admiral");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // Business rules, enforced at the boundary

    [Fact]
    public async Task MarkingAnUnderMannedVesselReadyToSailIsRefusedWithTheShortfall()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(
            ManagerEmail, ManagerPassword, SeedFleet);

        var response = await client.PatchAsJsonAsync(
            "/api/vessels/vessel-under", new { readyToSail = true });

        Assert.Equal(HttpStatusCode.UnprocessableContent, response.StatusCode);

        var violations = (await response.ReadJsonAsync()).GetProperty("violations")
            .EnumerateArray().ToList();

        // Structured detail, so the UI renders "Master: 0/1" without recomputing why.
        var master = violations.Single(item => item.GetProperty("rank").GetString() == "Master");
        Assert.Equal(1, master.GetProperty("required").GetInt32());
        Assert.Equal(0, master.GetProperty("actual").GetInt32());
        Assert.Equal(1, master.GetProperty("short").GetInt32());
    }

    [Fact]
    public async Task MarkingACompliantVesselReadyToSailSucceeds()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(
            ManagerEmail, ManagerPassword, SeedFleet);

        var response = await client.PatchAsJsonAsync(
            "/api/vessels/vessel-clear", new { readyToSail = true });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True((await response.ReadJsonAsync()).GetProperty("readyToSail").GetBoolean());
    }

    [Fact]
    public async Task ACrewingOfficerCannotMarkAVesselReadyToSail()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(
            CrewingEmail, CrewingPassword, SeedFleet);

        var response = await client.PatchAsJsonAsync(
            "/api/vessels/vessel-clear", new { readyToSail = true });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AnOverlappingRotationIsRefusedWithTheClashingDates()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(
            ManagerEmail, ManagerPassword, SeedFleet);

        var response = await client.PostAsJsonAsync("/api/assignments", new
        {
            crewId = SeedGenerator.DemoCrewMemberCrewId,
            vesselId = "vessel-clear",
            rankOnboard = "Cook",
            signOnDate = Today.AddDays(-5).ToString("yyyy-MM-dd"),
            signOffDate = Today.AddDays(5).ToString("yyyy-MM-dd"),
            port = "Singapore",
            status = "Planned",
        });

        Assert.Equal(HttpStatusCode.UnprocessableContent, response.StatusCode);

        var violations = (await response.ReadJsonAsync()).GetProperty("violations")
            .EnumerateArray().ToList();
        Assert.Equal("assignment-demo", violations[0].GetProperty("assignmentId").GetString());
    }

    [Fact]
    public async Task ARotationIsRefusedWhenARequiredCertificateLapsesBeforeSignOff()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(
            ManagerEmail, ManagerPassword, SeedFleet);

        var response = await client.PostAsJsonAsync("/api/assignments", new
        {
            crewId = "crew-other",
            vesselId = "vessel-clear",
            rankOnboard = "Cook",
            signOnDate = Today.AddDays(200).ToString("yyyy-MM-dd"),
            signOffDate = Today.AddDays(400).ToString("yyyy-MM-dd"),
            port = "Singapore",
            status = "Planned",
        });

        Assert.Equal(HttpStatusCode.UnprocessableContent, response.StatusCode);

        var violation = (await response.ReadJsonAsync()).GetProperty("violations")
            .EnumerateArray().First();

        Assert.Equal("Seaman's Book", violation.GetProperty("type").GetString());
        Assert.Equal("expires-before-sign-off", violation.GetProperty("reason").GetString());
        // The rule reports how short it falls, so the UI never recomputes it.
        Assert.True(violation.GetProperty("daysShort").GetInt32() > 0);
    }

    [Fact]
    public async Task ClosingOutARotationIsAllowedEvenWhenACertificateHasLapsed()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(
            ManagerEmail, ManagerPassword, SeedFleet);

        // A lapsed certificate shouldn't trap the rotation in Active forever.
        var response = await client.PatchAsJsonAsync(
            "/api/assignments/assignment-lapsed", new { status = "Completed" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Completed", (await response.ReadJsonAsync()).GetProperty("status").GetString());
    }

    [Fact]
    public async Task ACrewMemberWhoIsOnboardCannotBeDeleted()
    {
        using var factory = new CrewLinkApiFactory();
        var client = await factory.CreateAuthenticatedClientAsync(
            ManagerEmail, ManagerPassword, SeedFleet);

        var response = await client.DeleteAsync($"/api/crew/{SeedGenerator.DemoCrewMemberCrewId}");

        Assert.Equal(HttpStatusCode.UnprocessableContent, response.StatusCode);
    }

    // Simulated network conditions

    [Fact]
    public async Task AnInjectedFailureLeavesTheDatabaseUntouched()
    {
        using var factory = new CrewLinkApiFactory();
        factory.ExtraConfiguration["NetworkSimulation:Enabled"] = "true";
        factory.ExtraConfiguration["NetworkSimulation:WriteFailureRate"] = "1";
        factory.ExtraConfiguration["NetworkSimulation:LatencyMinMs"] = "0";
        factory.ExtraConfiguration["NetworkSimulation:LatencyMaxMs"] = "0";

        var client = await factory.CreateAuthenticatedClientAsync(
            ManagerEmail, ManagerPassword, SeedFleet);

        var before = 0;
        await factory.WithDbAsync(async db => before = await db.Vessels.CountAsync());

        var response = await client.PostAsJsonAsync("/api/vessels", new
        {
            name = "MV Should Not Persist",
            imoNumber = "9074729",
            flag = "Panama",
            type = "Tanker",
            status = "In Service",
            minimumSafeManning = new { },
            readyToSail = false,
        });

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);

        var after = 0;
        await factory.WithDbAsync(async db => after = await db.Vessels.CountAsync());

        // Failure is injected before the endpoint runs, never after — a write
        // that "failed" but had already committed would leave the server and
        // rolled-back client disagreeing.
        Assert.Equal(before, after);
    }

    // Fixture

    /// <summary>
    /// A small, readable fleet. Two vessels (one below manning, one with no
    /// requirements), two crew, and rotations positioned relative to today.
    /// </summary>
    private static void SeedFleet(CrewLinkDbContext db)
    {
        db.Vessels.AddRange(
            Vessel(
                id: "vessel-under",
                minimumSafeManning: new() { [Rank.Master] = 1, [Rank.ChiefOfficer] = 1 },
                imoNumber: "9074729"),
            Vessel(id: "vessel-clear", minimumSafeManning: [], imoNumber: "9074731"));

        db.Crew.AddRange(
            new CrewMember
            {
                Id = SeedGenerator.DemoCrewMemberCrewId,
                Name = "Ariel Santos",
                Rank = Rank.Cook,
                Nationality = "Philippines",
                DateOfBirth = new DateOnly(1990, 1, 1),
                Status = CrewStatus.Onboard,
                Email = "ariel@crewlink.dev",
                Phone = "+63 900 000 0000",
            },
            new CrewMember
            {
                Id = "crew-other",
                Name = "Deck Hand",
                Rank = Rank.Cook,
                Nationality = "Philippines",
                DateOfBirth = new DateOnly(1992, 2, 2),
                Status = CrewStatus.Available,
                Email = "deck@crewlink.dev",
                Phone = "+63 900 000 0001",
            });

        db.Assignments.AddRange(
            new Assignment
            {
                Id = "assignment-demo",
                CrewId = SeedGenerator.DemoCrewMemberCrewId,
                VesselId = "vessel-clear",
                RankOnboard = Rank.Cook,
                SignOnDate = Today.AddDays(-30),
                SignOffDate = Today.AddDays(30),
                Port = "Manila",
                Status = AssignmentStatus.Active,
            },
            new Assignment
            {
                Id = "assignment-lapsed",
                CrewId = "crew-other",
                VesselId = "vessel-clear",
                RankOnboard = Rank.Cook,
                SignOnDate = Today.AddDays(-60),
                SignOffDate = Today.AddDays(-1),
                Port = "Manila",
                Status = AssignmentStatus.Active,
            });

        db.Certifications.AddRange(
            Certification(
                id: "cert-demo-medical", crewId: SeedGenerator.DemoCrewMemberCrewId,
                type: CertificationType.MedicalFitness, expiryDate: "2035-01-01"),
            Certification(
                id: "cert-demo-book", crewId: SeedGenerator.DemoCrewMemberCrewId,
                type: CertificationType.SeamansBook, expiryDate: "2035-01-01"),
            Certification(
                id: "cert-demo-passport", crewId: SeedGenerator.DemoCrewMemberCrewId,
                type: CertificationType.Passport, expiryDate: "2035-01-01"),
            Certification(
                id: "cert-other-medical", crewId: "crew-other",
                type: CertificationType.MedicalFitness, expiryDate: "2035-01-01"),
            // Lapses well before any future contract could end, so rule 3 has
            // something to refuse.
            Certification(
                id: "cert-other-book", crewId: "crew-other",
                type: CertificationType.SeamansBook,
                expiryDate: Today.AddDays(10).ToString("yyyy-MM-dd")));
    }
}
