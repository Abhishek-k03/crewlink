import 'fake-indexeddb/auto';

import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { assignmentsApi } from '@/api/assignments';
import { certificationsApi } from '@/api/certifications';
import { ApiError, apiConfig } from '@/api/client';
import { vesselsApi } from '@/api/vessels';
import { DEMO_CREW_MEMBER_CREW_ID } from '@/auth/users';
import { db } from '@/db/schema';
import { ensureSeeded } from '@/db/seed';
import { addDays, todayIso } from '@/domain/dates';

import { imoCheckDigit } from '@/domain/imo';

import { handlers } from './handlers';
import { networkSimulation } from './network';

// Exercises the full request path: api wrapper -> fetch -> MSW handler ->
// Dexie. Type-checking proves none of this; only running it does.
const server = setupServer(...handlers);

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  // Node's fetch cannot resolve relative URLs the way the browser can.
  apiConfig.baseUrl = 'http://localhost/api';
  networkSimulation.latencyMinMs = 0;
  networkSimulation.latencyMaxMs = 0;
  networkSimulation.writeFailureRate = 0;
  await ensureSeeded();
});

afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('vessel list endpoint', () => {
  it('returns the seeded fleet with pagination metadata', async () => {
    const result = await vesselsApi.list({ page: 1, pageSize: 10 });

    expect(result.total).toBe(20);
    expect(result.items).toHaveLength(10);
    expect(result.page).toBe(1);
  });

  it('returns a different slice on the next page', async () => {
    const first = await vesselsApi.list({ page: 1, pageSize: 10, sort: 'name' });
    const second = await vesselsApi.list({ page: 2, pageSize: 10, sort: 'name' });

    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it('filters by status', async () => {
    const result = await vesselsApi.list({ status: 'In Service', pageSize: 100 });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((vessel) => vessel.status === 'In Service')).toBe(true);
  });

  it('searches across name, IMO and flag', async () => {
    const all = await vesselsApi.list({ pageSize: 100 });
    const target = all.items[0];
    if (!target) throw new Error('Seed produced no vessels');

    const result = await vesselsApi.list({ search: target.imoNumber });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(target.id);
  });
});

describe('vessel writes', () => {
  it('rejects an IMO number whose check digit is wrong', async () => {
    // 1234567 is a *valid* IMO number: 7*1+6*2+5*3+4*4+3*5+2*6 = 77, check digit 7.
    // Transposing the last digit is what a plain "seven digits" check would miss.
    const error = await vesselsApi
      .create({
        name: 'MV Invalid',
        imoNumber: '1234568',
        flag: 'Panama',
        type: 'Tanker',
        status: 'In Service',
        minimumSafeManning: { Master: 1 },
        readyToSail: false,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).fieldErrors?.imoNumber).toBeDefined();
  });

  it('creates and then deletes a vessel', async () => {
    const base = '912345';
    const created = await vesselsApi.create({
      name: 'MV Integration Test',
      imoNumber: `${base}${imoCheckDigit(base)}`,
      flag: 'Malta',
      type: 'RoRo',
      status: 'Laid Up',
      minimumSafeManning: { Master: 1 },
      readyToSail: false,
    });

    expect(created.id).toBeTruthy();
    expect(await db.vessels.get(created.id)).toBeDefined();

    await vesselsApi.remove(created.id);
    expect(await db.vessels.get(created.id)).toBeUndefined();
  });

  it('refuses to mark an under-manned vessel ready to sail, and names the shortfall', async () => {
    const base = '923456';
    const vessel = await vesselsApi.create({
      name: 'MV Undermanned',
      imoNumber: `${base}${imoCheckDigit(base)}`,
      flag: 'Cyprus',
      type: 'Bulk Carrier',
      status: 'In Service',
      minimumSafeManning: { Master: 2, AB: 4 },
      readyToSail: false,
    });

    const error = await vesselsApi
      .update(vessel.id, { readyToSail: true })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isRuleViolation).toBe(true);
    expect((error as ApiError).violations).toContainEqual(
      expect.objectContaining({ rank: 'Master', required: 2, actual: 0, short: 2 }),
    );

    // The refused write must not have been applied.
    expect((await db.vessels.get(vessel.id))?.readyToSail).toBe(false);

    await vesselsApi.remove(vessel.id);
  });
});

