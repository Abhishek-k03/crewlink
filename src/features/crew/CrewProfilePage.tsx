import { ArrowLeft, Download, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/context';
import { can, permissionScope } from '@/auth/permissions';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import { todayIso } from '@/domain/dates';
import { type ExpiryBucket, expiryBucket } from '@/domain/reporting';
import { getOverdueDays } from '@/domain/rules';
import type { AssignmentStatus } from '@/domain/types';
import { CertificationForm } from '@/features/certifications/CertificationForm';
import { toDownloadHref } from '@/features/certifications/documentFile';
import { useAssignments } from '@/hooks/useAssignments';
import {
  useCertifications,
  useCreateCertification,
  useDeleteCertification,
} from '@/hooks/useCertifications';
import { useCrewMember, useDeleteCrewMember, useUpdateCrewMember } from '@/hooks/useCrew';
import { useVesselNames } from '@/hooks/useVessels';

import { CrewForm } from './CrewForm';

const EXPIRY_TONES: Record<ExpiryBucket, BadgeTone> = {
  Expired: 'critical',
  'Within 30 days': 'critical',
  'Within 90 days': 'caution',
  Valid: 'positive',
};

const ASSIGNMENT_TONES: Record<AssignmentStatus, BadgeTone> = {
  Planned: 'info',
  Active: 'positive',
  Completed: 'neutral',
};

// Serves both /crew/:id and /me. A Crew Member has crew:read: 'own', so the id
// comes from their session rather than the URL when the permission is own-scoped.
export function CrewProfilePage({ ownProfile = false }: { ownProfile?: boolean }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const today = useMemo(() => todayIso(), []);
  const [addingCertification, setAddingCertification] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const scope = user ? permissionScope(user.role, 'crew:read') : 'none';
  const crewId = ownProfile || scope === 'own' ? user?.crewId : params.id;
  const canEditCrew = user ? can(user.role, 'crew:write') : false;

  const updateCrewMember = useUpdateCrewMember();
  const deleteCrewMember = useDeleteCrewMember();

  // Own-scoped roles may upload only against their own record, which `can`
  // resolves by comparing the viewer's crew id with the record's owner.
  const canUpload = user ? can(user.role, 'certification:write', user.crewId, crewId) : false;
  // Deliberately a separate permission: crew may add certificates but not remove
  // them, so an expired one cannot be made to disappear by its holder.
  const canDeleteCertification = user
    ? can(user.role, 'certification:delete', user.crewId, crewId)
    : false;

  const createCertification = useCreateCertification();
  const deleteCertification = useDeleteCertification();

  const crewQuery = useCrewMember(crewId);
  const assignmentsQuery = useAssignments({ crewId, pageSize: 100, sort: 'signOnDate', order: 'desc' });
  const certificationsQuery = useCertifications({ crewId, pageSize: 100 });
  // Names only: a Crew Member has no access to the fleet register, but does need
  // to see which ship their own rotation is on.
  const { names: vesselNames } = useVesselNames();

  if (!crewId) {
    return (
      <EmptyState
        title="No profile linked to this account"
        description="This login is not associated with a crew record."
      />
    );
  }

  if (crewQuery.isPending) {
    // On one's own profile the name is already known from the session, so the
    // header renders immediately instead of waiting a round trip to say it.
    const knownName = scope === 'own' ? user?.name : undefined;
    return (
      <>
        <PageHeader title={knownName ?? 'Crew profile'} />
        <Skeleton className="h-40 w-full" />
      </>
    );
  }

  if (crewQuery.isError || !crewQuery.data) {
    return (
      <EmptyState
        title="Crew member not found"
        description="That record may have been deleted."
        action={
          <Link to="/crew" className="text-sm font-medium underline underline-offset-4">
            Back to the directory
          </Link>
        }
      />
    );
  }

  const member = crewQuery.data;
  const assignments = assignmentsQuery.data?.items ?? [];
  const certifications = certificationsQuery.data?.items ?? [];

  return (
    <>
      {scope === 'all' && (
        <Link
          to="/crew"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All crew
        </Link>
      )}

      <PageHeader
        title={member.name}
        description={`${member.rank} · ${member.nationality}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={member.status === 'Onboard' ? 'positive' : 'neutral'}>
              {member.status}
            </Badge>
            {canEditCrew && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingDelete(true)} title="Delete">
                  <Trash2 className="size-4 text-danger" aria-hidden />
                  <span className="sr-only">Delete {member.name}</span>
                </Button>
              </>
            )}
          </div>
        }
      />

      <dl className="mb-8 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Email</dt>
          <dd className="truncate">{member.email}</dd>
        </div>
        <div>
          <dt className="text-muted">Phone</dt>
          <dd>{member.phone}</dd>
        </div>
        <div>
          <dt className="text-muted">Date of birth</dt>
          <dd>{member.dateOfBirth}</dd>
        </div>
      </dl>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Rotation history</h2>

        {assignmentsQuery.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : assignments.length === 0 ? (
          <EmptyState title="No rotations" description="This crew member has never been assigned." />
        ) : (
          <ol className="relative flex flex-col gap-3 border-l border-line pl-5">
            {assignments.map((assignment) => {
              const overdue = getOverdueDays(assignment, today);
              return (
                <li key={assignment.id} className="relative">
                  {/* The dot sits on the timeline rule rather than beside it. */}
                  <span
                    className="absolute top-2 -left-[1.4375rem] size-2 rounded-full bg-accent"
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3 text-sm">
                    <span className="font-medium">
                      {vesselNames.get(assignment.vesselId) ?? assignment.vesselId}
                    </span>
                    <span className="text-muted">
                      {assignment.rankOnboard}
                    </span>
                    <span className="text-muted">
                      {assignment.signOnDate} → {assignment.signOffDate}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      {overdue > 0 && <Badge tone="critical">{overdue} days overdue</Badge>}
                      <Badge tone={ASSIGNMENT_TONES[assignment.status]}>{assignment.status}</Badge>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Certifications</h2>
          {canUpload && (
            <Button variant="secondary" onClick={() => setAddingCertification(true)}>
              <Plus className="size-4" aria-hidden />
              Add certification
            </Button>
          )}
        </div>

        {certificationsQuery.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : certifications.length === 0 ? (
          <EmptyState title="No certifications on file" />
        ) : (
          <ul className="flex flex-col gap-2">
            {certifications.map((certification) => {
              const bucket = expiryBucket(certification.expiryDate, today);
              return (
                <li
                  key={certification.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3 text-sm"
                >
                  <span className="font-medium">{certification.type}</span>
                  <span className="text-muted">
                    {certification.issuingAuthority}
                  </span>
                  <span className="text-muted">
                    Expires {certification.expiryDate}
                  </span>

                  <span className="ml-auto flex items-center gap-3">
                    {certification.document && (
                      <a
                        href={toDownloadHref(certification.document)}
                        download={certification.document.fileName}
                        className="inline-flex items-center gap-1 underline underline-offset-4"
                      >
                        <Download className="size-4" aria-hidden />
                        Scan
                      </a>
                    )}
                    <Badge tone={EXPIRY_TONES[bucket]}>{bucket}</Badge>
                    {canDeleteCertification && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          deleteCertification.mutate(certification.id, {
                            onError: (caught) =>
                              showToast({
                                tone: 'error',
                                title:
                                  caught instanceof ApiError
                                    ? caught.message
                                    : 'Could not delete the certificate.',
                              }),
                          });
                        }}
                        title="Delete certificate"
                      >
                        <Trash2 className="size-4 text-danger" aria-hidden />
                        <span className="sr-only">Delete {certification.type}</span>
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit crew member">
        <CrewForm
          member={member}
          pending={updateCrewMember.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            try {
              await updateCrewMember.mutateAsync({ id: member.id, input: values });
              setEditing(false);
              showToast({ tone: 'success', title: `${values.name} updated` });
            } catch (caught) {
              if (caught instanceof ApiError && caught.fieldErrors) throw caught;
              showToast({
                tone: 'error',
                title: caught instanceof ApiError ? caught.message : 'Could not save the changes.',
              });
            }
          }}
        />
      </Modal>

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete crew member"
      >
        <p className="text-sm text-muted">
          Delete <span className="font-medium text-ink">{member.name}</span>?
          Their rotations and certificates are removed too. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            pending={deleteCrewMember.isPending}
            onClick={() => {
              deleteCrewMember.mutate(member.id, {
                onSuccess: () => {
                  setConfirmingDelete(false);
                  showToast({ tone: 'success', title: `${member.name} deleted` });
                  navigate('/crew');
                },
                onError: (caught) => {
                  setConfirmingDelete(false);
                  showToast({
                    tone: 'error',
                    title:
                      caught instanceof ApiError
                        ? caught.message
                        : 'Could not delete the crew member.',
                  });
                },
              });
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>

      <Modal
        open={addingCertification}
        onClose={() => setAddingCertification(false)}
        title="Add certification"
      >
        {crewId && (
          <CertificationForm
            crewId={crewId}
            pending={createCertification.isPending}
            onCancel={() => setAddingCertification(false)}
            onSubmit={async (values) => {
              try {
                await createCertification.mutateAsync(values);
                setAddingCertification(false);
                showToast({ tone: 'success', title: `${values.type} added` });
              } catch (caught) {
                if (caught instanceof ApiError && caught.fieldErrors) throw caught;
                showToast({
                  tone: 'error',
                  title:
                    caught instanceof ApiError
                      ? caught.message
                      : 'Could not add the certificate.',
                });
              }
            }}
          />
        )}
      </Modal>
    </>
  );
}
