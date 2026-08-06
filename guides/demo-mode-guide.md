# Demo Mode Implementation Guide

A portable spec for adding a public, safe, no-login demo build to a private Next.js + Supabase app deployed on Vercel.

Hand this file to Claude Code inside a repo and ask it to implement the plan. It is written to be adapted, not followed blindly — read the **Audit first** section before writing any code.

---

## 1. Goal

Produce a second Vercel project, built from this same repo, that:

- Anyone can open with no login and no Google OAuth round-trip.
- Contains **zero** real data and **zero** credentials that could reach real data.
- Persists the visitor's own changes across page refreshes, so the app feels real.
- Cannot send email, hit webhooks, run cron work, or cause any other outbound side effect.
- Resets to a clean state on demand.

The production project is untouched by all of this. Every change is gated behind one environment flag.

---

## 2. The one flag

```
NEXT_PUBLIC_DEMO_MODE=true
```

It **must** be `NEXT_PUBLIC_` — the browser needs to read it to pick a data adapter. Read it through a single module so there is exactly one definition of "are we in demo mode":

```ts
// src/lib/demo/flag.ts
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
```

Never read `process.env.NEXT_PUBLIC_DEMO_MODE` anywhere else. Import `IS_DEMO`.

Note that `NEXT_PUBLIC_*` values are inlined into the client bundle at **build time**, not read at runtime. Changing the flag requires a redeploy, and the same build artifact cannot serve both modes. That is fine — the two Vercel projects produce two builds.

---

## 3. Audit first — this decides everything

**Before writing code, find every place the app touches Supabase and record whether it runs on the server or in the browser.**

```
grep -rn "createClient\|createServerClient\|createBrowserClient\|from(" src/ app/ lib/
```

For each hit, classify it:

- **Client component / hook / SWR / React Query fetcher** → fine, the demo adapter drops straight in.
- **Server component, server action, route handler, `generateStaticParams`, middleware** → **problem.** `localStorage` does not exist on the server. There is no way to read a visitor's browser storage from a server component.

This is the single biggest thing that derails this project. If most data access is server-side, you have three options, in order of preference:

1. **Move the demo-mode read path to the client.** Keep the page a server component for layout/shell, but have the data-bearing subtree be a client component that calls the adapter. Often this is a small refactor because the data is already rendered by a client component one level down.
2. **Render the whole demo route client-side.** Wrap the page body in a client component that shows the boot screen (section 6) and then renders from the store. Acceptable for a portfolio demo; SEO is irrelevant here since the demo is `noindex` anyway.
3. **Only if 1 and 2 are impractical:** serve seed data from the server statically (same for every visitor, no mutations) and layer client-side mutations on top. More complexity, worse result. Avoid.

Write the audit results down before proceeding. If the answer is "everything is server-side," say so explicitly and plan the refactor rather than papering over it.

---

## 4. Data layer: the adapter seam

**Rule: if the repo already has a data-source abstraction, use it and extend it.** This one does.

| Piece | Where |
| --- | --- |
| `DataSource` — one flat interface, ~18 methods over three entities | `src/lib/data/types.ts` |
| `getDataSource()` — picks an implementation from `DATA_SOURCE` | `src/lib/data/source.ts` |
| `SupabaseDataSource` (production) / `SqliteDataSource` (offline dev) | `src/lib/data/supabase-source.ts`, `sqlite-source.ts` |
| Normalized failures: `NotFoundError`, `ForeignKeyViolationError`, `UniqueViolationError` | `src/lib/data/errors.ts` |

Three cosmetic differences from the generic sketch this guide used to carry, all resolved in favour of the repo: the interface is **flat** (`loadReceipts()`, `insertReceipt()`, …), not one repository object per entity; the implementations are **classes**; and the selector lives in `source.ts`, not `index.ts`. Everything already returns a `Promise`, so the demo adapter costs nothing to make async-compatible.

### 4.1 The seam is on the wrong side of the network

Pattern A (`ARCHITECTURE.md` §2) puts the entire data layer on the server:

| | Runs where | Can see `localStorage` |
| --- | --- | --- |
| `getDataSource()` → `SupabaseDataSource` | route handlers only | no |
| `request()` in `src/hooks/use-finance-data.ts` | browser | **yes** |

So a `DemoDataSource` selected inside `getDataSource()` would run in a Vercel function: one dataset shared by every visitor at once, wiped on every cold start, and one visitor's "Reset" resetting everybody. **Do not add a `demo` branch to `getDataSource()`.** It is the obvious move, it looks like the architecturally correct one, and it does not produce a working demo.

