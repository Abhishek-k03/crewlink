using System.Text;

using CrewLink.Api.Auth;
using CrewLink.Api.Contracts;
using CrewLink.Api.Data;
using CrewLink.Api.Endpoints;
using CrewLink.Api.Infrastructure;
using CrewLink.Api.Validation;

using FluentValidation;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Serialisation

// One description of how this API speaks JSON, shared with the SQLite JSON
// columns. See Infrastructure/JsonConfig.cs.
builder.Services.ConfigureHttpJsonOptions(options => JsonConfig.Apply(options.SerializerOptions));

// Persistence

var connectionString = builder.Configuration.GetConnectionString("CrewLink")
    ?? "Data Source=crewlink.db";

builder.Services.AddDbContext<CrewLinkDbContext>(options => options.UseSqlite(connectionString));

// Validation. Registered explicitly rather than by assembly scanning — four
// lines, no extra package, and the set stays visible here.
builder.Services.AddScoped<IValidator<VesselInput>, VesselInputValidator>();
builder.Services.AddScoped<IValidator<CrewInput>, CrewInputValidator>();
builder.Services.AddScoped<IValidator<AssignmentInput>, AssignmentInputValidator>();
builder.Services.AddScoped<IValidator<CertificationInput>, CertificationInputValidator>();

// Authentication and authorization

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.AddSingleton<TokenService>();

var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? new JwtOptions();

if (string.IsNullOrWhiteSpace(jwtOptions.Key))
{
    // Failing to start beats a guessable signing key — anyone who knows it can
    // mint themselves a Fleet Manager token.
    if (!builder.Environment.IsDevelopment())
    {
        throw new InvalidOperationException(
            "Jwt:Key is not configured. Set it via user-secrets or the environment before running outside Development.");
    }

    jwtOptions.Key = "crewlink-development-signing-key-not-for-production-use";
    builder.Services.Configure<JwtOptions>(options => options.Key = jwtOptions.Key);
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Without this, the handler rewrites short claim names into long
        // SOAP-era URIs and `role` stops being findable.
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key)),
            RoleClaimType = CrewLinkClaims.Role,
            // No grace period — tokens expire exactly when they say they do.
            ClockSkew = TimeSpan.Zero,
        };
    });

builder.Services.AddCrewLinkAuthorization();

// Cross-origin access

const string DevelopmentCorsPolicy = "crewlink-dev";
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:5173", "http://127.0.0.1:5173"];

builder.Services.AddCors(options => options.AddPolicy(
    DevelopmentCorsPolicy,
    policy => policy
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()));

// Simulated network conditions and API docs

builder.Services.Configure<NetworkSimulationOptions>(
    builder.Configuration.GetSection(NetworkSimulationOptions.SectionName));

builder.Services.AddOpenApi();

var app = builder.Build();

// Pipeline

app.UseExceptionHandler(handler => handler.Run(async context =>
{
    var feature = context.Features.Get<IExceptionHandlerFeature>();
    app.Logger.LogError(feature?.Error, "Unhandled exception for {Path}.", context.Request.Path);

    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    // The same shape every other error uses, so ApiError can read it instead
    // of falling back to a bare status text.
    await context.Response.WriteAsJsonAsync(
        new MessageResponse("The server could not complete the request. Please try again."));
}));

app.UseCors(DevelopmentCorsPolicy);

app.UseAuthentication();
app.UseAuthorization();

// After authorization — a request that was going to be refused with 401/403
// should say so, not get masked by an injected 500.
app.UseMiddleware<NetworkSimulationMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapAuthEndpoints();
app.MapVesselEndpoints();
app.MapCrewEndpoints();
app.MapAssignmentEndpoints();
app.MapCertificationEndpoints();
app.MapDashboardEndpoints();

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous().ExcludeFromDescription();

// Start-up. Migrate and seed before serving, so the first request never races
// an empty database; skipped when tests supply their own database.
if (!builder.Configuration.GetValue("CrewLink:SkipStartupSeed", false))
{
    using var scope = app.Services.CreateScope();
    await DatabaseSeeder.InitialiseAsync(
        scope.ServiceProvider.GetRequiredService<CrewLinkDbContext>(),
        app.Logger,
        reseed: builder.Configuration.GetValue("CrewLink:Reseed", false));
}

await app.RunAsync();

/// <summary>Exposed so the integration tests can boot the real pipeline.</summary>
public partial class Program;
