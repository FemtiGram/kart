"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Mountain, DollarSign, Shield, Zap, Home, Wind, BatteryCharging, Waves } from "lucide-react";
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
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

const primaryLinks = [
  { href: "/map", label: "Høydekart", icon: Mountain },
  { href: "/energi", label: "Energikart", icon: BatteryCharging },
  { href: "/magasin", label: "Magasinkart", icon: Waves },
  { href: "/lading", label: "Ladestasjoner", icon: Zap },
  { href: "/hytter", label: "Turisthytter", icon: Home },
];

const secondaryLinks = [
  { href: "/lonn", label: "Inntektskart", icon: DollarSign, description: "Median inntekt per kommune" },
  { href: "/vern", label: "Verneområder", icon: Shield, description: "Nasjonalparker og naturreservater" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isSecondaryActive = secondaryLinks.some((l) => l.href === pathname);

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
          <span className="font-extrabold text-base tracking-tight text-white">MapGram</span>
        </Link>

        {/* Desktop nav */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {primaryLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <NavigationMenuItem key={link.href}>
                  <NavigationMenuLink
                    href={link.href}
                    data-active={active ? "" : undefined}
                    className="inline-flex h-9 w-max items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all text-white/70 hover:text-white hover:bg-white/10 focus:text-[#24374c] focus:bg-white/90 data-[active]:text-[#24374c] data-[active]:bg-white"
                    render={<Link href={link.href} />}
                  >
                    {link.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            })}

            {/* "Mer" dropdown for secondary pages */}
            <NavigationMenuItem>
              <NavigationMenuTrigger
                data-active={isSecondaryActive ? "" : undefined}
                className="text-white/70 hover:text-white hover:bg-white/10 focus:text-[#24374c] focus:bg-white/90 data-[active]:text-[#24374c] data-[active]:bg-white data-popup-open:text-[#24374c] data-popup-open:bg-white/90"
              >
                Mer
              </NavigationMenuTrigger>
              <NavigationMenuContent className="min-w-[240px]">
                <ul className="flex flex-col">
                  {secondaryLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <li key={link.href}>
                        <NavigationMenuLink
                          href={link.href}
                          data-active={pathname === link.href ? "" : undefined}
                          render={<Link href={link.href} />}
                          className="flex items-start gap-3 p-3 rounded-md hover:bg-muted transition-colors"
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
                MapGram
              </SheetTitle>
            </SheetHeader>
            <nav className="mt-2 flex flex-col">
              {primaryLinks.map((link) => {
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

              {/* Separator + secondary items */}
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 px-3 pt-4 pb-2">
                Annet
              </p>
              {secondaryLinks.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-3 px-3 py-3.5 text-base font-medium border-b border-border last:border-0 transition-colors ${
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
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