The browser's actual seam is a single function — `request()` in [use-finance-data.ts:63](src/hooks/use-finance-data.ts#L63). Every read, every mutation, the Refresh button and both send buttons funnel through it. That is the whole surface.

### 4.2 What to build

```
src/lib/demo/
  flag.ts          # IS_DEMO — the only read of NEXT_PUBLIC_DEMO_MODE
  store.ts         # in-memory dataset + localStorage write-through (§5)
  seed.ts          # generateSeed(): DemoDataset
  transport.ts     # (method, path, body) -> DemoDataSource call -> parsed body
src/lib/data/
  demo-source.ts   # class DemoDataSource implements DataSource
```

`demo-source.ts` sits with its siblings rather than under `src/lib/demo/` because it implements the same interface they do, and that interface is what keeps the demo honest — a method added to `DataSource` breaks the demo build immediately. Nothing else in `src/lib/data/` is `server-only` except `cache.ts`; `types.ts` and `merge.ts` are plain modules and are all `DemoDataSource` needs.

Then one change, in `request()`:

```ts
async function request<T>(url: string, init?: { method: string; input?: unknown }): Promise<T> {
  if (IS_DEMO) return demoRequest<T>(url, init); // src/lib/demo/transport.ts
  const res = await fetch(url, /* … unchanged … */);
  // …unchanged…
}
```

Everything above that line keeps working untouched: every hook, the invalidation fan-out (`invalidateReceipts` / `invalidateDisbursements` / `invalidateSubscriptionCharges`), `placeholderData` on the report queries, and the `ApiError` the tables read `linked` off. The demo exercises the real client, not a parallel one.

### 4.3 The transport reproduces the route handlers, not just the data

Status codes are load-bearing in this UI. `errorResponse()` in [api.ts](src/lib/api.ts) maps `NotFoundError` → 404 and `ForeignKeyViolationError` → 409 with `linked: error.blockedBy`; the client reads that back through `linkedDisbursements()` in `use-finance-data.ts` and renders the blocking rows inline. `demoRequest` must therefore throw `ApiError` with the same status and the same body shape.

Mirror the mapping rules — do **not** import `errorResponse` itself, which returns a `NextResponse` and pulls in `next/server`. Also mirror per route: validate with the same zod schemas from `src/lib/data/schemas.ts` (so a bad form fails identically), treat `?fresh=1` as a no-op, and return the created row for a POST.

### 4.4 Reports and the digest are not CRUD — and this is where the runner split pays off

`/api/reports` and `/api/reports/monthly` return a computed model, not rows. `src/lib/reports.ts` and `src/lib/monthly-digest.ts` are pure and client-importable **by design** — that split exists so the model is checkable without I/O, and it means the demo builds the real report in the browser:

```ts
buildSpendingReport(mergedReceipts, disbursements, period, today);
buildMonthlyDigest(mergedReceipts, disbursements, subscriptions, month, today);
```

Never import `reports-runner.ts`, `monthly-digest-runner.ts` or `subscriptions-runner.ts` — all three are `import "server-only"`, and a client import is a build error, which is the point.

**`today`:** production uses `todayInZone(APP_TIMEZONE)` server-side. `APP_TIMEZONE` is not `NEXT_PUBLIC_`, so in the browser `src/lib/config.ts` evaluates it to its `"America/Toronto"` fallback — meaning `todayInZone(APP_TIMEZONE)` works client-side and gives every visitor the same "today". Use it. Don't reach for `new Date()`, and don't add a `NEXT_PUBLIC_APP_TIMEZONE`.

The two `/send` endpoints return `{ sent, subject, reason }`. In demo, return `{ sent: false, subject, reason: "demo mode" }` so the toast on `/reports` says something true (§8). `POST /api/subscriptions/run-due` and `/charge-now` genuinely write — they generate receipts — and should keep working in the demo. That behaviour is worth showing.

---

## 5. Demo store: in-memory, backed by localStorage

Do **not** read or write `localStorage` on every operation. Do this instead:

- On boot, read one key from `localStorage`, parse it, hold the whole dataset in a module-level object.
- All reads hit the in-memory object. Synchronous, fast, no parse cost.
- All writes mutate memory, then schedule a debounced (~250ms) write-through of the whole dataset back to the one key.

