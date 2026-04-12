"use client";

import { useEffect, useRef } from "react";

/**
 * Sync a selection state with the URL hash.
 *
 * Usage:
 *   useHashSelection({
 *     prefix: "kommune",
 *     selectedId: selected?.kommunenummer ?? null,
 *     onRestore: (id) => { ... restore selection from id ... },
 *     readyToRestore: !loading && geoData != null,
 *   });
 *
 * When `selectedId` changes, the URL hash is updated to `#{prefix}-{id}`.
 * On mount (once `readyToRestore` is true), any matching hash triggers `onRestore`.
 */
export function useHashSelection(opts: {
  prefix: string;
  selectedId: string | number | null | undefined;
  onRestore: (id: string) => void;
  readyToRestore: boolean;
}) {
  const { prefix, selectedId, onRestore, readyToRestore } = opts;
  const initialHash = useRef<string>(typeof window !== "undefined" ? window.location.hash : "");
  const restored = useRef(false);

  // Sync selection → URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedId != null) {
      history.replaceState(null, "", `#${prefix}-${selectedId}`);
    } else if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
  }, [prefix, selectedId]);

  // Restore from URL once data is ready
  useEffect(() => {
    if (restored.current) return;
    if (!readyToRestore) return;
    const hash = initialHash.current || (typeof window !== "undefined" ? window.location.hash : "");
    if (!hash) { restored.current = true; return; }
    const pattern = new RegExp(`^#${prefix}-(.+)$`);
    const match = hash.match(pattern);
    if (match) {
      onRestore(match[1]);
    }
    restored.current = true;
  }, [prefix, onRestore, readyToRestore]);
}
