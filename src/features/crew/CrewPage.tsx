import { Plus, Search } from 'lucide-react';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { List } from 'react-window';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/context';
import { can } from '@/auth/permissions';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { fieldClasses } from '@/components/ui/formStyles';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import { CREW_STATUSES, type CrewStatus, type Rank, RANKS } from '@/domain/types';
import { useCreateCrewMember, useCrewInfinite } from '@/hooks/useCrew';

import { CrewForm } from './CrewForm';
import { CrewRow } from './CrewRow';

const ROW_HEIGHT = 52;
/** Start loading the next page this many rows before the end of what is loaded. */
const PREFETCH_THRESHOLD = 20;

export function CrewPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CrewStatus | ''>('');
  const [rank, setRank] = useState<Rank | ''>('');
  const [creating, setCreating] = useState(false);

  const canWrite = user ? can(user.role, 'crew:write') : false;
  const createCrewMember = useCreateCrewMember();

  // Keeps typing responsive: the input updates immediately while the query runs
  // against a slightly stale term instead of firing on every keystroke.
  const deferredSearch = useDeferredValue(search);

  const query = useCrewInfinite({
    search: deferredSearch || undefined,
    status: status || undefined,
    rank: rank || undefined,
    sort: 'name',
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, isError, error } = query;

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  const handleRowsRendered = useCallback(
    (visible: { startIndex: number; stopIndex: number }) => {
      if (!hasNextPage || isFetchingNextPage) return;
      if (visible.stopIndex >= items.length - PREFETCH_THRESHOLD) {
        void fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage, items.length],
  );

  const rowProps = useMemo(() => ({ items }), [items]);

  return (
    <>
      <PageHeader
        title="Crew"
        description={
          total > 0
            ? `${total} crew members. Only the visible rows are in the DOM.`
            : 'Crew directory, searchable by name, rank and nationality.'
        }
        actions={
          canWrite && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden />
              Add crew member
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, rank or nationality"
            aria-label="Search crew"
            className={`${fieldClasses} w-full pl-9`}
          />
        </div>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as CrewStatus | '')}
          aria-label="Filter by status"
          className={fieldClasses}
        >
          <option value="">All statuses</option>
          {CREW_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          value={rank}
          onChange={(event) => setRank(event.target.value as Rank | '')}
          aria-label="Filter by rank"
          className={fieldClasses}
        >
          <option value="">All ranks</option>
          {RANKS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {isPending && <TableSkeleton rows={10} columns={4} />}

      {isError && (
        <EmptyState
          title="Could not load the crew directory"
          description={error instanceof Error ? error.message : 'Unexpected error.'}
        />
      )}

      {!isPending && !isError && items.length === 0 && (
        <EmptyState
          title="No crew members match those filters"
          description="Try a different search term or clear the filters."
        />
      )}

      {items.length > 0 && (
        <div className="rounded-lg border border-line bg-surface">
          <div className="flex items-center gap-3 border-b border-line px-4 py-2 text-xs font-medium text-muted">
            <span className="w-56">Name</span>
            <span className="w-32">Rank</span>
            <span className="hidden w-32 sm:block">Nationality</span>
            <span>Status</span>
          </div>

          <List
            rowComponent={CrewRow}
            rowCount={items.length}
            rowHeight={ROW_HEIGHT}
            rowProps={rowProps}
            onRowsRendered={handleRowsRendered}
            overscanCount={8}
            style={{ height: '32rem' }}
          />

          {isFetchingNextPage && (
            <p className="border-t border-line px-4 py-2 text-sm text-muted">
              Loading more…
            </p>
          )}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Add crew member">
        <CrewForm
          pending={createCrewMember.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            try {
              await createCrewMember.mutateAsync(values);
              setCreating(false);
              showToast({ tone: 'success', title: `${values.name} added` });
            } catch (caught) {
              if (caught instanceof ApiError && caught.fieldErrors) throw caught;
              showToast({
                tone: 'error',
                title:
                  caught instanceof ApiError ? caught.message : 'Could not add the crew member.',
              });
            }
          }}
        />
      </Modal>
    </>
  );
}