```ts
// Namespaced, because localStorage here already holds `finance-tracker-filters`
// (the Zustand persist key in src/store/filters-store.ts). Bump v1 -> v2 after a
// shape change so stale data self-invalidates instead of crashing the app.
const STORAGE_KEY = "finance-tracker-demo:v1";
```

**Reset clears only the demo key.** Wiping the filters key too would make one button both reset data and reset the view, and `ARCHITECTURE.md` §4 is explicit that "Reset filters" and data actions must stay visibly different things.

Still true here, unchanged:

- **Wrap every `localStorage` call in try/catch.** Safari private mode throws on write. On failure fall back to memory-only and keep going — a demo that forgets on refresh beats a demo that white-screens.
- **Never touch `localStorage` during render.** Only in `useEffect` or event handlers.

On that last point the repo already has the pattern, and §6's `DemoBoot` should copy it rather than invent a second one: `src/store/filters-store.ts` is created with `skipHydration`, [filters-hydrator.tsx](src/components/filters-hydrator.tsx) rehydrates in a `useEffect` and flips `hasHydrated`, and `useFilteredReceipts` folds that flag into its `isLoading` so pages wait instead of rendering wrong numbers. Same shape, same reason.

### 5.1 Five things this repo's model requires

**IDs are `number`, not UUID.** `Receipt.id`, `Disbursement.id` and `Subscription.id` are all `number` (Postgres identity columns), and `refunded_from_receipt` / `subscription_id` are `number | null` foreign keys pointing at them. `crypto.randomUUID()` breaks the types *and* `parseIdParam()`'s positive-integer check. Keep a `nextId` counter per entity inside the persisted blob; monotonic, never reused after a delete.

**Store facts, derive the rest.** `MergedReceipt.total_refunded` and `actual_price` are computed by `mergeReceipts()` ([merge.ts](src/lib/data/merge.ts)). Persist `receipts` and `disbursements` raw and call the real `mergeReceipts` on read. Persisting the merged shape would create a second place that knows what a receipt cost — the exact thing `ARCHITECTURE.md` §1 exists to prevent — and it goes wrong the first time a refund is edited.

**`updated_at` is a database trigger in production.** It is absent from every `Update*Input` on purpose. The demo store has to stamp it on every insert and update itself, or the "last edited" column is blank on every row. (`SqliteDataSource` coalesces it to `""` for the same missing-trigger reason. That is precedent, not a licence — the tables display the column.)

**Three database constraints have to move into the store.** Each one is a behaviour the demo either shows or silently loses:

1. **Receipt delete blocked by refunds** → implement `disbursementsForReceipt(id)` and throw `ForeignKeyViolationError(msg, blocking)` so the 409 carries `linked`.
2. **Subscription delete blocked by generated receipts** → `receiptsForSubscription(id)`, same shape.
3. **`unique (subscription_id, date)`** → `insertSubscriptionCharge` throws `UniqueViolationError` when that pair already exists. The runner treats it as success-already-recorded (`ARCHITECTURE.md` §6). Without it, pressing "Run due charges" twice double-charges in the demo and doesn't in production.

Keep `setChargesGenerated` separate from `updateSubscription`, as the interface already does — `charges_generated` is runner bookkeeping, and merging them lets a form desync the schedule.

**Caps have to clear the seed.** The generic "500 per entity" is below what this app needs: the digest reads `DIGEST_BASELINE_MONTHS` (6) months behind its own month and `BIG_SPENDER.medianMonths` is 12, so a seed that makes `/reports/monthly` look real is ~13 months at roughly 50 receipts a month — ~650 rows before a visitor adds anything. **Cap at 2000 per entity.** Size is not the constraint: a receipt serializes to ~150 bytes, so 2000 receipts plus disbursements and subscriptions stays well under 500 KB against a ~5 MB quota.

---

## 6. Boot sequence

The boot gate is not just cosmetic — it is what prevents hydration mismatch. The server renders no data; the client has data only after mount. Gating render on a `ready` flag makes the two agree.

```tsx
// src/components/DemoBoot.tsx  ('use client')
export function DemoBoot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!IS_DEMO);

  useEffect(() => {
    if (!IS_DEMO) return;
    hydrateDemoStore().then(() => setReady(true));
  }, []);

  if (!ready) return <BootScreen />; // "Setting up your demo environment…"
  return <>{children}</>;
}
```

`hydrateDemoStore()` should:

1. Try to load the existing dataset from `localStorage`.
2. If absent, malformed, or a stale version → generate a fresh seed and write it.
3. Resolve.

