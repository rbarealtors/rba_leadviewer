"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mapping = {
  id: string;
  type: "campaign" | "adgroup";
  display_name: string;
  updated_at: string;
};

type UnmappedInfo = {
  id: string;
  type: "campaign" | "adgroup";
};

export function CampaignMappingsClient({
  initialMappings,
  unmappedIds,
}: {
  initialMappings: Mapping[];
  unmappedIds: UnmappedInfo[];
}) {
  const router = useRouter();
  const [mappings, setMappings] = useState<Mapping[]>(initialMappings);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    type: "campaign" as "campaign" | "adgroup",
    id: "",
    display_name: "",
  });

  const campaigns = mappings.filter((m) => m.type === "campaign");
  const adgroups = mappings.filter((m) => m.type === "adgroup");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.id || !form.display_name) return;
    
    setSaving(true);
    try {
      const res = await fetch("/api/settings/campaign-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      
      if (!res.ok) {
        throw new Error("Failed to save mapping");
      }
      
      // Reset form on success
      setForm({ type: "campaign", id: "", display_name: "" });
      router.refresh(); // Refresh page to get latest data
    } catch (err) {
      alert("Error saving mapping");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this mapping?")) return;
    try {
      await fetch(`/api/settings/campaign-mappings?id=${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert("Error deleting mapping");
    }
  }

  function handleMapUnmapped(unmapped: UnmappedInfo) {
    setForm({
      type: unmapped.type,
      id: unmapped.id,
      display_name: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric"
    });
  }

  return (
    <div className="space-y-8">
      {/* Add New Mapping Form */}
      <div className="bg-panel border border-line rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-ink mb-4">Add or Edit Mapping</h2>
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as "campaign" | "adgroup" })}
              className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="campaign">Campaign</option>
              <option value="adgroup">Ad Group / Ad Set</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Numeric ID</label>
            <input
              type="text"
              required
              placeholder="e.g. 23814107752"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value.replace(/\\D/g, "") })}
              className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Display Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Search - 2 BHK"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={saving}
              className="w-full h-[38px] bg-accent hover:bg-[#1a3d33] text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Mapping"}
            </button>
          </div>
        </form>
      </div>

      {/* Unmapped Detected */}
      {unmappedIds.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-amber-900 mb-2">Unmapped IDs Detected</h2>
          <p className="text-sm text-amber-800 mb-4">
            We found raw numeric IDs in recent Google Ads leads. Map them so they appear correctly in your dashboard.
          </p>
          <div className="flex flex-wrap gap-3">
            {unmappedIds.map((u) => (
              <div key={u.id} className="flex items-center gap-2 bg-white border border-amber-200 rounded-md px-3 py-1.5 shadow-sm text-sm">
                <span className="font-mono text-amber-900">{u.id}</span>
                <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded uppercase font-medium">{u.type}</span>
                <button
                  onClick={() => handleMapUnmapped(u)}
                  className="ml-2 text-xs font-semibold text-accent hover:underline"
                >
                  Map Name &rarr;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing Mappings Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <MappingTable title="Campaigns" items={campaigns} onDelete={handleDelete} onEdit={setForm} formatDate={formatDate} />
        <MappingTable title="Ad Groups" items={adgroups} onDelete={handleDelete} onEdit={setForm} formatDate={formatDate} />
      </div>
    </div>
  );
}

function MappingTable({
  title,
  items,
  onDelete,
  onEdit,
  formatDate
}: {
  title: string;
  items: Mapping[];
  onDelete: (id: string) => void;
  onEdit: (mapping: { id: string; type: "campaign" | "adgroup"; display_name: string }) => void;
  formatDate: (iso: string) => string;
}) {
  return (
    <div className="bg-panel border border-line rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-line bg-canvas">
        <h3 className="font-bold text-ink">{title}</h3>
      </div>
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="p-8 text-center text-subtle text-sm">No mappings found.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-canvas border-b border-line sticky top-0">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-subtle uppercase tracking-wider">ID</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-subtle uppercase tracking-wider">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-subtle uppercase tracking-wider">Updated</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-subtle uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-panel">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-canvas/50 transition-colors group">
                  <td className="px-4 py-3 text-sm font-mono text-subtle">{item.id}</td>
                  <td className="px-4 py-3 text-sm font-medium text-ink">{item.display_name}</td>
                  <td className="px-4 py-3 text-xs text-subtle">{formatDate(item.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(item)} className="p-1 text-subtle hover:text-accent" title="Edit">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </button>
                      <button onClick={() => onDelete(item.id)} className="p-1 text-subtle hover:text-red-600" title="Delete">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

