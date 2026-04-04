"use client";

import { LocateFixed, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LocationPromptProps {
  asked: boolean;
  locating: boolean;
  /** Short description shown below the heading, e.g. "Vi kan vise kommunen du befinner deg i" */
  description: string;
  onChoice: (useLocation: boolean) => void;
  /** Only show when loading is false (for maps that load data before prompting) */
  loading?: boolean;
}

export function LocationPrompt({ asked, locating, description, onChoice, loading = false }: LocationPromptProps) {
  if (loading) return null;

  if (!asked) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-[1000]">
        <div className="bg-background rounded-2xl shadow-xl border px-6 py-6 max-w-sm w-full mx-4 flex flex-col items-center gap-4 text-center">
          <LocateFixed className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-semibold text-base">Bruk din posisjon?</p>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
          <div className="flex gap-3 w-full">
            <Button onClick={() => onChoice(true)} className="flex-1" size="lg">
              <LocateFixed className="h-4 w-4" /> Ja, bruk posisjon
            </Button>
            <Button onClick={() => onChoice(false)} variant="secondary" className="flex-1" size="lg">
              Nei takk
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (locating) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-[1000]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Finner posisjon...
        </div>
      </div>
    );
  }

  return null;
}
