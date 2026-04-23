import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, total);

  const buttonClasses =
    'flex items-center gap-1 rounded-md border border-line px-2 py-1.5 text-sm transition-colors disabled:opacity-40 enabled:hover:bg-elevated';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-sm text-muted">
        {firstShown}–{lastShown} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={buttonClasses}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </button>
        <span className="text-sm text-muted">
          {page} / {lastPage}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= lastPage}
          className={buttonClasses}
        >
          Next
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
