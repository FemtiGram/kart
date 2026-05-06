import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface HomeCategoryCardProps {
  href: string;
  label: string;
  tagline: string;
  examples: string[];
  count: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Big primary navigation card on the home page — one per category
 * (Energi / Natur / Samfunn). Replaces the flat 13-card grid that the
 * home used to render directly. Clicking goes to the category landing
 * page; the example labels are non-interactive hints.
 */
export function HomeCategoryCard({
  href,
  label,
  tagline,
  examples,
  count,
  icon: Icon,
}: HomeCategoryCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-2xl border bg-card px-6 py-6 shadow-sm hover:shadow-lg hover:border-foreground/30 transition-all overflow-hidden"
    >
      <div
        className="absolute -top-12 -right-12 h-40 w-40 rounded-full opacity-[0.06] group-hover:opacity-[0.12] transition-opacity"
        style={{ background: "var(--kv-blue)" }}
        aria-hidden="true"
      />
      <div
        className="rounded-xl p-3 self-start"
        style={{ background: "var(--kv-blue-light)" }}
      >
        <Icon className="h-7 w-7" style={{ color: "var(--kv-blue)" }} />
      </div>
      <h2
        className="mt-5 text-3xl font-extrabold tracking-tight"
        style={{ color: "var(--kv-blue)" }}
      >
        {label}
      </h2>
      <p className="mt-2 text-sm text-foreground/70 leading-relaxed">{tagline}</p>

      <ul className="mt-4 flex flex-wrap gap-1.5">
        {examples.map((e) => (
          <li
            key={e}
            className="text-[11px] font-medium rounded-full bg-muted px-2.5 py-1 text-foreground/70"
          >
            {e}
          </li>
        ))}
      </ul>

      <div className="mt-5 pt-4 border-t flex items-center justify-between">
        <span className="text-xs text-foreground/60">{count}</span>
        <span
          className="inline-flex items-center gap-1 text-sm font-semibold"
          style={{ color: "var(--kv-blue)" }}
        >
          Utforsk
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
