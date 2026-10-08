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
 * inspired minimalism — outline icon inline with the bold title, one-line
 * description underneath spanning the full card width, no CTA chrome.
 * Hierarchy comes from section headings and the optional `compact` size.
 *
 * The icon sits on the title line, sized to the title's cap height, so the
 * description can start at the card's left edge instead of being indented
 * by an icon column (which wasted up to half the card on narrow screens).
 */
export function MinimalCard({ href, icon: Icon, title, description, badge, compact = false }: MinimalCardProps) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-xl border bg-card hover:border-foreground/40 hover:shadow-sm transition-all h-full ${
        compact ? "px-4 sm:px-5 py-4" : "p-5 sm:p-6"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Icon
          className={compact ? "h-[1.125em] w-[1.125em] shrink-0" : "h-[1.15em] w-[1.15em] shrink-0"}
          style={{ color: "var(--kv-blue)" }}
          strokeWidth={compact ? 2 : 1.85}
          aria-hidden="true"
        />
        <h3
          className={`font-bold tracking-tight ${compact ? "text-base" : "text-lg"}`}
          style={{ color: "var(--kv-blue)" }}
        >
          {title}
        </h3>
      </div>
      {/* The badge leads the description line rather than sitting alone on
          the title row: on a narrow card it would otherwise wrap under the
          title and leave an empty band between title and text */}
      <p className={compact ? "mt-1.5 text-xs text-foreground/80" : "mt-2 text-sm text-foreground/80 leading-relaxed"}>
        {badge && (
          <span
            className="inline-block align-middle text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 mr-2 mb-0.5"
            style={{
              background: "var(--kv-warning-light)",
              color: "var(--kv-warning-dark)",
            }}
          >
            {badge}
          </span>
        )}
        {description}
      </p>
    </Link>
  );
}
