"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Mountain, DollarSign, Shield, Zap, Home, BatteryCharging, Waves, TrendingUp, BarChart3 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuTrigger,
  NavigationMenuContent,
} from "@/components/ui/navigation-menu";

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

interface NavGroup {
  label: string;
  links: NavLink[];
}

const navGroups: NavGroup[] = [
  {
    label: "Energi",
    links: [
      { href: "/energi", label: "Energikart", icon: BatteryCharging, description: "Vind, vann, olje og gass" },
      { href: "/magasin", label: "Magasinkart", icon: Waves, description: "Vannmagasiner og fyllingsgrad" },
      { href: "/lading", label: "Ladestasjoner", icon: Zap, description: "Elbil-lading i hele Norge" },
    ],
  },
  {
    label: "Natur",
    links: [
      { href: "/map", label: "Høydekart", icon: Mountain, description: "Høydedata og værforhold" },
      { href: "/hytter", label: "Turisthytter", icon: Home, description: "DNT-hytter og fjellstuer" },
      { href: "/vern", label: "Verneområder", icon: Shield, description: "Nasjonalparker og naturreservater" },
    ],
  },
  {
    label: "Samfunn",
    links: [
      { href: "/lonn", label: "Inntektskart", icon: DollarSign, description: "Median inntekt per kommune" },
      { href: "/bolig", label: "Boligpriser", icon: TrendingUp, description: "Kvadratmeterpris per kommune" },
      { href: "/prisvekst", label: "Prisvekst", icon: BarChart3, description: "Konsumprisindeksen i Norge" },
    ],
  },
];

const allLinks = navGroups.flatMap((g) => g.links);

const triggerClass =
  "text-white hover:text-white hover:bg-white/10 focus:text-[#24374c] focus:bg-white/90 data-[active]:text-[#24374c] data-[active]:bg-white data-popup-open:text-[#24374c] data-popup-open:bg-white/90";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-[1100] w-full shadow-sm" style={{ background: "#24374c" }}>
      <div className="container mx-auto flex h-14 items-center justify-between px-6 md:px-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="h-8 w-8 shrink-0">
            <rect width="32" height="32" rx="7" fill="#24374c"/>
            <g transform="translate(5, 5) scale(0.9375)" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
              <line x1="9" x2="9" y1="3" y2="18"/>
              <line x1="15" x2="15" y1="6" y2="21"/>
            </g>
          </svg>
          <span className="font-extrabold text-base tracking-tight text-white">Datakart</span>
        </Link>

        {/* Desktop nav */}
        <NavigationMenu align="center" className="hidden md:flex">
          <NavigationMenuList className="gap-1">
            {navGroups.map((group) => {
              const isGroupActive = group.links.some((l) => l.href === pathname);
              return (
                <NavigationMenuItem key={group.label}>
                  <NavigationMenuTrigger
                    data-active={isGroupActive ? "" : undefined}
                    className={triggerClass}
                  >
                    {group.label}
                  </NavigationMenuTrigger>
                  <NavigationMenuContent className="min-w-[280px]">
                    <ul className="flex flex-col gap-1 p-1">
                      {group.links.map((link) => {
                        const Icon = link.icon;
                        return (
                          <li key={link.href}>
                            <NavigationMenuLink
                              href={link.href}
                              data-active={pathname === link.href ? "" : undefined}
                              render={<Link href={link.href} />}
                              className="flex items-start gap-3 px-3 py-3.5 rounded-md hover:bg-muted transition-colors"
                            >
                              <Icon className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium">{link.label}</p>
                                <p className="text-xs text-muted-foreground">{link.description}</p>
                              </div>
                            </NavigationMenuLink>
                          </li>
                        );
                      })}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              );
            })}
          </NavigationMenuList>
        </NavigationMenu>

        {/* Mobile nav */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <button
                className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-white hover:bg-white/10 transition-colors"
                aria-label={open ? "Lukk meny" : "Åpne meny"}
              >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            }
          />
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle className="text-left font-extrabold text-base">
                Datakart
              </SheetTitle>
            </SheetHeader>
            <nav className="mt-2 flex flex-col">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-3 pt-4 pb-2">
                    {group.label}
                  </p>
                  {group.links.map((link) => {
                    const Icon = link.icon;
                    const active = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`flex items-center gap-3 px-3 py-3.5 text-base font-medium border-b border-border transition-colors ${
                          active
                            ? "text-foreground bg-muted"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => setOpen(false)}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
