"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function InfoModal({ open, onClose, title, children }: InfoModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-2xl shadow-xl border w-full max-w-sm p-5 max-h-[85svh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-base">{title}</h2>
          <button
            onClick={onClose}
            className="p-2.5 -mr-2 -mt-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Lukk"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
