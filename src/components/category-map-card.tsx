import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface CategoryMapCardProps {
  href: string;
  title: string;
  description: string;
  bullets?: string[];
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

/**
 * Rich card used on category landing pages (/energi, /natur, /samfunn).
 * Bigger and more editorial than the navbar dropdown items — gives space
 * for a 1-line description and 2-3 example bullets so users can pick the
 * right map without clicking through.
 */
export function CategoryMapCard({
  href,
  title,
  description,
  bullets,
  icon: Icon,
  badge,
}: CategoryMapCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border bg-card px-5 py-5 shadow-sm hover:shadow-md hover:border-foreground/20 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="rounded-xl p-2.5 shrink-0"
          style={{ background: "var(--kv-blue-light)" }}
        >
          <Icon className="h-5 w-5" style={{ color: "var(--kv-blue)" }} />
        </div>
        {badge && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
            style={{
              background: "var(--kv-warning-light)",
              color: "var(--kv-warning-dark)",
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <h3
        className="mt-4 text-lg font-extrabold leading-tight"
        style={{ color: "var(--kv-blue)" }}
      >
        {title}
      </h3>
      <p className="mt-1 text-sm text-foreground/70 leading-snug">{description}</p>
      {bullets && bullets.length > 0 && (
        <ul className="mt-3 space-y-1">
          {bullets.map((b) => (
            <li
              key={b}
              className="text-xs text-foreground/60 leading-snug pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-foreground/40"
            >
              {b}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--kv-blue)" }}>
        Åpne kartet
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
