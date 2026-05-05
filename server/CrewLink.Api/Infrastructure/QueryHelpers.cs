using System.Linq.Expressions;
using System.Text.Json;

using CrewLink.Api.Contracts;

using Microsoft.EntityFrameworkCore;

namespace CrewLink.Api.Infrastructure;

public static class PagedQuery
{
    public const int DefaultPageSize = 25;

    /// <summary>High enough for the calendar's 2,000-crew request, but not unbounded.</summary>
    public const int MaxPageSize = 2000;

    public static (int Page, int PageSize) Resolve(int? page, int? pageSize) =>
        (Math.Max(1, page ?? 1),
         Math.Clamp(pageSize ?? DefaultPageSize, 1, MaxPageSize));

    /// <summary>
    /// Counts and pages in the database rather than in memory — unlike the MSW
    /// handlers, which fetch everything and filter/sort/slice in JavaScript. Here
    /// it's all SQL against indexed columns, so a page costs the same at a
    /// thousand rows or a million.
    /// </summary>
    public static async Task<Paginated<T>> ToPageAsync<T>(
        IQueryable<T> query,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new Paginated<T>(items, total, page, pageSize);
    }
}

public static class SortHelpers
{
    public static bool IsDescending(string? order) =>
        string.Equals(order, "desc", StringComparison.OrdinalIgnoreCase);

    public static IQueryable<T> OrderByField<T, TKey>(
        this IQueryable<T> query,
        Expression<Func<T, TKey>> selector,
        bool descending) =>
        descending ? query.OrderByDescending(selector) : query.OrderBy(selector);

    /// <summary>
    /// Paging is only stable if the sort is total — two rows with the same name
    /// have no defined order, so the database could return them differently on
    /// page 2 than page 1. Appending the primary key breaks every tie.
    /// </summary>
    public static IQueryable<T> ThenById<T>(this IQueryable<T> query, Expression<Func<T, string>> id)
        where T : class =>
        query is IOrderedQueryable<T> ordered ? ordered.ThenBy(id) : query.OrderBy(id);
}

public static class RequestJson
{
    /// <summary>
    /// Reads a JSON body, turning a malformed one (unknown enum name, bad date)
    /// into the same 400 shape the client already understands.
    /// </summary>
    public static async Task<(T? Value, IResult? Error)> ReadAsync<T>(
        HttpRequest request,
        CancellationToken cancellationToken)
        where T : class
    {
        try
        {
            var value = await request.ReadFromJsonAsync<T>(cancellationToken);
            return value is null
                ? (null, ApiResults.MalformedBody("A request body is required."))
                : (value, null);
        }
        catch (JsonException exception)
        {
            return (null, ApiResults.MalformedBody(exception.Message));
        }
        catch (BadHttpRequestException exception)
        {
            return (null, ApiResults.MalformedBody(exception.Message));
        }
    }
}
