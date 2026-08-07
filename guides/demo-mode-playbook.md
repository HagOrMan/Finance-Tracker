# Demo Mode Playbook

A portable spec for adding a public, safe, no-login demo build to a private **Next.js + Supabase app deployed on Vercel**.

Hand this file to Claude Code inside a repo and ask it to implement it. It is written to be adapted, not followed blindly: sections 3 and 4 decide the shape of everything after them, and the answer differs per repo.

Nothing here is specific to any one app. It was written after building this pattern once end-to-end and deploying it; §16 records what actually went wrong that time, since a lesson is cheaper to read than to repeat.

---

## 1. What you are producing

A second Vercel project, built from the same repo and the same branch, that:

- Anyone can open — no login, no OAuth round-trip.
- Contains **zero** real data and **zero** credentials that could reach real data.
- Persists the visitor's own changes across refreshes, so it feels like an app rather than a screenshot.
- Cannot send email, hit a webhook, run scheduled work, or cause any other outbound effect.
- Resets to a clean state on demand.

The production project is untouched. Every difference is behind one environment variable.

**Non-goals.** This is not a multi-tenant sandbox, not a staging environment, and not a way to let someone try the app with their own data. Each of those wants a real backend, and none of them is what a portfolio demo is for.

---

## 2. The one flag

```ts
// src/lib/demo/flag.ts
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
```

**Never read `process.env.NEXT_PUBLIC_DEMO_MODE` anywhere else.** Import `IS_DEMO`. One definition is what stops the build from being demo-ish in some places and not others.

Three things about that line:

- **It must be `NEXT_PUBLIC_`** — the browser reads it to pick a data adapter.
- **It must be a literal member access.** Next only inlines `NEXT_PUBLIC_*` into the client bundle for statically analyzable access. If the repo has a `requireEnv(name)` helper doing `process.env[name]`, it returns `undefined` in the browser — and it probably throws when a var is missing, which is exactly wrong here, since "missing" is the normal case.
- **It is inlined at build time, not read at runtime.** Flipping it needs a redeploy and one build artifact can never serve both modes. That is fine: two Vercel projects, two builds, one branch.

Add it to `.env.example` with a comment saying the demo project's environment should contain **this variable and nothing else**.

---

## 3. Audit first — this decides everything

**Before writing any code, enumerate every path from the browser to real data, and record whether each runs on the server or in the client.**

```
rg "createClient|createServerClient|createBrowserClient|\.from\(" src/
rg "'use server'|\"use server\"" src/
rg "^import .*server-only" src/
```

Then walk these deliberately, because at least one is always forgotten:

| Path | How it hides |
| --- | --- |
| Route handlers (`app/api/**`) | Obvious. Start here. |
| **Server Actions** | A form or button with no `fetch` in sight. Easy to miss, and they bypass any fetch-level interception. |
| **Server components** that render data | No network call to intercept at all — the data arrives already rendered. |
| Realtime subscriptions / websockets | Long-lived, opened in an effect. |
| File or image uploads to Storage | Often a direct browser→Supabase call. |
| Analytics / Sentry / feature-flag SDKs | Initialized at **module scope**, so they run even when the feature is never used. |
| Auth itself | Sign-in, sign-out, session refresh, middleware. §9. |

Write the results down before proceeding. If the answer is "most data is rendered by server components," say so out loud and plan the refactor — that is the case this whole document is longest about, and papering over it is where these projects die.

---

## 4. Pick the seam

There is exactly one question that matters: **where is the last point the browser controls before data arrives?** That is your seam, because `localStorage` exists only in the browser and there is no way to read a visitor's storage from a server component.

| How the browser gets data today | Seam | Effort |
| --- | --- | --- |
| **A** — client components call Supabase directly (`createBrowserClient`) | The module that creates the client, or the data-access layer just above it | Smallest |
| **B** — client components `fetch` your own `/api` routes | The shared fetch helper. Return a `Response`, so everything downstream is unchanged | Small, but you must reproduce handler semantics — see §6.3 |
| **C** — server components / Server Actions render or mutate the data | **There is no seam.** One has to be created first | Largest. This is real refactoring |

