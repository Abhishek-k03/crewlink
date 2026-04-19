import { http, HttpResponse } from 'msw';
import { z } from 'zod';

import { db } from '@/db/schema';
import { todayIso } from '@/domain/dates';
import {
  assignmentInputSchema,
  assignmentPatchSchema,
  certificationInputSchema,
  certificationPatchSchema,
  crewInputSchema,
  vesselInputSchema,
} from '@/domain/schemas';
import { buildNotifications } from '@/domain/notifications';
import { buildDashboardSummary, expiryBucket } from '@/domain/reporting';
import {
  checkManningCompliance,
  findBlockingCertifications,
  findConflictingAssignments,
} from '@/domain/rules';
import type { Assignment, Certification, CrewMember, Vessel } from '@/domain/types';

import { simulateNetwork, SimulatedFailure } from './network';

// The mock REST layer. It owns the database — no component or hook reads Dexie
// directly, so swapping this for a real server changes nothing above the
// src/api wrappers. Business rules are enforced here too, as the authority,
// not just in the forms. Authentication isn't modelled: there's no token to
// check, so role permissions are enforced client-side only.

const DEFAULT_PAGE_SIZE = 25;

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function paginate<T>(items: T[], url: URL): Paginated<T> {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const pageSize = Math.max(
    1,
    Number(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)),
  );
  const start = (page - 1) * pageSize;

  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

function matchesSearch(haystacks: (string | undefined)[], needle: string | null): boolean {
  if (!needle) return true;
  const term = needle.trim().toLowerCase();
  if (!term) return true;
  return haystacks.some((value) => value?.toLowerCase().includes(term));
}

function sortItems<T>(items: T[], url: URL): T[] {
  const field = url.searchParams.get('sort');
  if (!field) return items;
  const direction = url.searchParams.get('order') === 'desc' ? -1 : 1;
  const valueOf = (item: T) => (item as Record<string, unknown>)[field];

  return [...items].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
    return String(left ?? '').localeCompare(String(right ?? '')) * direction;
  });
}

function validationError(error: z.ZodError): Response {
  return HttpResponse.json(
    {
      message: 'The submitted values are not valid.',
      fieldErrors: z.flattenError(error).fieldErrors,
    },
    { status: 400 },
  );
}

function notFound(entity: string): Response {
  return HttpResponse.json({ message: `${entity} not found.` }, { status: 404 });
}

/** 422 carries rule violations: valid input the domain refuses to accept. */
function ruleViolation(message: string, violations: unknown): Response {
  return HttpResponse.json({ message, violations }, { status: 422 });
}

/** Turns a thrown `SimulatedFailure` back into the response it carries. */
async function withNetwork<T>(isWrite: boolean, handle: () => Promise<T>): Promise<T | Response> {
  try {
    await simulateNetwork(isWrite);
  } catch (error) {
    if (error instanceof SimulatedFailure) return error.response;
    throw error;
  }
  return handle();
}

// Vessels