Keep the boot screen honest — it is genuinely doing work, but it will finish in well under a second. Do not add an artificial delay; a fake loading bar is exactly the kind of thing an interviewer notices. If the flash is ugly, that is a styling problem, not a timing problem.

Mount `DemoBoot` inside the authenticated layout, not the root layout, so the marketing/landing shell renders instantly.

---

## 7. Auth stub

In demo mode the app must never contact Google. Behind `IS_DEMO`:

- The session hook returns a fixed fake user (`{ id: 'demo-user', email: 'demo@example.com', name: 'Alex Demo' }`).
- Route guards and middleware treat that session as authenticated. **Guard the guard**: middleware runs on the server, so it reads `IS_DEMO` from the build-time env — that works, but make the bypass a single explicit early return, clearly commented, not a scattered condition.
- `/login` redirects straight to the dashboard.
- Sign-out clears the demo store and re-seeds rather than logging out.

Do not configure a Google OAuth client for the demo project at all. Nothing should be reachable.

---

## 8. Disable every side effect

Two layers, both required.

**Layer 1 — no credentials.** The demo Vercel project's environment contains _only_ `NEXT_PUBLIC_DEMO_MODE`. No `SUPABASE_*`, no `RESEND_API_KEY` / `SENDGRID_*`, no `CRON_SECRET`, no webhook URLs, no analytics keys tied to real accounts. Code cannot exfiltrate what the environment does not hold. This is the actual security boundary; everything else is convenience.

**Layer 2 — guarded handlers.** Every route that sends email, calls an external API, or runs scheduled work returns early:

```ts
export async function GET(req: Request) {
  if (IS_DEMO) {
    return Response.json({ ok: true, skipped: "demo mode" }, { status: 200 });
  }
  // ...real work
}
```

Return 200, not an error — a red row in the Vercel logs every day is noise you will learn to ignore.

**On cron specifically:** `vercel.json` is committed to the repo, so if both projects build from the same branch, both register the cron schedules. The guarded handler above makes those invocations no-ops that cost nothing. That is fine and is the simplest correct answer. Do not try to maintain two `vercel.json` files unless you are already committed to the separate-branch approach in section 11.

**Audit for outbound calls** beyond the obvious ones: analytics, Sentry, feature flags, image uploads to Supabase Storage, anything with an SDK initialized at module scope. Module-scope initialization runs even if the feature is never used.

---

## 9. Seed data

- **Entirely fictional.** No real merchants you actually shop at, no real companies you are actually interviewing with, no real employer names, no real amounts. Someone will read this carefully; assume it is the hiring manager.
- **Anchor dates relative to `Date.now()`**, not hardcoded. A demo showing "last activity: March 2026" in November reads as abandoned.
- **Deterministic per visitor, varied across the dataset.** Seed a small PRNG rather than using `Math.random()` directly, so the shape stays plausible: realistic spend distribution, a believable funnel of application stages, some gaps and some clusters.
- **Enough volume that charts look real.** ~6 months of transactions, ~25–40 job applications across all stages. Too little data makes every visualization look broken.
- **Make the empty states reachable.** Leave at least one category or stage empty so a curious visitor sees you handled that case.
- Keep the generator in one file, e.g. `src/lib/demo/seed.ts`, exporting `generateSeed(): DemoDataset`.

---

## 10. Demo UX

- **Persistent banner:** "Demo mode — sample data only. Changes are stored in your browser and reset when you clear them." Dismissible, but reappears on reload.
- **Reset button** in the banner or settings: clears the key, re-seeds, reloads.
- **`noindex`.** Add `robots: { index: false, follow: false }` to the demo metadata and serve a blocking `robots.txt`. You do not want the demo competing with your real site in search results, or a recruiter landing on the demo thinking it is production.
- **Do not disable destructive actions.** Let people delete things. That is the point of a sandbox, and it is one refresh away from a reset.
- If a feature genuinely cannot work without a server (file export, PDF generation, real-time subscriptions), show a disabled control with a short tooltip explaining why rather than hiding it. Hiding it makes the app look thinner than it is.

---

## 11. Branch strategy

**Default recommendation: no demo branch.** Point the second Vercel project at `main` with `NEXT_PUBLIC_DEMO_MODE=true`. Everything above is env-gated, so the same commit produces both builds. Nothing to merge, nothing to drift, and the demo can never fall behind production.

A long-lived `demo` branch means every feature you ship needs a second merge, and in practice that merge stops happening within a couple of months. A stale demo is worse than no demo.

