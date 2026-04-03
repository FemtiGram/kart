import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[calc(100svh-57px)] flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <p className="text-6xl font-extrabold" style={{ color: "var(--kv-blue)" }}>404</p>
        <p className="mt-3 text-lg font-semibold">Siden ble ikke funnet</p>
        <p className="mt-1 text-sm text-muted-foreground">Denne siden finnes ikke eller har blitt flyttet.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ background: "var(--kv-blue)" }}
        >
          Tilbake til forsiden
        </Link>
      </div>
    </div>
  );
}
