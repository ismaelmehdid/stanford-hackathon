import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/70 backdrop-blur-md print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-6 place-items-center rounded-full border border-foreground"
          >
            <span className="size-2 rounded-full bg-foreground" />
          </span>
          <span className="font-mono text-[11px] tracking-[0.14em] whitespace-nowrap uppercase max-[480px]:sr-only sm:text-xs sm:tracking-[0.2em]">
            Stanford Hackathon
          </span>
        </Link>
        <nav className="flex items-center text-sm sm:gap-1">
          <Link
            href="/analyze"
            className="rounded-full px-2 py-1.5 text-muted transition-colors hover:text-foreground sm:px-3"
          >
            Analyze
          </Link>
          <Link
            href="/generate"
            className="rounded-full px-2 py-1.5 text-muted transition-colors hover:text-foreground sm:px-3"
          >
            Generate
          </Link>
          <Link
            href="/analyze#runs"
            className="rounded-full px-2 py-1.5 text-muted transition-colors hover:text-foreground sm:px-3"
          >
            Reports
          </Link>
        </nav>
      </div>
    </header>
  );
}
