"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";

interface KommuneOption {
  knr: string;
  name: string;
  fylke: string | null;
}

const BOLIGTYPE_OPTIONS = [
  { value: "01", label: "Enebolig" },
  { value: "02", label: "Småhus" },
  { value: "03", label: "Blokkleilighet" },
] as const;

const YEARS = ["2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023"] as const;

type Boligtype = (typeof BOLIGTYPE_OPTIONS)[number]["value"];

export function UtviklingCalculator({ kommuner }: { kommuner: KommuneOption[] }) {
  const [kommuneQuery, setKommuneQuery] = useState("");
  const [boligtype, setBoligtype] = useState<Boligtype>("01");
  const [year, setYear] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [area, setArea] = useState<string>("");

  // Resolve the typed query to a knr when the user has picked a valid kommune
  // (iteration 2 will use this for the actual lookup)
  const matchedKommune = kommuner.find(
    (k) => `${k.name} (${k.knr})` === kommuneQuery || k.name === kommuneQuery
  );

  const canSubmit =
    !!matchedKommune && !!year && !!price && parseFloat(price) > 0;

  return (
    <div className="bg-card rounded-2xl shadow-sm border px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex items-center gap-2 mb-4">
        <Calculator
          className="h-5 w-5"
          style={{ color: "var(--kv-blue)" }}
          aria-hidden="true"
        />
        <h2 className="text-lg font-bold tracking-tight" style={{ color: "var(--kv-blue)" }}>
          Beregn utvikling
        </h2>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Iteration 2 will compute and show the result here
        }}
        className="flex flex-col gap-5"
      >
        {/* Kommune */}
        <div>
          <label
            htmlFor="utv-kommune"
            className="text-sm font-medium text-foreground mb-2 block"
          >
            Kommune
          </label>
          <input
            id="utv-kommune"
            type="text"
            list="utv-kommune-list"
            value={kommuneQuery}
            onChange={(e) => setKommuneQuery(e.target.value)}
            placeholder="Søk etter kommune..."
            autoComplete="off"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <datalist id="utv-kommune-list">
            {kommuner.map((k) => (
              <option key={k.knr} value={`${k.name} (${k.knr})`}>
                {k.fylke}
              </option>
            ))}
          </datalist>
        </div>

        {/* Boligtype */}
        <div>
          <p className="text-sm font-medium text-foreground mb-2">Boligtype</p>
          <div className="grid grid-cols-3 gap-2">
            {BOLIGTYPE_OPTIONS.map((opt) => {
              const active = boligtype === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBoligtype(opt.value)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium border transition-colors ${
                    active
                      ? "text-white border-transparent"
                      : "bg-background hover:bg-muted text-foreground border-border"
                  }`}
                  style={active ? { background: "var(--kv-blue)" } : undefined}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Year + Price (two columns on desktop) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="utv-year"
              className="text-sm font-medium text-foreground mb-2 block"
            >
              Kjøpsår
            </label>
            <select
              id="utv-year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Velg år...</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="utv-price"
              className="text-sm font-medium text-foreground mb-2 block"
            >
              Kjøpesum (kr)
            </label>
            <input
              id="utv-price"
              type="number"
              inputMode="numeric"
              min={0}
              step={10000}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="3 000 000"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Area (optional) */}
        <div>
          <label
            htmlFor="utv-area"
            className="text-sm font-medium text-foreground mb-2 block"
          >
            Areal{" "}
            <span className="font-normal text-muted-foreground">
              (m², valgfri — gir ekstra kontekst)
            </span>
          </label>
          <input
            id="utv-area"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="80"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ background: "var(--kv-blue)" }}
        >
          Beregn
        </button>

        <p className="text-xs text-muted-foreground text-center">
          Beregningslogikk kommer i neste iterasjon — dette er bare layout-forhåndsvisning.
        </p>
      </form>
    </div>
  );
}
