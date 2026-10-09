import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Terminal, AlertTriangle } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";

/* ── Types ── */
interface EdrEvent {
  pid: number;
  ppid: number | null;
  process_name: string | null;
  cmdline: string | null;
  image_path: string | null;
  threat_score: number | null;
  event_time: string | null;
  severity_id: number | null;
  device_uid: string | null;
}

interface TreeNode extends EdrEvent {
  children: TreeNode[];
}

/* ── Helpers ── */
function threatBadgeStyle(score: number | null): React.CSSProperties {
  if (score == null) return { background: "var(--c-faint)", color: "var(--c-muted)" };
  if (score > 0.7)   return { background: "rgba(239,68,68,0.15)",   color: "#ef4444"   };
  if (score >= 0.5)  return { background: "rgba(245,158,11,0.15)",  color: "#f59e0b"   };
  return                    { background: "rgba(34,197,94,0.12)",   color: "#22c55e"   };
}

function threatDotColor(score: number | null): string {
  if (score == null) return "var(--c-muted)";
  if (score > 0.7)   return "#ef4444";
  if (score >= 0.5)  return "#f59e0b";
  return                    "#22c55e";
}

function severityLabel(id: number | null): string {
  if (id == null) return "";
  switch (id) {
    case 5: return "Critical";
    case 4: return "High";
    case 3: return "Medium";
    case 2: return "Low";
    default: return `${id}`;
  }
}

function buildTree(events: EdrEvent[]): { roots: TreeNode[]; nodeMap: Map<number, TreeNode> } {
  const nodeMap = new Map<number, TreeNode>();
  events.forEach(e => nodeMap.set(e.pid, { ...e, children: [] }));

  const roots: TreeNode[] = [];
  events.forEach(e => {
    const node = nodeMap.get(e.pid)!;
    if (e.ppid != null && nodeMap.has(e.ppid)) {
      nodeMap.get(e.ppid)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return { roots, nodeMap };
}

/* ── Hero stat card ── */
function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{
      background: "var(--c-card)",
      border: "1px solid var(--c-border)",
      borderRadius: 20,
      padding: "20px 24px",
      flex: 1,
      minWidth: 0,
    }}>
      <p style={{ fontSize: 12, color: "var(--c-muted)", marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, letterSpacing: "-1px", color: accent ?? "var(--c-strong)" }}>
        {value}
      </p>
    </div>
  );
}

