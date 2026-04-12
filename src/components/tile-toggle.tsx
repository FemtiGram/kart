"use client";

import type { ReactNode } from "react";

export interface TileOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface TileToggleProps<T extends string> {
  options: TileOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function TileToggle<T extends string>({ options, value, onChange, className }: TileToggleProps<T>) {
  return (
    <div className={`flex rounded-lg border bg-card shadow-md overflow-hidden ${className ?? ""}`}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${i > 0 ? "border-l" : ""} ${value === opt.value ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
          style={value === opt.value ? { background: "var(--kv-blue)" } : {}}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
