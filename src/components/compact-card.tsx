"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

// ─── Root container ─────────────────────────────────────────

interface CompactCardProps {
  children: ReactNode;
  onClose: () => void;
  visible?: boolean;
}

function CompactCardRoot({ children, onClose, visible = true }: CompactCardProps) {
  if (!visible) return null;
  return (
    <div
      className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-[999] bg-card rounded-2xl shadow-xl px-4 py-4"
      style={{ border: "1.5px solid var(--border)" }}
    >
      <div className="relative">
        <button
          onClick={onClose}
          className="absolute -top-1 -right-1 shrink-0 p-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Lukk"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

// ─── Header row (row 1) ─────────────────────────────────────

interface HeaderProps {
  title: string;
  titleStat?: string;
  metric?: string | number;
  metricUnit?: string;
  metricColor?: string;
}

function Header({ title, titleStat, metric, metricUnit, metricColor = "var(--kv-blue)" }: HeaderProps) {
  return (
    <div className="flex items-baseline justify-between gap-2 pr-9">
      <div className="flex items-baseline gap-1.5 min-w-0">
        <p className="text-xl font-extrabold leading-snug truncate" style={{ color: "var(--kv-blue)" }}>{title}</p>
        {titleStat && (
          <span className="text-xs text-foreground/70 shrink-0">{titleStat}</span>
        )}
      </div>
      {metric != null && (
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-xl font-extrabold" style={{ color: metricColor }}>{metric}</span>
          {metricUnit && <span className="text-xs text-foreground/70">{metricUnit}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Context row (row 2) ────────────────────────────────────

function Context({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mt-1 pr-9">
      {children}
    </div>
  );
}

// ─── Context left/right helpers ─────────────────────────────

function ContextLeft({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1.5 min-w-0 truncate">{children}</div>;
}

function ContextRight({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1.5 shrink-0">{children}</div>;
}

// ─── Badge ──────────────────────────────────────────────────

interface BadgeProps {
  children: ReactNode;
  color?: string;
  bg?: string;
}

function Badge({ children, color, bg }: BadgeProps) {
  return (
    <span
      className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0"
      style={{
        color: color ?? "white",
        backgroundColor: bg ?? color ?? "var(--kv-blue)",
      }}
    >
      {children}
    </span>
  );
}

// ─── Text (for context rows) ────────────────────────────────

function ContextText({ children }: { children: ReactNode }) {
  return <span className="text-xs text-foreground/70">{children}</span>;
}

// ─── Actions row ────────────────────────────────────────────

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 mt-3">{children}</div>;
}

// ─── Action button ──────────────────────────────────────────

interface ActionProps {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  primary?: boolean;
  icon?: ReactNode;
}

function Action({ children, onClick, href, primary = false, icon }: ActionProps) {
  const className = primary
    ? "flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white transition-colors hover:opacity-90"
    : "flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors";

  const style = primary ? { background: "var(--kv-blue)" } : undefined;

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style}>
        {icon}{children}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={className} style={style}>
      {icon}{children}
    </button>
  );
}

// ─── Custom content slot (for compare mode etc.) ────────────

function Custom({ children }: { children: ReactNode }) {
  return <div className="mt-3">{children}</div>;
}

// ─── Export as compound component ───────────────────────────

export const CompactCard = Object.assign(CompactCardRoot, {
  Header,
  Context,
  ContextLeft,
  ContextRight,
  Badge,
  ContextText,
  Actions,
  Action,
  Custom,
});
