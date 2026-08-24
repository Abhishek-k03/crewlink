# CrewLink — Fleet Crew Rotation & Certification Management

A crew management system for a small shipping fleet: 20 vessels, 1,200 seafarers, and the
rotations and certificates that decide who is legally allowed to sail on what.

The interesting part is not the CRUD. It is the **constraint layer** — you cannot assign someone
whose STCW certificate expires mid-contract, you cannot double-book a seafarer, and you cannot mark
a vessel ready to sail when it is below minimum safe manning. Those rules are enforced by the API,
not just hinted at by the forms.

---

## Demo credentials

| Role | Email | Password | Sees |
|---|---|---|---|
| Fleet Manager | `manager@crewlink.dev` | `manager123` | Everything, including "mark ready to sail" |
| Crewing Officer | `crewing@crewlink.dev` | `crewing123` | Everything except vessel edits and ready-to-sail |
| Crew Member | `crew@crewlink.dev` | `crew123` | Only their own profile and certificates |

Sign in as each in turn — the navigation, the buttons, and the reachable URLs all differ.

---

## Business rules

These four constraints are pure functions in [`src/domain/rules.ts`](src/domain/rules.ts), with no
React and no database access, and they are imported by **both** the mock API (which enforces them)
and the forms (which preview them). One implementation, two callers.

1. **No overlapping assignments.** A seafarer cannot hold two rotations whose date ranges intersect
   while either is Planned or Active. Ranges are half-open, so a same-day handover is legal.
2. **Minimum safe manning.** A vessel below its required complement for any rank cannot be marked
   ready to sail. The refusal names the shortfall: `Master: 0/2, AB: 1/4`.
3. **Certification gating.** A rotation is blocked if a certificate required for the rank being
   sailed expires before sign-off — reported as *which* certificate and *by how many days*. Note the
   subtlety: a certificate valid today can still block a contract that ends in eight months.
4. **Overdue rotation.** A rotation still Active past its sign-off date is flagged on the dashboard,
   the crew profile, and in notifications.

Two judgment calls worth naming, because the specification left them open:

- **Certification gating applies to taking up a rotation, not closing one out.** Refusing to record
  that a contract ended, because a certificate has since lapsed, would strand it in Active for ever.
- **Crew may upload certificates but never delete them.** Deleting an expired certificate is exactly
  how a seafarer would hide their own non-compliance, so `certification:delete` is a separate
  permission the Crew Member role does not have.

---

## Features

**Auth & access control** — Simulated login, session persisted to `localStorage`, protected routes,
and a single permission table driving route guards, navigation, and per-record actions.

**Vessels** — Register with search, filters and pagination; detail page with live crew roster and a
manning-compliance banner; create/edit/delete; ready-to-sail toggle that rule 2 can refuse.

**Crew** — Directory of 1,200 seafarers, virtualised and paged; search by name, rank or nationality;
profiles with rotation timeline and colour-coded certificate expiry.

**Rotations** — Kanban board (Planned → Active → Completed) with drag-and-drop, optimistic updates
and rollback; month/week calendar of sign-on and sign-off movements, clickable per day.

**Certifications** — Fleet-wide compliance view banded by expiry, searchable across crew name,
issuing authority and type; scan upload and download.

**Dashboard** — Crew onboard, vessels below manning, certificates expiring within 30 days, overdue
rotations; charts for crew by rank, rotations over time, and fleet compliance.

**Notifications** — Derived from current data, dismissible, with dismissals persisted per viewer.

**Polish** — Light/dark theme with no flash on load, responsive to 375 px, skeleton loaders, empty
states, toast errors, keyboard-accessible drag-and-drop.

---

## Simulated network conditions

Every request pays **200–1200 ms** of latency, and **7% of writes fail** with a 500. This is
deliberate, and it is the reason the drag-and-drop had to be built properly.

**Try it:** drag a rotation between columns on `/assignments`, or rename a vessel, five or six times.
One will fail — the card moves instantly, then snaps back to its original column with an error
toast, and the server state is unchanged.

The rollback is not decoration:

```
onMutate   cancel in-flight queries, snapshot every cached list, patch them
onError    restore the snapshot exactly
onSettled  invalidate, so the server has the final word either way
```

Cancelling first matters — without it a refetch already on the wire lands *after* the optimistic
write and silently overwrites it. Failure is injected **before** the database is touched, so a
"failed" write never half-applies. Three tests cover this, including that the restored cache is
byte-identical to what was there before.

Mutations deliberately **do not retry**. Retrying would hide the very behaviour this demonstrates.

---

## Architecture

```
VITE_API_MODE=msw   component → query hook → api wrapper → MSW handler  → Dexie (IndexedDB)
VITE_API_MODE=http  component → query hook → api wrapper → ASP.NET Core → SQLite
                          ↑                       ↑
              src/domain/rules.ts        identical code above this line
              (imported by both ends)
```

