import { createSupabaseServerClient } from "@/lib/supabase/server";
import { issuePinCookie, extractSessionId } from "./pin-cookie";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const pin = body?.pin;

    if (!pin || typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) {
      return new Response(
        JSON.stringify({ verified: false, message: "PIN must be between 4 and 6 digits" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ verified: false, message: "Not authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const user = userData.user;
    const role = user.app_metadata?.role;

    if (role && role !== "sales") {
      return new Response(
        JSON.stringify({
          verified: false,
          message: "PIN verification is only required for sales agents",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc("verify_sales_pin", {
      submitted_pin: pin,
    });

    if (rpcError || !rpcData) {
      return new Response(
        JSON.stringify({
          verified: false,
          message: rpcError?.message || "Failed to verify PIN",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const resStatus = (rpcData as { status: string; locked_until?: string; attempts_remaining?: number; pin_epoch?: string }).status;

    if (resStatus === "locked") {
      return new Response(
        JSON.stringify({
          verified: false,
          status: "locked",
          locked_until: (rpcData as { locked_until?: string }).locked_until,
          message: "Account is locked. Try again later.",
        }),
        { status: 423, headers: { "Content-Type": "application/json" } }
      );
    }

    if (resStatus === "invalid") {
      return new Response(
        JSON.stringify({
          verified: false,
          status: "invalid",
          attempts_remaining: (rpcData as { attempts_remaining?: number }).attempts_remaining,
          message: `Incorrect PIN. Attempts remaining: ${(rpcData as { attempts_remaining?: number }).attempts_remaining}`,
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (resStatus === "not_found") {
      return new Response(
        JSON.stringify({
          verified: false,
          status: "not_found",
          message: "PIN not set up",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (resStatus === "ok") {
      const pinEpoch = (rpcData as { pin_epoch: string }).pin_epoch;
      const { data: sessionData } = await supabase.auth.getSession();
      const sid = extractSessionId(user, sessionData?.session);
      await issuePinCookie(user.id, sid, pinEpoch);

      return new Response(
        JSON.stringify({
          verified: true,
          status: "ok",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        verified: false,
        message: "Unexpected response from verification service",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("PIN verification error:", error);
    return new Response(
      JSON.stringify({ verified: false, message: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
