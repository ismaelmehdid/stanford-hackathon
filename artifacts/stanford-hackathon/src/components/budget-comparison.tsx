import { useMemo, useState } from 'react';
import { ArrowLeftRight, Download } from 'lucide-react';
import type { BudgetPlan } from '@workspace/api-client-react';
import { usd } from '@/lib/format';
import { compareBudgetPlans, comparisonCsvRows, signedUsd, signedPercent } from '@/lib/budget-comparison';
import { dl } from '@/lib/csv';

const utc = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};
const pct = (n: number | null) => (n === null ? 'N/A' : `${n.toFixed(1)}%`);
const rel = (n: number | null) => (n === null ? 'N/A' : `${signedPercent(n)}%`);
const pts = (n: number | null) => (n === null ? 'N/A' : `${signedPercent(n)} pts`);

export function BudgetComparison({ plans, onLoad, loadDisabled }: { plans: BudgetPlan[]; onLoad: (p: BudgetPlan) => void; loadDisabled: boolean }) {
  const [baseId, setBaseId] = useState<string | null>(null);
  const [altId, setAltId] = useState<string | null>(null);

  const ids = useMemo(() => new Set(plans.map((p) => p.id)), [plans]);
  const selectionUnavailable = Boolean((baseId && !ids.has(baseId)) || (altId && !ids.has(altId)));
  // Reconcile ids against the latest list and disclose any replacement below.
  let b = baseId && ids.has(baseId) ? baseId : null;
  let a = altId && ids.has(altId) ? altId : null;
  if (b && a && b === a) a = null;
  if (!b) b = plans.find((p) => p.id !== a)?.id ?? null;
  if (!a) a = plans.find((p) => p.id !== b)?.id ?? null;
  const baseline = plans.find((p) => p.id === b);
  const alt = plans.find((p) => p.id === a);
  const ready = Boolean(baseline && alt && baseline.id !== alt.id);
  const cmp = useMemo(() => (baseline && alt && ready ? compareBudgetPlans(baseline, alt) : null), [baseline, alt, ready]);

  const pickBase = (id: string) => { setBaseId(id); if (id === a) setAltId(b); else setAltId(a); };
  const pickAlt = (id: string) => { setAltId(id); if (id === b) setBaseId(a); else setBaseId(b); };
  const swap = () => { setBaseId(a); setAltId(b); };

  const meta = (label: string, p: BudgetPlan, testid: string) => (
    <div className="rounded-md border border-line bg-paper p-3 text-xs" data-testid={testid}>
      <div className="label">{label}</div>
      <div className="text-sm font-medium break-words">{p.name}</div>
      <div className="font-mono text-[11px] text-muted break-all">id {p.id}</div>
      <div className="text-muted">{utc(p.createdAt)}</div>
      <div className="mt-1 font-mono text-sm">{usd(p.totalBudget)}</div>
      <p className="mt-1 break-words">{p.note || <span className="text-muted">No note</span>}</p>
      <button className="btn btn-ghost mt-2 !py-1 text-xs" disabled={loadDisabled} onClick={() => onLoad(p)} data-testid={`button-compare-load-${testid.endsWith('baseline') ? 'baseline' : 'alternative'}`}>Load as copy</button>
    </div>
  );

  return (
    <section className="panel mt-6 min-w-0 p-5" data-testid="section-budget-comparison">
      <h2 className="font-display text-xl">Compare saved drafts</h2>
      <p className="mb-4 text-xs text-muted" data-testid="text-comparison-scope">
        What-if planning only. These are saved scenarios, not actual spend or measured performance. Meta is not connected. Loading copies a draft into the editor and does not apply any budget.
      </p>
      {plans.length === 0 && <div className="rounded-md border border-line bg-paper p-4 text-sm text-muted" data-testid="empty-comparison">No saved drafts yet. Save two drafts to compare them here.</div>}
      {plans.length === 1 && <div className="rounded-md border border-line bg-paper p-4 text-sm text-muted" data-testid="one-plan-comparison">Only one saved draft ("{plans[0].name}"). Save a second draft to compare.</div>}
      {plans.length >= 2 && (
        <>
          {selectionUnavailable && <p className="mb-3 text-xs text-accent" role="status" data-testid="text-comparison-selection-changed">A selected draft is no longer in the latest saved list. The selectors now show available drafts; check your selections before exporting or loading.</p>}
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div><label className="label" htmlFor="cmp-base">Baseline</label>
              <select id="cmp-base" className="input" value={b ?? ''} onChange={(e) => pickBase(e.target.value)} data-testid="select-compare-baseline">
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id.slice(0, 8)})</option>)}
              </select></div>
            <button className="btn btn-ghost justify-center" onClick={swap} data-testid="button-swap-comparison"><ArrowLeftRight className="h-4 w-4" /> Swap</button>
            <div><label className="label" htmlFor="cmp-alt">Alternative</label>
              <select id="cmp-alt" className="input" value={a ?? ''} onChange={(e) => pickAlt(e.target.value)} data-testid="select-compare-alternative">
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id.slice(0, 8)})</option>)}
              </select></div>
          </div>
          {ready && baseline && alt && cmp && (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {meta('Baseline', baseline, 'compare-meta-baseline')}
                {meta('Alternative', alt, 'compare-meta-alternative')}
              </div>
              <div className="mt-4 max-w-full overflow-x-auto" data-testid="table-comparison-scroll">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead>
                    <tr className="label">
                      <th className="py-2 pr-3 font-normal">Channel</th>
                      <th className="px-2 text-right font-normal">Baseline (USD)</th>
                      <th className="px-2 text-right font-normal">Share</th>
                      <th className="px-2 text-right font-normal">Alternative (USD)</th>
                      <th className="px-2 text-right font-normal">Share</th>
                      <th className="px-2 text-right font-normal">Diff (alt - base)</th>
                      <th className="px-2 text-right font-normal">Amount change (%)</th>
                      <th className="pl-2 text-right font-normal">Share diff (pp)</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {cmp.channels.map((c) => (
                      <tr key={c.channel} className="border-t border-line" data-testid={`row-comparison-${c.channel}`}>
                        <td className="py-2 pr-3 font-sans font-medium">{c.channel}</td>
                        <td className="px-2 text-right">{usd(c.baselineAmount)}</td>
                        <td className="px-2 text-right">{pct(c.baselineSharePercent)}</td>
                        <td className="px-2 text-right">{usd(c.alternativeAmount)}</td>
                        <td className="px-2 text-right">{pct(c.alternativeSharePercent)}</td>
                        <td className="px-2 text-right">{signedUsd(c.amountDelta)}</td>
                        <td className="px-2 text-right">{rel(c.relativeChangePercent)}</td>
                        <td className="pl-2 text-right">{pts(c.shareDeltaPoints)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-ink font-medium" data-testid="row-comparison-total">
                      <td className="py-2 pr-3 font-sans">Total</td>
                      <td className="px-2 text-right">{usd(cmp.total.baselineAmount)}</td>
                      <td className="px-2 text-right">-</td>
                      <td className="px-2 text-right">{usd(cmp.total.alternativeAmount)}</td>
                      <td className="px-2 text-right">-</td>
                      <td className="px-2 text-right">{signedUsd(cmp.total.amountDelta)}</td>
                      <td className="px-2 text-right">{rel(cmp.total.relativeChangePercent)}</td>
                      <td className="pl-2 text-right">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted" data-testid="text-zero-baseline-note">Relative change is N/A when the baseline amount is $0, including $0 to $0, because it cannot be computed. Differences are alternative minus baseline. Shares use each draft's own total; share differences are percentage points (pp).</p>
            </>
          )}
        </>
      )}
      <div className="mt-4">
        <button className="btn btn-ghost" disabled={!ready} onClick={() => baseline && alt && dl('budget-comparison.csv', comparisonCsvRows(baseline, alt))} data-testid="button-export-comparison"><Download className="h-4 w-4" /> Export comparison CSV</button>
      </div>
    </section>
  );
}
