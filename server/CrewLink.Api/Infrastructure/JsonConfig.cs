using System.Text.Json;
using System.Text.Json.Serialization;

using CrewLink.Api.Domain;

namespace CrewLink.Api.Infrastructure;

/// <summary>
/// <c>minimumSafeManning</c> is an object keyed by rank name
/// (<c>{ "Chief Officer": 1 }</c>). Dictionary keys don't pick up
/// <c>JsonStringEnumMemberName</c> the way values do, so without this converter
/// they'd silently serialise as C# identifiers (<c>ChiefOfficer</c>) and the
/// client would read every rank as absent.
/// </summary>
public sealed class RankIntDictionaryJsonConverter : JsonConverter<Dictionary<Rank, int>>
{
    public override Dictionary<Rank, int> Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.StartObject)
        {
            throw new JsonException("Expected an object for minimumSafeManning.");
        }

        var result = new Dictionary<Rank, int>();
        while (reader.Read())
        {
            if (reader.TokenType == JsonTokenType.EndObject) return result;

            var key = reader.GetString()
                ?? throw new JsonException("Rank keys cannot be null.");
            if (!EnumNames<Rank>.TryParse(key, out var rank))
            {
                throw new JsonException($"'{key}' is not a known rank.");
            }

            reader.Read();
            result[rank] = reader.GetInt32();
        }

        throw new JsonException("Unterminated minimumSafeManning object.");
    }

    public override void Write(
        Utf8JsonWriter writer,
        Dictionary<Rank, int> value,
        JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        // Rank order, not dictionary order, so the JSON is byte-stable for a
        // given set of requirements.
        foreach (var rank in Ranks.All)
        {
            if (value.TryGetValue(rank, out var required))
            {
                writer.WriteNumber(EnumNames<Rank>.Name(rank), required);
            }
        }
        writer.WriteEndObject();
    }
}

public static class JsonConfig
{
    /// <summary>
    /// Applied to both the HTTP pipeline and the JSON columns in SQLite, so a
    /// value can't round-trip through the database as something the client
    /// wouldn't recognise.
    /// </summary>
    public static void Apply(JsonSerializerOptions options)
    {
        options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        // The client's types mark absent values as optional (document?), not as
        // T | null, so omit rather than emit an explicit null.
        options.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        options.Converters.Add(new JsonStringEnumConverter());
        options.Converters.Add(new RankIntDictionaryJsonConverter());
    }

    public static readonly JsonSerializerOptions Default = Create();

    private static JsonSerializerOptions Create()
    {
        var options = new JsonSerializerOptions();
        Apply(options);
        return options;
    }
}
