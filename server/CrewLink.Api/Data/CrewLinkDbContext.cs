using System.Text.Json;

using CrewLink.Api.Domain;
using CrewLink.Api.Infrastructure;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace CrewLink.Api.Data;

/// <summary>A demo account. Kept out of <c>Domain</c> — authentication is an application concern.</summary>
public sealed class UserAccount
{
    public required string Id { get; set; }
    public required string Name { get; set; }
    public required string Email { get; set; }

    /// <summary>PBKDF2, salted and iterated — never the password itself, even for these demo accounts.</summary>
    public required string PasswordHash { get; set; }

    public Role Role { get; set; }

    /// <summary>Present only for Crew Member, linking the login to a crew record.</summary>
    public string? CrewId { get; set; }
}

/// <summary>
/// Persistence mapping — the only file that knows both the domain types and EF
/// Core, so <c>Domain</c> stays testable with no database in sight.
/// </summary>
public sealed class CrewLinkDbContext(DbContextOptions<CrewLinkDbContext> options) : DbContext(options)
{
    public DbSet<Vessel> Vessels => Set<Vessel>();
    public DbSet<CrewMember> Crew => Set<CrewMember>();
    public DbSet<Assignment> Assignments => Set<Assignment>();
    public DbSet<Certification> Certifications => Set<Certification>();
    public DbSet<UserAccount> Users => Set<UserAccount>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Vessel>(entity =>
        {
            entity.HasKey(vessel => vessel.Id);
            entity.Property(vessel => vessel.Id).HasMaxLength(64);
            entity.Property(vessel => vessel.Name).HasMaxLength(80).IsRequired();
            entity.Property(vessel => vessel.ImoNumber).HasMaxLength(7).IsRequired();
            entity.Property(vessel => vessel.Flag).HasMaxLength(80).IsRequired();
            entity.Property(vessel => vessel.Type).HasEnumNameConversion();
            entity.Property(vessel => vessel.Status).HasEnumNameConversion();

            // Sparse, small, and never queried by its contents — a JSON column is
            // simpler than a rank/count join table for what's really one value.
            entity.Property(vessel => vessel.MinimumSafeManning)
                .HasConversion(ManningConverter, ManningComparer)
                .HasColumnType("TEXT");

            // Enforced by the database, not only by a handler that remembers to
            // check, so two concurrent creates can't both win.
            entity.HasIndex(vessel => vessel.ImoNumber).IsUnique();
            entity.HasIndex(vessel => vessel.Status);
            entity.HasIndex(vessel => vessel.Name);
        });

        modelBuilder.Entity<CrewMember>(entity =>
        {
            entity.HasKey(member => member.Id);
            entity.Property(member => member.Id).HasMaxLength(64);
            entity.Property(member => member.Name).HasMaxLength(80).IsRequired();
            entity.Property(member => member.Nationality).HasMaxLength(80).IsRequired();
            entity.Property(member => member.Email).HasMaxLength(200).IsRequired();
            entity.Property(member => member.Phone).HasMaxLength(40).IsRequired();
            entity.Property(member => member.Rank).HasEnumNameConversion();
            entity.Property(member => member.Status).HasEnumNameConversion();

            // The crew directory filters on exactly these three and sorts by
            // name — keeps paging off a table scan as the table grows.
            entity.HasIndex(member => member.Status);
            entity.HasIndex(member => member.Rank);
            entity.HasIndex(member => member.Nationality);
            entity.HasIndex(member => member.Name);
        });

