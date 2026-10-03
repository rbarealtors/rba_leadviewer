import "server-only";

import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthorizationError,
  requireManagementUser,
} from "./authorization";

export async function requireManagement() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  try {
    return requireManagementUser(user);
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
