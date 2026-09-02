import { describe, it, expect } from "vitest";
import { normalizePhoneNumber } from "../src/lib/leads/phone";

describe("normalizePhoneNumber", () => {
  it("strips a leading p: transport prefix", () => {
    expect(normalizePhoneNumber("p:9876543210")).toBe("9876543210");
  });

  it("is case-insensitive on the prefix", () => {
    expect(normalizePhoneNumber("P:9876543210")).toBe("9876543210");
  });

  it("leaves an already-clean number untouched", () => {
    expect(normalizePhoneNumber("+919876543210")).toBe("+919876543210");
  });

  it("does not perform any other rewriting", () => {
    expect(normalizePhoneNumber("  09876543210  ")).toBe("09876543210");
  });

  it("returns null for empty/missing input", () => {
    expect(normalizePhoneNumber(null)).toBeNull();
    expect(normalizePhoneNumber(undefined)).toBeNull();
    expect(normalizePhoneNumber("")).toBeNull();
    expect(normalizePhoneNumber("   ")).toBeNull();
  });
});
