import { cookies } from "next/headers";
import type { User, Session } from "@supabase/supabase-js";

export interface PinCookiePayload {
  v: number;
  uid: string;
  sid: string;
  ep: string;
  exp: number;
}

export const IS_PROD = process.env.NODE_ENV === "production";
export const COOKIE_NAME = IS_PROD ? "__Host-sales_pin" : "sales_pin";
export const COOKIE_MAX_AGE = 8 * 60 * 60; // 8 hours (28800 seconds)

function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getCryptoKey(secret?: string): Promise<CryptoKey | null> {
  const secretKey = secret ?? process.env.PIN_COOKIE_SECRET;
  if (!secretKey || secretKey.length < 32) return null;
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Extracts a stable session identifier.
 * Uses the JWT session_id if available from access_token, otherwise falls back to last_sign_in_at.
 */
export function extractSessionId(user: User, session?: Session | null): string {
  if (session && session.access_token) {
    try {
      const parts = session.access_token.split(".");
      if (parts.length === 3) {
        const payloadStr = parts[1];
        if (payloadStr) {
          const payload = JSON.parse(atob(payloadStr.replace(/-/g, "+").replace(/_/g, "/")));
          if (payload.session_id) {
            return String(payload.session_id);
          }
        }
      }
    } catch {
      // Fallback below
    }
  }
  return user.last_sign_in_at || "unknown_session";
}

/**
 * Generates a signed PIN token string.
 */
export async function createPinToken(
  params: { uid: string; sid: string; ep: string },
  secretOverride?: string,
  expiresInSeconds: number = COOKIE_MAX_AGE
): Promise<string> {
  const key = await getCryptoKey(secretOverride);
  if (!key) throw new Error("Missing or invalid PIN_COOKIE_SECRET (minimum 32 bytes required)");

  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload: PinCookiePayload = {
    v: 1,
    uid: params.uid,
    sid: params.sid,
    ep: params.ep,
    exp,
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = bufferToBase64Url(new TextEncoder().encode(payloadStr));

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64)
  );
  const signatureB64 = bufferToBase64Url(signatureBuffer);

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Generates and sets a signed PIN cookie in Next.js cookie store.
 */
export async function issuePinCookie(uid: string, sid: string, ep: string): Promise<string> {
  const token = await createPinToken({ uid, sid, ep });
  try {
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  } catch {
    // Graceful fallback for non-request environments
  }
  return token;
}

/**
 * Clears the PIN cookie.
 */
export async function clearPinCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
  } catch {
    // Graceful fallback for non-request environments
  }
}

/**
 * Verifies a PIN token (stateless).
 * Checks signature, version, uid, sid, and expiration.
 */
export async function verifyPinToken(
  token: string | undefined | null,
  context: { uid: string; sid: string },
  secretOverride?: string
): Promise<PinCookiePayload | null> {
  if (!token) return null;
  const key = await getCryptoKey(secretOverride);
  if (!key) return null; // Fail closed if no secret

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const payloadB64 = parts[0];
  const signatureB64 = parts[1];
  if (!payloadB64 || !signatureB64) return null;

  try {
    const signatureBuffer = base64UrlToBuffer(signatureB64);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBuffer,
      new TextEncoder().encode(payloadB64)
    );

    if (!isValid) return null;

    const payloadStr = new TextDecoder().decode(base64UrlToBuffer(payloadB64));
    const payload = JSON.parse(payloadStr) as PinCookiePayload;

    if (payload.v !== 1) return null;
    if (payload.uid !== context.uid) return null;
    if (payload.sid !== context.sid) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Read raw token from cookies (for server components / route handlers).
 */
export async function getPinCookieRaw(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(COOKIE_NAME)?.value;
  } catch {
    return undefined;
  }
}
