"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import {
  previewMetaCsvAction,
  executeMetaImportAction,
  type PreviewResult,
  type ImportExecutionResult,
} from "./actions";
import type { AnalyzedMetaRow, ImportRowStatus } from "@/lib/leads/import-meta-csv";
import { formatIST } from "@/lib/time";

export function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"ALL" | ImportRowStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportExecutionResult | null>(null);

  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setErrorMessage(null);
    setPreview(null);
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    startTransition(async () => {
      const res = await previewMetaCsvAction(formData);
      if (res.error) {
        setErrorMessage(res.error);
      } else if (res.data) {
        setPreview(res.data);
        // Pre-select all actionable leads (NEW and REPEAT_INQUIRER)
        const actionable = new Set<string>();
        for (const row of res.data.rows) {
          if (row.status === "NEW" || row.status === "REPEAT_INQUIRER") {
            actionable.add(row.externalLeadId);
          }
        }
        setSelectedIds(actionable);
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0]!;
      if (droppedFile.name.endsWith(".csv") || droppedFile.type === "text/csv") {
        handleFileSelect(droppedFile);
      } else {
        setErrorMessage("Please upload a .csv file.");
      }
    }
  };

  const handleConfirmImport = () => {
    if (!preview || selectedIds.size === 0) return;

    // Filter rows to import based on selection
    const rowsToImport = preview.rows
      .filter((r) => selectedIds.has(r.externalLeadId) && (r.status === "NEW" || r.status === "REPEAT_INQUIRER"))
      .map((r) => ({
        rowNumber: r.rowNumber,
        rawId: r.rawId,
        externalLeadId: r.externalLeadId,
        fullName: r.fullName,
        phoneNumber: r.phoneNumber,
        email: r.email,
        campaignName: r.campaignName,
        campaignId: r.campaignId,
        adGroupName: r.adGroupName,
        adsetName: r.adsetName,
        adName: r.adName,
        formId: r.formId,
        formName: r.formName,
        platform: r.platform,
        sourceSubmittedAt: r.sourceSubmittedAt,
        rawPayload: r.rawPayload,
        isValid: r.isValid,
      }));

    startTransition(async () => {
      const res = await executeMetaImportAction({
        rowsToImport,
        filename: preview.filename,
      });

      if (res.error) {
        setErrorMessage(res.error);
      } else if (res.data) {
        setImportResult(res.data);
      }
    });
  };

  const handleToggleSelectAllActionable = () => {
    if (!preview) return;
    const actionable = preview.rows.filter(
      (r) => r.status === "NEW" || r.status === "REPEAT_INQUIRER"
    );
    const allSelected = actionable.every((r) => selectedIds.has(r.externalLeadId));

    const next = new Set(selectedIds);
    if (allSelected) {
      for (const r of actionable) next.delete(r.externalLeadId);
    } else {
      for (const r of actionable) next.add(r.externalLeadId);
    }
    setSelectedIds(next);
  };

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setSelectedIds(new Set());
    setErrorMessage(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Filter rows for display in table
  const filteredRows = (preview?.rows || []).filter((row) => {
    if (activeTab !== "ALL" && row.status !== activeTab) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = row.fullName?.toLowerCase().includes(q);
      const matchPhone = row.phoneNumber?.includes(q);
      const matchCamp = row.campaignName?.toLowerCase().includes(q);
      const matchId = row.externalLeadId.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchCamp && !matchId) return false;
    }
    return true;
  });

  const selectedActionableCount = Array.from(selectedIds).filter((id) => {
    const row = preview?.rows.find((r) => r.externalLeadId === id);
    return row && (row.status === "NEW" || row.status === "REPEAT_INQUIRER");
  }).length;

  return (
    <div className="space-y-6">
      {/* Top Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-900">Validation Error</h3>
            <p className="text-xs text-red-700 mt-0.5">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs font-semibold text-red-700 hover:text-red-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Step 3: Completed Result */}
      {importResult ? (
        <div className="bg-white border border-line rounded-xl p-8 shadow-xs text-center max-w-2xl mx-auto space-y-6">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-bold text-ink">Import Completed</h2>
            <p className="text-subtle text-sm mt-1">
              File <span className="font-semibold text-ink">{preview?.filename}</span> has been processed.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 border border-line rounded-lg p-4 bg-canvas/50">
            <div>
              <p className="text-2xl font-bold text-emerald-700">{importResult.createdCount}</p>
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mt-0.5">Leads Created</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-700">{importResult.alreadyExistedCount}</p>
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mt-0.5">Already in CRM</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{importResult.failedCount}</p>
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider mt-0.5">Failed</p>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="text-left bg-red-50 border border-red-100 p-4 rounded-lg">
              <h4 className="text-xs font-bold text-red-900 uppercase tracking-wider">Errors Encountered</h4>
              <ul className="text-xs text-red-700 mt-1 space-y-1 list-disc list-inside">
                {importResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/leads"
              className="bg-accent hover:bg-accent-hover text-white text-sm font-semibold py-2.5 px-6 rounded-lg transition-colors shadow-2xs"
            >
              View Leads in CRM
            </Link>
            <button
              type="button"
              onClick={handleReset}
              className="bg-panel hover:bg-canvas text-ink border border-line text-sm font-semibold py-2.5 px-5 rounded-lg transition-colors"
            >
              Import Another File
            </button>
          </div>
        </div>
      ) : !preview ? (
        /* Step 1: Upload Dropzone */
        <div className="bg-white border border-line rounded-xl p-8 shadow-xs">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-accent bg-accent-soft/30"
                : "border-line hover:border-accent hover:bg-canvas/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelect(e.target.files[0]!);
                }
              }}
              className="hidden"
            />

            <div className="w-14 h-14 bg-accent-soft text-accent rounded-full flex items-center justify-center mx-auto mb-4">
              {isPending ? (
                <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
            </div>

            <h3 className="text-base font-bold text-ink">
              {isPending ? "Reading & Validating CSV..." : "Upload Meta Lead Ads CSV"}
            </h3>
            <p className="text-subtle text-xs mt-1.5 max-w-sm mx-auto">
              Drag and drop your Meta Lead Ads export file here, or click to browse. Supports UTF-16LE, UTF-8,
              tab-delimited, and comma-delimited Meta files.
            </p>
            <p className="text-[11px] text-subtle mt-4 font-mono">Maximum file size: 20 MB</p>
          </div>
        </div>
      ) : (
        /* Step 2: Preview & Validation Screen */
        <div className="space-y-6">
          {/* File Meta Header Bar */}
          <div className="bg-white border border-line rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent-soft text-accent rounded-lg flex items-center justify-center font-bold text-xs uppercase">
                CSV
              </div>
              <div>
                <h2 className="text-base font-bold text-ink">{preview.filename}</h2>
                <div className="flex items-center gap-3 text-xs text-subtle mt-0.5">
                  <span>{preview.totalRows} total records</span>
                  <span>•</span>
                  <span className="uppercase">Encoding: {preview.encoding}</span>
                  <span>•</span>
                  <span>Delimiter: {preview.delimiter === "\t" ? "Tab (TSV)" : "Comma"}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              className="text-xs font-semibold text-subtle hover:text-ink border border-line hover:bg-canvas rounded-lg px-3.5 py-2 transition-colors"
            >
              Upload Different File
            </button>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div
              onClick={() => setActiveTab("NEW")}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                activeTab === "NEW"
                  ? "bg-emerald-50/80 border-emerald-500 shadow-xs"
                  : "bg-white border-line hover:border-slate-300"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">New Leads</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-emerald-700 mt-2">{preview.summary.newCount}</p>
              <p className="text-[11px] text-emerald-600 mt-1">Ready for normal creation</p>
            </div>

            <div
              onClick={() => setActiveTab("REPEAT_INQUIRER")}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                activeTab === "REPEAT_INQUIRER"
                  ? "bg-amber-50/80 border-amber-500 shadow-xs"
                  : "bg-white border-line hover:border-slate-300"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Repeat Inquirers</span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              </div>
              <p className="text-2xl font-bold text-amber-700 mt-2">{preview.summary.repeatInquirerCount}</p>
              <p className="text-[11px] text-amber-600 mt-1">Contact exists in other campaign</p>
            </div>

            <div
              onClick={() => setActiveTab("ALREADY_IN_CRM")}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                activeTab === "ALREADY_IN_CRM"
                  ? "bg-slate-100 border-slate-400 shadow-xs"
                  : "bg-white border-line hover:border-slate-300"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Already in CRM</span>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              </div>
              <p className="text-2xl font-bold text-slate-700 mt-2">{preview.summary.alreadyInCrmCount}</p>
              <p className="text-[11px] text-slate-500 mt-1">Exact Meta ID already exists (skipped)</p>
            </div>

            <div
              onClick={() => setActiveTab("INVALID")}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                activeTab === "INVALID"
                  ? "bg-red-50/80 border-red-500 shadow-xs"
                  : "bg-white border-line hover:border-slate-300"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-red-800 uppercase tracking-wider">Invalid Rows</span>
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              </div>
              <p className="text-2xl font-bold text-red-600 mt-2">{preview.summary.invalidCount}</p>
              <p className="text-[11px] text-red-500 mt-1">Missing ID, phone, or duplicate in file</p>
            </div>
          </div>

          {/* Action Bar & Filter Tabs */}
          <div className="bg-white border border-line rounded-xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-line flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("ALL")}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                    activeTab === "ALL" ? "bg-accent text-white" : "bg-panel text-ink hover:bg-canvas"
                  }`}
                >
                  All Rows ({preview.totalRows})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("NEW")}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                    activeTab === "NEW" ? "bg-emerald-600 text-white" : "bg-panel text-ink hover:bg-canvas"
                  }`}
                >
                  New ({preview.summary.newCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("REPEAT_INQUIRER")}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                    activeTab === "REPEAT_INQUIRER"
                      ? "bg-amber-600 text-white"
                      : "bg-panel text-ink hover:bg-canvas"
                  }`}
                >
                  Repeat Inquirers ({preview.summary.repeatInquirerCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("ALREADY_IN_CRM")}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                    activeTab === "ALREADY_IN_CRM"
                      ? "bg-slate-700 text-white"
                      : "bg-panel text-ink hover:bg-canvas"
                  }`}
                >
                  Already in CRM ({preview.summary.alreadyInCrmCount})
                </button>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Filter preview..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-xs bg-panel border border-line rounded-lg px-3 py-1.5 text-ink focus:outline-hidden focus:border-accent w-48"
                />
                <button
                  type="button"
                  onClick={handleToggleSelectAllActionable}
                  className="text-xs font-semibold text-accent hover:underline whitespace-nowrap"
                >
                  Toggle All Actionable
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-panel border-b border-line text-subtle font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          selectedActionableCount > 0 &&
                          selectedActionableCount ===
                            preview.summary.newCount + preview.summary.repeatInquirerCount
                        }
                        onChange={handleToggleSelectAllActionable}
                        className="rounded border-line text-accent focus:ring-accent"
                      />
                    </th>
                    <th className="px-4 py-3 whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 whitespace-nowrap">Lead Name</th>
                    <th className="px-4 py-3 whitespace-nowrap">Phone</th>
                    <th className="px-4 py-3 whitespace-nowrap">Campaign / Project</th>
                    <th className="px-4 py-3 whitespace-nowrap">Ad Name / Adset</th>
                    <th className="px-4 py-3 whitespace-nowrap">Platform</th>
                    <th className="px-4 py-3 whitespace-nowrap">Submitted Date (IST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-ink font-medium">
                  {filteredRows.map((row) => {
                    const isActionable = row.status === "NEW" || row.status === "REPEAT_INQUIRER";
                    const isSelected = selectedIds.has(row.externalLeadId);

                    return (
                      <tr
                        key={`${row.externalLeadId}-${row.rowNumber}`}
                        className={`hover:bg-slate-50 transition-colors ${
                          !isActionable ? "opacity-60 bg-slate-50/50" : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isActionable}
                            onChange={() => handleToggleRow(row.externalLeadId)}
                            className="rounded border-line text-accent focus:ring-accent disabled:opacity-30 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.status === "NEW" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              NEW
                            </span>
                          )}
                          {row.status === "REPEAT_INQUIRER" && (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                REPEAT INQUIRER
                              </span>
                              {row.matchedLead && (
                                <span className="text-[10px] text-amber-800 font-normal">
                                  Prior: {row.matchedLead.campaign_name || "Existing contact"}
                                </span>
                              )}
                            </div>
                          )}
                          {row.status === "ALREADY_IN_CRM" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              ALREADY IN CRM
                            </span>
                          )}
                          {row.status === "INVALID" && (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                                INVALID
                              </span>
                              <span className="text-[10px] text-red-600 font-normal">{row.statusReason}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold">
                          {row.fullName || "—"}
                          <p className="text-[10px] text-subtle font-mono">{row.externalLeadId}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono">{row.phoneNumber || "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{row.campaignName || "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-subtle">
                          {row.adName || row.adGroupName || "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.platform === "facebook" ? (
                            <span className="inline-flex items-center gap-1 text-blue-600 font-semibold text-[11px]">
                              Facebook
                            </span>
                          ) : row.platform === "instagram" ? (
                            <span className="inline-flex items-center gap-1 text-pink-600 font-semibold text-[11px]">
                              Instagram
                            </span>
                          ) : (
                            <span className="text-subtle text-[11px]">Meta</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-subtle">
                          {formatIST(row.sourceSubmittedAt)}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-subtle">
                        No rows match the selected filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Confirmation Bar */}
            <div className="p-4 bg-slate-50 border-t border-line flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs text-subtle">
                <span className="font-bold text-ink">{selectedActionableCount}</span> leads selected for import (
                {preview.summary.alreadyInCrmCount} already in CRM will be skipped).
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isPending}
                  className="text-xs font-semibold text-subtle hover:text-ink px-4 py-2 rounded-lg border border-line bg-white hover:bg-canvas transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isPending || selectedActionableCount === 0}
                  className={`flex items-center gap-2 text-xs font-bold px-6 py-2.5 rounded-lg transition-colors shadow-xs ${
                    selectedActionableCount > 0 && !isPending
                      ? "bg-accent hover:bg-accent-hover text-white cursor-pointer"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {isPending ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span>Importing Leads...</span>
                    </>
                  ) : (
                    <span>Confirm & Import {selectedActionableCount} Leads</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