### 4.1 If you are in case C

In preference order:

1. **Move the data-bearing subtree to the client.** Keep the page a server component for layout and shell; have the part that reads data be a client component calling the adapter. Often this is small, because a client component one level down is already rendering the rows.
2. **Render the whole route client-side.** Wrap the page body in a client component that shows the boot screen (§12) and renders from the store. Perfectly acceptable for a portfolio demo — SEO is irrelevant on a page you are deliberately marking `noindex`.
3. **Only if 1 and 2 are impractical:** serve seed data statically from the server (identical for every visitor, no mutations) and layer client-side mutations on top. More moving parts, worse result. Avoid.

**Do not** solve case C by putting the demo data source on the server. It is the obvious move and it produces a demo that does not work: one dataset shared by every visitor at once, wiped on every cold start, and one visitor's Reset resetting everybody.

### 4.2 Server Actions need their own answer

A fetch-level seam does not catch them. For each one: either it is unreachable in demo mode (make it so, and say why), or it needs an `IS_DEMO` branch of its own. Sign-out is the usual offender — see §9.

---

## 5. Build the data layer (if the repo has none)

**If the repo already has a data-source abstraction, skip to §6 and extend it.** If it does not — the common case — this section is the bulk of the work, and it is worth doing on its own merits: the demo is the forcing function, not the payoff.

### 5.1 Derive the interface from call sites, not from a design

Grep every Supabase call and write down the operations the app *actually performs*. That list is your interface.

Resist inventing a complete CRUD surface. Every method you add is a method the demo implementation must also provide, keep faithful, and be tested through. An app with no delete path does not need `remove()`.

```ts
// src/lib/data/types.ts
export interface DataSource {
  loadThings(): Promise<Thing[]>;
  insertThing(input: NewThing): Promise<Thing>;
  updateThing(id: Id, patch: ThingPatch): Promise<Thing>;
  deleteThing(id: Id): Promise<void>;
  // ...only what the app calls
}
```

**Flat interface or one repository object per entity** — either is fine. Flat is fewer files and reads well up to roughly 20 methods; per-entity is better past that. Pick one and don't mix. If the repo has an existing style, match it; consistency across your projects beats either choice on its own merits.

**Every operation returns a `Promise`, in every implementation.** The demo one resolves from memory, but keeping the signature means no call site changes when adapters swap.

### 5.2 Normalize failures into your own error types

**This is the step people skip, and it is the one that decides whether the demo is faithful or merely populated.**

Supabase speaks PostgREST: `23503` for a foreign-key violation, `23505` for a unique violation, `PGRST116` for no rows. A `localStorage` store speaks none of that. If your route handlers branch on Postgres codes inline, the demo can never reproduce their behaviour — and those branches are usually where the interesting product behaviour lives ("you can't delete this while X references it").

So: define your own error classes in the data layer, map every implementation onto them, and have callers branch on those.

```ts
// src/lib/data/errors.ts
export class NotFoundError extends Error {}
export class ConflictError extends Error {          // FK violation, delete guard
  constructor(message: string, readonly blockedBy: unknown[] = []) { super(message) }
}
export class DuplicateError extends Error {}        // unique index
```

Carry the *blocking rows* on the conflict error. The UI almost always wants to show them, and a bare "conflict" forces a second round trip to find out what.

### 5.3 Ship the refactor before you write any demo code

Wrap the existing Supabase calls in the real implementation, change **nothing else**, deploy, and confirm production still works.

Skipping this means the first bug is ambiguous: adapter bug, or demo bug? You will spend longer bisecting than the deploy would have cost.

### 5.4 Inventory what the database does that a store will not

Go through this list and decide, per item, **replicate or drop** — and write down which. Every one of these is a behaviour the demo either shows or silently loses:

