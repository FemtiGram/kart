import Link from "next/link";
import Image, { type StaticImageData } from "next/image";
import { ArrowRight } from "lucide-react";

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
  /** Decorative picture across the top of the card (16:10). Generated at
   *  build time by scripts/build-thumbs.mjs from the real map data, so
   *  the card shows what the map looks like before you open it. */
  image?: StaticImageData;
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
 *
 * Hover is a 2px lift with a crisp press on touch (CSS only; Tailwind 4
 * scopes `hover:` to pointers that can hover, so touch never sticks).
 */
export function MinimalCard({ href, icon: Icon, title, description, badge, compact = false, image }: MinimalCardProps) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-xl border bg-card h-full overflow-hidden transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-foreground/40 active:translate-y-0 active:shadow-sm active:duration-75 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        compact ? "px-3 min-[360px]:px-4 sm:px-5 py-4" : "p-5 sm:p-6"
      }`}
    >
      {image && (
        <div className={`relative aspect-[16/10] overflow-hidden border-b ${compact ? "-mx-3 min-[360px]:-mx-4 sm:-mx-5 -mt-4 mb-3" : "-mx-5 sm:-mx-6 -mt-5 sm:-mt-6 mb-4"}`}>
          <Image
            src={image}
            alt=""
            fill
            placeholder="blur"
            sizes="(min-width: 1024px) 240px, 50vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
          />
        </div>
      )}
      {/* Compact cards get 12px side padding under 360px: at 320px a
          two-column card has ~106px for icon + one-word title ("Stedsprofil") */}
      <div className={`flex items-center ${compact ? "gap-2" : "gap-2.5"}`}>
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
        {/* Decorative arrow; hidden under 400px where a two-column compact
            card (~120px of content) can't fit icon + one-word title + arrow
            and the arrow was pushed into the padding and clipped */}
        {image && (
          <ArrowRight
            className="ml-auto hidden min-[400px]:block h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transform-none"
            aria-hidden="true"
          />
        )}
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
