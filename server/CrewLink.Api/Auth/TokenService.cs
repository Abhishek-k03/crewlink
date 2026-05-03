using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

using CrewLink.Api.Data;
using CrewLink.Api.Domain;

using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace CrewLink.Api.Auth;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    /// <summary>
    /// HMAC-SHA256 signing key, at least 256 bits. Supplied through config
    /// (user-secrets or an env var) and never committed — anyone holding it can
    /// mint a Fleet Manager token.
    /// </summary>
    public string Key { get; set; } = string.Empty;

    public string Issuer { get; set; } = "crewlink";
    public string Audience { get; set; } = "crewlink";
    public int ExpiryMinutes { get; set; } = 480;
}

public static class CrewLinkClaims
{
    public const string Role = "role";

    /// <summary>
    /// The crew record this login owns, present only for Crew Member. Carried in
    /// the token rather than sent by the client — the server decides whose
    /// records "own" refers to.
    /// </summary>
    public const string CrewId = "crewId";
}

public sealed class TokenService(IOptions<JwtOptions> options)
{
    private readonly JwtOptions _options = options.Value;

    public (string Token, DateTimeOffset ExpiresAt) Issue(UserAccount user)
    {
        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(_options.ExpiryMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.Name, user.Name),
            new(CrewLinkClaims.Role, EnumNames<Role>.Name(user.Role)),
        };

        if (user.CrewId is not null)
        {
            claims.Add(new Claim(CrewLinkClaims.CrewId, user.CrewId));
        }

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}

public static class ClaimsPrincipalExtensions
{
    public static Role GetRole(this ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(CrewLinkClaims.Role);
        return value is not null && EnumNames<Role>.TryParse(value, out var role)
            ? role
            : throw new InvalidOperationException("The token carries no recognisable role claim.");
    }

    public static string? GetCrewId(this ClaimsPrincipal principal) =>
        principal.FindFirstValue(CrewLinkClaims.CrewId);

    public static string? GetUserId(this ClaimsPrincipal principal) =>
        principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
}
