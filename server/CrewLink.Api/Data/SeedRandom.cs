namespace CrewLink.Api.Data;

/// <summary>
/// A bit-exact port of the client's mulberry32 generator (<c>src/db/random.ts</c>).
/// </summary>
/// <remarks>
/// Porting the algorithm rather than reaching for <see cref="Random"/> means
/// the same seed and calendar day produce the identical fleet the browser
/// generates, so <c>msw</c> and <c>http</c> modes show the same data.
/// <para>
/// Every operation is <c>unchecked</c> on <see cref="uint"/>, matching how
/// JavaScript's bitwise operators wrap at 32 bits and how <c>Math.imul</c> is
/// defined as the low 32 bits of the product.
/// </para>
/// </remarks>
public sealed class SeedRandom(uint seed)
{
    private uint _state = seed;

    /// <summary>A double in <c>[0, 1)</c>, matching JavaScript's <c>random()</c>.</summary>
    public double Next()
    {
        unchecked
        {
            _state += 0x6D2B79F5u;
            var t = _state;
            t = (t ^ (t >> 15)) * (t | 1u);
            t ^= t + ((t ^ (t >> 7)) * (t | 61u));
            return (t ^ (t >> 14)) / 4294967296.0;
        }
    }

    /// <summary>Inclusive on both ends.</summary>
    public int NextInt(int min, int max) => min + (int)Math.Floor(Next() * (max - min + 1));

    public T Pick<T>(IReadOnlyList<T> items) => items[(int)Math.Floor(Next() * items.Count)];

    /// <summary>Picks with the given probability, e.g. <c>Chance(0.25)</c>.</summary>
    public bool Chance(double probability) => Next() < probability;
}
