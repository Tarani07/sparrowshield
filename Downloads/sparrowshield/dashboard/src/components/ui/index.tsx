// SparrowShield console design system: the building blocks every page uses so the
// product reads as one enterprise tool (CrowdStrike / SentinelOne style).
import { useEffect, type ElementType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, X, Inbox } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";

export { default as DataTable } from "./DataTable";
export type { Column, FilterDef } from "./DataTable";

/* ── Page header: breadcrumb, title, description, actions ───────────────── */
export function PageHeader({
  title, description, crumbs = [], actions, icon: Icon,
}: {
  title: string;
  description?: ReactNode;
  crumbs?: { label: string; to?: string }[];
  actions?: ReactNode;
  icon?: ElementType;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-5">
      <div className="min-w-0">
        {crumbs.length > 0 && (
          <nav className="flex items-center gap-1 text-[11px] font-medium mb-1.5" style={{ color: "var(--c-muted)" }}>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3 opacity-60" />}
                {c.to ? <Link to={c.to} className="hover:underline">{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="flex items-center gap-2.5 text-[22px] leading-7 font-semibold tracking-tight" style={{ color: "var(--c-strong)" }}>
          {Icon && <Icon className="w-5 h-5" style={{ color: "var(--c-accent)" }} />}
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-[13px] max-w-3xl" style={{ color: "var(--c-muted)" }}>{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── Page container ─────────────────────────────────────────────────────── */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 sm:px-6 py-5 sm:py-6 max-w-[1600px] mx-auto w-full", className)}>{children}</div>;
}

/* ── Panel: titled card ─────────────────────────────────────────────────── */
export function Panel({
  title, subtitle, actions, children, className, bodyClassName, noPad,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPad?: boolean;
}) {
  return (
    <section
      className={cn("rounded-lg border min-w-0", className)}
      style={{ background: "var(--c-card)", borderColor: "var(--c-border)", boxShadow: "var(--c-shadow)" }}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 h-11 border-b" style={{ borderColor: "var(--c-border)" }}>
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold truncate" style={{ color: "var(--c-strong)" }}>{title}</h2>
            {subtitle && <p className="text-[11px] -mt-0.5 truncate" style={{ color: "var(--c-muted)" }}>{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn(noPad ? "" : "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ── KPI tile ───────────────────────────────────────────────────────────── */
export function StatTile({
  label, value, sub, icon: Icon, tone = "neutral", onClick, active,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ElementType;
  tone?: "neutral" | "ok" | "critical" | "high" | "medium" | "low" | "accent";
  onClick?: () => void;
  active?: boolean;
}) {
  const color = TONE[tone];
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "relative text-left rounded-lg border px-4 py-3.5 overflow-hidden min-w-0 transition-colors",
        onClick && "hover:border-[var(--c-border2)] cursor-pointer",
      )}
      style={{
        background: "var(--c-card)",
        borderColor: active ? color : "var(--c-border)",
        boxShadow: active ? `inset 0 0 0 1px ${color}` : "var(--c-shadow)",
      }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: color, opacity: tone === "neutral" ? 0.35 : 0.9 }} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--c-muted)" }}>{label}</span>
        {Icon && <Icon className="w-4 h-4 shrink-0" style={{ color, opacity: 0.9 }} />}
      </div>
      <div className="mt-1.5 text-[26px] leading-8 font-semibold tabular-nums" style={{ color: "var(--c-strong)" }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] truncate" style={{ color: "var(--c-muted)" }}>{sub}</div>}
    </Comp>
  );
}

const TONE: Record<string, string> = {
  neutral:  "var(--c-muted)",
  ok:       "var(--ok)",
  critical: "var(--sev-critical)",
  high:     "var(--sev-high)",
  medium:   "var(--sev-medium)",
  low:      "var(--sev-low)",
  accent:   "var(--c-accent)",
};

/* ── Badges ─────────────────────────────────────────────────────────────── */
export function Badge({
  children, tone = "neutral", dot, className,
}: {
  children: ReactNode;
  tone?: keyof typeof TONE;
  dot?: boolean;
  className?: string;
}) {
  const color = TONE[tone];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 h-[22px] px-2 rounded text-[11px] font-semibold whitespace-nowrap border", className)}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

export type Severity = "critical" | "high" | "medium" | "warning" | "low" | "info";
export function severityTone(s?: string | null): keyof typeof TONE {
  switch ((s ?? "").toLowerCase()) {
    case "critical": return "critical";
    case "high": return "high";
    case "medium": case "warning": return "medium";
    case "low": return "low";
    default: return "neutral";
  }
}
export const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, warning: 2, low: 3, info: 4 };

export function SeverityBadge({ severity }: { severity?: string | null }) {
  const s = (severity ?? "info").toLowerCase();
  const label = s === "warning" ? "Medium" : s.charAt(0).toUpperCase() + s.slice(1);
  return <Badge tone={severityTone(s)}>{label}</Badge>;
}

export function StatusBadge({ online, label }: { online: boolean; label?: string }) {
  return <Badge tone={online ? "ok" : "neutral"} dot>{label ?? (online ? "Online" : "Offline")}</Badge>;
}

/* ── Buttons ────────────────────────────────────────────────────────────── */
export function Button({
  children, variant = "secondary", size = "md", icon: Icon, className, adminOnly, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: ElementType;
  /** Disable for read-only users. Defaults to true for primary/danger buttons (they change things). */
  adminOnly?: boolean;
}) {
  const { isAdmin } = useAuth();
  const locked = (adminOnly ?? (variant === "primary" || variant === "danger")) && !isAdmin;
  const styles: Record<string, React.CSSProperties> = {
    primary:   { background: "var(--c-accent)", color: "#fff", borderColor: "var(--c-accent)" },
    secondary: { background: "var(--c-card2)", color: "var(--c-strong)", borderColor: "var(--c-border2)" },
    ghost:     { background: "transparent", color: "var(--c-text)", borderColor: "transparent" },
    danger:    { background: "color-mix(in srgb, var(--sev-critical) 14%, transparent)", color: "var(--sev-critical)", borderColor: "color-mix(in srgb, var(--sev-critical) 40%, transparent)" },
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || locked}
      title={locked ? "Read-only access — ask an admin" : rest.title}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap transition-[filter,background] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-accent)]",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
        className,
      )}
      style={{ ...styles[variant], ...(rest.style ?? {}) }}
    >
      {Icon && <Icon className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />}
      {children}
    </button>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */
