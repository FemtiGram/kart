import Link from "next/link";
import { Separator } from "@/components/ui/separator";

/**
 * Utforsk column is sub-grouped by theme (Energi / Natur / Samfunn) to
 * match the navbar dropdowns. Keeps the 3-column footer layout while
 * fitting 12 map links in one column without turning into a wall of text.
 */
const utforskGroups = [
  {
    label: "Energi",
    links: [
      { label: "Energikart", href: "/energi" },
      { label: "Magasinkart", href: "/magasin" },
      { label: "Ladestasjoner", href: "/lading" },
    ],
  },
  {
    label: "Natur",
    links: [
      { label: "Høydekart", href: "/map" },
      { label: "Turisthytter", href: "/hytter" },
      { label: "Verneområder", href: "/vern" },
    ],
  },
  {
    label: "Samfunn",
    links: [
      { label: "Stedsprofil", href: "/kommune" },
      { label: "Skoler og barnehager", href: "/skoler" },
      { label: "Helsetilbud", href: "/helse" },
      { label: "Inntektskart", href: "/lonn" },
      { label: "Boligpriser", href: "/bolig" },
      { label: "Prisvekst", href: "/prisvekst" },
    ],
  },
];

const ressurserLinks = [
  { label: "Datakilder og lisenser", href: "/kilder" },
  { label: "Personvern", href: "/personvern" },
  { label: "Åpen kildekode", href: "https://github.com/FemtiGram/kart", external: true },
  { label: "kartverket.no", href: "https://www.kartverket.no", external: true },
  { label: "Geonorge", href: "https://geonorge.no", external: true },
];

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-6 md:px-16 py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 font-extrabold text-base w-fit"
              style={{ color: "var(--kv-blue)" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
                <rect width="32" height="32" rx="7" fill="#24374c"/>
                <g transform="translate(5, 5) scale(0.9375)" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
                  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                  <line x1="9" x2="9" y1="3" y2="18"/>
                  <line x1="15" x2="15" y1="6" y2="21"/>
                </g>
              </svg>
              Datakart
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Interaktive kart og visualiseringer bygget på åpne norske data fra SSB, NVE, Kartverket og flere.
            </p>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Har du forslag? Et kart du savner?{" "}
              <a
                href="mailto:anders.gram83@gmail.com?subject=Forslag%20til%20Datakart"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Send meg en e-post
              </a>
              .
            </p>
          </div>

          {/* Utforsk — sub-grouped by theme */}
          <div className="flex flex-col gap-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/70">
              Utforsk
            </h3>
            {utforskGroups.map((group) => (
              <div key={group.label} className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                  {group.label}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Ressurser — flat list */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/70">
              Ressurser
            </h3>
            <ul className="flex flex-col gap-2">
              {ressurserLinks.map((link) => (
                <li key={link.label}>
                  {"external" in link && link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                    >
                      {link.label} ↗
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-foreground/70">
          <p>© {new Date().getFullYear()} Datakart</p>
          <p>
            Bygd med{" "}
            <span style={{ color: "var(--kv-green)" }}>&#9829;</span>
            {" "}og{" "}
            <Link
              href="/kilder"
              className="hover:text-foreground transition-colors underline underline-offset-2"
            >
              apne data
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
