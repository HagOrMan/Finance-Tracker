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

If this repo already has a data-source abstraction, **use it and extend it** — do not build a parallel one. If it does not, create one shaped like this.

Define one interface per domain entity, colocating every operation on that entity:

```ts
// src/lib/data/types.ts
export interface TransactionRepository {
  list(filter?: TransactionFilter): Promise<Transaction[]>;
  get(id: string): Promise<Transaction | null>;
  create(input: NewTransaction): Promise<Transaction>;
  update(id: string, patch: Partial<Transaction>): Promise<Transaction>;
  remove(id: string): Promise<void>;
}

export interface DataSource {
  transactions: TransactionRepository;
  accounts: AccountRepository;
  // ...one per entity
}
```

Two implementations, one selector:

```
src/lib/data/
  types.ts
  supabase/          # real implementation
  demo/              # localStorage-backed implementation
  index.ts           # picks one based on IS_DEMO
```

```ts
// src/lib/data/index.ts
import { IS_DEMO } from "@/lib/demo/flag";

export const data: DataSource = IS_DEMO
  ? createDemoDataSource()
  : createSupabaseDataSource();
```

**Every operation returns a Promise, in both implementations.** The demo one resolves synchronously-ish from memory, but keeping the async signature means calling code is identical and you never rewrite a component when swapping adapters.

Plain objects implementing a TypeScript interface are preferable to classes here — less ceremony, better tree-shaking, and no `this` binding hazards in callbacks. If the existing repo uses classes, match the existing repo. Consistency across your projects matters more than either choice.

**Bundle hygiene:** import the Supabase implementation lazily (`await import(...)`) inside `createSupabaseDataSource`, so a demo build does not ship the Supabase client to visitors at all.

---

## 5. Demo store: in-memory, backed by localStorage

Do **not** read or write `localStorage` on every operation. Do this instead:

- On boot, read one key from `localStorage`, parse it, hold the whole dataset in a module-level object.
- All reads hit the in-memory object. Synchronous, fast, no parse cost.
- All writes mutate memory, then schedule a debounced (~250ms) write-through of the whole dataset back to the one key.

```ts
const STORAGE_KEY = "demo:v1"; // bump the version to invalidate old shapes
```

Rules:

- **One key, versioned.** Bumping `v1` → `v2` after a schema change makes stale data self-invalidate instead of crashing the app.
- **Wrap every `localStorage` call in try/catch.** Safari private mode throws on write. Quota is ~5MB. On failure, fall back to memory-only and keep going — a demo that forgets on refresh beats a demo that white-screens.
- **Never touch `localStorage` during render.** Only in `useEffect` or event handlers. Reading it during render causes hydration mismatches.
- **Generate IDs with `crypto.randomUUID()`**, and keep the same ID shape as production so nothing downstream cares.
- Enforce sane caps (e.g. max 500 records per entity) so a visitor hammering "add" cannot blow the quota.

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
