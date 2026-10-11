import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { BarChart3, GitBranch, LayoutDashboard, Workflow, ShieldCheck, Plus, Video } from 'lucide-react';
import { NewCampaignDialog } from '@/components/new-campaign';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/campaigns', label: 'Campaigns', icon: GitBranch },
  { href: '/pipelines', label: 'Pipelines', icon: Workflow },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
];

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === '/' ? loc === '/' : loc.startsWith(h));
  return (
    <div className="min-h-[100dvh] md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-line bg-ink text-paper md:sticky md:top-0 md:h-[100dvh] md:border-r">
        <div className="flex items-center justify-between gap-4 px-4 py-3 md:block md:py-5">
          <Link href="/" className="flex items-center gap-2" data-testid="link-brand">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-gold font-display text-ink">G</span>
            <span className="font-display text-xl font-semibold">GrowthOS</span>
          </Link>
          <button className="btn btn-accent md:mt-5 md:w-full md:justify-center" onClick={() => setOpen(true)} data-testid="button-new-campaign">
            <Plus className="h-4 w-4" /> New campaign
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} data-testid={`nav-${label.toLowerCase()}`}
              className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 transition-colors ${active(href) ? 'bg-paper text-ink' : 'text-paper/70 hover:bg-white/10'}`}>
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
          {import.meta.env.VITE_ANALYSIS_URL && (
            <a href={import.meta.env.VITE_ANALYSIS_URL} data-testid="nav-video-analysis"
              className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-paper/70 transition-colors hover:bg-white/10">
              <Video className="h-4 w-4" /> Video analysis
            </a>
          )}
        </nav>
        <p className="hidden px-5 pt-6 font-mono text-[11px] leading-relaxed text-paper/50 md:block">
          Campaign repositories, briefs, versions and approvals. Publishing and integrations are not connected yet.
        </p>
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-8">
        <div className="mx-auto max-w-6xl rise">{children}</div>
      </main>
      {open && <NewCampaignDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
