namespace CrewLink.Api.Data;

/// <summary>
/// Name and place pools, matching <c>src/db/seedData.ts</c> element for
/// element. Order is load-bearing — the shared PRNG indexes into these arrays,
/// so reordering one silently produces a different fleet.
/// </summary>
public static class SeedPools
{
    public static readonly string[] GivenNames =
    [
        "Ariel", "Mateo", "Nikolai", "Rajesh", "Emeka", "Dimitris", "Yusuf", "Andrei", "Carlos", "Ivan",
        "Miguel", "Sergei", "Anton", "Rafael", "Joaquin", "Bogdan", "Ronaldo", "Marek", "Pavel", "Danilo",
        "Grace", "Ingrid", "Marta", "Sofia", "Lenka", "Amara", "Yuliya", "Katarina", "Rosa", "Priya",
        "Tomas", "Henrik", "Olek", "Vikram", "Chidi", "Nikos", "Hasan", "Petro", "Diego", "Vasili",
    ];

    public static readonly string[] FamilyNames =
    [
        "Santos", "Reyes", "Cruz", "Villanueva", "Bautista", "Mendoza", "Aquino", "Delgado", "Navarro",
        "Petrov", "Ivanov", "Sokolov", "Kuznetsov", "Volkov", "Morozov", "Popov", "Lebedev",
        "Kowalski", "Nowak", "Wozniak", "Lewandowski", "Kaminski",
        "Papadopoulos", "Nikolaidis", "Georgiou", "Vlachos",
        "Okafor", "Adeyemi", "Mensah", "Nwosu",
        "Sharma", "Patel", "Nair", "Menon", "Rao",
        "Lindqvist", "Andersen", "Halvorsen", "Virtanen", "Bergstrom",
    ];

    public static readonly string[] Nationalities =
    [
        "Philippines", "Ukraine", "India", "Indonesia", "China", "Russia", "Greece", "Turkey",
        "Poland", "Romania", "Myanmar", "Nigeria", "Norway", "Croatia", "Sri Lanka", "Vietnam",
    ];

    public static readonly string[] Flags =
    [
        "Panama", "Liberia", "Marshall Islands", "Singapore", "Malta", "Bahamas", "Cyprus",
        "Hong Kong", "Greece", "Japan",
    ];

    public static readonly string[] Ports =
    [
        "Singapore", "Rotterdam", "Shanghai", "Busan", "Hamburg", "Jebel Ali", "Santos", "Durban",
        "Piraeus", "Manila", "Antwerp", "Colombo", "Houston", "Valencia", "Gdansk", "Yokohama",
    ];

    public static readonly string[] VesselPrefixes =
    [
        "Nordic", "Pacific", "Atlantic", "Coral", "Iron", "Golden", "Silver", "Northern", "Southern",
        "Eastern", "Crimson", "Azure",
    ];

    public static readonly string[] VesselSuffixes =
    [
        "Voyager", "Trader", "Mariner", "Pioneer", "Horizon", "Endeavour", "Spirit", "Sentinel",
        "Ranger", "Explorer", "Harmony", "Meridian",
    ];

    public static readonly string[] IssuingAuthorities =
    [
        "MARINA", "Panama Maritime Authority", "Liberian Registry", "DNV", "Lloyds Register",
        "Bureau Veritas", "Maritime NZ", "Transport Malta",
    ];
}