| Database does | In the demo store |
| --- | --- |
| **Generates ids** | Keep a monotonic counter per entity in the persisted blob. **Match the production type** — `crypto.randomUUID()` in an app whose ids are `bigint` breaks the types and any "is this a positive integer" validation |
| **Column defaults** | Apply them on insert |
| **`updated_at` / `created_at` triggers** | Stamp by hand on every insert and update, or "last edited" is blank on every row |
| **`NOT NULL` / `CHECK`** | Usually already covered by the zod schema at the edge. Confirm, don't assume |
| **`UNIQUE` indexes used for idempotency** | Replicate. This is often load-bearing — an idempotent job that stops being idempotent in the demo double-writes where production doesn't |
| **Foreign keys used as delete guards** | Replicate, including the payload of blocking rows |
| **`ON DELETE CASCADE` / `SET NULL`** | Replicate the cascade explicitly, or deletes leave orphans |
| **`ORDER BY` in queries** | Sort on read. Add a stable tiebreaker — an unsorted list visibly reshuffles on every refetch |
| **Views / generated columns** | See §5.5 |

### 5.5 Derived data stays derived

If production computes a field — in a view, a generated column, or a merge step — the demo store must **persist the inputs and compute on read, using the same function**.

Persisting the computed value creates a second place that knows the answer, and it will be wrong the first time an input is edited. Reuse the real merge/compute function; do not reimplement it for the demo.

---

## 6. The demo adapter

```
src/lib/demo/
  flag.ts        # IS_DEMO
  store.ts       # in-memory dataset + localStorage write-through (§7)
  seed.ts        # generateSeed(): DemoDataset
  transport.ts   # case B only — see §6.3
src/lib/data/
  demo-source.ts # implements the same DataSource interface
```

Put the demo implementation **beside the real one**, implementing the same interface. That is what makes a newly added method a build error rather than a demo that quietly lacks a feature.

### 6.1 Case A — swap the adapter

```ts
export async function getDataSource(): Promise<DataSource> {
  if (IS_DEMO) return new (await import("./demo-source")).DemoDataSource();
  return new (await import("./supabase-source")).SupabaseDataSource(...);
}
```

Only valid when this function runs in the browser. If it runs on the server, you are in case B or C — go back to §4.

### 6.2 Case C — same, after the refactor

Once the read path is client-side, case C collapses into case A.

### 6.3 Case B — intercept the fetch helper

Find the one function every client fetch goes through. If there isn't one, make it — that refactor is small and worth it regardless.

**Return a `Response`, not a parsed body and not a thrown error.**

```ts
const res = IS_DEMO
  ? await (await import("@/lib/demo/transport")).demoRequest(url, init)
  : await fetch(url, /* unchanged */);
// everything below here is unchanged
```

Two reasons this exact shape:

- **It avoids a circular import.** Throwing your `ApiError` from the transport means importing it from the module that imports the transport. You find out at build time.
- **Everything downstream keeps working**: `res.ok`, `res.json()`, error construction, and any structured error payload the UI reads back.

The transport must then **mirror the route handlers, not just return data**:

- Same validation schemas, so a bad form fails identically.
- Same status codes. If the UI branches on 404 vs 409, the demo must produce 404 vs 409 — this is the single most common way a demo silently loses a feature.
- Same response shapes, including error payloads and created-row returns.
- Cache-busting query params become no-ops.

Copy the *rules* from any shared handler helpers; do not import the helpers themselves if they build framework response objects (`NextResponse`, `next/server`) — those do not belong in a browser bundle. It is about fifteen lines re-stated locally.

**Do not mirror authorization.** There is no session and no server. Leave the real guards untouched and let the demo simply never reach them (§9).

---

## 7. The store: in-memory, backed by localStorage

Do **not** read or write `localStorage` per operation:

- On boot, read one key, parse it, hold the whole dataset in a module-level object.
- All reads hit that object.
- All writes mutate it, then schedule a debounced (~250 ms) write-through of the whole blob.

```ts
const STORAGE_KEY = "myapp-demo:v1";
```

Rules:

