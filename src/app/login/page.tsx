import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LoginButtons } from "@/components/login-buttons";

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-2xl font-semibold text-foreground">
            💸 Finance Tracker
          </CardTitle>
          <CardDescription>Sign in to view and log spending.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <LoginButtons />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
