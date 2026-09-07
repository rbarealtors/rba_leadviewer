import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveGoogleCampaignName,
  resolveGoogleAdGroupName,
  resolvePropertyName,
  invalidateMappingsCache,
} from "../src/lib/leads/google-ads-map";

describe("Campaign and Property ID Mapping", () => {
  beforeEach(() => {
    invalidateMappingsCache();
  });

  it("resolves Google campaign ID 23814107752 to 'Sevoke Road' with string or number type coercion", async () => {
    // Number type
    const mappedNum = await resolveGoogleCampaignName(23814107752);
    expect(mappedNum).toBe("Sevoke Road");

    // String type
    const mappedStr = await resolveGoogleCampaignName("23814107752");
    expect(mappedStr).toBe("Sevoke Road");

    // Whitespace string
    const mappedWhitespace = await resolveGoogleCampaignName("  23814107752  ");
    expect(mappedWhitespace).toBe("Sevoke Road");
  });

  it("resolves Google ad group ID with string or number coercion", async () => {
    const mappedNum = await resolveGoogleAdGroupName(197003307318);
    expect(mappedNum).toBe("Green Retreat");

    const mappedStr = await resolveGoogleAdGroupName("197003307318");
    expect(mappedStr).toBe("Green Retreat");
  });

  it("returns raw string if ID has no mapping", async () => {
    const unknown = await resolveGoogleCampaignName("99999999999");
    expect(unknown).toBe("99999999999");

    const unknownName = await resolveGoogleCampaignName("Some Custom Campaign");
    expect(unknownName).toBe("Some Custom Campaign");
  });

  it("returns null for null or empty campaign / property values", async () => {
    expect(await resolveGoogleCampaignName(null)).toBeNull();
    expect(await resolveGoogleCampaignName(undefined)).toBeNull();
    expect(await resolveGoogleCampaignName("   ")).toBeNull();

    expect(await resolvePropertyName(null)).toBeNull();
    expect(await resolvePropertyName(undefined)).toBeNull();
    expect(await resolvePropertyName("   ")).toBeNull();
  });
});