/* ── Tree row (recursive) ── */
function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<number>;
  onToggle: (pid: number) => void;
}) {
  const isExpanded = expanded.has(node.pid);
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          paddingLeft: 16 + depth * 20,
          borderBottom: "1px solid var(--c-faint)",
          cursor: hasChildren ? "pointer" : "default",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--c-bg)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        onClick={() => hasChildren && onToggle(node.pid)}
      >
        {/* Expand chevron */}
        <span style={{ width: 16, flexShrink: 0, color: "var(--c-muted)" }}>
          {hasChildren ? (
            isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
          ) : null}
        </span>

        {/* Threat dot */}
        <span style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: threatDotColor(node.threat_score),
        }} />

        {/* Process name */}
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-strong)", flex: "0 0 auto", minWidth: 0 }}>
          {node.process_name ?? "unknown"}
        </span>

        <span style={{ fontSize: 11, color: "var(--c-muted)", fontFamily: "monospace" }}>
          PID {node.pid}
        </span>

        <span style={{ flex: 1 }} />

        {/* Threat score badge */}
        {node.threat_score != null && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            padding: "2px 8px", borderRadius: 20,
            ...threatBadgeStyle(node.threat_score),
          }}>
            {node.threat_score.toFixed(2)}
          </span>
        )}

        {/* Severity */}
        {node.severity_id != null && node.severity_id >= 3 && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            padding: "2px 8px", borderRadius: 20,
            background: node.severity_id === 5 ? "rgba(239,68,68,0.12)" : node.severity_id === 4 ? "rgba(245,158,11,0.12)" : "rgba(156,163,175,0.1)",
            color: node.severity_id === 5 ? "#ef4444" : node.severity_id === 4 ? "#f59e0b" : "var(--c-muted)",
          }}>
            {severityLabel(node.severity_id)}
          </span>
        )}

        {/* Time */}
        {node.event_time && (
          <span style={{ fontSize: 10, color: "var(--c-faint)", flexShrink: 0, whiteSpace: "nowrap" }}>
            {timeAgo(node.event_time)}
          </span>
        )}
      </div>

      {/* Children */}
      {isExpanded && node.children.map(child => (
        <TreeRow
          key={child.pid}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

const SEVERITY_FILTERS = [
  { key: "all",      label: "All"      },
  { key: "critical", label: "Critical" },
  { key: "high",     label: "High"     },
  { key: "medium",   label: "Medium"   },
];

export default function ProcessTree() {
  const [expandedPids, setExpandedPids] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");

  const { data: events = [], isLoading, error } = useQuery<EdrEvent[]>({
    queryKey: ["process-tree"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edr_events")
        .select("pid, ppid, process_name, cmdline, image_path, threat_score, event_time, severity_id, device_uid")
        .eq("ocsf_class_uid", 1007)
        .eq("activity_id", 1)
        .order("event_time", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as EdrEvent[];
    },
    refetchInterval: 10_000,
  });

  /* ── Computed stats ── */
  const totalProcs = events.length;
  const highThreat = events.filter(e => (e.threat_score ?? 0) > 0.7).length;
  const uniqueDevices = new Set(events.map(e => e.device_uid).filter(Boolean)).size;
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const lastHour = events.filter(e => e.event_time && new Date(e.event_time).getTime() > oneHourAgo).length;

  /* ── Filter + tree build ── */
  const filteredEvents = useMemo(() => {
    let evts = events;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      evts = evts.filter(e => e.process_name?.toLowerCase().includes(q));
    }
    if (severityFilter !== "all") {
      const sevMap: Record<string, number> = { critical: 5, high: 4, medium: 3 };
      const sevId = sevMap[severityFilter];
      if (sevId != null) evts = evts.filter(e => e.severity_id === sevId);
    }
    return evts;
  }, [events, searchTerm, severityFilter]);

  const { roots } = useMemo(() => buildTree(filteredEvents), [filteredEvents]);

  function togglePid(pid: number) {
    setExpandedPids(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }

  /* ── Table not found ── */
  const tableNotFound = error != null && (
    String((error as any).message ?? "").includes("does not exist") ||
    String((error as any).code ?? "") === "42P01"
  );

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--c-bg)" }}>
      <TopBar title="Process Tree" />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--c-strong)" }}>
            Process Tree
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--c-muted)" }}>
            Causal execution chain from Windows ETW sensor events.
          </p>
        </div>

        {/* Hero stats */}
        <div className="flex gap-4">
          <StatCard label="Total Processes"   value={totalProcs} />
          <StatCard label="High Threat (>0.7)" value={highThreat}    accent={highThreat > 0 ? "#ef4444" : undefined} />
          <StatCard label="Unique Devices"    value={uniqueDevices} />
          <StatCard label="Events Last Hour"  value={lastHour} />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex items-center">
            <Terminal className="absolute left-3 w-4 h-4 pointer-events-none" style={{ color: "var(--c-muted)" }} />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Filter by process name…"
              className="rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none"
              style={{
                background: "var(--c-card)",
                border: "1px solid var(--c-border2)",
                color: "var(--c-text)",
                width: 240,
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--c-primary)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--c-border2)")}
            />
          </div>

          {/* Severity pills */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
            {SEVERITY_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setSeverityFilter(f.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={severityFilter === f.key
                  ? { background: "var(--c-primary)", color: "#fff" }
                  : { color: "var(--c-muted)", background: "transparent" }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main panel */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
          <div className="px-5 py-3.5 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--c-border)" }}>
            <h2 className="text-sm font-bold" style={{ color: "var(--c-strong)" }}>
              Execution Chain
            </h2>
            <span className="text-xs" style={{ color: "var(--c-muted)" }}>
              {filteredEvents.length} events
            </span>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-sm" style={{ color: "var(--c-muted)" }}>
              Loading process events…
            </div>
          ) : tableNotFound ? (
            <div className="py-16 px-8 text-center">
              <AlertTriangle size={32} className="mx-auto mb-3" style={{ color: "#f59e0b" }} />
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--c-strong)" }}>
                Windows sensor not yet connected
              </p>
              <p className="text-xs" style={{ color: "var(--c-muted)" }}>
                Install SparrowShieldSensor.exe to see process events
              </p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm" style={{ color: "#ef4444" }}>
              Failed to load: {String((error as any).message ?? error)}
            </div>
          ) : roots.length === 0 ? (
            <div className="py-16 text-center">
              <Terminal size={32} className="mx-auto mb-3" style={{ color: "var(--c-faint)" }} />
              <p className="text-sm" style={{ color: "var(--c-muted)" }}>
                {events.length === 0
                  ? "No process events recorded yet"
                  : "No events match the current filter"}
              </p>
            </div>
          ) : (
            <div>
              {roots.map(root => (
                <TreeRow
                  key={root.pid}
                  node={root}
                  depth={0}
                  expanded={expandedPids}
                  onToggle={togglePid}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
