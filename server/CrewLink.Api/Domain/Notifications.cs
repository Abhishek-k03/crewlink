using System.Globalization;
using System.Text.Json.Serialization;

namespace CrewLink.Api.Domain;

/// <summary>Declaration order is the sort order: most severe first.</summary>
public enum NotificationSeverity
{
    [JsonStringEnumMemberName("critical")] Critical,
    [JsonStringEnumMemberName("warning")] Warning,
    [JsonStringEnumMemberName("info")] Info,
}

/// <param name="Id">Derived from the record it concerns, not random, so a dismissal survives reloads.</param>
public sealed record Notification(
    string Id,
    NotificationSeverity Severity,
    string Title,
    string Description,
    string Href);

/// <summary>Computed from current data rather than stored.</summary>
/// <remarks>
/// An expiring certificate is a fact that's true right now, not an event, so
/// there's no notifications table to keep in sync. Only dismissals are
/// persisted, client-side, since they're per-viewer. This can't express
/// "assignment changed" — a real event that would need an audit log.
/// </remarks>
public static class Notifications
{
    /// <summary>Rotations starting within this window are worth flagging as upcoming.</summary>
    private const int UpcomingDays = 7;
    private const int MaxNotifications = 50;

    public static List<Notification> Build(
        IReadOnlyList<Assignment> assignments,
        IReadOnlyList<Certification> certifications,
        IReadOnlyList<CrewMember> crew,
        DateOnly today)
    {
        var nameOf = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var member in crew) nameOf[member.Id] = member.Name;

        var notifications = new List<Notification>();

        foreach (var assignment in assignments)
        {
            var holder = nameOf.GetValueOrDefault(assignment.CrewId, "A crew member");

            var overdue = Rules.GetOverdueDays(assignment, today);
            if (overdue > 0)
            {
                notifications.Add(new Notification(
                    Id: $"rotation-overdue:{assignment.Id}",
                    Severity: NotificationSeverity.Critical,
                    Title: "Rotation overdue",
                    Description: string.Create(
                        CultureInfo.InvariantCulture,
                        $"{holder} should have signed off {overdue} {Days(overdue)} ago."),
                    Href: $"/crew/{assignment.CrewId}"));
                continue;
            }

            if (assignment.Status != AssignmentStatus.Planned) continue;

            var until = Dates.DaysBetween(today, assignment.SignOnDate);
            if (until >= 0 && until <= UpcomingDays)
            {
                notifications.Add(new Notification(
                    Id: $"rotation-upcoming:{assignment.Id}",
                    Severity: NotificationSeverity.Info,
                    Title: "Rotation starting soon",
                    Description: string.Create(
                        CultureInfo.InvariantCulture,
                        $"{holder} signs on in {until} {Days(until)} at {assignment.Port}."),
                    Href: "/calendar"));
            }
        }

        foreach (var certification in certifications)
        {
            var days = Dates.DaysBetween(today, certification.ExpiryDate);
            var holder = nameOf.GetValueOrDefault(certification.CrewId, "A crew member");
            var type = EnumNames<CertificationType>.Name(certification.Type);

            if (days < 0)
            {
                notifications.Add(new Notification(
                    Id: $"certification-expired:{certification.Id}",
                    Severity: NotificationSeverity.Critical,
                    Title: $"{type} expired",
                    Description: string.Create(
                        CultureInfo.InvariantCulture,
                        $"{holder}'s {type} expired {Math.Abs(days)} days ago."),
                    Href: $"/crew/{certification.CrewId}"));
            }
            else if (days <= Reporting.ExpiringSoonDays)
            {
                notifications.Add(new Notification(
                    Id: $"certification-expiring:{certification.Id}",
                    Severity: NotificationSeverity.Warning,
                    Title: $"{type} expiring",
                    Description: string.Create(
                        CultureInfo.InvariantCulture,
                        $"{holder}'s {type} expires in {days} {Days(days)}."),
                    Href: $"/crew/{certification.CrewId}"));
            }
        }

        // Most severe first, then by id — without the tiebreaker, equal-severity
        // items would shuffle between refetches.
        notifications.Sort((left, right) =>
        {
            var bySeverity = left.Severity.CompareTo(right.Severity);
            return bySeverity != 0 ? bySeverity : string.CompareOrdinal(left.Id, right.Id);
        });

        return notifications.Count > MaxNotifications
            ? notifications[..MaxNotifications]
            : notifications;
    }

    private static string Days(int count) => count == 1 ? "day" : "days";
}
