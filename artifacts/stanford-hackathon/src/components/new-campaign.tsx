import { useState } from 'react';
import { useLocation } from 'wouter';
import { X } from 'lucide-react';
import { useCreateCampaign, type CampaignInputChannel } from '@workspace/api-client-react';
import { useInvalidateAll } from '@/lib/invalidate';
import { CHANNELS, errMsg } from '@/lib/format';

export function NewCampaignDialog({ onClose }: { onClose: () => void }) {
  const [, nav] = useLocation();
  const invalidate = useInvalidateAll();
  const create = useCreateCampaign();
  const [f, setF] = useState({ name: '', channel: 'Content', objective: '', owner: '', budget: '', hypothesis: '' });
  const [touched, setTouched] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const budgetValid = f.budget === '' || (Number.isInteger(Number(f.budget)) && Number(f.budget) >= 0);
  const valid = f.name.trim() && f.objective.trim() && budgetValid;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    const data = {
      name: f.name.trim(),
      channel: f.channel as CampaignInputChannel,
      objective: f.objective.trim(),
      ...(f.owner.trim() && { owner: f.owner.trim() }),
      ...(f.budget !== '' && { budget: Number(f.budget) }),
      ...(f.hypothesis.trim() && { hypothesis: f.hypothesis.trim() }),
    };
    create.mutate({ data }, {
      onSuccess: (c) => { invalidate(c.id); onClose(); nav(`/campaigns/${c.id}`); },
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="new-campaign-title" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/50 p-4" onClick={onClose} onKeyDown={e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea')];
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="panel rise w-full max-w-lg space-y-4 p-5" data-testid="dialog-new-campaign">
        <div className="flex items-center justify-between">
          <h2 id="new-campaign-title" className="font-display text-2xl">New campaign repository</h2>
          <button type="button" onClick={onClose} aria-label="Close" data-testid="button-close-dialog"><X className="h-5 w-5" /></button>
        </div>
        {touched && !budgetValid && <p role="alert" className="text-accent">Budget must be a non-negative whole number.</p>}
        <div>
          <label className="label" htmlFor="nc-name">Name</label>
          <input id="nc-name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} data-testid="input-name" autoFocus />
          {touched && !f.name.trim() && <p className="mt-1 text-accent">Name is required.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="nc-ch">Channel</label>
            <select id="nc-ch" className="input" value={f.channel} onChange={(e) => set('channel', e.target.value)} data-testid="select-channel">
              {CHANNELS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="nc-budget">Budget (USD)</label>
            <input id="nc-budget" type="number" min={0} className="input" value={f.budget} onChange={(e) => set('budget', e.target.value)} data-testid="input-budget" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="nc-obj">Objective</label>
          <input id="nc-obj" className="input" value={f.objective} onChange={(e) => set('objective', e.target.value)} data-testid="input-objective" />
          {touched && !f.objective.trim() && <p className="mt-1 text-accent">Objective is required.</p>}
        </div>
        <div>
          <label className="label" htmlFor="nc-owner">Owner</label>
          <input id="nc-owner" className="input" value={f.owner} onChange={(e) => set('owner', e.target.value)} data-testid="input-owner" />
        </div>
        <div>
          <label className="label" htmlFor="nc-hyp">Experiment hypothesis</label>
          <textarea id="nc-hyp" rows={3} className="input" value={f.hypothesis} onChange={(e) => set('hypothesis', e.target.value)} data-testid="input-hypothesis" />
        </div>
        {create.isError && <p role="alert" className="text-accent" data-testid="text-create-error">{errMsg(create.error)}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={create.isPending} data-testid="button-create-campaign">{create.isPending ? 'Creating...' : 'Create campaign'}</button>
        </div>
      </form>
    </div>
  );
}
