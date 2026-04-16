import { createHash } from 'node:crypto';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { generateSeedData } from './seed';
import { canonicaliseSeed } from './seedDigest';

// Cross-language contract test: SeedParityTests.cs asserts this same hash, so a
// disagreement means the two generators have drifted. Changing the generator on
// purpose means updating this constant from the failure message, then copying
// it into the C# test.
const EXPECTED_DIGEST = 'c96c50921cc355deeaca486ea12c678866faa303c31e01232b0f89d491747b33';

// Midday UTC, so the local calendar date is 1 Jan 2026 in every timezone
// between UTC-11 and UTC+11 — the generator reads the local date.
const FIXED_TODAY = new Date('2026-01-01T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

it('produces the dataset the .NET generator is pinned to', () => {
  const digest = createHash('sha256').update(canonicaliseSeed(generateSeedData()), 'utf8').digest('hex');

  expect(digest).toBe(EXPECTED_DIGEST);
});