describe('assignment rules are enforced by the server, not just the form', () => {
  it('rejects a rotation that overlaps one the crew member already holds', async () => {
    const existing = await db.assignments.where('status').equals('Active').first();
    if (!existing) throw new Error('Seed produced no active assignments');

    const error = await assignmentsApi
      .create({
        crewId: existing.crewId,
        vesselId: existing.vesselId,
        rankOnboard: existing.rankOnboard,
        signOnDate: existing.signOnDate,
        signOffDate: existing.signOffDate,
        port: 'Singapore',
        status: 'Planned',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isRuleViolation).toBe(true);
    expect((error as ApiError).message).toMatch(/already has a rotation/i);
  });

  it('accepts a partial update that changes only the status', async () => {
    // Regression: the patch schema used to be derived with `.partial()` from a
    // refined schema, which throws at runtime. Every Kanban drop hit this path.
    const planned = await db.assignments.where('status').equals('Planned').first();
    if (!planned) throw new Error('Seed produced no planned rotations');

    const updated = await assignmentsApi.update(planned.id, { status: 'Active' });

    expect(updated.status).toBe('Active');
    await assignmentsApi.update(planned.id, { status: 'Planned' });
  });

  it('rejects a partial update whose new date crosses the untouched one', async () => {
    const planned = await db.assignments.where('status').equals('Planned').first();
    if (!planned) throw new Error('Seed produced no planned rotations');

    const error = await assignmentsApi
      .update(planned.id, { signOffDate: addDays(planned.signOnDate, -1) })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
  });

  it('rejects a rotation extending past a required certificate expiry', async () => {
    const crew = await db.crew.get({ status: 'Available' });
    if (!crew) throw new Error('Seed produced no available crew');

    const vessel = await db.vessels.toCollection().first();
    if (!vessel) throw new Error('Seed produced no vessels');

    // Far enough out that some required certificate must lapse first.
    const signOnDate = addDays(todayIso(), 3650);
    const error = await assignmentsApi
      .create({
        crewId: crew.id,
        vesselId: vessel.id,
        rankOnboard: crew.rank,
        signOnDate,
        signOffDate: addDays(signOnDate, 120),
        port: 'Rotterdam',
        status: 'Planned',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isRuleViolation).toBe(true);
    expect((error as ApiError).message).toMatch(/certification/i);
  });
});

describe('certification search', () => {
  it('finds certificates by the name of the crew member who holds them', async () => {
    const member = await db.crew.get(DEMO_CREW_MEMBER_CREW_ID);
    if (!member) throw new Error('Seed produced no demo crew member');

    const result = await certificationsApi.list({ search: member.name, pageSize: 200 });

    // Names are not unique -- the generator draws from name pools, so several
    // people can share one. The guarantee is that every result belongs to
    // *someone* of that name, not to this specific record.
    const sameName = new Set(
      (await db.crew.toArray())
        .filter((other) => other.name === member.name)
        .map((other) => other.id),
    );

    expect(result.items.length).toBeGreaterThan(0);
    // Crew name lives in a different table, so this can only work server-side.
    expect(result.items.every((item) => sameName.has(item.crewId))).toBe(true);
    expect(result.items.some((item) => item.crewId === member.id)).toBe(true);
  });

  it('also matches the issuing authority', async () => {
    const result = await certificationsApi.list({ search: 'marina', pageSize: 100 });

    expect(result.items.length).toBeGreaterThan(0);
    expect(
      result.items.every((item) => item.issuingAuthority.toLowerCase().includes('marina')),
    ).toBe(true);
  });

  it('returns nothing for a term that matches no crew, authority or type', async () => {
    const result = await certificationsApi.list({ search: 'zzzznotarealterm', pageSize: 100 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe('simulated write failures', () => {
  it('returns 500 and leaves the database untouched', async () => {
    networkSimulation.writeFailureRate = 1;

    const before = await db.vessels.count();
    const base = '934567';
    const error = await vesselsApi
      .create({
        name: 'MV Never Saved',
        imoNumber: `${base}${imoCheckDigit(base)}`,
        flag: 'Panama',
        type: 'Container',
        status: 'In Service',
        minimumSafeManning: {},
        readyToSail: false,
      })
      .catch((caught: unknown) => caught);

    networkSimulation.writeFailureRate = 0;

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
    expect(await db.vessels.count()).toBe(before);
  });
});
