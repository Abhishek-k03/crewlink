# CrewLink API — ASP.NET Core backend

The optional real backend for CrewLink: **ASP.NET Core 10 Minimal API + EF Core + SQLite**.

The React app runs perfectly well without it. This exists because the frontend was built against an
API boundary rather than against MSW, and the cheapest way to prove that claim is to swap the
implementation behind the boundary and change nothing above it.

```
VITE_API_MODE=msw   component → query hook → api wrapper → MSW handler   → Dexie (IndexedDB)
VITE_API_MODE=http  component → query hook → api wrapper → ASP.NET Core  → SQLite
                                                 ↑
                                  identical code above this line
```

---

## Running it

```bash
cd server
dotnet run --project CrewLink.Api          # http://localhost:5180
```

On first run it applies migrations and seeds 20 vessels, 1,200 crew, ~1,500 rotations and ~4,000
certificates. Then point the frontend at it:

```bash
# from the repo root
echo "VITE_API_MODE=http" > .env.local
npm run dev                                 # http://localhost:5173
```

Vite proxies `/api` to `localhost:5180`, so `apiConfig.baseUrl` stays the relative `/api` in both
modes and there is no CORS preflight in development. The API also declares a CORS policy for anyone
running the two on separate origins.

Interactive API docs (Development only): `http://localhost:5180/openapi/v1.json`.

```bash
dotnet test                                 # 61 tests
dotnet run --project CrewLink.Api -- --CrewLink:Reseed=true   # rebuild the fleet
```

**Demo credentials** are the same three accounts as the mock mode — see the root README. Passwords
are stored PBKDF2-hashed, salted and iterated, even though they are published.

---

## What the backend buys that the mock server cannot

The mock server is a faithful stand-in, but three of the root README's *Known limitations* are
limitations of running without a server, not of the design. This is where they go away.

| Limitation in `msw` mode | What `http` mode does instead |
|---|---|
| Auth is simulated; passwords are constants in the client bundle | `POST /api/auth/login` verifies a PBKDF2 hash and issues a signed JWT carrying role and crew id |
| Role permissions are enforced client-side only — a direct `DELETE /api/...` would succeed | Every endpoint carries an authorization policy. A Crew Member's list queries are narrowed server-side, and record ownership is checked against the *token*, not the request body |
| Filtering and sorting happen in memory after reading the whole table | Filters, sorts and paging are SQL against indexed columns; a page costs the same at a thousand rows or a million |

The third is the honest answer to "what breaks at 100,000 crew?" — and here it is answered rather
than deferred.

---

## Layout

```
server/CrewLink.Api/
├── Domain/          entities, the four business rules, reporting, notifications — no EF, no HTTP
├── Data/            DbContext, migrations, seed generator, cross-language seed digest
├── Contracts/       request/response DTOs, Patch<T>, the error shapes the client reads
├── Validation/      FluentValidation rules mirroring the client's zod schemas
├── Auth/            permission matrix, JWT issuing, authorization policies
├── Endpoints/       one file per resource
├── Infrastructure/  JSON config, paging/search helpers, simulated network conditions
└── Program.cs       composition root
```

`Domain/` deliberately references neither EF Core nor ASP.NET Core, mirroring the ESLint rule that
keeps `src/domain/` free of React and Dexie. Mapping lives in `Data/CrewLinkDbContext.cs`; the
entities themselves carry no attributes.

---

## Technical decisions

| Decision | Alternative considered | Why |
|---|---|---|
| Rules ported to C# and pinned by a ported test suite | Share one implementation | Nothing can be shared across the language boundary, and the browser build must work with no backend. `RulesTests.cs` is a case-for-case port of `rules.test.ts`, so drift fails a test instead of going unnoticed |
| Seed PRNG ported bit-for-bit | Any C# random generator | Both modes then show the *same* fleet, so switching `VITE_API_MODE` is a comparison rather than a reset. A cross-language digest test pins it |
| `DateOnly` | `DateTime` | A rotation date is a calendar fact, not an instant. It serialises as `YYYY-MM-DD` and SQLite stores it as text in the same shape, so ordering is correct in JSON, C# and SQL alike |
| Enums stored and sent as wire names | Ordinals | Ordinals make the database unreadable and silently re-map every row if a member is inserted mid-enum. One attribute drives JSON, SQLite and query-string parsing |
| `Patch<T>` for PATCH bodies | Nullable properties | A nullable property cannot tell "absent" from "explicitly null", so a field can never be cleared and untouched fields get silently rewritten |
| Patches validated as the *merged* record | Validate the patch alone | Otherwise moving a sign-on date past an untouched sign-off date passes validation |
| Latency and failure injection carried over | Ship a "clean" API | Without it, switching to `http` mode turns the optimistic-rollback path into code that has never run |
| Failure injected before the endpoint executes | Fail after the write | A write that "failed" but committed leaves server and rolled-back client disagreeing — worse than no injection at all |
| SQLite in-memory for tests | EF's in-memory provider | The in-memory provider is not relational and accepts things SQLite refuses, so tests would pass against a store the app never runs on |
| JSON column for `minimumSafeManning` | A rank/count join table | It is sparse, small, and never queried by its contents. Three joins to express one value is not a win |
| Explicit sort whitelists | Reflection over the sort parameter | Keeps the sortable set a deliberate decision — each one indexed — rather than exposing every column to arbitrary ordering |

---

## Known limitations

- **The JWT is a bearer token in `localStorage`**, which is vulnerable to XSS. A production system
  would use an httpOnly, SameSite cookie with a refresh token and CSRF protection. It is stated here
  rather than hidden because the trade-off was deliberate: cookie auth needs same-site hosting that
  the Vercel demo does not have.
- **No refresh tokens.** A session lasts eight hours and then requires signing in again.
- **The demo accounts are seeded with published passwords.** They are hashed, but they are public.
- **Dashboard and notification endpoints read whole tables** and delegate to the pure functions
  rather than aggregating in SQL. That keeps one definition of "below manning" and "overdue" shared
  with the rules; at this size the read is a few milliseconds. At ten times the data it should move
  into SQL — accepting that the definitions then exist twice, and testing them against each other.
- **SQLite, single-writer.** Fine for a demo and for a single-node deployment; concurrent writes
  serialise. The provider is one line in `Program.cs`.
- **`LIKE` is case-insensitive for ASCII only** in SQLite, which matches the client's
  `toLowerCase().includes()` for this dataset but would not for non-Latin names.
