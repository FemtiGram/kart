import Link from "next/link";

interface MinimalCardProps {
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  badge?: string;
  /** Smaller padding, icon, and type — used in the Mest populært strip
   *  so the secondary entry points read clearly below the primary
   *  category cards. */
  compact?: boolean;
}

/**
 * Single card style used everywhere on the home and category landing
 * pages: home category cards (Energi/Natur/Samfunn), the "Mest populært"
 * strip, and the per-map cards on /energi, /natur, /samfunn. Helsenorge-
 * inspired minimalism — outline icon on top, bold title, one-line
 * description, no CTA chrome. Hierarchy comes from section headings
 * and the optional `compact` size.
 */
export function MinimalCard({ href, icon: Icon, title, description, badge, compact = false }: MinimalCardProps) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-xl border bg-card hover:border-foreground/40 hover:shadow-sm transition-all h-full ${compact ? "p-4" : "p-6"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <Icon
          className={compact ? "h-6 w-6" : "h-8 w-8"}
          style={{ color: "var(--kv-blue)" }}
          strokeWidth={1.75}
        />
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
        className={`font-bold tracking-tight ${compact ? "mt-3 text-sm" : "mt-5 text-lg"}`}
        style={{ color: "var(--kv-blue)" }}
      >
        {title}
      </h3>
      <p
        className={`text-foreground/80 leading-relaxed ${compact ? "mt-1 text-xs" : "mt-2 text-sm"}`}
      >
        {description}
      </p>
    </Link>
  );
}
