// Seeded pseudo-random generator (mulberry32), used instead of Math.random so
// the seed data is byte-identical across machines and reloads. Skips Faker
// since it's a multi-megabyte dependency that would ship in the client bundle.
export type Random = () => number;

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclusive on both ends. */
export function randomInt(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function pick<T>(random: Random, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) {
    throw new Error('pick() requires a non-empty list');
  }
  return item;
}

/** Picks with the given probability, e.g. `chance(random, 0.25)`. */
export function chance(random: Random, probability: number): boolean {
  return random() < probability;
}
