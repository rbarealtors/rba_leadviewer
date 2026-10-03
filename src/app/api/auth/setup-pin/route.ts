import { createSupabaseServerClient } from "@/lib/supabase/server";
import { issuePinCookie, extractSessionId } from "@/lib/auth/pin-cookie";

export async function POST(req: Request) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ success: false, message: "Invalid JSON body" }), {
        status: 400,
        headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
      });
    }

    const pin = body?.pin;
    if (typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) {
      return new Response(
        JSON.stringify({ success: false, message: "PIN must be between 4 and 6 digits" }),
        {
          status: 400,
          headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
        }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return new Response(JSON.stringify({ success: false, message: "Not authenticated" }), {
        status: 401,
        headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
      });
    }

    if (user.app_metadata?.role !== "sales") {
      return new Response(JSON.stringify({ success: false, message: "Access denied" }), {
        status: 403,
        headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
      });
    }

    const { data: result, error: rpcError } = await supabase.rpc("set_sales_pin_initial", {
      new_pin: pin,
    });

    if (rpcError || !result) {
      console.error("set_sales_pin_initial error:", rpcError);
      return new Response(JSON.stringify({ success: false, message: "Internal server error" }), {
        status: 500,
        headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
      });
    }

    const resObj = result as { status: string; pin_epoch?: string };

    if (resObj.status === "already_set") {
      return new Response(
        JSON.stringify({ success: false, message: "PIN is already configured" }),
        {
          status: 409,
          headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
        }
      );
    }

    if (resObj.status === "weak") {
      return new Response(
        JSON.stringify({ success: false, message: "PIN is too simple or common. Choose a different PIN." }),
        {
          status: 400,
          headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
        }
      );
    }

    if (resObj.status === "invalid_format") {
      return new Response(
        JSON.stringify({ success: false, message: "PIN must be between 4 and 6 digits" }),
        {
          status: 400,
          headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
        }
      );
    }

    if (resObj.status === "ok" && resObj.pin_epoch) {
      const { data: sessionData } = await supabase.auth.getSession();
      const sid = extractSessionId(user, sessionData?.session);
      await issuePinCookie(user.id, sid, resObj.pin_epoch);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, message: "Setup failed" }), {
      status: 400,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Setup PIN route error:", err);
    return new Response(JSON.stringify({ success: false, message: "Internal error" }), {
      status: 500,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  }
}