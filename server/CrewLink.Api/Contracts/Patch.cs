using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CrewLink.Api.Contracts;

/// <summary>
/// A field in a PATCH body that knows whether it was present at all.
/// </summary>
/// <remarks>
/// PATCH has three states per field where a plain nullable property has only
/// two: absent (leave alone), present with a value (set it), present as null
/// (clear it). Collapsing the first two would mean a field can never be
/// cleared, and would silently rewrite any field the client didn't send.
/// <para>
/// System.Text.Json only invokes a converter for a property that actually
/// appears in the payload, so the presence flag comes for free: a default
/// <see cref="Patch{T}"/> is absent, a deserialised one is set.
/// </para>
/// </remarks>
[JsonConverter(typeof(PatchJsonConverterFactory))]
public readonly struct Patch<T>
{
    private readonly T? _value;

    public Patch(T? value)
    {
        _value = value;
        IsSet = true;
    }

    /// <summary>Whether the field appeared in the request body at all.</summary>
    public bool IsSet { get; }

    /// <summary>The value the client sent, when <see cref="IsSet"/>.</summary>
    public T? Value => _value;

    /// <summary>The patched value, or the existing one when the field was absent.</summary>
    public T? Or(T? existing) => IsSet ? _value : existing;

    public bool TryGet([MaybeNullWhen(false)] out T value)
    {
        value = _value!;
        return IsSet;
    }
}

public sealed class PatchJsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) =>
        typeToConvert.IsGenericType && typeToConvert.GetGenericTypeDefinition() == typeof(Patch<>);

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
    {
        var valueType = typeToConvert.GetGenericArguments()[0];
        return (JsonConverter)Activator.CreateInstance(
            typeof(PatchJsonConverter<>).MakeGenericType(valueType))!;
    }

    private sealed class PatchJsonConverter<T> : JsonConverter<Patch<T>>
    {
        public override Patch<T> Read(
            ref Utf8JsonReader reader,
            Type typeToConvert,
            JsonSerializerOptions options) =>
            new(JsonSerializer.Deserialize<T>(ref reader, options));

        public override void Write(Utf8JsonWriter writer, Patch<T> value, JsonSerializerOptions options)
        {
            if (value.IsSet) JsonSerializer.Serialize(writer, value.Value, options);
            else writer.WriteNullValue();
        }
    }
}