const vesselHandlers = [
  http.get('*/api/vessels', ({ request }) =>
    withNetwork(false, async () => {
      const url = new URL(request.url);
      const status = url.searchParams.get('status');
      const type = url.searchParams.get('type');
      const search = url.searchParams.get('search');

      const all = await db.vessels.toArray();
      const filtered = all.filter(
        (vessel) =>
          (!status || vessel.status === status) &&
          (!type || vessel.type === type) &&
          matchesSearch([vessel.name, vessel.imoNumber, vessel.flag], search),
      );

      return HttpResponse.json(paginate(sortItems(filtered, url), url));
    }),
  ),

  // Registered before the :id handler: MSW matches in order, and :id would
  // otherwise swallow /lookup and 404 for a vessel literally named "lookup".
  http.get('*/api/vessels/lookup', () =>
    withNetwork(false, async () => {
      const vessels = await db.vessels.toArray();
      return HttpResponse.json(
        vessels
          .map((vessel) => ({ id: vessel.id, name: vessel.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    }),
  ),

  http.get('*/api/vessels/:id', ({ params }) =>
    withNetwork(false, async () => {
      const vessel = await db.vessels.get(String(params.id));
      return vessel ? HttpResponse.json(vessel) : notFound('Vessel');
    }),
  ),

  http.post('*/api/vessels', ({ request }) =>
    withNetwork(true, async () => {
      const parsed = vesselInputSchema.safeParse(await request.json());
      if (!parsed.success) return validationError(parsed.error);

      const duplicate = await db.vessels.where('imoNumber').equals(parsed.data.imoNumber).first();
      if (duplicate) {
        return ruleViolation('That IMO number is already registered to another vessel.', []);
      }

      const vessel: Vessel = { id: crypto.randomUUID(), ...parsed.data };
      await db.vessels.add(vessel);
      return HttpResponse.json(vessel, { status: 201 });
    }),
  ),

  http.patch('*/api/vessels/:id', ({ params, request }) =>
    withNetwork(true, async () => {
      const id = String(params.id);
      const existing = await db.vessels.get(id);
      if (!existing) return notFound('Vessel');

      const parsed = vesselInputSchema.partial().safeParse(await request.json());
      if (!parsed.success) return validationError(parsed.error);

      const updated: Vessel = { ...existing, ...parsed.data };

      if (updated.imoNumber !== existing.imoNumber) {
        const duplicate = await db.vessels.where('imoNumber').equals(updated.imoNumber).first();
        if (duplicate && duplicate.id !== id) {
          return ruleViolation('That IMO number is already registered to another vessel.', []);
        }
      }

      // Rule 2: a vessel below minimum safe manning cannot be marked ready to sail.
      if (updated.readyToSail && !existing.readyToSail) {
        const assignments = await db.assignments.where('vesselId').equals(id).toArray();
        const compliance = checkManningCompliance(updated, assignments, todayIso());
        if (!compliance.compliant) {
          return ruleViolation(
            'This vessel is below minimum safe manning and cannot be marked ready to sail.',
            compliance.shortfalls,
          );
        }
      }

      await db.vessels.put(updated);
      return HttpResponse.json(updated);
    }),
  ),

  http.delete('*/api/vessels/:id', ({ params }) =>
    withNetwork(true, async () => {
      const id = String(params.id);
      const existing = await db.vessels.get(id);
      if (!existing) return notFound('Vessel');

      const active = await db.assignments
        .where('[vesselId+status]')
        .equals([id, 'Active'])
        .count();
      if (active > 0) {
        return ruleViolation(
          `This vessel has ${active} active rotation${active === 1 ? '' : 's'} and cannot be deleted.`,
          [],
        );
      }

      await db.vessels.delete(id);
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];

// Crew

const crewHandlers = [
  http.get('*/api/crew', ({ request }) =>
    withNetwork(false, async () => {
      const url = new URL(request.url);
      const status = url.searchParams.get('status');
      const rank = url.searchParams.get('rank');
      const nationality = url.searchParams.get('nationality');
      const search = url.searchParams.get('search');

      const all = await db.crew.toArray();
      const filtered = all.filter(
        (member) =>
          (!status || member.status === status) &&
          (!rank || member.rank === rank) &&
          (!nationality || member.nationality === nationality) &&
          matchesSearch([member.name, member.rank, member.nationality, member.email], search),
      );

      return HttpResponse.json(paginate(sortItems(filtered, url), url));
    }),
  ),

  http.get('*/api/crew/:id', ({ params }) =>
    withNetwork(false, async () => {
      const member = await db.crew.get(String(params.id));
      return member ? HttpResponse.json(member) : notFound('Crew member');
    }),
  ),

  http.post('*/api/crew', ({ request }) =>
    withNetwork(true, async () => {
      const parsed = crewInputSchema.safeParse(await request.json());
      if (!parsed.success) return validationError(parsed.error);

      const member: CrewMember = { id: crypto.randomUUID(), ...parsed.data };
      await db.crew.add(member);
      return HttpResponse.json(member, { status: 201 });
    }),
  ),

  http.patch('*/api/crew/:id', ({ params, request }) =>
    withNetwork(true, async () => {
      const existing = await db.crew.get(String(params.id));
      if (!existing) return notFound('Crew member');

      const parsed = crewInputSchema.partial().safeParse(await request.json());
      if (!parsed.success) return validationError(parsed.error);

      const updated: CrewMember = { ...existing, ...parsed.data };
      await db.crew.put(updated);
      return HttpResponse.json(updated);
    }),
  ),

  http.delete('*/api/crew/:id', ({ params }) =>
    withNetwork(true, async () => {
      const id = String(params.id);
      const existing = await db.crew.get(id);
      if (!existing) return notFound('Crew member');

      const active = await db.assignments.where('[crewId+status]').equals([id, 'Active']).count();
      if (active > 0) {
        return ruleViolation('This crew member is currently onboard and cannot be deleted.', []);
      }

      await db.transaction('rw', [db.crew, db.assignments, db.certifications], async () => {
        await db.assignments.where('crewId').equals(id).delete();
        await db.certifications.where('crewId').equals(id).delete();
        await db.crew.delete(id);
      });
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];

// Assignments

/** Runs rules 1 and 3 against a proposed assignment. */
async function checkAssignmentRules(candidate: Assignment): Promise<Response | null> {
  const existing = await db.assignments.where('crewId').equals(candidate.crewId).toArray();
  const conflicts = findConflictingAssignments(candidate, existing);
  if (conflicts.length > 0) {
    return ruleViolation(
      'This crew member already has a rotation covering those dates.',
      conflicts.map((item) => ({
        assignmentId: item.id,
        signOnDate: item.signOnDate,
        signOffDate: item.signOffDate,
      })),
    );
  }

  // Certification gating only blocks *taking up* a rotation — closing one out
  // is always allowed, or a lapsed cert would trap the rotation in Active forever.
  if (candidate.status === 'Completed') return null;

  const crew = await db.crew.get(candidate.crewId);
  if (!crew) return notFound('Crew member');

  const certifications = await db.certifications.where('crewId').equals(candidate.crewId).toArray();
  const blocks = findBlockingCertifications(
    crew,
    certifications,
    candidate.rankOnboard,
    candidate.signOffDate,
  );
  if (blocks.length > 0) {
    return ruleViolation('Certification requirements are not met for this rotation.', blocks);
  }

  return null;
}

const assignmentHandlers = [
  http.get('*/api/assignments', ({ request }) =>
    withNetwork(false, async () => {
      const url = new URL(request.url);
      const crewId = url.searchParams.get('crewId');
      const vesselId = url.searchParams.get('vesselId');
      const status = url.searchParams.get('status');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');

      const all = await db.assignments.toArray();
      const filtered = all.filter(
        (assignment) =>
          (!crewId || assignment.crewId === crewId) &&
          (!vesselId || assignment.vesselId === vesselId) &&
          (!status || assignment.status === status) &&
          // Overlap against the requested window, for the calendar's month view.
          (!from || assignment.signOffDate >= from) &&
          (!to || assignment.signOnDate <= to),
      );

      return HttpResponse.json(paginate(sortItems(filtered, url), url));
    }),
  ),

  http.get('*/api/assignments/:id', ({ params }) =>
    withNetwork(false, async () => {
      const assignment = await db.assignments.get(String(params.id));
      return assignment ? HttpResponse.json(assignment) : notFound('Assignment');
    }),
  ),

  http.post('*/api/assignments', ({ request }) =>
    withNetwork(true, async () => {
      const parsed = assignmentInputSchema.safeParse(await request.json());
      if (!parsed.success) return validationError(parsed.error);

      const assignment: Assignment = { id: crypto.randomUUID(), ...parsed.data };
      const violation = await checkAssignmentRules(assignment);
      if (violation) return violation;

      await db.assignments.add(assignment);
      return HttpResponse.json(assignment, { status: 201 });
    }),
  ),

  http.patch('*/api/assignments/:id', ({ params, request }) =>
    withNetwork(true, async () => {
      const existing = await db.assignments.get(String(params.id));
      if (!existing) return notFound('Assignment');

      const parsed = assignmentPatchSchema.safeParse(await request.json());
      if (!parsed.success) return validationError(parsed.error);

      const updated: Assignment = { ...existing, ...parsed.data };
      // Validating the merged record, not just the patch, so a change to one
      // date is still checked against the other.
      const merged = assignmentInputSchema.safeParse(updated);
      if (!merged.success) return validationError(merged.error);

      const violation = await checkAssignmentRules(updated);
      if (violation) return violation;

      await db.assignments.put(updated);
      return HttpResponse.json(updated);
    }),
  ),

  http.delete('*/api/assignments/:id', ({ params }) =>
    withNetwork(true, async () => {
      const id = String(params.id);
      if (!(await db.assignments.get(id))) return notFound('Assignment');

      await db.assignments.delete(id);
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];

// Certifications

const certificationHandlers = [
  http.get('*/api/certifications', ({ request }) =>
    withNetwork(false, async () => {
      const url = new URL(request.url);
      const crewId = url.searchParams.get('crewId');
      const type = url.searchParams.get('type');
      const expiringBefore = url.searchParams.get('expiringBefore');
      const bucket = url.searchParams.get('bucket');
      const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
      const today = todayIso();

      // Searching by crew name joins across tables, which only the server can
      // do — the client only holds one page of certificates at a time.
      let matchingCrewIds: Set<string> | null = null;
      if (search) {
        const crew = await db.crew.toArray();
        matchingCrewIds = new Set(
          crew
            .filter((member) => member.name.toLowerCase().includes(search))
            .map((member) => member.id),
        );
      }

      const all = await db.certifications.toArray();
      const filtered = all.filter(
        (certification) =>
          (!crewId || certification.crewId === crewId) &&
          (!type || certification.type === type) &&
          (!expiringBefore || certification.expiryDate <= expiringBefore) &&
          (!bucket || expiryBucket(certification.expiryDate, today) === bucket) &&
          (!search ||
            matchingCrewIds?.has(certification.crewId) ||
            certification.issuingAuthority.toLowerCase().includes(search) ||
            certification.type.toLowerCase().includes(search)),
      );

      return HttpResponse.json(paginate(sortItems(filtered, url), url));
    }),
  ),

  http.get('*/api/certifications/:id', ({ params }) =>
    withNetwork(false, async () => {
      const certification = await db.certifications.get(String(params.id));
      return certification ? HttpResponse.json(certification) : notFound('Certification');
    }),
  ),

  http.post('*/api/certifications', ({ request }) =>
    withNetwork(true, async () => {
      const parsed = certificationInputSchema.safeParse(await request.json());
      if (!parsed.success) return validationError(parsed.error);

      const certification: Certification = { id: crypto.randomUUID(), ...parsed.data };
      await db.certifications.add(certification);
      return HttpResponse.json(certification, { status: 201 });
    }),
  ),

  http.patch('*/api/certifications/:id', ({ params, request }) =>
    withNetwork(true, async () => {
      const existing = await db.certifications.get(String(params.id));
      if (!existing) return notFound('Certification');

      const parsed = certificationPatchSchema.safeParse(await request.json());
      if (!parsed.success) return validationError(parsed.error);

      const updated: Certification = { ...existing, ...parsed.data };
      const merged = certificationInputSchema.safeParse(updated);
      if (!merged.success) return validationError(merged.error);

      await db.certifications.put(updated);
      return HttpResponse.json(updated);
    }),
  ),

  http.delete('*/api/certifications/:id', ({ params }) =>
    withNetwork(true, async () => {
      const id = String(params.id);
      if (!(await db.certifications.get(id))) return notFound('Certification');

      await db.certifications.delete(id);
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];

// Dashboard

const dashboardHandlers = [
  // Aggregation happens here, not in the browser — shipping every crew,
  // certification and assignment to the client to compute four KPIs would be slow.
  http.get('*/api/dashboard', () =>
    withNetwork(false, async () => {
      const [vessels, crew, assignments, certifications] = await Promise.all([
        db.vessels.toArray(),
        db.crew.toArray(),
        db.assignments.toArray(),
        db.certifications.toArray(),
      ]);

      return HttpResponse.json(
        buildDashboardSummary(vessels, crew, assignments, certifications, todayIso()),
      );
    }),
  ),
];

const notificationHandlers = [
  http.get('*/api/notifications', () =>
    withNetwork(false, async () => {
      const [crew, assignments, certifications] = await Promise.all([
        db.crew.toArray(),
        db.assignments.toArray(),
        db.certifications.toArray(),
      ]);

      return HttpResponse.json(
        buildNotifications(assignments, certifications, crew, todayIso()),
      );
    }),
  ),
];

export const handlers = [
  ...vesselHandlers,
  ...crewHandlers,
  ...assignmentHandlers,
  ...certificationHandlers,
  ...dashboardHandlers,
  ...notificationHandlers,
];

