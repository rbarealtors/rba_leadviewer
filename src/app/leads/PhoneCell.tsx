"use client";

import { useState } from "react";
import { buildWhatsAppUrl, sanitizePhoneForCopy } from "@/lib/leads/formatters";

export function PhoneCell({
  phone,
  fullName,
  campaignName,
  showLabels = true,
}: {
  phone: string | null | undefined;
  fullName: string | null | undefined;
  campaignName: string | null | undefined;
  showLabels?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (!phone || !phone.trim()) {
    return <span className="text-subtle">—</span>;
  }

  const cleanDisplay = phone.replace(/^p:/i, "").trim();
  const waUrl = buildWhatsAppUrl(phone, fullName, campaignName);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    const toCopy = sanitizePhoneForCopy(phone);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(toCopy);
      } else {
        // Fallback for older/restricted clipboard contexts
        const textarea = document.createElement("textarea");
        textarea.value = toCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex flex-col gap-2 py-0.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        <a
          href={`tel:${sanitizePhoneForCopy(phone)}`}
          title={`Call ${cleanDisplay}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[13px] font-semibold text-ink hover:text-accent hover:underline decoration-accent/30 underline-offset-2"
        >
          {cleanDisplay}
        </a>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Copy button */}
        <button
          type="button"
          onClick={handleCopy}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors shrink-0 ${
            copied
              ? "bg-emerald-50 text-emerald-700 border-emerald-300"
              : "bg-panel text-subtle hover:text-ink border-line hover:bg-canvas"
          }`}
          title={copied ? "Copied to clipboard!" : "Copy phone number"}
        >
          {copied ? (
            <>
              <svg className="w-3 h-3 text-emerald-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              {showLabels && <span>Copied</span>}
            </>
          ) : (
            <>
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>Copy</span>
            </>
          )}
        </button>

        {/* WhatsApp button */}
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-xs transition-colors shrink-0 border border-[#25D366]"
            title="Open WhatsApp Web chat"
          >
            {/* WhatsApp speech bubble icon */}
            <svg className="w-3 h-3 shrink-0 fill-current" viewBox="0 0 24 24">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
            </svg>
            {showLabels && <span>WhatsApp</span>}
          </a>
        )}
      </div>
    </div>
  );
}
