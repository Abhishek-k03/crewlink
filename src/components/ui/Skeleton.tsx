/** Placeholder blocks shown while a query is in flight, sized like the real content. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-elevated ${className}`} />;
}

export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }, (_unused, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: columns }, (_columnUnused, columnIndex) => (
            <Skeleton key={columnIndex} className="h-9 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
