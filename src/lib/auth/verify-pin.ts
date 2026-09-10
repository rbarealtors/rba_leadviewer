import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { pin } = await req.json();

    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return new Response(JSON.stringify({ verified: false, message: "User not found" }), {
        status: 401,
      });
    }

    const user = data.user;
    // Fallback default PIN is 1234 if not explicitly set in metadata
    const pinCode = user.user_metadata?.pin_code || "1234";

    if (pinCode && pinCode === pin) {
      const sessionCookie = {
        name: "sales_pin_verified",
        value: "true",
        maxAge: 8 * 60 * 60, // 8 hours
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
      };

      return new Response(JSON.stringify({ verified: true }), {
        status: 200,
        headers: {
          "Set-Cookie": `${sessionCookie.name}=${sessionCookie.value}; Max-Age=${sessionCookie.maxAge}; Path=/; HttpOnly; Secure; SameSite=${sessionCookie.sameSite}`,
        },
      });
    }

    return new Response(JSON.stringify({ verified: false, message: "Incorrect PIN" }), {
      status: 401,
    });
  } catch (error) {
    console.error("PIN verification error:", error);
    return new Response(JSON.stringify({ verified: false, message: "Internal error" }), {
      status: 500,
    });
  }
}

