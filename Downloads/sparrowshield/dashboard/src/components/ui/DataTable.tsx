// Enterprise data grid: search, faceted filters, sortable columns, pagination,
// CSV export and row selection — shared by every list in the console.
import { useMemo, useState, type ReactNode } from "react";
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, Download, X, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { cn } from "../../lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  /** Value used for sorting and CSV; defaults to row[key]. */
  value?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  width?: string;
  className?: string;
  /** Hide on narrow screens. */
  hideBelow?: "md" | "lg" | "xl";
}

export interface FilterDef<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  get: (row: T) => string | string[] | null | undefined;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  /** Text searched by the search box; defaults to all column values. */
  searchText?: (row: T) => string;
  filters?: FilterDef<T>[];
  initialFilters?: Record<string, string>;
  initialSort?: { key: string; dir: "asc" | "desc" };
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  pageSize?: number;
  exportName?: string;
  toolbar?: ReactNode;
  loading?: boolean;
  empty?: ReactNode;
  rowTone?: (row: T) => string | undefined;
}

const HIDE: Record<string, string> = { md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" };

export default function DataTable<T>({
  rows, columns, rowKey, searchPlaceholder = "Search…", searchText, filters = [], initialFilters = {},
  initialSort, onRowClick, selectedKey, pageSize = 25, exportName, toolbar, loading, empty, rowTone,
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Record<string, string>>(initialFilters);
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const valueOf = (c: Column<T>, r: T) =>
    c.value ? c.value(r) : ((r as Record<string, unknown>)[c.key] as string | number | null | undefined);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      for (const f of filters) {
        const want = active[f.key];
        if (!want) continue;
        const got = f.get(r);
        const vals = Array.isArray(got) ? got : [got ?? ""];
        if (!vals.map(v => String(v).toLowerCase()).includes(want.toLowerCase())) return false;
      }
      if (!q) return true;
      const hay = searchText
        ? searchText(r)
        : columns.map(c => valueOf(c, r)).filter(v => v != null).join(" ");
      return hay.toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, active, filters, columns, searchText]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = valueOf(col, a), vb = valueOf(col, b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);
  const activeCount = Object.values(active).filter(Boolean).length;

  function toggleSort(key: string) {
    setSort(s => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = columns.map(c => esc(c.header)).join(",");
    const body = sorted.map(r => columns.map(c => esc(valueOf(c, r))).join(",")).join("\n");
    const blob = new Blob([head + "\n" + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="rounded-lg border min-w-0" style={{ background: "var(--c-card)", borderColor: "var(--c-border)", boxShadow: "var(--c-shadow)" }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: "var(--c-border)" }}>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--c-muted)" }} />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(0); }}
            placeholder={searchPlaceholder}
            className="w-full h-8 pl-8 pr-7 rounded-md border text-[13px] outline-none focus:border-[var(--c-accent)]"
            style={{ background: "var(--c-card2)", borderColor: "var(--c-border2)", color: "var(--c-strong)" }}
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--c-muted)" }} aria-label="Clear search">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {filters.map(f => (
          <label key={f.key} className="relative">
            <span className="sr-only">{f.label}</span>
            <select
              value={active[f.key] ?? ""}
              onChange={e => { setActive(a => ({ ...a, [f.key]: e.target.value })); setPage(0); }}
              className="h-8 pl-2.5 pr-7 rounded-md border text-[12px] font-medium outline-none appearance-none cursor-pointer focus:border-[var(--c-accent)]"
              style={{
                background: active[f.key] ? "var(--c-accent-bg)" : "var(--c-card2)",
                borderColor: active[f.key] ? "var(--c-accent)" : "var(--c-border2)",
                color: active[f.key] ? "var(--c-accent)" : "var(--c-text)",
              }}
            >
              <option value="">{f.label}: All</option>
              {f.options.map(o => <option key={o.value} value={o.value}>{f.label}: {o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--c-muted)" }} />
          </label>
        ))}

        {activeCount > 0 && (
          <button onClick={() => setActive({})} className="h-8 px-2 text-[12px] font-medium flex items-center gap-1" style={{ color: "var(--c-accent)" }}>
            <Filter className="w-3.5 h-3.5" /> Clear {activeCount} filter{activeCount > 1 ? "s" : ""}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          {exportName && (
            <button onClick={exportCsv} disabled={!sorted.length}
              className="h-8 px-2.5 rounded-md border text-[12px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: "var(--c-card2)", borderColor: "var(--c-border2)", color: "var(--c-text)" }}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr style={{ background: "var(--c-card2)" }}>
              {columns.map(c => {
                const sortable = c.sortable !== false;
                const on = sort?.key === c.key;
                return (
                  <th key={c.key}
                    className={cn("h-9 px-3 text-[11px] font-semibold uppercase tracking-[0.05em] whitespace-nowrap border-b select-none",
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                      c.hideBelow && HIDE[c.hideBelow])}
                    style={{ color: on ? "var(--c-strong)" : "var(--c-muted)", borderColor: "var(--c-border)", width: c.width }}>
                    {sortable ? (
                      <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 uppercase">
                        {c.header}
                        {on ? (sort!.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
                            : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map(c => (
                    <td key={c.key} className={cn("px-3 h-11 border-b", c.hideBelow && HIDE[c.hideBelow])} style={{ borderColor: "var(--c-divider)" }}>
                      <div className="h-3 rounded animate-pulse" style={{ background: "var(--c-card2)", width: `${40 + ((i * 17) % 50)}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-[13px]" style={{ color: "var(--c-muted)" }}>
                  {rows.length && (query || activeCount) ? "No results match your search or filters." : (empty ?? "No data yet.")}
                </td>
              </tr>
            ) : (
              visible.map(r => {
                const k = rowKey(r);
                const sel = selectedKey === k;
                const tone = rowTone?.(r);
                return (
                  <tr key={k}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={cn("group transition-colors", onRowClick && "cursor-pointer")}
                    style={{ background: sel ? "var(--c-accent-bg)" : undefined }}
                    onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--c-row-hover)"; }}
                    onMouseLeave={e => { if (!sel) e.currentTarget.style.background = ""; }}>
                    {columns.map((c, i) => (
                      <td key={c.key}
                        className={cn("px-3 h-11 border-b align-middle", c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                          c.hideBelow && HIDE[c.hideBelow], c.className)}
                        style={{
                          borderColor: "var(--c-divider)", color: "var(--c-text)",
                          boxShadow: i === 0 && tone ? `inset 3px 0 0 ${tone}` : undefined,
                        }}>
                        {c.render ? c.render(r) : (valueOf(c, r) ?? "—")}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 h-10 text-[12px]" style={{ color: "var(--c-muted)" }}>
        <span className="tabular-nums">
          {sorted.length === 0 ? "0 results"
            : `${current * pageSize + 1}–${Math.min(sorted.length, (current + 1) * pageSize)} of ${sorted.length}${sorted.length !== rows.length ? ` (filtered from ${rows.length})` : ""}`}
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={current === 0}
              className="w-7 h-7 rounded flex items-center justify-center disabled:opacity-40 hover:bg-[var(--c-card2)]" aria-label="Previous page">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="tabular-nums px-1">Page {current + 1} / {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={current >= pages - 1}
              className="w-7 h-7 rounded flex items-center justify-center disabled:opacity-40 hover:bg-[var(--c-card2)]" aria-label="Next page">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
