"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm({ redirectedFrom }: { redirectedFrom?: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-ink">RBA Realtors</h1>
          <p className="text-sm text-subtle mt-1">Lead Viewer — staff sign in</p>
        </div>

        <form action={formAction} className="bg-panel border border-line rounded-lg p-6 space-y-4">
          <input type="hidden" name="redirectedFrom" value={redirectedFrom ?? "/leads"} />

          <div>
            <label htmlFor="email" className="block text-xs font-medium text-subtle mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-subtle mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-accent text-white text-sm font-medium py-2 hover:bg-accent/90 disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}