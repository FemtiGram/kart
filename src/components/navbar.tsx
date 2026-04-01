"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Mountain, DollarSign, Shield, Zap } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const navLinks = [
  { href: "/map", label: "Høydekart", icon: Mountain },
  { href: "/lonn", label: "Inntektskart", icon: DollarSign },
  { href: "/vern", label: "Verneområder", icon: Shield },
  { href: "/lading", label: "Ladestasjoner", icon: Zap },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full bg-background border-b">
      {/* Green top accent line */}
      <div className="h-1 w-full" style={{ background: "var(--kv-green)" }} />
      <div className="container mx-auto flex h-14 items-center justify-between px-6 md:px-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="h-8 w-8 shrink-0">
            <rect width="32" height="32" rx="7" fill="#003da5"/>
            <g transform="translate(5, 5) scale(0.9375)" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
              <line x1="9" x2="9" y1="3" y2="18"/>
              <line x1="15" x2="15" y1="6" y2="21"/>
            </g>
          </svg>
          <span className="font-extrabold text-base tracking-tight">MapGram</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3.5 py-2 rounded-md text-sm font-medium transition-colors ${
                pathname === link.href
                  ? "text-foreground bg-muted"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Mobile nav */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <button
                className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-foreground hover:bg-muted transition-colors"
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
              {navLinks.map((link) => {
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