The app ships in `msw` mode and needs no server. An optional ASP.NET Core + EF Core backend lives in
[`server/`](server/README.md) and is selected with one environment variable — nothing above
`src/api/` changes, which is what the boundary was for. See [`.env.example`](.env.example).

```
src/
├── domain/          entities, business rules, reporting, notifications — no React, no I/O
├── db/              Dexie schema + deterministic seed generator
├── mocks/           MSW handlers: the "server". Owns the database, enforces the rules
├── api/             typed fetch wrappers — the seam a real backend would replace
├── hooks/           TanStack Query hooks, query-key factories
├── auth/            permission table, session, route guard
├── components/      ui primitives, calendar, kanban, charts
├── features/        vessels, crew, assignments, certifications, dashboard
└── layout/          app shell, sidebar, header, notification centre
```

Two rules hold the layering together:

- **No component touches Dexie.** Everything goes through the API boundary, which is what makes the
  mock server replaceable by a real one.
- **`src/domain` imports nothing.** This is enforced by ESLint, not convention —
  [`eslint.config.js`](eslint.config.js) forbids React, Dexie, TanStack Query and the db/api layers
  inside `src/domain/**`, so "the business rules are pure and independently testable" is a verifiable
  claim rather than a README assertion.

---

## Technical decisions

| Decision | Alternative considered | Why |
|---|---|---|
| Business rules enforced in the mock API, not only in forms | Validate in the UI only | The server is the authority in any real system. The forms preview the same pure functions, so the two cannot disagree |
| Dexie (IndexedDB) | `localStorage` | Structured queries, indexes, transactions, no 5 MB cap. 5,600 seeded records would not fit |
| TanStack Query | Redux / Zustand | This is *server* state — staleness, refetching, invalidation and optimistic rollback are built in, not hand-rolled |
| Optimistic update/delete, **not** create | Optimistic everything | The server assigns the id; an optimistic row means guessing where it sorts and paginates. A pending button costs one round trip and is honest |
| Pagination **and** virtualisation | Either alone | They solve different problems: paging keeps the *network* honest (100 rows/request), virtualisation keeps the *DOM* honest (~20 rows mounted) |
| Hand-written deterministic seed | Faker | Faker is multi-megabyte and seeding runs in the browser, so it would ship to users. A seeded PRNG also makes the data byte-identical across machines, which makes it testable |
| Aggregation behind the API (`/api/dashboard`) | Compute in the browser | Four KPIs should not cost 5,600 records over the wire |
| Notifications derived, never stored | A notifications table | An expiring certificate is a fact that is *true now*, not an event that happened. Storing it means keeping a derived copy in sync |
| Semantic colour tokens | Tailwind palette utilities | A rebrand becomes a diff in one file; every `dark:` variant disappears from components |
| Dates as `YYYY-MM-DD` strings | `Date` objects | A rotation date is a calendar fact, not an instant. `Date` round-tripping through timezones turns 2024-06-01 into 2024-05-31 |
| dnd-kit | react-beautiful-dnd | Unmaintained; dnd-kit also gives keyboard dragging, which a mouse-only board denies to keyboard users |
| React Router **v7** | v6, as originally planned | v6 carries two moderate advisories with no v6 patch. The API this app uses is identical, and `npm audit` now reports zero |
| Two API modes behind one seam | Pick one and hardcode it | The deployed demo must work with no backend; the interesting engineering claim is that the UI does not know which it is talking to. Swapping the implementation is how that claim gets tested rather than asserted |
| Business rules ported to C# **and** pinned by a ported test suite | Accept the duplication, or drop MSW | Nothing is shareable across the language boundary. `RulesTests.cs` is a case-for-case port of `rules.test.ts`, so a divergence fails a test rather than producing two systems that disagree about who may sail |
| Seed PRNG ported bit-for-bit to C# | Any C# random generator | Both modes then show the *same* fleet, so switching modes is a comparison rather than a reset. A cross-language digest test pins it in both languages |
| A narrow `/api/vessels/lookup` | Widen `vessel:read` for Crew Members | A crew member needs the *name* of their own ship, not the fleet register. Widening the permission would also unlock the vessel list; a narrower resource is the smaller grant. It also replaced the same 8-line id→name block in three pages |
| Route-level code splitting | Single bundle | Recharts is ~410 kB. A Crew Member who only sees their own profile should not download a charting library. Entry chunk: 876 kB → 311 kB |

---

## Testing

**169 tests** — 108 in the frontend, 61 in the backend — covering the parts where correctness is not
obvious by inspection:

- **Business rules** — every overlap shape, both interval boundaries, and the exclusion cases.
- **Reporting & notifications** — the aggregation and derivation logic, including that `crewOnboard`
  counts distinct people rather than active rows.
