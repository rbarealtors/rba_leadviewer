import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createPinToken,
  verifyPinToken,
} from "@/lib/auth/pin-cookie";

const VALID_SECRET = "0123456789abcdef0123456789abcdef"; // 32 chars
const OTHER_SECRET = "abcdef0123456789abcdef0123456789"; // 32 chars

describe("PIN Cookie Token Security (pin-cookie.ts)", () => {
  const originalEnv = process.env.PIN_COOKIE_SECRET;

  beforeEach(() => {
    process.env.PIN_COOKIE_SECRET = VALID_SECRET;
  });

  afterEach(() => {
    process.env.PIN_COOKIE_SECRET = originalEnv;
  });

  it("successfully creates and verifies a valid token", async () => {
    const context = { uid: "user-123", sid: "sess-456" };
    const token = await createPinToken({
      uid: context.uid,
      sid: context.sid,
      ep: "epoch-789",
    });

    const payload = await verifyPinToken(token, context);
    expect(payload).not.toBeNull();
    expect(payload?.v).toBe(1);
    expect(payload?.uid).toBe(context.uid);
    expect(payload?.sid).toBe(context.sid);
    expect(payload?.ep).toBe("epoch-789");
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects forged tokens with arbitrary signature bytes", async () => {
    const context = { uid: "user-123", sid: "sess-456" };
    const validToken = await createPinToken({
      uid: context.uid,
      sid: context.sid,
      ep: "epoch-789",
    });

    const [payloadB64] = validToken.split(".");
    const forgedToken = `${payloadB64}.c29tZVJhbmRvbUJvZ3VzU2lnbmF0dXJl`;

    const result = await verifyPinToken(forgedToken, context);
    expect(result).toBeNull();
  });

  it("rejects tampered payload content even if signature looks well-formed", async () => {
    const context = { uid: "user-123", sid: "sess-456" };
    const validToken = await createPinToken({
      uid: context.uid,
      sid: context.sid,
      ep: "epoch-789",
    });

    const [, sig] = validToken.split(".");
    const tamperedPayload = btoa(JSON.stringify({
      v: 1,
      uid: "attacker-user-id",
      sid: "sess-456",
      ep: "epoch-789",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

    const tamperedToken = `${tamperedPayload}.${sig}`;
    const result = await verifyPinToken(tamperedToken, context);
    expect(result).toBeNull();
  });

  it("fails verification when signed with a different secret", async () => {
    const context = { uid: "user-123", sid: "sess-456" };
    const tokenWithOtherSecret = await createPinToken(
      { uid: context.uid, sid: context.sid, ep: "epoch-789" },
      OTHER_SECRET
    );

    const result = await verifyPinToken(tokenWithOtherSecret, context);
    expect(result).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const context = { uid: "user-123", sid: "sess-456" };
    const expiredToken = await createPinToken(
      { uid: context.uid, sid: context.sid, ep: "epoch-789" },
      VALID_SECRET,
      -10 // Expired 10 seconds ago
    );

    const result = await verifyPinToken(expiredToken, context);
    expect(result).toBeNull();
  });

  it("rejects tokens if user context (uid) doesn't match", async () => {
    const token = await createPinToken({
      uid: "legit-user",
      sid: "session-1",
      ep: "epoch-1",
    });

    const result = await verifyPinToken(token, {
      uid: "different-user",
      sid: "session-1",
    });
    expect(result).toBeNull();
  });

  it("rejects tokens if session context (sid) doesn't match", async () => {
    const token = await createPinToken({
      uid: "user-1",
      sid: "session-legit",
      ep: "epoch-1",
    });

    const result = await verifyPinToken(token, {
      uid: "user-1",
      sid: "session-hijacked",
    });
    expect(result).toBeNull();
  });

  it("fails closed when PIN_COOKIE_SECRET is missing", async () => {
    delete process.env.PIN_COOKIE_SECRET;
    const context = { uid: "user-1", sid: "session-1" };

    await expect(
      createPinToken({ uid: "user-1", sid: "session-1", ep: "epoch-1" })
    ).rejects.toThrow("Missing or invalid PIN_COOKIE_SECRET");

    const result = await verifyPinToken("some.token", context);
    expect(result).toBeNull();
  });

  it("fails closed when PIN_COOKIE_SECRET is less than 32 characters", async () => {
    process.env.PIN_COOKIE_SECRET = "too-short-secret";
    const context = { uid: "user-1", sid: "session-1" };

    await expect(
      createPinToken({ uid: "user-1", sid: "session-1", ep: "epoch-1" })
    ).rejects.toThrow("Missing or invalid PIN_COOKIE_SECRET");

    const result = await verifyPinToken("some.token", context);
    expect(result).toBeNull();
  });
});