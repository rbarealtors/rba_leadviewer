import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/authorization";
import { AppHeader } from "@/app/AppHeader";
import { getAttributionReportAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AttributionReportPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || (!isAdmin(user) && user.app_metadata?.role !== "staff")) {
    return (
      <div className="h-screen bg-canvas flex flex-col overflow-hidden">
        <AppHeader email={user?.email} isAdmin={isAdmin(user)} />
        <main className="max-w-[1400px] mx-auto px-6 py-5">
          <p className="text-red-600">Not authorized to view reports.</p>
        </main>
      </div>
    );
  }

  const { data: reportData, error } = await getAttributionReportAction();

  const totalLeads = reportData?.reduce((acc, row) => acc + row.leads, 0) || 0;
  const totalContacted = reportData?.reduce((acc, row) => acc + row.contacted, 0) || 0;
  const totalInterested = reportData?.reduce((acc, row) => acc + row.interested, 0) || 0;
  const totalSiteVisit = reportData?.reduce((acc, row) => acc + row.siteVisit, 0) || 0;
  const totalClosedWon = reportData?.reduce((acc, row) => acc + row.closedWon, 0) || 0;

  return (
    <div className="h-screen bg-canvas flex flex-col overflow-hidden">
      <AppHeader email={user?.email} isAdmin={isAdmin(user)} />

      <main className="max-w-[1400px] w-full mx-auto px-6 pt-6 pb-6 flex-1 flex flex-col min-h-0">
        {/* Stationary Page Title / Subtitle */}
        <div className="mb-4 flex-shrink-0">
          <h1 className="text-2xl font-bold text-ink">Attribution / ROI Report</h1>
          <p className="text-subtle text-sm mt-1">
            CRM funnel progression aggregated by Lead Source and Campaign.
          </p>
        </div>

        {error ? (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex-shrink-0">
            {error}
          </div>
        ) : (
          /* Stationary Card Container containing the Scrollable Table Area */
          <div className="flex-1 min-h-0 bg-white border border-line rounded-xl shadow-xs flex flex-col overflow-hidden">
            {/* Scrollable Table Area: Only this element scrolls vertically when rows exceed viewport */}
            <div
              className="overflow-y-auto overflow-x-auto flex-1 focus:outline-hidden"
              tabIndex={0}
              aria-label="Attribution funnel report table"
            >
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-panel border-b border-line text-xs font-semibold text-subtle uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5 whitespace-nowrap bg-panel">Source</th>
                    <th className="px-6 py-3.5 whitespace-nowrap bg-panel">Campaign</th>
                    <th className="px-6 py-3.5 whitespace-nowrap text-right bg-panel">Leads</th>
                    <th className="px-6 py-3.5 whitespace-nowrap text-right bg-panel">Contacted</th>
                    <th className="px-6 py-3.5 whitespace-nowrap text-right bg-panel">Interested</th>
                    <th className="px-6 py-3.5 whitespace-nowrap text-right bg-panel">Site Visit</th>
                    <th className="px-6 py-3.5 whitespace-nowrap text-right bg-panel">Closed Won</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-sm text-ink font-medium">
                  {reportData?.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <span className="capitalize">{row.source.replace(/_/g, " ")}</span>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">{row.campaign}</td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-right">{row.leads}</td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-right">{row.contacted}</td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-right">{row.interested}</td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-right">{row.siteVisit}</td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-right font-bold text-green-700">
                        {row.closedWon}
                      </td>
                    </tr>
                  ))}
                  {reportData?.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-subtle font-normal">
                        No attribution data available.
                      </td>
                    </tr>
                  )}
                </tbody>
                {reportData && reportData.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10 bg-slate-50 border-t border-line font-bold text-ink shadow-2xs">
                    <tr>
                      <td colSpan={2} className="px-6 py-3.5 text-right bg-slate-50">Total:</td>
                      <td className="px-6 py-3.5 text-right bg-slate-50">{totalLeads}</td>
                      <td className="px-6 py-3.5 text-right bg-slate-50">{totalContacted}</td>
                      <td className="px-6 py-3.5 text-right bg-slate-50">{totalInterested}</td>
                      <td className="px-6 py-3.5 text-right bg-slate-50">{totalSiteVisit}</td>
                      <td className="px-6 py-3.5 text-right text-green-700 bg-slate-50">{totalClosedWon}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
