import type { LeadPlatform, LeadSource } from "@/lib/leads/types";

export function SourceBadge({
  source,
  platform,
  className = "",
}: {
  source: LeadSource;
  platform?: LeadPlatform;
  className?: string;
}) {
  if (source === "meta_ads") {
    const platformLabel = platform === "instagram" ? "Instagram" : platform === "facebook" ? "Facebook" : "Meta";
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 shadow-sm ${className}`}
        title={`Source: Meta Ads (${platformLabel})`}
      >
        {/* Meta / Infinity symbol */}
        <svg className="w-3 h-3 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 4.5C7.3 4.5 3.5 8.3 3.5 13s3.8 8.5 8.5 8.5 8.5-3.8 8.5-8.5-3.8-8.5-8.5-8.5zm4.8 11.2c-1.3 0-2.4-.7-3.1-1.7-.4.6-.9 1.1-1.5 1.4-.6.3-1.3.4-2 .3-1.6-.3-2.8-1.7-2.7-3.4.1-1.7 1.5-3 3.2-3 1.1 0 2.1.6 2.7 1.5.6-.9 1.6-1.5 2.7-1.5 1.8 0 3.2 1.4 3.2 3.2 0 1.8-1.4 3.2-3.2 3.2z" />
        </svg>
        <span>{platform === "instagram" ? "Meta · IG" : platform === "facebook" ? "Meta · FB" : "Meta Ads"}</span>
      </span>
    );
  }

  if (source === "99acres") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200 shadow-sm ${className}`}
        title="Source: 99acres"
      >
        <span className="w-2 h-2 rounded-full bg-teal-600 shrink-0" aria-hidden />
        <span>99acres</span>
      </span>
    );
  }

  if (source === "magicbricks") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 shadow-sm ${className}`}
        title="Source: MagicBricks"
      >
        <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0" aria-hidden />
        <span>MagicBricks</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm ${className}`}
      title="Source: Google Ads"
    >
      {/* Google Ads icon symbol */}
      <svg className="w-3 h-3 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z" />
      </svg>
      <span>Google Ads</span>
    </span>
  );
}
