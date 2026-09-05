import defaultMappings from "./google-ads-map.json";
import { createClient } from "@supabase/supabase-js";

export interface GoogleAdsMappingConfig {
  campaigns: Record<string, string>;
  adgroups: Record<string, string>;
}

// In-memory cache
let cachedMappings: {
  campaigns: Record<string, string>;
  adgroups: Record<string, string>;
} | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute

export async function getActiveMappingsAsync() {
  const now = Date.now();
  if (cachedMappings && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedMappings;
  }

  const baseConfig: GoogleAdsMappingConfig = {
    campaigns: { ...(defaultMappings.campaigns || {}) },
    adgroups: { ...(defaultMappings.adgroups || {}) },
  };

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
    
    const { data, error } = await supabase.from("campaign_mappings").select("*");
    if (error) {
      console.error("Error fetching campaign mappings:", error);
    } else if (data) {
      data.forEach((row) => {
        if (row.type === "campaign") {
          baseConfig.campaigns[row.id as string] = row.display_name;
        } else if (row.type === "adgroup") {
          baseConfig.adgroups[row.id as string] = row.display_name;
        }
      });
    }
    
    cachedMappings = baseConfig;
    lastCacheTime = now;
  } catch (err) {
    console.error("Failed to load mappings dynamically", err);
  }

  return baseConfig;
}

export async function resolveGoogleCampaignName(
  raw: string | number | null | undefined
): Promise<string | null> {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;

  const idMatch = str.match(/\b(\d{6,15})\b/);
  const id = idMatch && idMatch[1] ? idMatch[1] : str;

  const { campaigns } = await getActiveMappingsAsync();
  const mapped = id ? campaigns[id as string] : undefined;
  if (mapped) {
    return mapped;
  }

  return str;
}

export async function resolveGoogleAdGroupName(
  raw: string | number | null | undefined
): Promise<string | null> {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;

  const idMatch = str.match(/\b(\d{6,15})\b/);
  const id = idMatch && idMatch[1] ? idMatch[1] : str;

  const { adgroups } = await getActiveMappingsAsync();
  const mapped = id ? adgroups[id as string] : undefined;
  if (mapped) {
    return mapped;
  }

  return str;
}
