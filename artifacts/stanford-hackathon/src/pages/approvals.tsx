import { Link } from 'wouter';
import { useGetCampaigns } from '@workspace/api-client-react';
import { PageHeader, ErrorBox, Skeleton, Empty } from '@/components/bits';
import { ReviewPanel } from '@/components/review-panel';
import { ago, usd } from '@/lib/format';

export default function Approvals() {
  const q = useGetCampaigns({ status: 'in_review' }, { query: { queryKey: ['/api/campaigns', { status: 'in_review' }], staleTime: 10000 } });
  return (
    <>
      <PageHeader title="Approvals" sub="Campaigns waiting on a decision. Approve to unlock launch, or send back with a note." />
      {q.isLoading && <Skeleton rows={3} h={140} />}
      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (q.data.length === 0
        ? <Empty title="Review queue is clear" body="Submit a draft from its campaign page and it will show up here." />
        : <div className="grid gap-4 md:grid-cols-2" data-testid="list-approvals">
          {q.data.map((c) => (
            <article key={c.id} className="panel p-4" data-testid={`approval-${c.id}`}>
              <Link href={`/campaigns/${c.id}`} className="font-display text-xl underline decoration-line underline-offset-4 hover:decoration-ink">{c.name}</Link>
              <div className="mb-2 font-mono text-xs text-muted">{c.channel} / {c.owner} / {usd(c.budget)} / updated {ago(c.updatedAt)}</div>
              <p className="mb-1"><span className="label inline">Objective </span>{c.objective}</p>
              {c.hypothesis && <p className="mb-3 text-muted"><span className="label inline">Hypothesis </span>{c.hypothesis}</p>}
              <ReviewPanel c={c} compact />
            </article>
          ))}
        </div>)}
    </>
  );
}
