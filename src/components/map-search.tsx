"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useImperativeHandle,
  useDeferredValue,
  forwardRef,
} from "react";
import { Search, MapPin, Anchor, Loader2 } from "lucide-react";
import { FYLKER } from "@/lib/fylker";
import { useDebounceRef, useSearchAbort } from "@/lib/map-utils";
import type { Address, KommuneEntry, Suggestion } from "@/lib/map-utils";

// ─── Imperative handle ──────────────────────────────────────

/**
 * Parent components can imperatively control the search bar via a ref:
 *
 *   const searchRef = useRef<MapSearchBarHandle>(null);
 *   searchRef.current?.setQuery("Oslo");
 *
 * Used when a map click / marker select should fill the input with the
 * resolved name.
 */
export interface MapSearchBarHandle {
  setQuery: (q: string) => void;
  focus: () => void;
}

// ─── Component props ────────────────────────────────────────

interface MapSearchBarProps {
  /** Getter that returns the kommune list (usually a ref-backed array). */
  kommuneList: () => KommuneEntry[];
  /** Optional extra suggestions (e.g. oil/gas facility names). */
  extraSuggestions?: (q: string) => Suggestion[];
  /** Called when a suggestion is selected. */
  onSelect: (s: Suggestion) => void;
  /** Input placeholder text. */
  placeholder: string;
  /** Rendered inline next to the input (filter button, etc). */
  children?: React.ReactNode;
}

// ─── Component ──────────────────────────────────────────────

/**
 * Self-contained search bar. Owns all search state (query, suggestions,
 * dropdown, debounce, abort) internally so that parent map components are
 * not re-rendered on every keystroke.
 *
 * Before this refactor: typing "oslo" re-rendered the parent ChargingMap
 * four times, which in turn reconciled ~2000 <Marker> components per key.
 * Now the marker tree is untouched until the user actually picks a
 * suggestion — keyboard input stays at 60fps even on slow laptops.
 */
