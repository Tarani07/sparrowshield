import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import type { EdrEventPoint } from "../../hooks/useEdrEvents";
import { timeAgo } from "../../lib/utils";

interface Props {
  data: EdrEventPoint[];
  isLoading: boolean;
}

interface TooltipState {
  x: number;
  y: number;
  point: EdrEventPoint;
}

const W = 800;
const H = 100;
const PAD = { top: 8, right: 12, bottom: 4, left: 8 };

function scoreToColor(score: number): string {
  if (score >= 0.7) return "#ef4444";
  if (score >= 0.5) return "#f59e0b";
  return "#22c55e";
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function avgScoreColor(avg: number): string {
  // Interpolate green -> amber -> red
  if (avg <= 0.5) {
    const t = avg / 0.5;
    return `rgb(${Math.round(lerp(34, 245, t))}, ${Math.round(lerp(197, 158, t))}, ${Math.round(lerp(94, 11, t))})`;
  } else {
    const t = (avg - 0.5) / 0.5;
    return `rgb(${Math.round(lerp(245, 239, t))}, ${Math.round(lerp(158, 68, t))}, ${Math.round(lerp(11, 68, t))})`;
  }
}

export default function ThreatTimelineCard({ data, isLoading }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const { points, lineColor, peakScore, avgScore, xLabels } = useMemo(() => {
    const now = Date.now();
    const rangeMs = 24 * 60 * 60 * 1000;
    const start = now - rangeMs;

    // Generate X-axis labels every 6h
    const labelCount = 5; // 0h, 6h, 12h, 18h, 24h
    const xLabels = Array.from({ length: labelCount }, (_, i) => {
      const ms = start + (i / (labelCount - 1)) * rangeMs;
      const d = new Date(ms);
      return {
        label: d.getHours().toString().padStart(2, "0") + ":00",
        xPct: i / (labelCount - 1),
      };
    });

    const validPoints = data.filter(p => p.threat_score != null);
    const scores = validPoints.map(p => p.threat_score as number);
    const peak = scores.length > 0 ? Math.max(...scores) : 0;
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const color = avgScoreColor(avg);

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const mapped = data.map(p => {
      const t = new Date(p.event_time).getTime();
      const xPct = Math.max(0, Math.min(1, (t - start) / rangeMs));
      const score = p.threat_score ?? 0;
      return {
        x: PAD.left + xPct * plotW,
        y: PAD.top + (1 - score) * plotH,
        score,
        point: p,
      };
    });

    return { points: mapped, lineColor: color, peakScore: peak, avgScore: avg, xLabels };
  }, [data]);

  const polylinePts = points.map(p => `${p.x},${p.y}`).join(" ");

  // Close polygon for fill: go to bottom-right, bottom-left
  const plotW = W - PAD.left - PAD.right;
  const bottom = H - PAD.bottom;
  const fillPts = points.length > 0
    ? `${points[0].x},${bottom} ${polylinePts} ${points[points.length - 1].x},${bottom}`
    : "";

  const peakBadgeClass =
    peakScore > 0.7 ? "bg-red-500/20 text-red-400 border border-red-500/30" :
    peakScore > 0.5 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                      "bg-green-500/20 text-green-400 border border-green-500/30";

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const svgY = ((e.clientY - rect.top) / rect.height) * H;

    if (points.length === 0) { setTooltip(null); return; }

    // Find nearest point
    let best = points[0];
    let bestDist = Math.abs(best.x - svgX);
    for (const p of points) {
      const d = Math.abs(p.x - svgX);
      if (d < bestDist) { bestDist = d; best = p; }
    }

    if (bestDist > 30) { setTooltip(null); return; }

    setTooltip({
      x: (best.x / W) * rect.width + rect.left,
      y: (best.y / H) * rect.height + rect.top,
      point: best.point,
    });
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--c-border)" }}
      >
        <div>
          <h2
            className="text-sm font-bold flex items-center gap-2"
            style={{ color: "var(--c-strong)" }}
          >
            <Activity className="w-4 h-4 text-blue-400" />
            Threat Score Timeline
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--c-muted)" }}>
            Last 24 hours · auto-refreshes every 30s
          </p>
        </div>
        {data.length > 0 && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${peakBadgeClass}`}>
            Peak {(peakScore * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {isLoading ? (
          <div
            className="h-28 flex items-center justify-center text-xs"
            style={{ color: "var(--c-muted)" }}
          >
            Loading…
          </div>
        ) : data.length === 0 ? (
          <div className="h-28 flex flex-col items-center justify-center gap-2">
            <Activity className="w-6 h-6 opacity-30" style={{ color: "var(--c-muted)" }} />
            <p className="text-xs text-center" style={{ color: "var(--c-muted)" }}>
              No EDR events in last 24h — sensor not yet connected
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Y-axis labels */}
            <div
              className="absolute left-0 top-0 flex flex-col justify-between text-[9px] font-mono pointer-events-none"
              style={{ color: "var(--c-faint)", height: H, paddingTop: PAD.top, paddingBottom: PAD.bottom }}
            >
              <span>1.0</span>
              <span>0.5</span>
              <span>0.0</span>
            </div>

            {/* SVG chart */}
            <div className="pl-6">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                style={{ height: H, cursor: "crosshair" }}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Grid lines */}
                <line
                  x1={PAD.left} y1={PAD.top + (H - PAD.top - PAD.bottom) * 0.5}
                  x2={W - PAD.right} y2={PAD.top + (H - PAD.top - PAD.bottom) * 0.5}
                  stroke="var(--c-border)" strokeDasharray="3 3" strokeWidth={0.5}
                />

                {/* Fill area */}
                {fillPts && (
                  <polygon
                    points={fillPts}
                    fill={lineColor}
                    fillOpacity={0.15}
                  />
                )}

                {/* Line */}
                {points.length > 1 && (
                  <polyline
                    points={polylinePts}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}

                {/* Data points */}
                {points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={3}
                    fill={scoreToColor(p.score)}
                    stroke="var(--c-card)"
                    strokeWidth={1}
                  >
                    <title>{`${p.point.process_name ?? "—"} | score: ${p.score.toFixed(2)} | ${new Date(p.point.event_time).toLocaleTimeString()}`}</title>
                  </circle>
                ))}
              </svg>

              {/* X-axis labels */}
              <div className="flex justify-between text-[9px] font-mono mt-1" style={{ color: "var(--c-faint)" }}>
                {xLabels.map((l, i) => (
                  <span key={i}>{l.label}</span>
                ))}
              </div>
            </div>

            {/* Hover tooltip */}
            {tooltip && (
              <div
                className="fixed z-50 pointer-events-none rounded-lg px-3 py-2 text-xs shadow-xl"
                style={{
                  left: tooltip.x + 12,
                  top: tooltip.y - 40,
                  background: "var(--c-card)",
                  border: "1px solid var(--c-border)",
                  color: "var(--c-text)",
                  minWidth: 160,
                }}
              >
                <p className="font-semibold truncate" style={{ color: "var(--c-strong)" }}>
                  {tooltip.point.process_name ?? "Unknown process"}
                </p>
                {tooltip.point.alert_type && (
                  <p className="text-[10px]" style={{ color: "var(--c-muted)" }}>
                    {tooltip.point.alert_type.replace(/_/g, " ")}
                  </p>
                )}
                <p className="font-mono mt-1">
                  Score:{" "}
                  <span style={{ color: scoreToColor(tooltip.point.threat_score ?? 0) }}>
                    {((tooltip.point.threat_score ?? 0) * 100).toFixed(0)}%
                  </span>
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--c-muted)" }}>
                  {timeAgo(tooltip.point.event_time)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer stats */}
        {data.length > 0 && !isLoading && (
          <div className="flex items-center gap-4 mt-3 pt-3 text-[10px]" style={{ borderTop: "1px solid var(--c-divider)", color: "var(--c-muted)" }}>
            <span>{data.length} events</span>
            <span>Avg score: <span className="font-mono font-semibold" style={{ color: avgScoreColor(avgScore) }}>{(avgScore * 100).toFixed(0)}%</span></span>
            <span>Peak: <span className="font-mono font-semibold" style={{ color: scoreToColor(peakScore) }}>{(peakScore * 100).toFixed(0)}%</span></span>
            <span className="ml-auto flex items-center gap-2">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> low</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> med</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> high</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
