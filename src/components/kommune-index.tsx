"use client";

import { useState, useDeferredValue, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, MapPin, X } from "lucide-react";

interface KommuneListItem {
  knr: string;
  /** The name shown to the user. First segment for bilingual kommuner. */
  displayName: string;
  /** Full name including both Sami and Norwegian segments when bilingual. */
  name: string;
  slug: string;
  fylke: string | null;
}

/**
 * Normalize text for search: lowercase, strip Norwegian + Sami diacritics.
 * Lets a user type "kautokeino" and match "Guovdageaidnu - Kautokeino",
 * or "trondheim" to match "Trondheim - Tråante".
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "o")
    .replaceAll("å", "a")
    .replaceAll("á", "a")
    .replaceAll("č", "c")
    .replaceAll("ŋ", "ng")
    .replaceAll("š", "s")
    .replaceAll("ŧ", "t")
    .replaceAll("ž", "z");
}

export function KommuneIndex({
  kommuner,
}: {
  kommuner: KommuneListItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount (desktop only — mobile autoFocus causes iOS
  // viewport jank). Using an effect avoids the hydration mismatch that
  // would occur if we tried to pass a window-dependent autoFocus prop.
  useEffect(() => {
    if (window.innerWidth >= 640) {
      inputRef.current?.focus();
    }
  }, []);
  // Defer filtering so typing stays 60fps even on slow devices.
  const deferredQuery = useDeferredValue(query);
  const q = deferredQuery.trim();

  const filtered = useMemo(() => {
    if (!q) return null;
    const needle = normalize(q);
    return kommuner
      .filter(
        (k) =>
          normalize(k.name).includes(needle) ||
          normalize(k.knr).includes(needle) ||
          (k.fylke && normalize(k.fylke).includes(needle))
      )
      .slice(0, 50);
  }, [kommuner, q]);

  // Reset highlight when the filter result changes. Auto-highlight the
  // first item so Enter immediately navigates to the top match.
  useEffect(() => {
    setHighlightedIndex(filtered && filtered.length > 0 ? 0 : -1);
  }, [filtered]);

  // Keep the highlighted item in view when navigating with arrow keys.
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-kommune-index="${highlightedIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!filtered || filtered.length === 0) {
      if (e.key === "Escape" && query) {
        e.preventDefault();
        setQuery("");
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlightedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlightedIndex(filtered.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[highlightedIndex] ?? filtered[0];
      if (target) router.push(`/kommune/${target.slug}`);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (query) {
        setQuery("");
      } else {
        (e.target as HTMLInputElement).blur();
      }
    }
  };

  const grouped = useMemo(() => {
    if (filtered) return null;
    const byFylke: Record<string, KommuneListItem[]> = {};
    for (const k of kommuner) {
      const fylke = k.fylke ?? "Andre";
      (byFylke[fylke] ??= []).push(k);
    }
    const fylkeNames = Object.keys(byFylke).sort((a, b) =>
      a.localeCompare(b, "no")
    );
    return { byFylke, fylkeNames };
  }, [kommuner, filtered]);

  return (
    <>
      {/* Search input */}
      <div className="mt-8 mb-8 sticky top-14 z-10 bg-background/95 backdrop-blur-sm pt-2 pb-2 -mx-2 px-2">
        <div className="flex items-center gap-2 bg-card border rounded-xl px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-autocomplete="list"
            aria-controls="kommune-results"
            aria-activedescendant={
              highlightedIndex >= 0 ? `kommune-result-${highlightedIndex}` : undefined
            }
            placeholder="Søk etter kommune, fylke eller kommunenummer..."
            className="flex-1 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="shrink-0 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Tøm søk"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filtered flat list */}
      {filtered && (
        <div>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              Ingen kommuner matcher «{deferredQuery}».
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground/70 mb-3">
                {filtered.length} treff
                {filtered.length === 50 && kommuner.length > 50
                  ? " (viser de første 50)"
                  : ""}
                <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
                  · ↑↓ Enter for å velge
                </span>
              </p>
              <div
                ref={listRef}
                id="kommune-results"
                role="listbox"
                className="rounded-2xl border bg-card overflow-hidden"
              >
                {filtered.map((k, i) => {
                  const isHighlighted = i === highlightedIndex;
                  return (
                    <Link
                      key={k.knr}
                      id={`kommune-result-${i}`}
                      role="option"
                      aria-selected={isHighlighted}
                      data-kommune-index={i}
                      href={`/kommune/${k.slug}`}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${i > 0 ? "border-t" : ""} ${isHighlighted ? "bg-muted" : "hover:bg-muted"}`}
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium flex-1">
                        {k.displayName}
                      </span>
                      {k.fylke && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {k.fylke}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Default grouped-by-fylke view */}
      {grouped && (
        <div className="space-y-8">
          {grouped.fylkeNames.map((fylke) => (
            <div key={fylke}>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground/70 mb-3">
                {fylke}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
                {grouped.byFylke[fylke].map((k) => (
                  <Link
                    key={k.knr}
                    href={`/kommune/${k.slug}`}
                    className="text-sm py-1 text-foreground/80 hover:text-foreground hover:underline transition-colors truncate"
                  >
                    {k.displayName}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
