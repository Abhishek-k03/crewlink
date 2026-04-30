using System.Globalization;

namespace CrewLink.Api.Domain;

/// <summary>
/// The client compares calendar dates as <c>YYYY-MM-DD</c> strings, which sorts
/// chronologically as text. <see cref="DateOnly"/> is the typed equivalent — no
/// time, no timezone — and serialises to the same shape, so ordering stays
/// correct in JSON, C#, and SQL alike.
/// </summary>
public static class Dates
{
    /// <summary>Whole days from <paramref name="from"/> to <paramref name="to"/>;
    /// negative when <paramref name="to"/> is earlier.</summary>
    public static int DaysBetween(DateOnly from, DateOnly to) => to.DayNumber - from.DayNumber;

    /// <summary>
    /// Business rules never call this — they take <c>today</c> as an argument so
    /// they stay testable without mocking the clock. Local, not UTC, to match
    /// the browser's <c>todayIso()</c>.
    /// </summary>
    public static DateOnly Today() => DateOnly.FromDateTime(DateTime.Now);

    public static DateOnly StartOfMonth(DateOnly date) => new(date.Year, date.Month, 1);

    /// <summary><c>YYYY-MM</c>, the bucket key for grouping by month.</summary>
    public static string MonthKey(DateOnly date) =>
        date.ToString("yyyy-MM", CultureInfo.InvariantCulture);
}
