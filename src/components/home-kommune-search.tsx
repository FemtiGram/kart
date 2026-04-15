"use client";

import { useState, useDeferredValue, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, ArrowRight } from "lucide-react";

/**
 * Lightweight "find your kommune" search for the home hero. Takes the
 * full kommune list as a prop (server-loaded from
 * `public/data/kommune-profiles.json` via the page's server component),
 * filters client-side with diacritic-aware matching, and routes straight
 * to /kommune/[slug] on Enter or click.
 *
 * Distinct from `KommuneIndex` (the /kommune directory page) which
 * renders a full grouped listing. This one is navigation-only — no
 * directory, no fylke grouping, just "type → jump".
 */

interface HomeKommuneItem {
  knr: string;
  displayName: string;
  name: string;
  slug: string;
  fylke: string | null;
}

/**
 * Lowercase + strip Norwegian and Sami diacritics so a reader typing
 * "kautokeino" matches "Guovdageaidnu - Kautokeino". Same rules as the
 * directory page's KommuneIndex.
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

export function HomeKommuneSearch({
  kommuner,
}: {
  kommuner: HomeKommuneItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(-1);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // useDeferredValue keeps the input at 60 fps under React's concurrent
  // scheduler — the filter re-runs at a lower priority than keystrokes.
  const deferred = useDeferredValue(query);
  const q = deferred.trim();

  const filtered = useMemo(() => {
    if (!q) return [];
    const needle = normalize(q);
    return kommuner
      .filter(
        (k) =>
          normalize(k.name).includes(needle) ||
          normalize(k.knr).includes(needle) ||
          (k.fylke && normalize(k.fylke).includes(needle))
      )
      .slice(0, 6);
  }, [kommuner, q]);

  // Auto-highlight the top match so a reader who types and presses Enter
  // lands on the most relevant kommune immediately, without using arrows.
  useEffect(() => {
    setHighlighted(filtered.length > 0 ? 0 : -1);
  }, [filtered]);

  const showDropdown = focused && filtered.length > 0;

  function navigate(slug: string) {
    router.push(`/kommune/${slug}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      navigate(filtered[highlighted].slug);
    } else if (e.key === "Escape") {
      setQuery("");
      setHighlighted(-1);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 z-10"
          style={{ color: "var(--kv-blue)" }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
            setFocused(true);
          }}
          onBlur={() => {
            // Delay the blur so an onMouseDown on a result still fires
            // before the dropdown unmounts.
            blurTimerRef.current = setTimeout(() => setFocused(false), 150);
          }}
          onKeyDown={onKeyDown}
          placeholder="Søk etter din kommune..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-label="Søk etter kommune"
          className="w-full h-12 pl-11 pr-4 rounded-full bg-white/95 backdrop-blur-sm border border-white/20 text-foreground text-[16px] sm:text-base placeholder:text-foreground/50 shadow-xl focus:outline-none focus:ring-2 focus:ring-white/40 transition-shadow"
        />
      </div>

      {showDropdown && (
        <ul
          role="listbox"
          className="absolute top-full mt-2 left-0 right-0 rounded-2xl bg-background border shadow-2xl overflow-hidden z-50"
        >
          {filtered.map((k, i) => (
            <li key={k.knr}>
              <button
                type="button"
                role="option"
                aria-selected={highlighted === i}
                onMouseDown={() => navigate(k.slug)}
                onMouseEnter={() => setHighlighted(i)}
                className={`group w-full flex items-center gap-3 px-4 py-3 text-left border-b last:border-0 transition-colors ${
                  highlighted === i ? "bg-muted" : "hover:bg-muted"
                }`}
              >
                <MapPin className="h-4 w-4 shrink-0 text-foreground/50" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {k.displayName}
                  </p>
                  {k.fylke && (
                    <p className="text-xs text-foreground/60 truncate">
                      {k.fylke}
                    </p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-foreground/40 group-hover:text-foreground transition-colors" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