- **Namespace the key, and version it.** Namespace because the app may already persist unrelated UI state (a filter store, a theme) — a Reset that clears the wrong key is a bug report you will not understand. Version so a shape change self-invalidates instead of crashing on a stale blob; validate the parsed shape and fall back to a fresh seed if it fails.
- **Wrap every `localStorage` call in try/catch.** Safari private mode throws on write; quota is ~5 MB. Degrade to memory-only and keep going — a demo that forgets on refresh beats one that white-screens.
- **Never touch `localStorage` during render.** Effects and event handlers only. If the repo already solves this for some other persisted store, copy that pattern rather than inventing a second one.
- **Return copies from reads.** `{...row}` for flat rows. Otherwise cached arrays share object identity with the store and a later edit mutates data already rendered — a bug class that cannot exist against a real database, because rows arrive over the wire.
- **Cap rows per entity**, above the seed size, so someone hammering "add" can't exhaust the quota. Size is rarely the real constraint: a typical row serializes to a couple of hundred bytes.

---

## 8. Seed data

- **Entirely fictional.** No real merchants, employers, or companies you are interviewing with. Generate from scratch — never copy production data and "anonymize" it. Assume the hiring manager reads it closely, because that is the one person who will.
- **Deterministic.** Seed a small PRNG (mulberry32 is ~6 lines) rather than calling `Math.random()`. Every visitor sees the same data, and a bug is reproducible from a screenshot.
- **Anchored to `today`.** Derive every date from the current date, never hardcode. A demo whose newest record is eight months old reads as abandoned. Use whatever "today" helper the app already has, and prefer one that doesn't depend on a server-only timezone constant.
- **Deep enough for the app's own windows — this is not a matter of taste.** Find the constants that drive the analytics (rolling averages, baseline periods, median windows, trend comparisons) and seed past the longest of them. A dashboard whose forecast has nothing to average renders as broken, not as empty.
- **Varied, with structure.** Realistic frequency and amount distributions, some clusters and some gaps. Deliberately include the rows that make edge-case code paths reachable: an outlier, a fully-refunded/cancelled record, an inactive entity.
- **Leave one category or state empty**, so a curious visitor reaches a real empty state.
- **Derive any counters from the same logic production uses.** If a record carries "how many times this has run," compute it by running the real schedule function — hand-picking the number drifts against the derived value and lights up an error badge on a fresh demo.

Keep it in one file exporting `generateSeed()`, and bind its return type to the store's dataset type so a new field is a build error rather than a silent omission.

---

## 9. Auth

The demo must never contact the identity provider. **Three places need attention, and the third is the one that bites.**

1. **Middleware / proxy.** A deny-by-default gate will bounce every request. Add a single explicit early return, clearly commented.
2. **Server Actions for sign-in / sign-out.** Sign-out is the classic miss: a button in the nav that invokes a Server Action that builds an auth client. Either hide the control (there is no session to end — a "Sign out" button in a demo is a lie) or branch it.
3. **⚠️ Position the bypass above the point where env vars are read, not merely above the auth check.** The demo project has no auth credentials at all, so any `requireEnv("...")`-style call throws *before* your bypass runs if you place it by the authorization logic. The symptom is a 500 on every request, which reads as a broken build rather than a misplaced return.

Also redirect `/login` and any auth callback route to the app root in demo mode. A login page is usually the one server-rendered page that reads a session, and it will hit the same throw.

**Do not put a demo branch inside the authorization guard itself.** Two reasons, and the second is the real one:

- The bypass belongs in adapter selection, not in the security check.
- A guard with a conditional in it stops reading as unconditional. Once `requireOwner()` has one exception, the next reader cannot tell at a glance whether it is enforced, and the invariant "every handler starts with this call" quietly becomes advice.

If the seam is client-side, the demo never reaches a route handler anyway, so there is nothing to bypass. **Expected consequence, so it isn't mistaken for a bug:** `curl`ing an API route on the deployed demo returns **500, not 401** — the handler runs, reaches its env read, and throws. Nothing is behind it; there is no data and no secret in that environment to reach.

---

## 10. Kill every side effect

Two layers, both required.

**Layer 1 — no credentials.** The demo project's environment holds `NEXT_PUBLIC_DEMO_MODE` and nothing else. No `SUPABASE_*`, no mail provider key, no cron secret, no webhook URLs, no analytics keys tied to real accounts. **This is the actual security boundary.** Code cannot exfiltrate what the environment does not hold; everything else is convenience.

