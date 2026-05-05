using CrewLink.Api.Contracts;

using Microsoft.Extensions.Options;

namespace CrewLink.Api.Infrastructure;

public sealed class NetworkSimulationOptions
{
    public const string SectionName = "NetworkSimulation";

    /// <summary>Off by default — injecting 500s into a running service should be opt-in, not inherited.</summary>
    public bool Enabled { get; set; }

    public int LatencyMinMs { get; set; } = 200;
    public int LatencyMaxMs { get; set; } = 1200;
    public double WriteFailureRate { get; set; } = 0.07;
}

/// <summary>
/// Reproduces the mock server's simulated network conditions: 200–1200 ms of
/// latency on every request and a ~7% failure rate on writes.
/// </summary>
/// <remarks>
/// Keeps the frontend's optimistic updates exercised against the real backend
/// too — without this, <c>http</c> mode would quietly turn the rollback path
/// into dead code.
/// <para>
/// Failure is injected before the endpoint runs, never after — a write that
/// "failed" but had already committed would leave the server and the
/// rolled-back client disagreeing.
/// </para>
/// </remarks>
public sealed class NetworkSimulationMiddleware(
    RequestDelegate next,
    IOptions<NetworkSimulationOptions> options,
    ILogger<NetworkSimulationMiddleware> logger)
{
    private readonly NetworkSimulationOptions _options = options.Value;

    private static readonly string[] WriteMethods = ["POST", "PUT", "PATCH", "DELETE"];

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_options.Enabled || !context.Request.Path.StartsWithSegments("/api"))
        {
            await next(context);
            return;
        }

        var delay = Random.Shared.Next(_options.LatencyMinMs, _options.LatencyMaxMs + 1);
        if (delay > 0)
        {
            await Task.Delay(delay, context.RequestAborted);
        }

        if (ShouldFail(context))
        {
            logger.LogInformation(
                "Injected a simulated failure for {Method} {Path}.",
                context.Request.Method,
                context.Request.Path);

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(
                new MessageResponse("The server could not complete the request. Please try again."),
                context.RequestAborted);
            return;
        }

        await next(context);
    }

    private bool ShouldFail(HttpContext context)
    {
        if (!WriteMethods.Contains(context.Request.Method, StringComparer.Ordinal)) return false;

        // Signing in is excluded — a random 500 during login is indistinguishable
        // from "wrong password" on screen.
        if (context.Request.Path.StartsWithSegments("/api/auth")) return false;

        return Random.Shared.NextDouble() < _options.WriteFailureRate;
    }
}
