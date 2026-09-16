import { assignLead } from "@/app/leads/assignment-actions";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { assigned_to } = await req.json();
    const { id } = await params;

    const result = await assignLead(id, assigned_to);

    if (result.error) {
      return new Response(JSON.stringify({ success: false, message: result.error }), {
        status: 400,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
    });
  } catch (error: any) {
    console.error("Assign lead error:", error);
    return new Response(JSON.stringify({ success: false, message: "Internal error" }), {
      status: 500,
    });
  }
}

