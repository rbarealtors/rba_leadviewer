'use client';

import { useState } from 'react';

interface SystemSettingsClientProps {
  initialMaxSourceMb: number;
}

export function SystemSettingsClient({
  initialMaxSourceMb,
}: SystemSettingsClientProps) {
  const [value, setValue] = useState<number>(initialMaxSourceMb);
  const [currentSavedValue, setCurrentSavedValue] = useState<number>(initialMaxSourceMb);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const presets = [
    { label: '50 MB', value: 50 },
    { label: '100 MB', value: 100 },
    { label: '150 MB (Default)', value: 150 },
    { label: '200 MB', value: 200 },
    { label: '250 MB (Max)', value: 250 },
  ];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    const intVal = Math.round(Number(value));
    if (isNaN(intVal) || intVal < 25 || intVal > 250) {
      setErrorMessage('Please enter an integer value between 25 MB and 250 MB.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings/system', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_browser_pdf_source_mb: intVal,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Failed to update system setting.');
      } else {
        setCurrentSavedValue(data.max_browser_pdf_source_mb);
        setValue(data.max_browser_pdf_source_mb);
        setSuccessMessage(
          `Successfully updated: Maximum PDF browser processing limit is now ${data.max_browser_pdf_source_mb} MB.`
        );
      }
    } catch {
      setErrorMessage('Network error while saving setting. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">System Settings</h1>
          <p className="text-xs text-subtle mt-0.5">
            Manage system-wide configuration and file processing limits.
          </p>
        </div>
      </div>

      {/* Main Settings Card */}
      <div className="max-w-3xl">
        <form
          onSubmit={handleSave}
          className="bg-panel border border-line rounded-xl p-6 shadow-2xs space-y-6"
        >
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-line pb-4">
            <div>
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-accent"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Maximum PDF browser processing size
              </h2>
              <p className="text-xs text-subtle mt-1">
                PDFs larger than this will be rejected before browser optimization. This does not change the 25 MB maximum stored brochure size.
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-1.5 bg-canvas border border-line rounded-lg px-2.5 py-1 text-xs">
              <span className="text-subtle font-medium">Current:</span>
              <span className="font-bold text-ink">{currentSavedValue} MB</span>
            </div>
          </div>

          {/* Feedback Banners */}
          {successMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-xs rounded-lg flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Setting Control */}
          <div className="space-y-4">
            <div>
              <label
                htmlFor="pdf-source-limit"
                className="block text-xs font-semibold text-ink mb-1.5"
              >
                Configured Limit (in Megabytes)
              </label>
              <div className="flex items-center gap-3">
                <div className="relative w-44">
                  <input
                    id="pdf-source-limit"
                    type="number"
                    min={25}
                    max={250}
                    step={1}
                    value={value}
                    onChange={(e) => setValue(Number(e.target.value))}
                    className="w-full pl-3 pr-10 py-2 bg-canvas border border-line rounded-lg text-sm font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                    required
                  />
                  <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs text-subtle font-bold">
                    MB
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {presets.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setValue(preset.value)}
                      className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                        value === preset.value
                          ? 'bg-accent/10 border-accent/40 text-accent font-bold'
                          : 'border-line hover:bg-canvas text-subtle hover:text-ink font-medium'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-subtle mt-1.5">
                Allowed range: <strong>25 MB</strong> (storage limit floor) to <strong>250 MB</strong> (browser safety ceiling).
              </p>
            </div>

            {/* Crucial Architectural Distinction Callout */}
            <div className="bg-canvas border border-line rounded-xl p-4 space-y-2.5">
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Understanding Storage &amp; Processing Limits
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-panel border border-line rounded-lg">
                  <div className="font-semibold text-ink flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Browser Processing Limit ({currentSavedValue} MB)
                  </div>
                  <p className="text-subtle text-[11px] mt-1 leading-relaxed">
                    Controls the maximum uncompressed source PDF that staff/admins can select. The browser optimizes embedded images locally before upload.
                  </p>
                </div>
                <div className="p-3 bg-panel border border-line rounded-lg">
                  <div className="font-semibold text-ink flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Final Storage Limit (25 MB)
                  </div>
                  <p className="text-subtle text-[11px] mt-1 leading-relaxed">
                    Strict, immutable server ceiling. Every brochure stored in the cloud library and downloaded by Sales must be 25 MB or under.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-line">
            <div className="text-xs text-subtle">
              Changes take effect immediately for all subsequent brochure uploads and replacements.
            </div>
            <button
              type="submit"
              disabled={saving || value === currentSavedValue}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs transition-colors shadow-sm ${
                saving || value === currentSavedValue
                  ? 'bg-line text-subtle cursor-not-allowed'
                  : 'bg-accent hover:bg-accent/90 text-white'
              }`}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
