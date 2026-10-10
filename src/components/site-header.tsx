import Link from "next/link";

const NAV = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/analyze", label: "Analyze" },
  { href: "/generate", label: "Generate" },
  { href: "/analyze#runs", label: "Reports" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/70 backdrop-blur-md print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-6 place-items-center rounded-full border border-foreground"
          >
            <span className="size-2 rounded-full bg-foreground" />
          </span>
          <span className="font-mono text-[11px] tracking-[0.14em] whitespace-nowrap uppercase max-[480px]:sr-only sm:text-xs sm:tracking-[0.2em]">
            GrowthOS
          </span>
        </Link>
        <nav className="flex min-w-0 items-center text-sm sm:gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-1.5 py-1.5 whitespace-nowrap text-muted transition-colors hover:text-foreground min-[400px]:px-2 sm:px-3"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
