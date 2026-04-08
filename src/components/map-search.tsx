"use client";

import { useState, useCallback, useRef } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { FYLKER } from "@/lib/fylker";
import { useDebounceRef, useSearchAbort } from "@/lib/map-utils";
import type { Address, Suggestion } from "@/lib/map-utils";

// ─── Hook ───────────────────────────────────────────────────

interface UseMapSearchOptions {
  /** Kommune list for matching — from kommunerRef or geoFeaturesRef */
  kommuneList: Array<{ kommunenummer: string; kommunenavn: string }>;
  /** Optional extra suggestions (e.g. anlegg names, reservoir names) */
  extraSuggestions?: (q: string) => Suggestion[];
  /** Called when a suggestion is selected */
  onSelect: (s: Suggestion) => void;
}

export function useMapSearch({ kommuneList, extraSuggestions, onSelect }: UseMapSearchOptions) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useDebounceRef();
  const searchAbort = useSearchAbort();
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoadingSuggestions(true);

    const extra = extraSuggestions?.(q) ?? [];

    const fylkeMatches: Suggestion[] = FYLKER
      .filter((f) => f.fylkesnavn.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 3)
      .map((f) => ({ type: "fylke", fylkesnavn: f.fylkesnavn, lat: f.lat, lon: f.lon, zoom: f.zoom }));

    const kommuneMatches: Suggestion[] = kommuneList
      .filter((k) => k.kommunenavn.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 5)
      .map((k) => ({ type: "kommune", kommunenummer: k.kommunenummer, kommunenavn: k.kommunenavn }));

    let adresseMatches: Suggestion[] = [];
    try {
      const signal = searchAbort.renew();
      const res = await fetch(
        `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=2&utkoordsys=4326`,
        { signal }
      );
      const data = await res.json();
      adresseMatches = (data.adresser ?? []).map((a: Address) => ({ type: "adresse" as const, addr: a }));
    } catch { /* aborted */ }

    setSuggestions([...extra, ...fylkeMatches, ...kommuneMatches, ...adresseMatches]);
    setShowDropdown(true);
    setLoadingSuggestions(false);
  }, [kommuneList, extraSuggestions, searchAbort]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setHighlightedIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  }, [debounceRef, search]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      onSelect(suggestions[highlightedIndex]);
      setShowDropdown(false);
      setSuggestions([]);
      setHighlightedIndex(-1);
    }
    else if (e.key === "Escape") { setShowDropdown(false); setHighlightedIndex(-1); }
  }, [showDropdown, suggestions, highlightedIndex, onSelect]);

  const handleSelect = useCallback((s: Suggestion) => {
    setShowDropdown(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
    onSelect(s);
  }, [onSelect]);

  return {
    query, setQuery,
    suggestions, showDropdown, setShowDropdown,
    highlightedIndex,
    loadingSuggestions,
    inputRef,
    handleInput, handleKeyDown, handleSelect,
  };
}

// ─── Component ──────────────────────────────────────────────

interface MapSearchBarProps {
  search: ReturnType<typeof useMapSearch>;
  placeholder: string;
  children?: React.ReactNode;
}

export function MapSearchBar({ search: s, placeholder, children }: MapSearchBarProps) {
  return (
    <div className="relative flex items-center gap-2">
      <div className="flex flex-1 items-center gap-2 bg-background border rounded-xl px-4 py-3">
        {s.loadingSuggestions ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <input
          ref={s.inputRef}
          value={s.query}
          onChange={s.handleInput}
          autoFocus
          onFocus={() => s.suggestions.length > 0 && s.setShowDropdown(true)}
          onBlur={() => setTimeout(() => s.setShowDropdown(false), 150)}
          onKeyDown={s.handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground text-[16px] sm:text-sm"
        />
      </div>
      {children}
      {s.showDropdown && s.suggestions.length > 0 && (
        <ul className="absolute top-full mt-1 left-0 right-0 bg-background rounded-xl shadow-xl border overflow-hidden z-50">
          {s.suggestions.map((sug, i) => (
            <li key={i}>
              <button
                onMouseDown={() => s.handleSelect(sug)}
                className={`w-full text-left px-4 py-3 text-sm flex items-start gap-3 transition-colors border-b last:border-0 ${s.highlightedIndex === i ? "bg-muted" : "hover:bg-muted"}`}
              >
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                {sug.type === "fylke" ? (
                  <div><p className="font-medium">{sug.fylkesnavn}</p><p className="text-xs text-muted-foreground">Fylke</p></div>
                ) : sug.type === "kommune" ? (
                  <div><p className="font-medium">{sug.kommunenavn}</p><p className="text-xs text-muted-foreground">Kommune</p></div>
                ) : sug.type === "adresse" ? (
                  <div><p className="font-medium">{sug.addr.adressetekst}</p><p className="text-xs text-muted-foreground">{sug.addr.poststed}, {sug.addr.kommunenavn}</p></div>
                ) : sug.type === "anlegg" ? (
                  <div><p className="font-medium">{sug.name}</p><p className="text-xs text-muted-foreground">{sug.subtitle}</p></div>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