- **Calendar date maths** — six-week grids, leap Februaries, year boundaries, and that days run
  consecutively with no gaps or repeats across week boundaries.
- **The mock API** — real requests through MSW to Dexie: pagination, filters, cross-table search,
  rule violations returning 422 with detail, and a simulated failure leaving the database untouched.
- **Optimistic rollback** — cache patched on success, restored byte-identically on failure, and the
  server unchanged. Failure is forced deterministically rather than left to a 7% chance.
- **RBAC** — the permission matrix as assertions, plus route-level checks that each role reaches a
  different page.
- **The seed itself** — that it obeys the rules the app enforces: nobody double-booked, nobody
  Onboard without an active rotation, and no upcoming rotation blocked by its own certificate
  requirements. Seeding through a generator that ignores your own domain rules opens the app already
  in violation of itself.

Two of them are cross-language contract tests, which is how the duplication between the TypeScript
and C# implementations is kept honest:

- **The rules suite is ported case for case.** `RulesTests.cs` asserts every boundary
  `rules.test.ts` asserts — the same-day handover, the certificate expiring exactly on sign-off, the
  Planned rotation that is a planning error rather than an overrun. A divergence fails a test rather
  than producing two systems that quietly disagree.
- **The seed generators are pinned to one hash.** Both languages render a generated fleet to the
  same canonical text and hash it, and both suites assert the same constant. A single reordered
  random draw changes it — which is the only reliable way to catch that, because the resulting data
  still looks entirely plausible.

```bash
npm test          # frontend, once
npm run test:watch
cd server && dotnet test   # backend
```

---

## Known limitations

Stated as scope decisions, because that is what they are.

The first three apply to **`msw` mode only**. They are limitations of running without a server, not
of the design, and [the ASP.NET Core backend](server/README.md) resolves each one.

- **Authentication is simulated and secures nothing.** Passwords are plaintext constants in the
  client bundle, compared in the browser. *(In `http` mode: PBKDF2-hashed credentials and a signed,
  expiring JWT.)*
- **Role permissions are enforced client-side only.** The mock server has no token to check, so a
  direct `DELETE /api/...` would succeed. *(In `http` mode: an authorization policy per endpoint,
  list queries narrowed server-side, and ownership checked against the token rather than the request
  body.)*
- **Filtering and sorting happen in memory** inside the handlers, after reading the table. Fine at
  1,200 crew; at 100,000 it would need indexed queries and server-side pagination — which is the
  honest answer to "what breaks at scale?" *(In `http` mode: filters, sorts and paging are SQL
  against indexed columns.)*
- **Scans are base64 in IndexedDB**, capped at 2 MB. Base64 inflates a file by a third and the whole
  string loads whenever its row is read. Dexie can store `Blob`s natively, which would be the fix.
- **All data is local to the browser.** Clearing site data resets everything; there is no sync between
  users or devices.
- **MSW ships in the production bundle** (~426 kB, lazily loaded) because the deployed demo genuinely
  has no backend.
- **"Assignment changed" notifications are absent.** That is a real event, not a derivable fact, and
  faking it would have meant pretending to have an audit log. Rotations *starting soon* are surfaced
  instead.
- **Notes with `@mentions` were cut.** The feature needed a fifth entity absent from the data model
  and connected to nothing else in the domain; the time went into the constraint layer instead.

---

## What I would build next

1. ~~**A real backend**~~ — [built](server/README.md). ASP.NET Core Minimal API + EF Core + SQLite,
   selected with `VITE_API_MODE=http`. No component or hook changed, which was the point of putting
   the `src/api` wrappers there.
2. **An audit log**, which would make "assignment changed" notifications and a supersede-rather-than-
   delete history for certificates both possible.
3. **Server-side search and pagination** backed by real indexes, for the 100,000-crew case.
4. **Cloud file storage** for scans, with signed URLs instead of base64 rows.

---

## Setup

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm test         # 108 tests
npm run lint
```

That runs the default `msw` mode, which needs nothing else. To run against the real backend instead:

```bash
cd server && dotnet run --project CrewLink.Api   # http://localhost:5180, migrates and seeds itself
cd .. && echo "VITE_API_MODE=http" > .env.local && npm run dev
```

The backend has its own 61 tests (`cd server && dotnet test`) and its own
[README](server/README.md).

The database seeds itself on first load — no manual step. Expect a brief pause while 5,600 records
are written to IndexedDB. Bumping `SEED_VERSION` in [`src/db/seed.ts`](src/db/seed.ts) rebuilds it.

**Stack:** React 18 · TypeScript 6 · Vite 8 · Tailwind 4 · TanStack Query · Dexie · MSW · dnd-kit ·
react-window · Recharts · react-hook-form + Zod · Vitest
