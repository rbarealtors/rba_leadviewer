export default function SalesLoading() {
  return (
    <div className="flex flex-col min-h-full bg-slate-50 animate-pulse">
      <header className="bg-slate-900 text-white px-6 py-5 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="space-y-2">
          <div className="h-6 w-32 bg-slate-800 rounded" />
          <div className="h-4 w-44 bg-slate-800 rounded" />
        </div>
        <div className="w-10 h-10 bg-slate-800 rounded-full" />
      </header>

      <div className="p-6 space-y-8">
        <section className="space-y-3">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-20 bg-white rounded-xl border border-slate-200" />
          <div className="h-20 bg-white rounded-xl border border-slate-200" />
        </section>

        <section className="space-y-3">
          <div className="h-4 w-36 bg-slate-200 rounded" />
          <div className="h-20 bg-white rounded-xl border border-slate-200" />
        </section>
      </div>
    </div>
  );
}

