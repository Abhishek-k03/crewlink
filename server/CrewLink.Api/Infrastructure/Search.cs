namespace CrewLink.Api.Infrastructure;

public static class Search
{
    /// <summary>
    /// Turns a user's search term into a safe <c>LIKE</c> pattern.
    /// </summary>
    /// <remarks>
    /// <c>%</c> and <c>_</c> are wildcards in SQL <c>LIKE</c> — not an injection
    /// risk (EF still parameterises the value), but left unescaped they'd
    /// silently change what the user asked for, e.g. "100%" matching everything
    /// starting with "100".
    /// <para>
    /// SQLite's <c>LIKE</c> is case-insensitive for ASCII only, matching the
    /// client's <c>toLowerCase().includes()</c> — but not beyond ASCII.
    /// </para>
    /// </remarks>
    public const string EscapeCharacter = "\\";

    public static string? ToLikePattern(string? term)
    {
        var trimmed = term?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;

        var escaped = trimmed
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);

        return $"%{escaped}%";
    }
}
