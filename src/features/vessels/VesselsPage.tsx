import { Anchor, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/context';
import { can } from '@/auth/permissions';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { fieldClasses } from '@/components/ui/formStyles';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import type { ManningShortfall } from '@/domain/rules';
import { type Vessel, type VesselStatus, VESSEL_STATUSES, type VesselType, VESSEL_TYPES } from '@/domain/types';
import { useCreateVessel, useDeleteVessel, useUpdateVessel, useVessels } from '@/hooks/useVessels';

import { VesselForm } from './VesselForm';

const PAGE_SIZE = 10;

const STATUS_TONES: Record<VesselStatus, BadgeTone> = {
  'In Service': 'positive',
  'Dry Dock': 'caution',
  'Laid Up': 'neutral',
};

/** Turns rule-2 violation detail into something a person can act on. */
function describeShortfalls(violations: unknown): string | undefined {
  if (!Array.isArray(violations) || violations.length === 0) return undefined;
  return (violations as ManningShortfall[])
    .map((shortfall) => `${shortfall.rank}: ${shortfall.actual}/${shortfall.required}`)
    .join(', ');
}

export function VesselsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<VesselStatus | ''>('');
  const [type, setType] = useState<VesselType | ''>('');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<Vessel | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Vessel | null>(null);

  // Any change to the filters invalidates the current page number: page 4 of the
  // old result set is meaningless against the new one.
  useEffect(() => {
    setPage(1);
  }, [search, status, type]);

  const { data, isPending, isError, error, isPlaceholderData } = useVessels({
    search: search || undefined,
    status: status || undefined,
    type: type || undefined,
    page,
    pageSize: PAGE_SIZE,
    sort: 'name',
  });

  const createVessel = useCreateVessel();
  const updateVessel = useUpdateVessel();
  const deleteVessel = useDeleteVessel();

  const canWrite = user ? can(user.role, 'vessel:write') : false;
  const canMarkReady = user ? can(user.role, 'vessel:markReadyToSail') : false;

  const reportError = (caught: unknown, fallbackTitle: string) => {
    if (caught instanceof ApiError) {
      showToast({
        tone: 'error',
        title: caught.message,
        description: describeShortfalls(caught.violations),
      });
      return;
    }
    showToast({ tone: 'error', title: fallbackTitle });
  };

  const handleToggleReadyToSail = async (vessel: Vessel) => {
    try {
      await updateVessel.mutateAsync({ id: vessel.id, input: { readyToSail: !vessel.readyToSail } });
      showToast({
        tone: 'success',
        title: vessel.readyToSail
          ? `${vessel.name} is no longer marked ready to sail`
          : `${vessel.name} is ready to sail`,
      });
    } catch (caught) {
      reportError(caught, 'Could not update the vessel.');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const name = deleting.name;
    try {
      await deleteVessel.mutateAsync(deleting.id);
      setDeleting(null);
      showToast({ tone: 'success', title: `${name} deleted` });
    } catch (caught) {
      setDeleting(null);
      reportError(caught, 'Could not delete the vessel.');
    }
  };

  return (
    <>
      <PageHeader
        title="Vessels"
        description="Fleet register and manning compliance per vessel."
        actions={
          canWrite && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden />
              Add vessel
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
            placeholder="Search name, IMO or flag"
            aria-label="Search vessels"
            className={`${fieldClasses} w-full pl-9`}
          />
        </div>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as VesselStatus | '')}
          aria-label="Filter by status"
          className={fieldClasses}
        >
          <option value="">All statuses</option>
          {VESSEL_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          value={type}
          onChange={(event) => setType(event.target.value as VesselType | '')}
          aria-label="Filter by type"
          className={fieldClasses}
        >
          <option value="">All types</option>
          {VESSEL_TYPES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {isPending && <TableSkeleton columns={6} />}

      {isError && (
        <EmptyState
          title="Could not load vessels"
          description={error instanceof Error ? error.message : 'Unexpected error.'}
        />
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          title="No vessels match those filters"
          description="Try a different search term or clear the filters."
        />
      )}

      {data && data.items.length > 0 && (
        <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="py-2 pr-4 font-medium">Name</th>
                  <th scope="col" className="py-2 pr-4 font-medium">IMO</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Type</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Flag</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((vessel) => (
                  <tr
                    key={vessel.id}
                    className="border-b border-line last:border-0"
                  >
                    <td className="py-2.5 pr-4 font-medium">
                      <Link to={`/vessels/${vessel.id}`} className="hover:underline">
                        {vessel.name}
                      </Link>
                      {vessel.readyToSail && (
                        <span className="ml-2 align-middle">
                          <Badge tone="info">Ready to sail</Badge>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-muted">
                      {vessel.imoNumber}
                    </td>
                    <td className="py-2.5 pr-4 text-muted">{vessel.type}</td>
                    <td className="py-2.5 pr-4 text-muted">{vessel.flag}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={STATUS_TONES[vessel.status]}>{vessel.status}</Badge>
                    </td>
                    <td className="py-2.5">
                      <div className="flex justify-end gap-1">
                        {canMarkReady && (
                          <Button
                            variant="ghost"
                            onClick={() => void handleToggleReadyToSail(vessel)}
                            title={
                              vessel.readyToSail ? 'Withdraw ready to sail' : 'Mark ready to sail'
                            }
                          >
                            <Anchor className="size-4" aria-hidden />
                            <span className="sr-only">
                              {vessel.readyToSail ? 'Withdraw ready to sail' : 'Mark ready to sail'}
                            </span>
                          </Button>
                        )}
                        {canWrite && (
                          <>
                            <Button variant="ghost" onClick={() => setEditing(vessel)} title="Edit">
                              <Pencil className="size-4" aria-hidden />
                              <span className="sr-only">Edit {vessel.name}</span>
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => setDeleting(vessel)}
                              title="Delete"
                            >
                              <Trash2 className="size-4 text-danger" aria-hidden />
                              <span className="sr-only">Delete {vessel.name}</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={setPage}
          />
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Add vessel">
        <VesselForm
          pending={createVessel.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            try {
              await createVessel.mutateAsync({ ...values, readyToSail: false });
              setCreating(false);
              showToast({ tone: 'success', title: `${values.name} added` });
            } catch (caught) {
              // Field errors are handled inside the form; anything else is a toast.
              if (caught instanceof ApiError && caught.fieldErrors) throw caught;
              reportError(caught, 'Could not add the vessel.');
            }
          }}
        />
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit vessel">
        {editing && (
          <VesselForm
            vessel={editing}
            pending={updateVessel.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              try {
                await updateVessel.mutateAsync({ id: editing.id, input: values });
                setEditing(null);
                showToast({ tone: 'success', title: `${values.name} updated` });
              } catch (caught) {
                if (caught instanceof ApiError && caught.fieldErrors) throw caught;
                reportError(caught, 'Could not save the vessel.');
              }
            }}
          />
        )}
      </Modal>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete vessel">
        <p className="text-sm text-muted">
          Delete <span className="font-medium text-ink">{deleting?.name}</span>?
          This cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button variant="danger" pending={deleteVessel.isPending} onClick={() => void handleDelete()}>
            Delete
          </Button>
        </div>
      </Modal>
    </>
  );
}