export const MapSearchBar = forwardRef<MapSearchBarHandle, MapSearchBarProps>(
  function MapSearchBar(
    { kommuneList, extraSuggestions, onSelect, placeholder, children },
    ref
  ) {
    const [query, setQueryState] = useState("");
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [showSpinner, setShowSpinner] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const debounceRef = useDebounceRef();
    const searchAbort = useSearchAbort();
    const inputRef = useRef<HTMLInputElement>(null);
    const isComposingRef = useRef(false);

    // Stable refs for props used inside async callbacks — avoids stale
    // closures when the parent re-renders with new getters/handlers.
    // Synced in an effect (not during render) to satisfy strict React rules.
    const propsRef = useRef({ kommuneList, extraSuggestions, onSelect });
    useEffect(() => {
      propsRef.current = { kommuneList, extraSuggestions, onSelect };
    });

    // Expose imperative API to parent
    useImperativeHandle(
      ref,
      () => ({
        setQuery: (q: string) => setQueryState(q),
        focus: () => inputRef.current?.focus(),
      }),
      []
    );

    // 200ms grace before the spinner shows — prevents flicker on cached
    // /api/sok responses that return in 20–50ms. Cleanup resets the spinner
    // when loading finishes.
    useEffect(() => {
      if (!loading) return;
      const t = setTimeout(() => setShowSpinner(true), 200);
      return () => {
        clearTimeout(t);
        setShowSpinner(false);
      };
    }, [loading]);

    const runSearch = useCallback(
      async (q: string) => {
        if (q.length < 2) {
          setSuggestions([]);
          return;
        }
        setLoading(true);

        const extra = propsRef.current.extraSuggestions?.(q) ?? [];

        const ql = q.toLowerCase();

        const fylkeMatches: Suggestion[] = FYLKER.filter((f) =>
          f.fylkesnavn.toLowerCase().includes(ql)
        )
          .slice(0, 3)
          .map((f) => ({
            type: "fylke",
            fylkesnavn: f.fylkesnavn,
            lat: f.lat,
            lon: f.lon,
            zoom: f.zoom,
          }));

        const kommuneMatches: Suggestion[] = propsRef.current.kommuneList()
          .filter((k) => k.kommunenavn.toLowerCase().includes(ql))
          .slice(0, 5)
          .map((k) => ({
            type: "kommune",
            kommunenummer: k.kommunenummer,
            kommunenavn: k.kommunenavn,
          }));

        let adresseMatches: Suggestion[] = [];
        try {
          const signal = searchAbort.renew();
          const res = await fetch(`/api/sok?q=${encodeURIComponent(q)}&n=2`, {
            signal,
          });
          const data = await res.json();
          adresseMatches = (data.adresser ?? []).map((a: Address) => ({
            type: "adresse" as const,
            addr: a,
          }));
        } catch {
          /* aborted or network error */
        }

        setSuggestions([
          ...extra,
          ...fylkeMatches,
          ...kommuneMatches,
          ...adresseMatches,
        ]);
        setShowDropdown(true);
        setLoading(false);
      },
      [searchAbort]
    );

    const scheduleSearch = useCallback(
      (val: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runSearch(val), 150);
      },
      [debounceRef, runSearch]
    );

    const handleInput = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQueryState(val);
        setHighlightedIndex(-1);
        if (isComposingRef.current) return;
        scheduleSearch(val);
      },
      [scheduleSearch]
    );

    const handleCompositionStart = useCallback(() => {
      isComposingRef.current = true;
    }, []);

    const handleCompositionEnd = useCallback(
      (e: React.CompositionEvent<HTMLInputElement>) => {
        isComposingRef.current = false;
        scheduleSearch((e.target as HTMLInputElement).value);
      },
      [scheduleSearch]
    );

    const handleSelect = useCallback((s: Suggestion) => {
      setShowDropdown(false);
      setSuggestions([]);
      setHighlightedIndex(-1);
      propsRef.current.onSelect(s);
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!showDropdown || suggestions.length === 0) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlightedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && highlightedIndex >= 0) {
          e.preventDefault();
          handleSelect(suggestions[highlightedIndex]);
        } else if (e.key === "Escape") {
          setShowDropdown(false);
          setHighlightedIndex(-1);
        }
      },
      [showDropdown, suggestions, highlightedIndex, handleSelect]
    );

    // Deferred suggestions keep the input 60fps under React concurrent
    // rendering even when the dropdown is expensive to render.
    const deferredSuggestions = useDeferredValue(suggestions);

    return (
      <div className="relative flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 bg-background border rounded-xl px-4 py-3">
          {showSpinner ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={handleInput}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            autoFocus={
              typeof window !== "undefined" && window.innerWidth >= 640
            }
            onFocus={() =>
              suggestions.length > 0 && setShowDropdown(true)
            }
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            role="combobox"
            aria-expanded={showDropdown && deferredSuggestions.length > 0}
            aria-controls="search-results"
            aria-autocomplete="list"
            aria-activedescendant={
              highlightedIndex >= 0
                ? `search-result-${highlightedIndex}`
                : undefined
            }
            className="flex-1 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
          />
        </div>
        {children}
        {showDropdown && deferredSuggestions.length > 0 && (
          <ul
            id="search-results"
            role="listbox"
            aria-label="Søkeresultater"
            className="absolute top-full mt-1 left-0 right-0 bg-background rounded-xl shadow-xl border overflow-hidden z-50"
          >
            {deferredSuggestions.map((sug, i) => (
              <li key={i} role="option" aria-selected={highlightedIndex === i} id={`search-result-${i}`}>
                <button
                  onMouseDown={() => handleSelect(sug)}
                  className={`w-full text-left px-4 py-3 text-sm flex items-start gap-3 transition-colors border-b last:border-0 ${highlightedIndex === i ? "bg-muted" : "hover:bg-muted"}`}
                >
                  {sug.type === "anlegg" ? (
                    <Anchor className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  )}
                  {sug.type === "fylke" ? (
                    <div>
                      <p className="font-medium">{sug.fylkesnavn}</p>
                      <p className="text-xs text-foreground/70">Fylke</p>
                    </div>
                  ) : sug.type === "kommune" ? (
                    <div>
                      <p className="font-medium">{sug.kommunenavn}</p>
                      <p className="text-xs text-foreground/70">Kommune</p>
                    </div>
                  ) : sug.type === "adresse" ? (
                    <div>
                      <p className="font-medium">{sug.addr.adressetekst}</p>
                      <p className="text-xs text-foreground/70">
                        {sug.addr.poststed}, {sug.addr.kommunenavn}
                      </p>
                    </div>
                  ) : sug.type === "anlegg" ? (
                    <div>
                      <p className="font-medium">{sug.name}</p>
                      <p className="text-xs text-foreground/70">
                        {sug.subtitle}
                      </p>
                    </div>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
);