**Layer 2 — guarded code.** Prefer **one guard at the choke point** over a guard per route. If every email in the app funnels through a single `sendEmail()`, that one `IS_DEMO` return covers every template at once and cannot be forgotten when a template is added. Guard per-route only where the UI needs to *say* why — an honest "Demo mode — nothing is emailed from here" beats a generic "not configured".

**Scheduled work.** If your cron config is committed to the repo, a second project building the same branch registers the same schedule. Return early in the handler. Prefer a status code that matches what the handler already does when unconfigured — **if it deliberately fails closed with a 503, leave that alone.** A guide that tells you to return 200 for quieter logs is not worth weakening a fail-closed path for.

**Audit module scope.** Anything constructed at import time runs even when its feature is never used. Move it inside the function, or guard it.

---

## 11. Bundle hygiene

**A build-time-false branch removes the call, not the import.**

```ts
import { resetDemoStore } from "@/lib/demo/store"; // ← shipped to production, always
if (IS_DEMO) resetDemoStore();                     // ← never runs in production
```

Every production visitor now downloads the store, the seed generator, and its fictional-world tables. Harmless, but it means every claim you made about the demo code not shipping is false.

**Every entry point into demo code must be `await import(...)` at the point of use.** This bites hardest in the boot gate and the banner, because those mount on every page in *both* modes — not just in the one seam you remembered to make dynamic.

The same applies in reverse: import the real backend implementation lazily too, so the demo build doesn't ship a Supabase client to visitors.

---

## 12. Boot sequence

```tsx
// 'use client'
export function DemoBoot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!IS_DEMO);

  useEffect(() => {
    if (!IS_DEMO) return;
    let cancelled = false;
    void import("@/lib/demo/store")
      .then(({ hydrateDemoStore }) => hydrateDemoStore())
      .then(() => { if (!cancelled) setReady(true) });
    return () => { cancelled = true };
  }, []);

  if (!ready) return <BootScreen />;   // "Setting up your demo…"
  return <>{children}</>;
}
```

`hydrateDemoStore()` loads the stored dataset, or — if absent, malformed, or a stale version — generates a fresh seed and stores it.

- **The gate is not cosmetic; it is what prevents a hydration mismatch.** The server renders with no `localStorage`; the client has data only after mount. Gating on `ready` makes both sides agree.
- **Mount it above anything that reads data**, including nav and chrome, not just the page body.
- **No artificial delay.** The work is real and finishes in well under a second. A fake loading bar is exactly what a careful visitor notices. If the flash is ugly, that's a styling problem.

---

## 13. Demo UX

- **Persistent banner:** what this is, that data is fictional, that changes live in this browser. Dismissible, but **not persistently** — it must come back on reload, or a visitor returning later mistakes generated data for someone's real records.
- **Reset button** in the banner: clear the key, re-seed, reload. A full reload is one line and provably correct; this is not the place to be clever with cache invalidation.
- **`noindex`.** Both halves: `robots.txt` (a route that returns disallow-all in demo) and `robots: { index: false, follow: false }` in the page metadata. One asks crawlers not to fetch, the other asks them not to index what they fetched anyway.
- **Do not disable destructive actions.** Letting people delete things is the point of a sandbox, and Reset is one click away.
- If a feature genuinely cannot work without a server, show a **disabled control with a tooltip** rather than hiding it. Hiding makes the app look thinner than it is.

---

## 14. Branch and deploy

**Default: no demo branch.** Point the second Vercel project at `main` with the flag set. Everything is env-gated, so the same commit produces both builds — nothing to merge, nothing to drift, and the demo cannot fall behind.

A long-lived `demo` branch means every feature needs a second merge, and in practice that merge stops happening within a couple of months. A stale demo is worse than no demo. Take the branch approach **only** for build-config differences env vars cannot express, keep the diff to config files, and rebase it every release. Any application logic on a demo branch is a bug.

Either way: **set the demo project's Production Branch** to whatever it builds from. Production domains are public; preview deployments sit behind a Vercel login, and a demo served from a preview URL shows visitors a login wall.

---

