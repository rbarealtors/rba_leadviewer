import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Only used for the login form. All lead data
 * access happens server-side (Server Components / Server Actions) so we
 * don't need to fetch leads from the client at all.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
