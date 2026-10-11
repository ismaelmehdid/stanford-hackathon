import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, Inbox } from 'lucide-react';
import { STATUS_STYLE, statusLabel, usd, ago } from '@/lib/format';
import type { Campaign } from '@workspace/api-client-react';

export function StatusBadge({ status }: { status: string }) {
  return (
    <span data-testid={`status-${status}`} className={`inline-block rounded px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${STATUS_STYLE[status] ?? ''}`}>
      {statusLabel(status)}
    </span>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-xl text-muted">{sub}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorBox({ error, onRetry, label = 'Could not load data' }: { error: unknown; onRetry?: () => void; label?: string }) {
  return (
    <div role="alert" data-testid="error-box" className="panel flex items-center gap-3 border-accent p-4">
      <AlertTriangle className="h-5 w-5 text-accent" />
      <div className="flex-1">
        <div className="font-medium">{label}</div>
        <div className="text-muted">{error instanceof Error ? error.message : 'Unexpected error'}</div>
      </div>
      {onRetry && <button className="btn btn-ghost" onClick={onRetry} data-testid="button-retry">Retry</button>}
    </div>
  );
}

export function Skeleton({ rows = 4, h = 44 }: { rows?: number; h?: number }) {
  return (
    <div className="space-y-2" data-testid="loading-skeleton">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skel" style={{ height: h }} />)}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center gap-2 border-dashed p-10 text-center" data-testid="empty-state">
      <Inbox className="h-7 w-7 text-muted" />
      <div className="font-display text-lg">{title}</div>
      <p className="max-w-sm text-muted">{body}</p>
      {action}
    </div>
  );
}

export function CampaignRow({ c, compact = false }: { c: Campaign; compact?: boolean }) {
  return (
    <Link href={`/campaigns/${c.id}`} data-testid={`row-campaign-${c.id}`}
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-paper ${compact ? 'md:grid-cols-[minmax(0,1fr)_110px_80px]' : 'md:grid-cols-[minmax(0,2fr)_90px_110px_100px_90px_80px]'}`}>
      <div className="min-w-0">
        <div className="truncate font-medium">{c.name}</div>
        <div className="truncate text-muted">{c.objective}</div>
      </div>
      {!compact && <div className="font-mono text-xs text-muted max-md:hidden">{c.channel}</div>}
      <div className="max-md:order-first max-md:col-start-2 max-md:row-start-1"><StatusBadge status={c.status} /></div>
      {!compact && <div className="truncate text-muted max-md:hidden">{c.owner}</div>}
      <div className="font-mono text-xs max-md:hidden">{usd(c.budget)}</div>
      {!compact && <div className="text-right font-mono text-xs text-muted max-md:hidden">{ago(c.updatedAt)}</div>}
    </Link>
  );
}
