import { Link, useParams, useLocation } from 'wouter';
import { ArrowLeft, GitFork } from 'lucide-react';
import { useGetCampaign, useForkCampaign } from '@workspace/api-client-react';
import { ErrorBox, Skeleton, StatusBadge } from '@/components/bits';
import { BriefEditor } from '@/components/brief-editor';
import { Revisions } from '@/components/revisions';
import { ReviewPanel } from '@/components/review-panel';
import { STAGES, ago, usd, errMsg } from '@/lib/format';
import { useInvalidateAll } from '@/lib/invalidate';
import { useState, useEffect } from 'react';

export default function CampaignDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const fork = useForkCampaign();
  const invalidate = useInvalidateAll();
  const [dirty, setDirty] = useState(false);
  useEffect(() => setDirty(false), [id]);
  const q = useGetCampaign(id, { query: { queryKey: [`/api/campaigns/${id}`], staleTime: 15000, retry: false } });
  const c = q.data;
  const idx = c ? STAGES.findIndex((s) => s.key === c.status) : -1;
  return (
    <>
      <Link href="/campaigns" className="mb-3 inline-flex items-center gap-1 text-muted hover:text-ink" data-testid="link-back"><ArrowLeft className="h-4 w-4" /> Campaigns</Link>
      {q.isLoading && <Skeleton rows={4} h={70} />}
      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} label="Campaign could not be loaded" />}
      {c && (
        <>
          <div className="mb-5 border-b border-line pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-semibold" data-testid="text-campaign-name">{c.name}</h1>
              <StatusBadge status={c.status} />
              <button className="btn btn-ghost ml-auto" disabled={fork.isPending || dirty} data-testid="button-fork" onClick={() => {
                fork.mutate({ id: c.id }, { onSuccess: created => { invalidate(created.id); navigate(`/campaigns/${created.id}`); } });
              }}><GitFork className="h-4 w-4" />{fork.isPending ? 'Forking...' : 'Fork campaign'}</button>
            </div>
            {fork.isError && <p role="alert" className="mt-2 text-accent">{errMsg(fork.error)}</p>}
            <p className="mt-1 font-mono text-xs text-muted">{c.channel} / {c.owner} / {usd(c.budget)} / created {ago(c.createdAt)} / updated {ago(c.updatedAt)}</p>
            <div className="mt-3 flex gap-1" aria-label="Lifecycle stage">
              {STAGES.map((s, i) => (
                <div key={s.key} className="flex-1">
                  <div className={`h-1.5 rounded ${i <= idx ? 'bg-moss' : 'bg-line'}`} />
                  <div className={`mt-1 text-[11px] ${i === idx ? 'font-semibold' : 'text-muted'}`}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
            <section className="panel p-4"><BriefEditor key={c.id} c={c} onDirtyChange={setDirty} /></section>
            <aside className="space-y-5">
              <section className="panel p-4">
                <h2 className="mb-2 font-display text-xl">Review</h2>
                {dirty && <p className="mb-2 text-accent">Save or discard your edits before changing the workflow.</p>}
                <ReviewPanel c={c} blocked={dirty} />
              </section>
              <section>
                <h2 className="mb-2 font-display text-xl">Revisions</h2>
                <Revisions id={c.id} blocked={dirty} />
              </section>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
