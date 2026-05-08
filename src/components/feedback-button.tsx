"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

type FoundAnswer = "ja" | "delvis" | "nei";
type Status = "idle" | "submitting" | "success" | "error";

const FOUND_OPTIONS: { value: FoundAnswer; label: string }[] = [
  { value: "ja", label: "Ja" },
  { value: "delvis", label: "Delvis" },
  { value: "nei", label: "Nei" },
];

export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Kill switch: set NEXT_PUBLIC_FEEDBACK_ENABLED=false in Vercel to hide.
  const enabled = process.env.NEXT_PUBLIC_FEEDBACK_ENABLED !== "false";
  const [found, setFound] = useState<FoundAnswer | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  function reset() {
    setFound(null);
    setMessage("");
    setEmail("");
    setWebsite("");
    setStatus("idle");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTimeout(reset, 200);
    }
  }

  async function handleSubmit() {
    if (status === "submitting") return;
    if (!found && !message.trim()) return;

    setStatus("submitting");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          found,
          message: message.trim() || undefined,
          email: email.trim() || undefined,
          page: pathname,
          website,
        }),
      });
      if (!res.ok) throw new Error("submit failed");
      setStatus("success");
      setTimeout(() => setOpen(false), 2200);
    } catch {
      setStatus("error");
    }
  }

  const canSubmit =
    (found !== null || message.trim().length > 0) && status !== "submitting";

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Gi tilbakemelding"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[1000] inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-white shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ background: "var(--kv-blue)" }}
      >
        <MessageCircle className="h-4 w-4" />
        <span>Tilbakemelding</span>
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[85svh] overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-md px-4 pb-6">
            <SheetHeader>
              <SheetTitle className="text-left">Tilbakemelding</SheetTitle>
              <SheetDescription className="text-left">
                Hjelp oss å gjøre Datakart bedre.
              </SheetDescription>
            </SheetHeader>

            {status === "success" ? (
              <div className="py-10 text-center">
                <p className="text-lg font-semibold text-foreground">
                  Tusen takk!
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Tilbakemeldingen din er mottatt.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-5 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">
                    Fant du det du lette etter?
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {FOUND_OPTIONS.map((opt) => {
                      const active = found === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setFound(active ? null : opt.value)}
                          className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                            active
                              ? "text-white border-transparent"
                              : "bg-background hover:bg-muted text-foreground border-border"
                          }`}
                          style={
                            active ? { background: "var(--kv-blue)" } : undefined
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="feedback-message"
                    className="text-sm font-medium text-foreground mb-2 block"
                  >
                    Hva tenker du? Noe du savner eller vil endre?
                  </label>
                  <textarea
                    id="feedback-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    placeholder="Skriv her..."
                  />
                </div>

                <div>
                  <label
                    htmlFor="feedback-email"
                    className="text-sm font-medium text-foreground mb-2 block"
                  >
                    E-post{" "}
                    <span className="font-normal text-muted-foreground">
                      (valgfri, hvis du vil ha svar)
                    </span>
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={200}
                    inputMode="email"
                    autoComplete="email"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="navn@eksempel.no"
                  />
                </div>

                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "-9999px",
                    top: 0,
                    height: 0,
                    overflow: "hidden",
                  }}
                >
                  <label htmlFor="feedback-website">Nettsted</label>
                  <input
                    id="feedback-website"
                    type="text"
                    name="website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ background: "var(--kv-blue)" }}
                >
                  {status === "submitting" ? "Sender..." : "Send"}
                </button>

                {status === "error" && (
                  <p
                    className="text-sm text-center"
                    style={{ color: "var(--kv-negative-dark)" }}
                  >
                    Noe gikk galt. Prøv igjen om litt.
                  </p>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