        modelBuilder.Entity<Assignment>(entity =>
        {
            entity.HasKey(assignment => assignment.Id);
            entity.Property(assignment => assignment.Id).HasMaxLength(64);
            entity.Property(assignment => assignment.CrewId).HasMaxLength(64).IsRequired();
            entity.Property(assignment => assignment.VesselId).HasMaxLength(64).IsRequired();
            entity.Property(assignment => assignment.Port).HasMaxLength(80).IsRequired();
            entity.Property(assignment => assignment.RankOnboard).HasEnumNameConversion();
            entity.Property(assignment => assignment.Status).HasEnumNameConversion();

            // Mirrors the two hottest queries: a vessel's active roster (rule 2)
            // and a crew member's live rotations (rule 1).
            entity.HasIndex(assignment => new { assignment.VesselId, assignment.Status });
            entity.HasIndex(assignment => new { assignment.CrewId, assignment.Status });
            entity.HasIndex(assignment => assignment.SignOnDate);
            entity.HasIndex(assignment => assignment.SignOffDate);

            // No navigation properties — the client's Assignment carries plain
            // ids, and navigations would tempt handlers into loading object
            // graphs the API never returns.
            entity.HasOne<CrewMember>()
                .WithMany()
                .HasForeignKey(assignment => assignment.CrewId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Vessel>()
                .WithMany()
                .HasForeignKey(assignment => assignment.VesselId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Certification>(entity =>
        {
            entity.HasKey(certification => certification.Id);
            entity.Property(certification => certification.Id).HasMaxLength(64);
            entity.Property(certification => certification.CrewId).HasMaxLength(64).IsRequired();
            entity.Property(certification => certification.IssuingAuthority).HasMaxLength(120).IsRequired();
            entity.Property(certification => certification.Type).HasEnumNameConversion();

            // The base64 scan is by far the largest thing in the row, so it's a
            // nullable column of its own — a query that doesn't select it doesn't pay for it.
            entity.Property(certification => certification.Document)
                .HasConversion(DocumentConverter, DocumentComparer)
                .HasColumnType("TEXT");

            entity.HasIndex(certification => certification.CrewId);
            entity.HasIndex(certification => certification.Type);
            // Every expiry bucket is a range scan on this column.
            entity.HasIndex(certification => certification.ExpiryDate);

            entity.HasOne<CrewMember>()
                .WithMany()
                .HasForeignKey(certification => certification.CrewId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserAccount>(entity =>
        {
            entity.HasKey(user => user.Id);
            entity.Property(user => user.Id).HasMaxLength(64);
            entity.Property(user => user.Name).HasMaxLength(80).IsRequired();
            entity.Property(user => user.Email).HasMaxLength(200).IsRequired();
            entity.Property(user => user.PasswordHash).IsRequired();
            entity.Property(user => user.Role).HasEnumNameConversion();
            entity.Property(user => user.CrewId).HasMaxLength(64);
            entity.HasIndex(user => user.Email).IsUnique();
        });
    }

    private static readonly ValueConverter<Dictionary<Rank, int>, string> ManningConverter = new(
        value => JsonSerializer.Serialize(value, JsonConfig.Default),
        json => JsonSerializer.Deserialize<Dictionary<Rank, int>>(json, JsonConfig.Default)!);

    /// <summary>
    /// Without this, EF would compare the dictionary by reference, and mutating
    /// it in place would never register as a change.
    /// </summary>
    private static readonly ValueComparer<Dictionary<Rank, int>> ManningComparer = new(
        (left, right) => JsonSerializer.Serialize(left, JsonConfig.Default)
            == JsonSerializer.Serialize(right, JsonConfig.Default),
        value => JsonSerializer.Serialize(value, JsonConfig.Default).GetHashCode(StringComparison.Ordinal),
        value => JsonSerializer.Deserialize<Dictionary<Rank, int>>(
            JsonSerializer.Serialize(value, JsonConfig.Default), JsonConfig.Default)!);

    // Typed as the non-generic base so the nullable property binds to EF's
    // untyped overload — an absent scan is then stored as SQL NULL, not "null".
    private static readonly ValueConverter DocumentConverter =
        new ValueConverter<CertificationDocument, string>(
            value => JsonSerializer.Serialize(value, JsonConfig.Default),
            json => JsonSerializer.Deserialize<CertificationDocument>(json, JsonConfig.Default)!);

    private static readonly ValueComparer DocumentComparer = new ValueComparer<CertificationDocument>(
        (left, right) => JsonSerializer.Serialize(left, JsonConfig.Default)
            == JsonSerializer.Serialize(right, JsonConfig.Default),
        value => JsonSerializer.Serialize(value, JsonConfig.Default).GetHashCode(StringComparison.Ordinal),
        value => JsonSerializer.Deserialize<CertificationDocument>(
            JsonSerializer.Serialize(value, JsonConfig.Default), JsonConfig.Default)!);
}

internal static class EnumMappingExtensions
{
    /// <summary>
    /// Stores enums as their wire names, not ordinals — ordinals are smaller but
    /// unreadable, and silently re-map every row if a member is inserted mid-enum.
    /// </summary>
    public static Microsoft.EntityFrameworkCore.Metadata.Builders.PropertyBuilder<TEnum>
        HasEnumNameConversion<TEnum>(
            this Microsoft.EntityFrameworkCore.Metadata.Builders.PropertyBuilder<TEnum> builder)
        where TEnum : struct, Enum =>
        builder.HasConversion(
            value => EnumNames<TEnum>.Name(value),
            name => EnumNames<TEnum>.Parse(name));
}
