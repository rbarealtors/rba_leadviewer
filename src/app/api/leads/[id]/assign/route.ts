import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { assigned_to } = await req.json();
    const { id } = await params;

    const supabase = await createSupabaseServerClient();

    // The RLS policy should ensure only authorized users can reassign (e.g., admin/staff or the current sales rep)
    const { data, error } = await supabase
      .from("leads")
      .update({ assigned_to, assigned_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error assigning lead:", error);
      return new Response(JSON.stringify({ success: false, message: error.message }), {
        status: 400,
      });
    }

    return new Response(JSON.stringify({ success: true, lead: data }), {
      status: 200,
    });
  } catch (error) {
    console.error("Assign lead error:", error);
    return new Response(JSON.stringify({ success: false, message: "Internal error" }), {
      status: 500,
    });
  }
}