Take the branch approach **only** if you need build-config differences that env vars cannot express — a genuinely different `vercel.json`, or excluding a package from the build. If you do, rebase it onto `main` on every release and keep the diff to config files only. Any application logic on the demo branch is a bug.

Either way: the demo Vercel project's Production Branch must be set to whichever branch it builds from, so the demo domain is a _production_ domain. Vercel's Standard Protection leaves production domains public on Hobby, but gates preview deployments behind a Vercel login — a demo served from a preview URL will show a login wall to visitors.

---

## 12. Verification checklist

Run all of these against the deployed demo before linking it anywhere.

- [ ] Open the demo URL in a fresh private window. No login prompt appears.
- [ ] DevTools → Network, filter `supabase`. **Zero requests.** Also check for your email provider, analytics, and any other third-party domain.
- [ ] DevTools → Application → Local Storage. One key. Contents are entirely fictional.
- [ ] View source / search the JS bundle for `supabase.co`, `eyJ` (JWT prefix), and any project ref. No hits.
- [ ] Create, edit, and delete a record. Refresh. Changes persisted.
- [ ] Reset button returns a clean seed.
- [ ] Every nav link reaches a working page — no route still calling Supabase and rendering a spinner forever.
- [ ] Charts and dashboards render with plausible data, dated near today.
- [ ] Trigger each cron route manually (`curl` the path). Returns 200, sends nothing, writes nothing.
- [ ] Vercel project env vars: `NEXT_PUBLIC_DEMO_MODE` only.
- [ ] `/robots.txt` blocks crawlers; page metadata is `noindex`.
- [ ] Mobile viewport is not broken — a meaningful share of recruiters open links on a phone.
- [ ] Production project still works and still requires Google login.

---

## 13. Do not

- Point the demo at the real Supabase project, even with a separate schema. `service_role` bypasses RLS across the whole instance; schema separation is not an isolation boundary.
- Copy production data and "anonymize" it. Generate synthetic data from scratch.
- Add a demo bypass to the production auth path. The bypass lives in the adapter selection, not in the auth check.
- Ship `NEXT_PUBLIC_` anything that is a secret. It is in the bundle, readable by anyone.
- Fake the loading screen's duration.
- Leave `console.log` of seed internals or store dumps in the demo build.

---

## 14. Suggested implementation order

1. Audit (section 3). Write down what is server-side. Stop and reconsider scope if it is most things.
2. Add `flag.ts` and the `DataSource` interface. Wrap the existing Supabase calls in the real implementation with no behavior change. **Verify production still works before continuing.**
3. Build the demo store and seed generator. Unit-test the store against the same interface.
4. Add `DemoBoot` and the boot screen.
5. Stub auth.
6. Guard side-effectful routes; audit module-scope SDK initialization.
7. Add banner, reset, `noindex`.
8. Create the Vercel project, set the production branch and the one env var, deploy.
9. Walk the entire checklist in section 12.

---

## Appendix A — audit of this repo against the guide

Written before any code, per §3. Everything below is a place the guide's assumptions meet something specific here. Sections not listed apply as written.

### §2 — the one flag

`src/lib/env.ts`'s `requireEnv()` **cannot** read it: it does a dynamic `process.env[name]` lookup, which Next does not inline into the client bundle, and the file says so. `flag.ts` must use the literal static access:

```ts
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
```

`IS_DEMO` gets imported by `use-finance-data.ts`, a `"use client"` module, so `flag.ts` must stay free of `server-only` imports. Add `NEXT_PUBLIC_DEMO_MODE` to `.env.example` — `CLAUDE.md` requires it.

### §3 — the audit result

**The thing this section warns is "the single biggest thing that derails this project" does not bite here.** All data access is server-side (route handlers only, never a component), *and* every data-bearing page is already `"use client"` and reaches the server only through `/api`. So none of options 1–3 are needed: no page converts, no subtree extracts. The refactor the guide braces for is replaced by the one-function swap in §4.2.

`src/app/login/page.tsx` is the only `async` server page in the app, and §7 handles it.

### §6 — boot sequence

"Mount `DemoBoot` inside the authenticated layout, not the root layout" doesn't map — there is one layout (`src/app/layout.tsx`) and no marketing shell. Mount it next to `FiltersHydrator` there, or gate inside [app-chrome.tsx](src/components/app-chrome.tsx), which already branches on `/login` and `/auth`.

### §7 — auth stub ⚠️ the sharpest edge in this port

The guide treats this as one bypass. Here it is three places, and one of them fails in a non-obvious way:

