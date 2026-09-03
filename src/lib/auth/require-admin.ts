import "server-only";

import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthorizationError,
  requireAdminUser,
} from "./authorization";

export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  try {
    return requireAdminUser(user);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) {
      throw error;
    }

    if (error.status === 401) {
      redirect("/login");
    }

    notFound();
  }
}