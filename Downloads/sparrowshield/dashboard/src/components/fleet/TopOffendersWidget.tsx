import type { HealthReport } from "../../lib/types";
import { formatBytes } from "../../lib/utils";

interface Props { reports: HealthReport[] }

export default function TopOffendersWidget({ reports }: Props) {
  // Aggregate culprit apps fleet-wide
  const appMap = new Map<string, { count: number; totalRam: number }>();

  for (const r of reports) {
    for (const app of r.culprit_apps ?? []) {
      const existing = appMap.get(app.app_name) ?? { count: 0, totalRam: 0 };
      existing.count++;
      existing.totalRam += app.ram_mb;
      appMap.set(app.app_name, existing);
    }
  }

  const sorted = Array.from(appMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);

  if (sorted.length === 0) {
    return <p className="text-slate-500 text-xs py-4 text-center">No offending apps detected</p>;
  }

  const maxCount = sorted[0][1].count;

  return (
    <div className="space-y-2.5">
      {sorted.map(([name, { count, totalRam }], i) => (
        <div key={name} className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-600 w-4">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-300 truncate font-medium">{name}</span>
              <span className="text-xs font-mono text-slate-500 ml-2 flex-shrink-0">{count} device{count !== 1 ? "s" : ""}</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${(count / maxCount) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-xs font-mono text-slate-500 flex-shrink-0 w-16 text-right">
            avg {formatBytes(totalRam / count)}
          </span>
        </div>
      ))}
    </div>
  );
}