1. **`updateSession()`** in [middleware.ts](src/lib/supabase/middleware.ts), reached via `src/proxy.ts`. Deny-by-default, so it 401s/redirects everything. Needs a single early `return NextResponse.next()` **at the very top** — crucially *before* `createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), …)`, because with no Supabase env vars set (§8 layer 1) `requireEnv` throws and every request 500s rather than rendering.
2. **`getSessionUser()`** in `src/lib/auth-server.ts` has the same problem through `createClient()`. In demo no route handler is ever reached from the browser, so nothing should call it — but `/login` is a server page that does. Make `/login` unreachable in demo rather than stubbing the guard.
3. **`signInWithGoogle` / `signOut`** in `src/lib/supabase/actions.ts` are Server Actions; both call `createClient()`. Sign-out in demo should clear the store and re-seed, never invoke these.

**Do not put the bypass inside `requireUser()` / `requireOwnerForApi()`.** `CLAUDE.md` states as a hard rule that every handler starts with that call and that the cron is the *only* exception; a demo branch inside it is a second gate in the file whose entire job is to have exactly one. Leave production's gate untouched and have the demo simply never reach it — §13 already says this, but here it is a documented invariant, so note the plan in `PROGRESS.md` before touching auth.

### §8 — side effects

Mostly already satisfied, and one piece of the advice actively conflicts with an existing decision:

- **Cron.** `vercel.json` holds exactly one cron (`/api/cron/subscriptions`, Hobby's limit). `requireCronSecret()` already returns **503 when `CRON_SECRET` is unset — fail-closed, deliberately**, and `.env.example` documents it. Layer 1 alone disables it with no code change. **Ignore the guide's "return 200, not an error" here**; a 503 is the correct, already-reasoned answer, and changing it would weaken production's fail-closed behaviour to quiet a log line in a project nobody reads the logs of.
- **Email.** `sendEmail()` already returns `{ sent: false, reason }` when `RESEND_API_KEY` is unset and never throws (`ARCHITECTURE.md` §5). Layer 1 covers it. Still add the layer-2 guard at the two `/send` routes, so the UI toast reads "demo mode" rather than "Email not configured".
- **Module-scope SDK init.** Nothing to find: `new Resend(apiKey)` is inside `sendEmail`, `createServiceClient()` is per-call, and there is no analytics, Sentry, feature-flag SDK, or Supabase Storage anywhere.

### §9 — seed data

- **"~6 months of transactions" is too short.** See §5.1 — ~13 months, or `/reports/monthly`'s projection has nothing to trim and its big-spender medians have no window.
- **Categories are fixed and real.** `CATEGORY_OPTIONS` in `src/lib/data/types.ts` is a closed list ported from the original app. Keep the categories; invent the store names.
- Seed **both** `Eating Out (Stressed)` and `Eating Out (Social)` — the digest renders a split between them.
- Seed **Travel / School / Rent** (`COMPARISON_EXCLUDED_CATEGORIES`) or the report's excluded strip and the digest's big-spenders table render empty, hiding two features.
- Seed subscriptions with `charges_generated` consistent with `start_date` and `nthChargeDate`, or the Overdue badge lights up on a fresh demo.
- The guide's "make the empty states reachable" is easy here: leave one category unused.

### §11 — branch strategy

No conflict. The one-cron limit is per Vercel project, so the demo project gets its own allowance and the committed `vercel.json` needs no variant.

### §12 — verification

"Search the bundle for `supabase.co` / `eyJ`" **already passes today**: nothing in `src/` calls `createBrowserClient`, so the Supabase client has never been in the client bundle. Keep the check; expect it green on the first run.

Three rows to add, each covering an invariant that only exists in Postgres in production:

- [ ] Delete a receipt that has a refund against it → 409, blocking rows listed inline.
- [ ] Press "Run due charges" twice → the second run is a no-op, not a double charge.
- [ ] Step the `/reports/monthly` month picker back through every seeded month → no blank months, projection populated.

### §14 — implementation order

Step 2 ("add the `DataSource` interface, wrap existing Supabase calls") **is already done** — skip it. Replace with: build `DemoDataSource` against the existing interface first, since the interface is the spec and TypeScript will enumerate what's missing.

### Incidental

`ARCHITECTURE.md` §4 refers to a `todayISO()` helper that no longer exists in `src/lib/dates.ts` (only `todayInZone`). Noticed while deciding what "today" means in demo (§4.4); unrelated to this work, worth a line in `PROGRESS.md`.
