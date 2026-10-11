import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Download, Loader2 } from 'lucide-react';
import { useGetBudgetPlans, useCreateBudgetPlan, getGetBudgetPlansQueryKey, type BudgetPlan } from '@workspace/api-client-react';
import { ErrorBox, Skeleton } from '@/components/bits';
import { usd } from '@/lib/format';
import { BudgetComparison } from '@/components/budget-comparison';
import { dl } from '@/lib/csv';
export { dl } from '@/lib/csv';

export const CHANNELS = ['Paid', 'Content', 'Social', 'Email', 'SEO', 'Brand'] as const;
const MAX = 1_000_000_000;
const num = (s: string) => (s === '' ? 0 : Number(s));

export function BudgetPlanner() {
  const qc = useQueryClient();
  const plans = useGetBudgetPlans({ query: { queryKey: getGetBudgetPlansQueryKey(), staleTime: 30000, refetchOnWindowFocus: true } });
  const save = useCreateBudgetPlan();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [total, setTotal] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>(Object.fromEntries(CHANNELS.map((c) => [c, ''])));
  const [loaded, setLoaded] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const t = num(total);
  const sum = CHANNELS.reduce((a, c) => a + num(alloc[c]), 0);
  const diff = t - sum;
  const numbersValid = Number.isSafeInteger(t) && t >= 1 && t <= MAX &&
    CHANNELS.every(c => Number.isSafeInteger(num(alloc[c])) && num(alloc[c]) >= 0 && num(alloc[c]) <= MAX);
  const errs: string[] = [];
  if (!name.trim()) errs.push('Name the draft.');
  if (name.length > 100) errs.push('Name is limited to 100 characters.');
  if (t < 1) errs.push('Total must be at least $1.');
  if (t > MAX || CHANNELS.some((c) => num(alloc[c]) > MAX)) errs.push('Amounts are limited to $1,000,000,000.');
  if (t >= 1 && diff !== 0) errs.push(diff > 0 ? `${usd(diff)} still unallocated.` : `Overspent by ${usd(-diff)}.`);
  if (note.length > 2000) errs.push('Note is limited to 2000 characters.');
  if (!numbersValid) errs.push('Enter non-negative whole-dollar amounts and a positive total. Decimals and negative amounts are not accepted.');
  const valid = errs.length === 0;

  const touch = () => setSaved(null);
  const equal = () => {
    if (!Number.isSafeInteger(t) || t < 1 || t > MAX) return;
    const base = Math.floor(t / 6), rem = t % 6;
    setAlloc(Object.fromEntries(CHANNELS.map((c, i) => [c, String(base + (i < rem ? 1 : 0))])));
    touch();
  };
  const hasUnsaved = !saved && Boolean(name || note || total || CHANNELS.some(c => alloc[c]));
  const reset = () => {
    if (hasUnsaved && !window.confirm('Clear the unsaved allocation draft? Saved plans will stay unchanged.')) return;
    setName(''); setNote(''); setTotal(''); setAlloc(Object.fromEntries(CHANNELS.map((c) => [c, '']))); setLoaded(null); touch(); save.reset();
  };
  const load = (p: BudgetPlan) => {
    if (hasUnsaved && !window.confirm('Replace the unsaved allocation draft with a copy of this saved plan?')) return;
    setName(`Copy of ${p.name}`.slice(0, 100));
    setNote(p.note ?? '');
    setTotal(String(p.totalBudget));
    setAlloc(Object.fromEntries(CHANNELS.map((c) => [c, String(p.allocations.find((a) => a.channel === c)?.amount ?? 0)])));
    setLoaded(p.name); touch(); save.reset();
  };
  const submit = () => {
    if (!valid || save.isPending) return;
    save.mutate({ data: { name: name.trim(), totalBudget: t, allocations: CHANNELS.map((c) => ({ channel: c, amount: num(alloc[c]) })), ...(note.trim() ? { note: note.trim() } : {}) } }, {
      onSuccess: (p) => {
        qc.setQueryData<BudgetPlan[]>(getGetBudgetPlansQueryKey(), (old) => [p, ...(old ?? [])].slice(0, 50));
        setSaved(p.name);
      },
    });
  };
  const exportDraft = () => {
    const rows = [['channel', 'amount_usd'], ...CHANNELS.map((c) => [c, String(num(alloc[c]))]), ['total', String(t)]];
    dl('allocation-draft.csv', rows);
  };

  return (
    <>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[1.3fr_1fr]" data-testid="section-scenario">
      <section className="panel p-5">
        <h2 className="font-display text-xl">What-if allocation draft</h2>
        <p className="mb-4 text-xs text-muted" data-testid="text-scenario-scope">
          Workspace-wide scenario across all six channels. A saved draft is a planning note only: it does not change campaign budgets, ad accounts or any external tool, and it is not actual spend.
        </p>
        {loaded && <p className="mb-3 rounded-md border border-line bg-paper px-3 py-2 text-xs" data-testid="text-loaded-plan">Editing a copy of saved draft "{loaded}". The original stays unchanged.</p>}
        <fieldset disabled={save.isPending}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="plan-name">Draft name</label>
            <input id="plan-name" className="input" maxLength={100} value={name} onChange={(e) => { setName(e.target.value); touch(); }} data-testid="input-plan-name" /></div>
          <div><label className="label" htmlFor="plan-total">Total budget (USD)</label>
            <input id="plan-total" className="input font-mono" type="number" step={1} min={1} max={MAX} inputMode="numeric" value={total} placeholder="0" onChange={(e) => { setTotal(e.target.value); touch(); }} data-testid="input-plan-total" /></div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <div key={c} className="flex items-center gap-2">
              <label className="w-20 font-mono text-xs uppercase text-muted" htmlFor={`alloc-${c}`}>{c}</label>
              <input id={`alloc-${c}`} className="input font-mono" type="number" step={1} min={0} max={MAX} inputMode="numeric" placeholder="0" value={alloc[c]} onChange={(e) => { setAlloc({ ...alloc, [c]: e.target.value }); touch(); }} data-testid={`input-allocation-${c}`} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-xs" data-testid="text-balance">
          <span>Allocated {usd(sum)}</span>
          <span className={diff === 0 && t >= 1 ? 'text-moss' : 'text-accent'} data-testid="text-remaining">
            {t < 1 ? 'Enter a total' : diff === 0 ? 'Balanced' : diff > 0 ? `Remaining ${usd(diff)}` : `Overspend ${usd(-diff)}`}
          </span>
        </div>
        <div className="mt-4"><label className="label" htmlFor="plan-note">Note (optional)</label>
          <textarea id="plan-note" className="input" rows={2} maxLength={2000} value={note} onChange={(e) => { setNote(e.target.value); touch(); }} data-testid="input-plan-note" /></div>
        {!valid && (name || total) && <ul className="mt-3 space-y-1 text-xs text-accent" data-testid="list-plan-errors">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
        {save.isError && <div className="mt-3"><ErrorBox error={save.error} onRetry={submit} /></div>}
        {saved && <p className="mt-3 flex items-center gap-1 text-sm text-moss" role="status" data-testid="text-plan-saved"><Check className="h-4 w-4" /> Saved "{saved}" as a new draft. No campaign budgets were changed.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn" disabled={!valid || save.isPending} onClick={submit} data-testid="button-save-budget-plan">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{save.isPending ? 'Saving draft' : 'Save draft'}
          </button>
          <button className="btn btn-ghost" disabled={!Number.isSafeInteger(t) || t < 1 || t > MAX} onClick={equal} data-testid="button-distribute-equally">Distribute equally</button>
          <button className="btn btn-ghost" onClick={reset} data-testid="button-reset-plan">Clear</button>
          <button className="btn btn-ghost" disabled={!numbersValid} onClick={exportDraft} data-testid="button-export-draft"><Download className="h-4 w-4" /> CSV</button>
        </div>
        </fieldset>
      </section>
      <section>
        <h2 className="mb-1 font-display text-xl">Saved drafts</h2>
        <p className="mb-3 text-xs text-muted">Latest 50, newest first. Scenarios only, not spend.</p>
        {plans.isLoading && <Skeleton rows={3} h={70} />}
        {plans.isError && <ErrorBox error={plans.error} onRetry={() => plans.refetch()} />}
        {plans.data && (
          <div className="space-y-2" data-testid="list-budget-plans">
            {plans.data.length === 0 && <div className="panel p-4 text-sm text-muted" data-testid="empty-budget-plans">No drafts saved yet. Build one on the left and save it.</div>}
            {plans.data.map((p) => (
              <div key={p.id} className="panel p-3" data-testid={`row-budget-plan-${p.id}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="font-mono text-sm">{usd(p.totalBudget)}</span>
                </div>
                <div className="mt-1 text-xs text-muted">{new Date(p.createdAt).toLocaleString()}</div>
                <div className="mt-1 font-mono text-[11px] text-muted">{p.allocations.filter((a) => a.amount > 0).map((a) => `${a.channel} ${usd(a.amount)}`).join(' / ') || 'No allocations'}</div>
                {p.note && <p className="mt-1 text-xs">{p.note}</p>}
                <button className="btn btn-ghost mt-2 !py-1 text-xs" disabled={save.isPending} onClick={() => load(p)} data-testid={`button-load-plan-${p.id}`}>Load into editor</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
    {plans.data && !plans.isError && <BudgetComparison plans={plans.data} onLoad={load} loadDisabled={save.isPending} />}
    </>
  );
}
