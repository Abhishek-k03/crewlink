using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

using CrewLink.Api.Contracts;
using CrewLink.Api.Data;
using CrewLink.Api.Domain;
using CrewLink.Api.Infrastructure;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace CrewLink.Api.Tests;

/// <summary>
/// Boots the real application — real routing, real authentication, real
/// authorization, real EF Core — against an in-memory SQLite database.
/// </summary>
/// <remarks>
/// SQLite in memory, not EF's in-memory provider — that provider isn't
/// relational and silently accepts things SQLite refuses. The connection stays
/// open for the factory's lifetime since an in-memory SQLite database is
/// destroyed when its last connection closes.
/// </remarks>
public sealed class CrewLinkApiFactory : WebApplicationFactory<Program>
{
    private SqliteConnection? _connection;

    /// <summary>
    /// Set before the first request to override config for one test — the
    /// failure-injection test turns the simulated network on and its failure
    /// rate up to 1, to assert on rollback deterministically.
    /// </summary>
    public Dictionary<string, string?> ExtraConfiguration { get; } = new(StringComparer.Ordinal);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environments.Development);

        builder.ConfigureAppConfiguration(config => config.AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                // The tests seed their own small dataset; generating 6,700 rows
                // per fixture would make the suite slow for no gain.
                ["CrewLink:SkipStartupSeed"] = "true",
                // Off by default — the one test that needs failures turns them
                // on itself.
                ["NetworkSimulation:Enabled"] = "false",
                ["Jwt:Key"] = "crewlink-integration-test-signing-key-long-enough-for-hmac-sha256",
            }));

        builder.ConfigureAppConfiguration(config => config.AddInMemoryCollection(ExtraConfiguration));

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<CrewLinkDbContext>>();
            services.RemoveAll<CrewLinkDbContext>();

            _connection = new SqliteConnection("DataSource=:memory:");
            _connection.Open();

            services.AddDbContext<CrewLinkDbContext>(options => options.UseSqlite(_connection));
        });
    }

    public async Task<HttpClient> CreateSeededClientAsync(Action<CrewLinkDbContext>? seed = null)
    {
        using (var scope = Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrewLinkDbContext>();
            await db.Database.EnsureCreatedAsync();

            if (!await db.Users.AnyAsync())
            {
                await DatabaseSeeder.SeedUsersAsync(db, CancellationToken.None);
            }

            seed?.Invoke(db);
            await db.SaveChangesAsync();
        }

        return CreateClient();
    }

    public async Task<HttpClient> CreateAuthenticatedClientAsync(
        string email,
        string password,
        Action<CrewLinkDbContext>? seed = null)
    {
        var client = await CreateSeededClientAsync(seed);

        var response = await client.PostAsJsonAsync(
            "/api/auth/login", new { email, password }, JsonConfig.Default);
        response.EnsureSuccessStatusCode();

        var login = await response.Content.ReadFromJsonAsync<LoginResponse>(JsonConfig.Default);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", login!.Token);

        return client;
    }

    public async Task WithDbAsync(Func<CrewLinkDbContext, Task> action)
    {
        using var scope = Services.CreateScope();
        await action(scope.ServiceProvider.GetRequiredService<CrewLinkDbContext>());
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) _connection?.Dispose();
    }
}

public static class TestJson
{
    public static readonly JsonSerializerOptions Options = JsonConfig.Default;

    /// <summary>Reads a response as raw JSON, for asserting on the wire format, not what a C# type would coerce it into.</summary>
    public static async Task<JsonElement> ReadJsonAsync(this HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
}
