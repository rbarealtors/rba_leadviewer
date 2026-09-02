import { cookies } from "next/headers";
import {
  createServerClient,
  type CookieOptions,
  type SetAllCookies,
} from "@supabase/ssr";

/**
 * Server-side Supabase client for use in Server Components, Server Actions,
 * and Route Handlers. Uses the anon/publishable key + the user's session
 * cookie, so it is subject to RLS as the signed-in user — this is the
 * client that should be used for anything triggered by an authenticated
 * staff member (reading leads, marking viewed).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options as CookieOptions);
            });
          } catch {
            // Called from a Server Component where cookies can't be
            // written; middleware handles session refresh in that case.
          }
        },
      },
    },
  );
}
