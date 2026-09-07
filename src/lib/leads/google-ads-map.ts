import defaultMappings from "./google-ads-map.json";
import { createClient } from "@supabase/supabase-js";

export interface GoogleAdsMappingConfig {
  campaigns: Record<string, string>;
  adgroups: Record<string, string>;
  properties: Record<string, string>;
}

// In-memory cache
let cachedMappings: GoogleAdsMappingConfig | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute

export function invalidateMappingsCache(): void {
  cachedMappings = null;
  lastCacheTime = 0;
}

export async function getActiveMappingsAsync(): Promise<GoogleAdsMappingConfig> {
  const now = Date.now();
  if (cachedMappings && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedMappings;
  }

  const baseConfig: GoogleAdsMappingConfig = {
    campaigns: Object.fromEntries(
      Object.entries(defaultMappings.campaigns || {}).map(([k, v]) => [String(k).trim(), String(v).trim()])
    ),
    adgroups: Object.fromEntries(
      Object.entries(defaultMappings.adgroups || {}).map(([k, v]) => [String(k).trim(), String(v).trim()])
    ),
    properties: Object.fromEntries(
      Object.entries((defaultMappings as any).properties || {}).map(([k, v]) => [String(k).trim(), String(v).trim()])
    ),
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return baseConfig;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    
    const { data, error } = await supabase.from("campaign_mappings").select("*");
    if (error) {
      console.error("Error fetching campaign mappings:", error);
    } else if (data) {
      data.forEach((row) => {
        const rowId = String(row.id ?? "").trim();
        const displayName = String(row.display_name ?? "").trim();
        if (!rowId || !displayName) return;

        if (row.type === "campaign") {
          baseConfig.campaigns[rowId] = displayName;
        } else if (row.type === "adgroup") {
          baseConfig.adgroups[rowId] = displayName;
        } else if (row.type === "property") {
          baseConfig.properties[rowId] = displayName;
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
  const cleanId = String(raw).trim();
  if (!cleanId) return null;

  const idMatch = cleanId.match(/\b(\d{6,15})\b/);
  const id = idMatch && idMatch[1] ? String(idMatch[1]).trim() : cleanId;

  const { campaigns } = await getActiveMappingsAsync();
  const mapped = campaigns[id] ?? campaigns[cleanId];
  if (mapped) {
    return mapped;
  }

  return cleanId;
}

export async function resolveGoogleAdGroupName(
  raw: string | number | null | undefined
): Promise<string | null> {
  if (raw === null || raw === undefined) return null;
  const cleanId = String(raw).trim();
  if (!cleanId) return null;

  const idMatch = cleanId.match(/\b(\d{6,15})\b/);
  const id = idMatch && idMatch[1] ? String(idMatch[1]).trim() : cleanId;

  const { adgroups } = await getActiveMappingsAsync();
  const mapped = adgroups[id] ?? adgroups[cleanId];
  if (mapped) {
    return mapped;
  }

  return cleanId;
}

export async function resolvePropertyName(
  raw: string | number | null | undefined
): Promise<string | null> {
  if (raw === null || raw === undefined) return null;
  const cleanId = String(raw).trim();
  if (!cleanId) return null;

  const idMatch = cleanId.match(/\b([A-Za-z]?\d{6,12})\b/);
  const id = idMatch && idMatch[1] ? String(idMatch[1]).trim() : cleanId;

  const { properties } = await getActiveMappingsAsync();
  const mapped = properties[id] ?? properties[cleanId];
  if (mapped) {
    return mapped;
  }

  return null;
}
