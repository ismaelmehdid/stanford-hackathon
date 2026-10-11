import { Link } from 'wouter';
import { useGetCampaigns } from '@workspace/api-client-react';
import { PageHeader, ErrorBox, Skeleton } from '@/components/bits';
import { STAGES, usd, ago } from '@/lib/format';

export default function Pipelines() {
  const q = useGetCampaigns(undefined, { query: { queryKey: ['/api/campaigns'], staleTime: 15000 } });
  return (
    <>
      <PageHeader title="Pipelines" sub="Where every campaign sits in the lifecycle. Stage moves happen through saving, submitting and review." />
      {q.isLoading && <Skeleton rows={3} h={120} />}
      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {STAGES.map((s) => {
            const items = q.data.filter((c) => c.status === s.key);
            return (
              <section key={s.key} className="panel flex flex-col" data-testid={`stage-${s.key}`}>
                <header className="border-b border-line p-3">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-display text-lg">{s.label}</h2>
                    <span className="font-mono text-xs" data-testid={`count-${s.key}`}>{items.length}</span>
                  </div>
                  <p className="text-xs text-muted">{s.hint}</p>
                  <p className="mt-1 font-mono text-[11px] text-moss">{usd(items.reduce((a, c) => a + c.budget, 0))}</p>
                </header>
                <div className="flex-1 space-y-2 p-2">
                  {items.length === 0 && <p className="p-3 text-center text-xs text-muted">Nothing in this stage</p>}
                  {items.map((c) => (
                    <Link key={c.id} href={`/campaigns/${c.id}`} data-testid={`card-pipeline-${c.id}`} className="block rounded-md border border-line bg-paper p-2.5 transition-transform hover:-translate-y-0.5">
                      <div className="font-medium leading-snug">{c.name}</div>
                      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted"><span>{c.channel}</span><span>{ago(c.updatedAt)}</span></div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
