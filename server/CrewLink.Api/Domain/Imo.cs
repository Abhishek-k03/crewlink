namespace CrewLink.Api.Domain;

/// <summary>
/// IMO numbers carry a check digit: multiply the first six digits by 7,6,5,4,3,2,
/// sum them, and the last digit of that sum is the seventh digit. Checking it
/// catches transposed digits a plain "seven numeric characters" test would miss.
/// </summary>
public static class Imo
{
    public static int CheckDigit(ReadOnlySpan<char> firstSixDigits)
    {
        var sum = 0;
        for (var index = 0; index < 6; index += 1)
        {
            sum += (firstSixDigits[index] - '0') * (7 - index);
        }
        return sum % 10;
    }

    public static bool IsValid(string? value)
    {
        if (value is not { Length: 7 }) return false;
        foreach (var character in value)
        {
            if (!char.IsAsciiDigit(character)) return false;
        }
        return CheckDigit(value.AsSpan(0, 6)) == value[6] - '0';
    }
}
