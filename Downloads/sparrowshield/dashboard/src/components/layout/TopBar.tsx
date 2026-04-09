import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, BellRing } from "lucide-react";
import { useAlerts } from "../../hooks/useAlerts";

export default function TopBar({ title }: { title: string }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { data: alerts } = useAlerts(undefined, false);
  const openCount = alerts?.length ?? 0;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) navigate(`/?search=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header className="h-14 bg-slate-900/80 backdrop-blur border-b border-slate-800 flex items-center px-6 gap-4 sticky top-0 z-10">
      <h1 className="text-sm font-semibold text-slate-200 flex-shrink-0">{title}</h1>

      <form onSubmit={handleSearch} className="flex-1 max-w-sm ml-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search devices…"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </form>

      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={() => navigate("/alerts")}
          className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <BellRing className="w-4 h-4" />
          {openCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
              {openCount > 9 ? "9+" : openCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
