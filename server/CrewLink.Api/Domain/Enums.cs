using System.Reflection;
using System.Text.Json.Serialization;

namespace CrewLink.Api.Domain;

// The wire values are fixed by the TypeScript client ("Chief Officer", "2nd
// Engineer", "Seaman's Book") and aren't legal C# identifiers, so each member
// carries its wire name as an attribute — the same one System.Text.Json reads,
// so JSON, the SQLite column, and query-string parsing share one definition.

public enum Rank
{
    [JsonStringEnumMemberName("Master")] Master,
    [JsonStringEnumMemberName("Chief Officer")] ChiefOfficer,
    [JsonStringEnumMemberName("Chief Engineer")] ChiefEngineer,
    [JsonStringEnumMemberName("2nd Engineer")] SecondEngineer,
    [JsonStringEnumMemberName("AB")] AB,
    [JsonStringEnumMemberName("Oiler")] Oiler,
    [JsonStringEnumMemberName("Cook")] Cook,
}

public enum VesselType
{
    [JsonStringEnumMemberName("Bulk Carrier")] BulkCarrier,
    [JsonStringEnumMemberName("Tanker")] Tanker,
    [JsonStringEnumMemberName("Container")] Container,
    [JsonStringEnumMemberName("RoRo")] RoRo,
}

public enum VesselStatus
{
    [JsonStringEnumMemberName("In Service")] InService,
    [JsonStringEnumMemberName("Dry Dock")] DryDock,
    [JsonStringEnumMemberName("Laid Up")] LaidUp,
}

public enum CrewStatus
{
    [JsonStringEnumMemberName("Onboard")] Onboard,
    [JsonStringEnumMemberName("On Leave")] OnLeave,
    [JsonStringEnumMemberName("Available")] Available,
}

public enum AssignmentStatus
{
    [JsonStringEnumMemberName("Planned")] Planned,
    [JsonStringEnumMemberName("Active")] Active,
    [JsonStringEnumMemberName("Completed")] Completed,
}

public enum CertificationType
{
    [JsonStringEnumMemberName("STCW")] Stcw,
    [JsonStringEnumMemberName("Medical Fitness")] MedicalFitness,
    [JsonStringEnumMemberName("GMDSS")] Gmdss,
    [JsonStringEnumMemberName("Seaman's Book")] SeamansBook,
    [JsonStringEnumMemberName("Passport")] Passport,
}

public enum Role
{
    [JsonStringEnumMemberName("Fleet Manager")] FleetManager,
    [JsonStringEnumMemberName("Crewing Officer")] CrewingOfficer,
    [JsonStringEnumMemberName("Crew Member")] CrewMember,
}

/// <summary>
/// Wire names for an enum, read from the same attribute System.Text.Json uses.
/// </summary>
public static class EnumNames<TEnum> where TEnum : struct, Enum
{
    private static readonly Dictionary<TEnum, string> ByValue = [];
    private static readonly Dictionary<string, TEnum> ByName = new(StringComparer.Ordinal);

    static EnumNames()
    {
        foreach (var field in typeof(TEnum).GetFields(BindingFlags.Public | BindingFlags.Static))
        {
            var value = (TEnum)field.GetValue(null)!;
            var name = field.GetCustomAttribute<JsonStringEnumMemberNameAttribute>()?.Name ?? field.Name;
            ByValue[value] = name;
            ByName[name] = value;
        }
    }

    /// <summary>Declaration order — rule 2 and the dashboard both iterate ranks and need a stable sequence.</summary>
    public static TEnum[] Values { get; } = Enum.GetValues<TEnum>();

    public static string Name(TEnum value) => ByValue[value];

    public static TEnum Parse(string name) =>
        ByName.TryGetValue(name, out var value)
            ? value
            : throw new ArgumentException($"'{name}' is not a valid {typeof(TEnum).Name}.", nameof(name));

    /// <summary>For query-string filters, where an unknown value is a client mistake, not an exception.</summary>
    public static bool TryParse(string? name, out TEnum value)
    {
        if (name is not null && ByName.TryGetValue(name, out value)) return true;
        value = default;
        return false;
    }
}

public static class Ranks
{
    /// <summary>The equivalent of the client's <c>RANKS</c> array.</summary>
    public static Rank[] All => EnumNames<Rank>.Values;
}
