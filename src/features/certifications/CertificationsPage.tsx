import { Download, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { fieldClasses } from '@/components/ui/formStyles';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { todayIso } from '@/domain/dates';
import { type ExpiryBucket, expiryBucket } from '@/domain/reporting';
import { CERTIFICATION_TYPES, type CertificationType } from '@/domain/types';
import { useCertifications } from '@/hooks/useCertifications';
import { useCrewInfinite } from '@/hooks/useCrew';

import { toDownloadHref } from './documentFile';

const PAGE_SIZE = 20;

const BUCKETS: readonly ExpiryBucket[] = [
  'Expired',
  'Within 30 days',
  'Within 90 days',
  'Valid',
];

const BUCKET_TONES: Record<ExpiryBucket, BadgeTone> = {
  Expired: 'critical',
  'Within 30 days': 'critical',
  'Within 90 days': 'caution',
  Valid: 'positive',
};

export function CertificationsPage() {
  const today = useMemo(() => todayIso(), []);
  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState<ExpiryBucket | ''>('');
  const [type, setType] = useState<CertificationType | ''>('');
  const [page, setPage] = useState(1);

  // Keeps typing responsive: the input updates immediately while the query runs
  // against a slightly stale term instead of firing on every keystroke.
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, bucket, type]);

  const { data, isPending, isError, error, isPlaceholderData } = useCertifications({
    search: deferredSearch || undefined,
    bucket: bucket || undefined,
    type: type || undefined,
    page,
    pageSize: PAGE_SIZE,
    sort: 'expiryDate',
  });

  // Certificates carry a crewId; the table has to show a person.
  const crewQuery = useCrewInfinite({ sort: 'name' });
  const crewNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const crewPage of crewQuery.data?.pages ?? []) {
      for (const member of crewPage.items) map.set(member.id, member.name);
    }
    return map;
  }, [crewQuery.data]);

  return (
    <>
      <PageHeader
        title="Certifications"
        description="Expiry tracking across the fleet, colour-coded by remaining validity."
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
            placeholder="Search crew name, authority or type"
            aria-label="Search certifications"
            className={`${fieldClasses} w-full pl-9`}
          />
        </div>

        <select
          value={bucket}
          onChange={(event) => setBucket(event.target.value as ExpiryBucket | '')}
          aria-label="Filter by expiry status"
          className={fieldClasses}
        >
          <option value="">All statuses</option>
          {BUCKETS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          value={type}
          onChange={(event) => setType(event.target.value as CertificationType | '')}
          aria-label="Filter by certificate type"
          className={fieldClasses}
        >
          <option value="">All types</option>
          {CERTIFICATION_TYPES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {isPending && <TableSkeleton rows={8} columns={5} />}

      {isError && (
        <EmptyState
          title="Could not load certifications"
          description={error instanceof Error ? error.message : 'Unexpected error.'}
        />
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          title="No certificates match those filters"
          description="Try a different search term, status or type."
        />
      )}

      {data && data.items.length > 0 && (
        <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="py-2 pr-4 font-medium">Crew member</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Type</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Authority</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Expires</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-2 font-medium">Scan</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((certification) => {
                  const band = expiryBucket(certification.expiryDate, today);
                  return (
                    <tr
                      key={certification.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="py-2.5 pr-4 font-medium">
                        <Link
                          to={`/crew/${certification.crewId}`}
                          className="hover:underline"
                        >
                          {crewNames.get(certification.crewId) ?? certification.crewId}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4">{certification.type}</td>
                      <td className="py-2.5 pr-4 text-muted">
                        {certification.issuingAuthority}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-muted">
                        {certification.expiryDate}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={BUCKET_TONES[band]}>{band}</Badge>
                      </td>
                      <td className="py-2.5">
                        {certification.document ? (
                          <a
                            href={toDownloadHref(certification.document)}
                            download={certification.document.fileName}
                            className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
                          >
                            <Download className="size-4" aria-hidden />
                            Download
                          </a>
                        ) : (
                          <span className="text-sm text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
    </>
  );
}
