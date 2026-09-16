"use client";

import { useActionState } from "react";
import { requestLinkAction } from "../actions/auth";
import { Button, Card, CardHeader, Field, inputClass, Notice } from "@/components/ui";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(requestLinkAction, null);

  return (
    <div className="mx-auto max-w-md pt-8">
      <Card>
        <CardHeader
          title="Sign in"
          subtitle="We email you a link. There is no password to remember."
        />
        <form action={formAction} className="space-y-4 px-5 py-5">
          <Field label="Email address">
            <input
              className={inputClass}
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </Field>

          {state ? (
            <Notice tone={state.ok ? "ok" : "error"}>{state.message}</Notice>
          ) : null}

          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Email me a sign-in link"}
          </Button>

          <p className="text-center text-xs text-muted">
            Only people the commissioner has added can sign in.
          </p>
        </form>
      </Card>
    </div>
  );
}
