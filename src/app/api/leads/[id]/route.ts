import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/leads/validate";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid lead id." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { full_name?: unknown };
  try {
    body = (await request.json()) as { full_name?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.full_name !== "string") {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  const fullName = body.full_name.trim();
  if (fullName.length > 200) {
    return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ full_name: fullName || null })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not update lead." }, { status: 500 });
  }

  return NextResponse.json({ lead: data });
}