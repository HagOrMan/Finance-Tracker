/**
 * The one definition of "are we in demo mode".
 *
 * **Never read `process.env.NEXT_PUBLIC_DEMO_MODE` anywhere else** — import
 * `IS_DEMO`. One definition is what keeps the demo build from being demo-ish in
 * some places and not others.
 *
 * Deliberately a literal `process.env.NEXT_PUBLIC_DEMO_MODE` member access
 * rather than `requireEnv("NEXT_PUBLIC_DEMO_MODE")`: Next only inlines
 * `NEXT_PUBLIC_*` into the browser bundle for statically analyzable access, and
 * `src/lib/env.ts` does a dynamic `process.env[name]` lookup that is always
 * `undefined` on the client. `requireEnv` would also throw when unset, which is
 * exactly wrong here — unset means "not a demo", the overwhelmingly common case.
 *
 * `NEXT_PUBLIC_*` is inlined at **build time**, so flipping this needs a
 * redeploy and one build artifact can never serve both modes. That is the
 * intended shape: two Vercel projects, two builds, one repo, one branch.
 *
 * This module is imported from client components, so it must never gain a
 * `server-only` import.
 */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
