import { Link } from 'wouter';
import { useGetDashboard, useGetGrowthAnalytics, getGetGrowthAnalyticsQueryKey } from '@workspace/api-client-react';
import { PageHeader, ErrorBox, Skeleton, Empty, CampaignRow } from '@/components/bits';
import { ActivityList } from '@/components/activity-list';
import { insights } from '@/pages/analytics';
import { usd } from '@/lib/format';

export default function Dashboard() {
  const q = useGetDashboard();
  const params = { days: 30 as const };
  const an = useGetGrowthAnalytics(params, { query: { queryKey: getGetGrowthAnalyticsQueryKey(params), staleTime: 300000, refetchOnWindowFocus: false } });
  const d = q.data, a = an.data;
  const ins = a ? insights(a) : [];
  return (
    <div data-testid="dashboard-page">
      <PageHeader title="Dashboard" sub="Planning priorities across the workspace. Budgets shown are planned, not spent." />
      {(q.isLoading || an.isLoading) && <Skeleton rows={3} h={80} />}
      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {an.isError && <ErrorBox error={an.error} onRetry={() => an.refetch()} />}
      {a && (
        <>
          <section className="panel mb-6 p-5" data-testid="section-priorities">
            <h2 className="font-display text-xl">Priorities</h2>
            {a.totalCampaigns === 0 ? <p className="mt-2 text-sm text-muted">No campaigns yet. Create one from the sidebar to start planning budget.</p> : ins.length === 0 ? <p className="mt-2 text-sm text-muted">No review or funding blockers found. Performance-based allocation still needs connected results.</p> : (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{ins.map((i) => <li key={i}>{i}</li>)}</ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/approvals" className="btn" data-testid="link-review-approvals">Review approvals</Link>
              <Link href="/analytics" className="btn btn-ghost" data-testid="link-plan-allocation">Plan allocation</Link>
            </div>
          </section>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            {([['Planned budget', usd(a.plannedBudget)], ['Waiting review', usd(a.reviewBudget)], ['Approved', usd(a.approvedBudget)], ['Unfunded campaigns', String(a.unfundedCampaigns)], ['Actual spend', a.actualSpend === null ? '\u2014' : usd(a.actualSpend)]] as const).map(([l, v]) => (
              <div key={l} className="panel p-4" data-testid={`stat-${l.toLowerCase().replace(/\s/g, '-')}`}>
                <div className="label">{l}</div><div className="font-display text-2xl">{v}</div>
                <div className="text-xs text-muted">{l === 'Actual spend' ? 'Not available, not connected' : l === 'Unfunded campaigns' ? 'no budget set' : 'planned'}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {d && (
        <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display text-xl">Recently active campaigns</h2>
              <Link href="/campaigns" className="text-sm underline">All campaigns</Link>
            </div>
            {d.campaigns.length === 0 ? <Empty title="No campaigns yet" body="Create your first campaign repository from the sidebar." /> : (
              <div className="panel overflow-hidden">{d.campaigns.slice(0, 8).map((c) => <CampaignRow key={c.id} c={c} compact />)}</div>
            )}
          </section>
          <section><h2 className="mb-3 font-display text-xl">Recent activity</h2><ActivityList /></section>
        </div>
      )}
    </div>
  );
}
