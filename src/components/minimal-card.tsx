import Link from "next/link";

interface MinimalCardProps {
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  badge?: string;
}

/**
 * Single card style used everywhere on the home and category landing
 * pages: home category cards (Energi/Natur/Samfunn), the "Mest populært"
 * strip, and the per-map cards on /energi, /natur, /samfunn. Helsenorge-
 * inspired minimalism — outline icon on top, bold title, one-line
 * description, no CTA chrome. Hierarchy comes from section headings.
 */
export function MinimalCard({ href, icon: Icon, title, description, badge }: MinimalCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border bg-card p-6 hover:border-foreground/40 hover:shadow-sm transition-all h-full"
    >
      <div className="flex items-start justify-between gap-3">
        <Icon
          className="h-8 w-8"
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
        className="mt-5 text-lg font-bold tracking-tight"
        style={{ color: "var(--kv-blue)" }}
      >
        {title}
      </h3>
      <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{description}</p>
    </Link>
  );
}
