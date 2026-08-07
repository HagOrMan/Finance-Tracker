import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth-server";
import { isOwnerUserId, ownerUserIds, sanitizeNextPath } from "@/lib/auth";
import { APP_ICON, APP_TITLE } from "@/lib/config";
import { IS_DEMO } from "@/lib/demo/flag";

export const metadata: Metadata = {
  title: `Login · ${APP_TITLE}`,
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  // The proxy already redirects /login away in demo mode, before it can build a
  // Supabase client from credentials the demo build doesn't carry. This is the
  // second lock on the same door: this is the one `async` server page in the
  // app, and `getSessionUser()` two lines down is the exact call that throws
  // when `NEXT_PUBLIC_SUPABASE_URL` is absent.
  if (IS_DEMO) redirect("/");

  const params = await searchParams;
  const next = sanitizeNextPath(params.next);
  const user = await getSessionUser();
  const authorized = isOwnerUserId(user?.id);

  // Signing in never depends on this — the allowlist only gates access, in
  // src/lib/auth.ts. Surfacing the id below is how you bootstrap the list.
  const hasOwnersConfigured = ownerUserIds().length > 0;

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-2xl font-semibold text-foreground">
            {APP_ICON} {APP_TITLE}
          </CardTitle>
          <CardDescription>
            {!user
              ? "Sign in to view and log spending."
              : authorized
                ? "You're signed in."
                : "This Google account isn't authorized for this app."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {params.error === "auth" && !user && (
            <p className="text-sm text-destructive">
              Sign-in didn&apos;t complete. Please try again.
            </p>
          )}

          {user ? (
            <>
              <p className="text-sm text-muted-foreground">
                Signed in as {user.email ?? user.id}
              </p>

              {/* Authentication is shared across every app on this Supabase
                  project, so a valid session isn't access. This id is what goes
                  into OWNER_USER_IDS. */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  Your user ID
                </span>
                <code className="rounded-md border border-border bg-muted px-3 py-2 text-xs break-all select-all">
                  {user.id}
                </code>
              </div>

              {!hasOwnersConfigured && (
                <p className="text-sm text-muted-foreground">
                  No <code className="text-foreground">OWNER_USER_IDS</code> is
                  configured yet — copy the id above into that environment
                  variable (and into Vercel) to grant access.
                </p>
              )}

              <SignOutButton />
            </>
          ) : (
            <GoogleSignInButton next={next} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
