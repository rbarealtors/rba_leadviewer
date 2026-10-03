"use client";

import { useState, useMemo } from "react";
import { SalesHeader } from "@/components/sales/SalesHeader";
import type { BrochureSalesView } from "@/lib/brochures/types";
import { formatFileSize } from "@/lib/brochures/validate";
import { formatDate } from "@/lib/date-utils";

interface SalesBrochuresClientProps {
  initialBrochures: BrochureSalesView[];
  loadError: boolean;
  userName: string;
  userInitial: string;
}

export function SalesBrochuresClient({
  initialBrochures,
  loadError,
  userName,
  userInitial,
}: SalesBrochuresClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedChip, setSelectedChip] = useState<string>("all");

  // Project chips list (only projects that have active brochures)
  const projectChips = useMemo(() => {
    const set = new Set<string>();
    let hasGeneral = false;

    initialBrochures.forEach((b) => {
      if (b.project_name?.trim()) {
        set.add(b.project_name.trim());
      } else {
        hasGeneral = true;
      }
    });

    const list = Array.from(set).sort();
    return { list, hasGeneral };
  }, [initialBrochures]);

  // Filtered brochures
  const filteredBrochures = useMemo(() => {
    return initialBrochures.filter((b) => {
      // Chip filter
      if (selectedChip !== "all") {
        if (selectedChip === "general") {
          if (b.project_name) return false;
        } else if (b.project_name?.toLowerCase() !== selectedChip.toLowerCase()) {
          return false;
        }
      }

      // Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesTitle = b.title.toLowerCase().includes(term);
        const matchesProject = b.project_name?.toLowerCase().includes(term);
        const matchesDesc = b.description?.toLowerCase().includes(term);
        if (!matchesTitle && !matchesProject && !matchesDesc) {
          return false;
        }
      }

      return true;
    });
  }, [initialBrochures, selectedChip, searchTerm]);

  return (
    <div className="flex flex-col min-h-full bg-slate-50 pb-24">
      <SalesHeader
        title="Brochures"
        subtitle="Resources"
        userInitial={userInitial}
        userName={userName}
        showBack={true}
        backHref="/sales"
      />

      <div className="p-4 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search brochures or projects..."
            className="w-full pl-10 pr-9 py-2.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Project Filter Chips */}
        {(projectChips.list.length > 0 || projectChips.hasGeneral) && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4">
            <button
              type="button"
              onClick={() => setSelectedChip("all")}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                selectedChip === "all"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              All ({initialBrochures.length})
            </button>

            {projectChips.list.map((proj) => {
              const count = initialBrochures.filter(
                (b) => b.project_name?.toLowerCase() === proj.toLowerCase(),
              ).length;

              return (
                <button
                  key={proj}
                  type="button"
                  onClick={() => setSelectedChip(proj)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    selectedChip.toLowerCase() === proj.toLowerCase()
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {proj} ({count})
                </button>
              );
            })}

            {projectChips.hasGeneral && (
              <button
                type="button"
                onClick={() => setSelectedChip("general")}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  selectedChip === "general"
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                General ({initialBrochures.filter((b) => !b.project_name).length})
              </button>
            )}
          </div>
        )}

        {/* Error Banner */}
        {loadError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
            Could not load brochures. Please refresh the page.
          </div>
        )}

        {/* Brochure List */}
        {initialBrochures.length === 0 ? (
          <div className="py-20 flex flex-col items-center text-center px-6">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3 text-slate-400">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              No brochures yet. Ask the office to upload some.
            </h3>
            <p className="text-slate-400 text-xs max-w-[260px]">
              Brochures uploaded by staff or administrators will appear here for you to download.
            </p>
          </div>
        ) : filteredBrochures.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            No brochures matching &quot;{searchTerm}&quot;.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBrochures.map((b) => (
              <div
                key={b.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      {b.project_name ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                          {b.project_name}
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          General
                        </span>
                      )}
                    </div>
                    <h2 className="text-[15px] font-bold text-slate-900 leading-snug">
                      {b.title}
                    </h2>
                    {b.description && (
                      <p className="text-slate-500 text-xs mt-1 line-clamp-2 leading-relaxed">
                        {b.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Meta details & Download CTA */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-400 font-medium">
                    <span>{formatFileSize(Number(b.file_size_bytes))}</span>
                    <span className="mx-1.5">•</span>
                    <span>Updated {formatDate(b.file_uploaded_at || b.updated_at)}</span>
                  </div>

                  <a
                    href={`/api/brochures/${b.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors shadow-xs"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    <span>Download</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
