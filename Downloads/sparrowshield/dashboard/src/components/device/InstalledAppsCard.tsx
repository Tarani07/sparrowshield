import { useState, useMemo } from "react";
import { Package, Search, ArrowUpDown } from "lucide-react";
import { cn } from "../../lib/utils";

interface InstalledApp {
  name: string;
  version: string;
  path?: string;
  last_modified?: string;
}

interface Props {
  apps: InstalledApp[];
}

type SortKey = "name" | "version";

export default function InstalledAppsCard({ apps }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.version.toLowerCase().includes(q)
    );
    list.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list;
  }, [apps, search, sortKey, sortAsc]);

  const displayed = showAll ? filtered : filtered.slice(0, 20);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  if (!apps || apps.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Package className="w-4 h-4 text-indigo-400" />
          Installed Applications
        </h2>
        <p className="text-xs text-slate-600 mt-3 text-center py-4">
          No app inventory yet — agent sends this data hourly
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-400" />
            Installed Applications
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {apps.length} apps found
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-5 py-2 bg-slate-950/40 border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
        <span className="w-8">#</span>
        <button
          onClick={() => toggleSort("name")}
          className="flex-1 flex items-center gap-1 hover:text-slate-300 transition-colors"
        >
          Application
          {sortKey === "name" && (
            <ArrowUpDown className="w-3 h-3" />
          )}
        </button>
        <button
          onClick={() => toggleSort("version")}
          className="w-32 text-right flex items-center justify-end gap-1 hover:text-slate-300 transition-colors"
        >
          Version
          {sortKey === "version" && (
            <ArrowUpDown className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* App list */}
      <div className="divide-y divide-slate-800/40 max-h-[500px] overflow-y-auto">
        {displayed.map((app, i) => (
          <div
            key={`${app.name}-${i}`}
            className="flex items-center px-5 py-2.5 hover:bg-slate-800/30 transition-colors"
          >
            <span className="w-8 text-[10px] text-slate-600 font-mono">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">
                {app.name}
              </p>
              {app.path && (
                <p className="text-[10px] text-slate-600 truncate">
                  {app.path.replace(/^\/Applications\//, "")}
                </p>
              )}
            </div>
            <span
              className={cn(
                "w-32 text-right text-xs font-mono",
                app.version ? "text-slate-400" : "text-slate-700"
              )}
            >
              {app.version || "—"}
            </span>
          </div>
        ))}
      </div>

      {/* Show more / less */}
      {filtered.length > 20 && (
        <div className="border-t border-slate-800 px-5 py-2 text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
          >
            {showAll
              ? "Show less"
              : `Show all ${filtered.length} apps`}
          </button>
        </div>
      )}
    </div>
  );
}
