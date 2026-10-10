# Valgkart

Election results per kommune: which party got the most votes, the full vote split, turnout and change since the previous election, plus an animated timeline of every Stortingsvalg since 1945.

Route: `/valg`

---

## Data Sources

| Data | Source | Script | Output |
|------|--------|--------|--------|
| Stortingsvalg 2025/2021, Kommunestyrevalg 2023/2019 (detail view) | Valgdirektoratet, `valgresultat.no/api/{year}/{type}` | `scripts/fetch-valg.mjs` (prebuild) | `public/data/valg/{type}-{year}.json` + `index.json` |
| Stortingsvalg 1945–2025 (timeline) | SSB table 08092 + SSB Klass 131 (kommune changes) | `scripts/fetch-valg-historikk.mjs` (manual) | `public/data/valg/historikk.json` |

valgresultat.no also has Stortingsvalg back to 2009 and Kommunestyrevalg back to 2011, but SSB 08092 covers all 21 Stortingsvalg since 1945 per kommune, so the timeline uses SSB. SSB has no comparable per-kommune history for Kommunestyrevalg (only 2007–2015), so the timeline is Stortingsvalg only.

---

## Timeline data: recalculating 1945 onto today's map

Norway had 744 kommuner in 1945 and has 357 today. `fetch-valg-historikk.mjs`:

1. Fetches votes for every party in every historical kommune, one election at a time (SSB allows 30 requests/minute).
2. Matches each SSB region to the Klass code valid on election day, by code **and** name. SSB reuses codes; regions like `0701u` (Borre) are earlier kommuner that held a number later given to another.
3. Follows each kommune through every later Klass change (mergers, splits, renumbering) to the kommuner on today's map.
4. When a kommune was later divided, its votes go to the successor that kept its code or name. Kommuner that didn't exist yet (e.g. Fedje before 1947) get the **shares** of the kommune they belonged to, without counting the votes twice.
5. Groups parties by lineage so colours stay continuous: Bondepartiet → Sp, Anders Langes parti → FrP, Sosialistisk Folkeparti / Sosialistisk Valgforbund → SV, Rød Valgallianse → Rødt. Joint lists (`90x`) become `FELLES`; everything else is `ANDRE`.
6. Publishes shares (0.1 % precision), not votes, so a misplaced border village moves a fraction of a percent, not a winner.

**Checks per election (the script keeps the old file if any fails):** every region is mapped, the kommune sum equals the national total, all 357 kommuner have data.

**Cross-check:** for 2021 and 2025 every party share matches the valgresultat.no files within ±0.05 percentage points. The only "winner" differences are Alta and Kautokeino (a local list counted as "Andre") and Modalen 2025 (an exact 43–43 tie between Sp and FrP).

Share of votes in kommuner that were later split (where "main successor" is an approximation): 13 % in 1945–1957, 5 % in 1969, about 2 % from the 1990s.

Rerun after a new Stortingsvalg or kommune reform:

```bash
node scripts/fetch-valg-historikk.mjs
```

---

## Timeline UI

`src/components/valg-timeline.tsx`, panel chrome shared with /energikart in `src/components/timeline-panel.tsx`.

- Each kommune is filled with its largest party; opacity scales with the winning share (25 % → 0.55, 55 % → 0.95).
- Fills cross-fade between elections through a CSS transition on the SVG paths (`.valg-timeline` in `globals.css`), 1.3 s per election.
- The timeline owns the colours through the page's `geoStyle` function. react-leaflet re-applies the GeoJSON `style` prop on every parent render, so direct `setStyle` calls alone would be wiped by the next render.
- Hover (desktop) or tap (mobile) shows a kommune's top three parties for the selected year. Closing restores the normal 2025 colours.

## SEO

The timeline is client-rendered, so `/valg` also server-renders a table of all 21 elections (largest party nationally, kommuner won) from the same `historikk.json` via `src/lib/valg-historikk.ts`. The Dataset JSON-LD declares `temporalCoverage: 1945/2025`.