## 15. Verification checklist

Run all of these **against the deployed demo**, not localhost. The last four can only fail in production.

- [ ] Fresh private window. No login prompt.
- [ ] Create, edit, delete a record. Refresh. Changes persisted.
- [ ] Reset returns a clean seed.
- [ ] Every nav link reaches a working page — no route still calling the real backend and spinning forever.
- [ ] Charts and dashboards render plausibly, dated near today, with no empty "not enough history" states you didn't intend.
- [ ] **Each behaviour that lived in a database constraint still happens** — every delete guard, every idempotent action run twice, every cascade. Write one checklist row per constraint from §5.4.
- [ ] Trigger every side-effectful route manually. Nothing sends, nothing writes.
- [ ] Production project still works and still requires login.
- [ ] DevTools → Network: **zero** requests to your backend, mail provider, analytics, or any third-party domain.
- [ ] DevTools → Application → Local Storage: contents entirely fictional, and Reset clears only the demo key (the app may legitimately persist other UI state under its own keys).
- [ ] Search the served JS for your project ref, backend hostname, and `eyJ` (JWT prefix). No hits.
- [ ] `/robots.txt` blocks crawlers; page metadata is `noindex`.
- [ ] Vercel env vars for the demo project: the flag, and nothing else.
- [ ] Mobile viewport is not broken — a meaningful share of people open links on a phone.

---

## 16. Lessons from the first build

Concrete things that cost time, in the order they surfaced.

1. **The obvious seam was on the wrong side of the network.** The app had a clean `DataSource` abstraction and a selector function — and the selector ran only in route handlers, so a demo adapter there would have been server-side. Having an abstraction is not the same as having one *in the browser*. Check where it runs before assuming it's the seam.
2. **Returning a parsed body from the transport caused a circular import.** Returning a `Response` fixed it and shrank the call-site diff to a ternary. (§6.3)
3. **Status codes were load-bearing.** The UI rendered blocking rows from a 409's payload. A transport returning correct *data* and wrong *statuses* looked fine until someone tried a delete.
4. **The auth bypass was initially placed by the auth check** — below the line that read a required env var. Every request 500'd, and it read like a broken build rather than a four-line move.
5. **Static imports in the boot gate and banner shipped the entire seed generator to production.** The `IS_DEMO` guard removed the call and not the import. Found by re-reading a comment claiming otherwise. (§11)
6. **Seed depth was set by the app's own constants, not by intuition.** A 6-month seed left the forecasting page rendering "not enough history" — the median window was 12 months. Grep the config for window sizes before choosing.
7. **The existing guide's advice conflicted with a deliberate decision once.** A cron route already failed closed with a 503; the guide said return 200 for quieter logs. The local decision won. When a playbook and a documented invariant disagree, the invariant is usually the one with a reason attached — find that reason before overriding it.

---

## 17. Do not

- Point the demo at the real backend project, even with a separate schema. A service key bypasses row-level security across the whole instance; schema separation is not an isolation boundary.
- Copy production data and anonymize it.
- Add a demo branch to the production authorization guard.
- Put the demo data source on the server.
- Ship a secret behind a `NEXT_PUBLIC_` name.
- Fake the loading screen's duration.
- Leave `console.log` of seed internals or store dumps in the demo build.

---

## 18. Order of work

1. **Audit** (§3). Write down every browser→data path and where it runs.
2. **Pick the seam** (§4). If case C, do the refactor now and verify production before continuing.
3. **Build or adopt the data layer** (§5), including normalized errors. Ship it against the real backend with no behaviour change and confirm production still works.
4. Add `flag.ts`. Add `demo-source.ts` implementing the same interface — TypeScript will enumerate what's missing.
5. Build the store and the seed generator (§7, §8).
6. Wire the seam (§6), dynamically imported (§11).
7. Add the boot gate (§12).
8. Handle auth (§9) — middleware, Server Actions, login route.
9. Kill side effects (§10); audit module-scope initialization.
10. Banner, reset, `noindex` (§13).
11. Create the Vercel project, one env var, correct production branch (§14).
12. Walk §15 against the deployed URL.
