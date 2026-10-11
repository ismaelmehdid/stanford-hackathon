import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useGetGrowthAnalytics, getGetGrowthAnalyticsQueryKey, getGetBudgetPlansQueryKey, type GetGrowthAnalyticsParams } from '@workspace/api-client-react';
import { PageHeader, ErrorBox, Skeleton } from '@/components/bits';
import { BudgetPlanner, CHANNELS, dl } from '@/components/budget-planner';
import { usd } from '@/lib/format';

const compact = (v: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

export function insights(a: { totalCampaigns: number; plannedBudget: number; reviewBudget: number; unfundedCampaigns: number; byChannel: { channel: string; share: number }[] }) {
  const out: string[] = [];
  if (a.totalCampaigns === 0) return out;
  if (a.reviewBudget > 0) out.push(`${usd(a.reviewBudget)} of planned budget is waiting in review.`);
  if (a.unfundedCampaigns > 0) out.push(`${a.unfundedCampaigns} campaign${a.unfundedCampaigns === 1 ? ' has' : 's have'} no budget set.`);
  const top = [...a.byChannel].sort((x, y) => y.share - x.share)[0];
  if (top && a.byChannel.length > 1 && a.plannedBudget > 0 && top.share >= 0.5) out.push(`${top.channel} holds ${(top.share * 100).toFixed(1)}% of planned budget. This describes the plan only, not results.`);
  return out;
}

const tip = { contentStyle: { background: '#fbf8f0', border: '1px solid #ded6c3', borderRadius: 6, fontSize: 13 } };

export default function Analytics() {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<string>('');
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const params: GetGrowthAnalyticsParams = { days, ...(channel ? { channel: channel as GetGrowthAnalyticsParams['channel'] } : {}) };
  const q = useGetGrowthAnalytics(params, { query: { queryKey: getGetGrowthAnalyticsQueryKey(params), staleTime: 300000, refetchOnWindowFocus: false } });
  const a = q.data;
  const ins = a ? insights(a) : [];
  const scope = channel || 'all channels';

  const exportCsv = () => {
    if (!a) return;
    dl(`planning-${channel || 'all'}.csv`, [
      ['scope', 'label', 'campaigns', 'planned_budget_usd'],
      ...a.byChannel.map((c) => ['channel', c.channel, String(c.campaigns), String(c.plannedBudget)]),
      ...a.byStage.map((s) => ['stage', s.stage, String(s.campaigns), String(s.plannedBudget)]),
    ]);
  };

  return (
    <div data-testid="analytics-page">
      <PageHeader title="Analytics" sub="Planned budget and workflow activity. Performance data is not connected." />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="f-channel">Channel (snapshot and activity)</label>
          <select id="f-channel" className="input" value={channel} onChange={(e) => setChannel(e.target.value)} data-testid="select-analytics-channel">
            <option value="">All channels</option>{CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div><label className="label" htmlFor="f-days">Workflow activity period</label>
          <select id="f-days" className="input" value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30 | 90)} data-testid="select-activity-days">
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select></div>
        <button className="btn btn-ghost" onClick={() => { q.refetch(); qc.invalidateQueries({ queryKey: getGetBudgetPlansQueryKey() }); }} disabled={q.isFetching} data-testid="button-refresh-analytics">
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? 'animate-spin' : ''}`} /> {q.isFetching ? 'Refreshing' : 'Refresh'}
        </button>
        <button className="btn btn-ghost" onClick={exportCsv} disabled={!a} data-testid="button-export-analytics"><Download className="h-4 w-4" /> Export planning CSV</button>
      </div>
      <p className="mb-5 text-xs text-muted" data-testid="text-analytics-scope">
        Budget figures are a current snapshot ({scope}) and are not filtered by date. The period selector filters workflow activity only. Dates are UTC.
        {a && ` Generated ${new Date(a.generatedAt).toLocaleString()}.`}
      </p>
      {q.isLoading && <Skeleton rows={4} h={90} />}
      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {a && (
        <>
          {a.totalCampaigns === 0 && <div className="panel mb-6 p-5 text-sm" data-testid="empty-analytics">No campaigns {channel ? `in ${channel}` : 'yet'}. Planned budget will appear once campaigns have budgets.</div>}
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            {([['Campaigns', String(a.totalCampaigns)], ['Planned budget', usd(a.plannedBudget)], ['Waiting review', usd(a.reviewBudget)], ['Approved', usd(a.approvedBudget)], ['Live (marked)', usd(a.liveBudget)]] as const).map(([l, v]) => (
              <div key={l} className="panel p-4" data-testid={`stat-${l.toLowerCase().replace(/[\s()]+/g, '-')}`}>
                <div className="label">{l}</div><div className="font-display text-2xl">{v}</div><div className="text-xs text-muted">{l === 'Campaigns' ? 'saved repositories' : 'planned, not spent'}</div>
              </div>
            ))}
          </div>
          <section className="panel mb-6 p-5" data-testid="section-performance">
            <h2 className="font-display text-xl">Performance</h2>
            <p className="mb-3 text-xs text-muted" data-testid="text-source-message">{a.sourceMessage}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {([['Actual spend', a.actualSpend, usd], ['Conversions', a.conversions, String], ['Cost per acquisition', a.costPerAcquisition, usd], ['ROAS', a.roas, (v: number) => `${v.toFixed(2)}x`]] as [string, number | null, (v: number) => string][]).map(([l, v, f]) => (
                <div key={l} data-testid={`perf-${l.toLowerCase().replace(/\s/g, '-')}`}><div className="label">{l}</div>
                  <div className="font-display text-2xl">{v === null ? '\u2014' : f(v)}</div>{v === null && <div className="text-xs text-muted">Not available</div>}</div>
              ))}
            </div>
          </section>
          {ins.length > 0 && (
            <section className="mb-6" data-testid="section-insights"><h2 className="mb-2 font-display text-xl">Workflow notes</h2>
              <ul className="panel divide-y divide-line">{ins.map((i) => <li key={i} className="px-4 py-3 text-sm">{i}</li>)}</ul></section>
          )}
          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <section className="panel p-5" data-testid="chart-planned-budget">
              <h2 className="font-display text-lg">Planned budget by channel</h2>
              <p className="mb-2 text-xs text-muted">Current snapshot, USD, {scope}. Not actual spend.</p>
              <div className="h-64" role="img" aria-label="Planned budget by channel">
                <ResponsiveContainer width="100%" height="100%"><BarChart data={a.byChannel}>
                  <CartesianGrid vertical={false} stroke="#ded6c3" />
                  <XAxis dataKey="channel" tick={{ fontSize: 12 }} /><YAxis domain={[0, 'auto']} tickFormatter={compact} tick={{ fontSize: 12 }} width={48} />
                  <Tooltip {...tip} formatter={(v: number) => [usd(v), 'Planned budget']} cursor={false} />
                  <Bar dataKey="plannedBudget" fill="#61A9BD" isAnimationActive={false}>
                    <LabelList dataKey="plannedBudget" position="top" formatter={(v: unknown) => Number(v) > 0 ? `$${compact(Number(v))}` : ''} fontSize={11} />
                  </Bar>
                </BarChart></ResponsiveContainer>
              </div>
            </section>
            <section className="panel p-5" data-testid="chart-activity">
              <h2 className="font-display text-lg">Workflow actions per day</h2>
              <p className="mb-2 text-xs text-muted">Last {a.periodDays} days, UTC dates, {scope}. Counts of recorded actions.</p>
              {a.trend.every((t) => t.actions === 0) && <p className="mb-2 text-xs" data-testid="text-no-activity">No workflow activity in this period.</p>}
              <div className="h-64" role="img" aria-label="Workflow actions per day">
                <ResponsiveContainer width="100%" height="100%"><BarChart data={a.trend.map(t => ({ ...t, time: Date.parse(`${t.date}T00:00:00Z`) }))}>
                  <CartesianGrid vertical={false} stroke="#ded6c3" />
                  <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(d: number) => new Date(d).toISOString().slice(5, 10)} tick={{ fontSize: 12 }} minTickGap={16} /><YAxis domain={[0, 'auto']} allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
                  <Tooltip {...tip} labelFormatter={(d: number) => `${new Date(d).toISOString().slice(0, 10)} UTC`} formatter={(v: number) => [v, 'Actions']} cursor={false} />
                  <Bar dataKey="actions" fill="#61A9BD" isAnimationActive={false} />
                </BarChart></ResponsiveContainer>
              </div>
            </section>
          </div>
          <section className="mb-8"><h2 className="mb-2 font-display text-xl">Planned budget by stage</h2>
            <div className="panel divide-y divide-line" data-testid="table-stage">
              {a.byStage.map((s) => (
                <div key={s.stage} className="flex justify-between px-4 py-2 text-sm"><span className="capitalize">{s.stage.replace('_', ' ')}</span>
                  <span className="font-mono">{s.campaigns} campaigns / {usd(s.plannedBudget)}</span></div>
              ))}
            </div></section>
        </>
      )}
      <BudgetPlanner />
    </div>
  );
}