export function Tabs<T extends string>({
  tabs, value, onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b overflow-x-auto" style={{ borderColor: "var(--c-border)" }}>
      {tabs.map(t => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="relative h-10 px-3 text-[13px] font-medium whitespace-nowrap flex items-center gap-2"
            style={{ color: on ? "var(--c-strong)" : "var(--c-muted)" }}
          >
            {t.label}
            {t.count != null && (
              <span className="text-[11px] px-1.5 rounded tabular-nums"
                style={{ background: on ? "var(--c-accent-bg)" : "var(--c-card2)", color: on ? "var(--c-accent)" : "var(--c-muted)" }}>
                {t.count}
              </span>
            )}
            {on && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded" style={{ background: "var(--c-accent)" }} />}
          </button>
        );
      })}
    </div>
  );
}

/* ── Slide-over detail drawer ───────────────────────────────────────────── */
export function Drawer({
  open, onClose, title, subtitle, children, footer, width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside
        className="relative h-full flex flex-col border-l shadow-2xl"
        style={{ width: `min(${width}px, 100vw)`, background: "var(--c-card)", borderColor: "var(--c-border2)" }}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--c-border)" }}>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--c-strong)" }}>{title}</h3>
            {subtitle && <div className="mt-0.5 text-[12px]" style={{ color: "var(--c-muted)" }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--c-card2)]" style={{ color: "var(--c-muted)" }} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: "var(--c-border)" }}>{footer}</footer>}
      </aside>
    </div>
  );
}

/* ── Key / value list (detail panels) ───────────────────────────────────── */
export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,38%)_1fr] gap-x-4 gap-y-2.5 text-[13px]">
      {items.map(i => (
        <div key={i.label} className="contents">
          <dt style={{ color: "var(--c-muted)" }}>{i.label}</dt>
          <dd className="min-w-0 break-words" style={{ color: "var(--c-strong)" }}>{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Empty state ────────────────────────────────────────────────────────── */
export function EmptyState({ title, hint, icon: Icon = Inbox, action }: {
  title: string; hint?: ReactNode; icon?: ElementType; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <Icon className="w-8 h-8 mb-3" style={{ color: "var(--c-faint)" }} />
      <p className="text-[13px] font-semibold" style={{ color: "var(--c-strong)" }}>{title}</p>
      {hint && <p className="mt-1 text-[12px] max-w-sm" style={{ color: "var(--c-muted)" }}>{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ── Form controls ──────────────────────────────────────────────────────── */
export const inputClass =
  "h-8 px-2.5 rounded-md border text-[13px] outline-none bg-[var(--c-card2)] border-[var(--c-border2)] text-[var(--c-strong)] placeholder:text-[var(--c-muted)] focus:border-[var(--c-accent)]";
