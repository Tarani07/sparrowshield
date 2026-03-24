import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function healthColor(status: string) {
  if (status === "critical") return "text-red-400";
  if (status === "warning") return "text-amber-400";
  return "text-green-400";
}

export function healthBg(status: string) {
  if (status === "critical") return "bg-red-500/10 border-red-500/30";
  if (status === "warning") return "bg-amber-500/10 border-amber-500/30";
  return "bg-green-500/10 border-green-500/30";
}

export function healthBadge(status: string) {
  if (status === "critical") return "bg-red-500/20 text-red-400 border border-red-500/30";
  if (status === "warning") return "bg-amber-500/20 text-amber-400 border border-amber-500/30";
  return "bg-green-500/20 text-green-400 border border-green-500/30";
}

export function scoreColor(score: number) {
  if (score < 60) return "#ef4444";
  if (score < 90) return "#f59e0b";
  return "#22c55e";
}

export function impactColor(impact: string) {
  if (impact === "high") return "text-red-400 bg-red-500/10 border-red-500/20";
  if (impact === "medium") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-slate-400 bg-slate-500/10 border-slate-500/20";
}

export function formatBytes(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

export function timeAgo(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return "—";
  }
}

export function metricColor(pct: number, warnAt = 75, critAt = 90) {
  if (pct >= critAt) return "bg-red-500";
  if (pct >= warnAt) return "bg-amber-500";
  return "bg-green-500";
}
