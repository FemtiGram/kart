import Link from "next/link";
import { Separator } from "@/components/ui/separator";

const footerLinks = {
  Utforsk: [
    { label: "Kart", href: "/map" },
    { label: "Åpne data", href: "/data" },
    { label: "Stedsnavn", href: "/stedsnavn" },
    { label: "Om tjenesten", href: "/about" },
  ],
  Ressurser: [
    { label: "kartverket.no", href: "https://www.kartverket.no", external: true },
    { label: "Geonorge", href: "https://geonorge.no", external: true },
    { label: "API-dokumentasjon", href: "https://kartkatalog.geonorge.no", external: true },
  ],
};

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
              <svg
                width="22"
                height="22"
                viewBox="0 0 28 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect width="28" height="28" rx="4" fill="#00B140" />
                <path
                  d="M6 20L10 12L14 17L18 10L22 20"
                  stroke="white"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Kartverket
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Et åpent utforskningsverktøy for Norges geografi, kart og
              stedsnavn — bygd på offentlige APIer.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group} className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {group}
              </h3>
              <ul className="flex flex-col gap-2">
                {links.map((link) => (
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
          ))}
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Kartverket Explorer</p>
          <p>
            Bygd med{" "}
            <span style={{ color: "var(--kv-green)" }}>♥</span>
            {" "}og åpne data fra{" "}
            <a
              href="https://www.kartverket.no"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors underline underline-offset-2"
            >
              Kartverket
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
