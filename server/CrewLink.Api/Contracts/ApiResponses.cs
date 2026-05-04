using System.Globalization;

using CrewLink.Api.Domain;

using FluentValidation.Results;

namespace CrewLink.Api.Contracts;

public sealed record Paginated<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

public sealed record MessageResponse(string Message);

public sealed record ValidationErrorResponse(
    string Message,
    IReadOnlyDictionary<string, string[]> FieldErrors);

public sealed record RuleViolationResponse(string Message, object Violations);

/// <summary>Rule 1's violation payload — enough for the UI to say which rotation clashes.</summary>
public sealed record AssignmentConflict(string AssignmentId, DateOnly SignOnDate, DateOnly SignOffDate);

/// <summary>Just enough of a vessel to render its name against a rotation.</summary>
public sealed record VesselSummary(string Id, string Name);

public sealed record LoginRequest(string? Email, string? Password);

/// <summary>Mirrors the client's <c>SessionUser</c> — the demo user without its password.</summary>
public sealed record SessionUser(string Id, string Name, string Email, Role Role, string? CrewId);

public sealed record LoginResponse(string Token, DateTimeOffset ExpiresAt, SessionUser User);

/// <summary>
/// The four response shapes the client's <c>ApiError</c> knows how to read.
/// Status codes carry meaning: 400 is malformed input, 422 is well-formed input
/// the domain refuses, 404 is a missing record, 500 is the injected failure.
/// </summary>
public static class ApiResults
{
    public static IResult ValidationError(ValidationResult result) =>
        Results.Json(
            new ValidationErrorResponse(
                "The submitted values are not valid.",
                result.Errors
                    .GroupBy(failure => ToClientFieldName(failure.PropertyName), StringComparer.Ordinal)
                    .ToDictionary(
                        group => group.Key,
                        group => group.Select(failure => failure.ErrorMessage).ToArray(),
                        StringComparer.Ordinal)),
            statusCode: StatusCodes.Status400BadRequest);

    /// <summary>A body that couldn't even be parsed — a bad enum name, a malformed date, invalid JSON.</summary>
    public static IResult MalformedBody(string message) =>
        Results.Json(
            new ValidationErrorResponse(message, new Dictionary<string, string[]>(StringComparer.Ordinal)),
            statusCode: StatusCodes.Status400BadRequest);

    public static IResult NotFound(string entity) =>
        Results.Json(new MessageResponse($"{entity} not found."), statusCode: StatusCodes.Status404NotFound);

    /// <summary>422 carries rule violations: valid input the domain refuses to accept.</summary>
    public static IResult RuleViolation(string message, object violations) =>
        Results.Json(
            new RuleViolationResponse(message, violations),
            statusCode: StatusCodes.Status422UnprocessableEntity);

    public static IResult Forbidden(string message) =>
        Results.Json(new MessageResponse(message), statusCode: StatusCodes.Status403Forbidden);

    /// <summary>
    /// FluentValidation reports <c>ImoNumber</c>; react-hook-form matches on the
    /// exact string <c>imoNumber</c> to attach the message to the right input.
    /// </summary>
    private static string ToClientFieldName(string propertyName)
    {
        if (propertyName.Length == 0) return propertyName;
        return string.Concat(
            char.ToLower(propertyName[0], CultureInfo.InvariantCulture).ToString(),
            propertyName.AsSpan(1));
    }
}
