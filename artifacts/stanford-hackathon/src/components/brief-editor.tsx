import { useEffect, useRef, useState } from 'react';
import { useUpdateCampaign, type Campaign, type CampaignUpdateChannel } from '@workspace/api-client-react';
import { useInvalidateAll } from '@/lib/invalidate';
import { CHANNELS, errMsg } from '@/lib/format';

const toForm = (c: Campaign) => ({ name: c.name, description: c.description, channel: c.channel as string, owner: c.owner, budget: String(c.budget), objective: c.objective, audience: c.audience, hypothesis: c.hypothesis, content: c.content });

export function BriefEditor({ c, onDirtyChange }: { c: Campaign; onDirtyChange: (dirty: boolean) => void }) {
  const invalidate = useInvalidateAll();
  const update = useUpdateCampaign();
  const [f, setF] = useState(toForm(c));
  const [saved, setSaved] = useState(false);
  const base = useRef(c);
  const [conflict, setConflict] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(toForm(base.current));

  useEffect(() => {
    if (c.updatedAt !== base.current.updatedAt) {
      if (JSON.stringify(f) === JSON.stringify(toForm(base.current))) {
        base.current = c;
        setF(toForm(c));
        setConflict(false);
      } else {
        setConflict(true);
      }
    }
  }, [c]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const set = (k: string, v: string) => { setSaved(false); setF((p) => ({ ...p, [k]: v })); };
  const valid = f.name.trim() && f.objective.trim() && Number.isInteger(Number(f.budget)) && Number(f.budget) >= 0 && f.budget !== '';

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    update.mutate({ id: c.id, data: { ...f, expectedUpdatedAt: base.current.updatedAt, channel: f.channel as CampaignUpdateChannel, budget: Number(f.budget) } }, {
      onSuccess: updated => { base.current = updated; setF(toForm(updated)); setConflict(false); invalidate(c.id); setSaved(true); },
    });
  };
  const F = ({ k, label, rows, type }: { k: keyof typeof f; label: string; rows?: number; type?: string }) => (
    <div>
      <label className="label" htmlFor={`f-${k}`}>{label}</label>
      {rows ? <textarea id={`f-${k}`} rows={rows} className="input" value={f[k]} onChange={(e) => set(k, e.target.value)} data-testid={`input-${k}`} />
        : <input id={`f-${k}`} type={type} min={type === 'number' ? 0 : undefined} className="input" value={f[k]} onChange={(e) => set(k, e.target.value)} data-testid={`input-${k}`} />}
    </div>
  );
  return (
    <form onSubmit={save} className="space-y-4" data-testid="form-brief">
      <p className="text-xs text-muted">Saving records a new revision and returns the brief to draft for fresh approval.</p>
      {conflict && <p role="alert" className="text-accent">The saved campaign changed while you were editing. Your draft has been kept. Copy any changes you need before discarding to load the latest saved brief.</p>}
      <div className="grid gap-4 md:grid-cols-2">{F({ k: 'name', label: 'Name' })}{F({ k: 'owner', label: 'Owner' })}</div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="f-channel">Channel</label>
          <select id="f-channel" className="input" value={f.channel} onChange={(e) => set('channel', e.target.value)} data-testid="select-channel">
            {CHANNELS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        {F({ k: 'budget', label: 'Budget (USD)', type: 'number' })}
      </div>
      {F({ k: 'objective', label: 'Objective' })}
      {F({ k: 'audience', label: 'Audience' })}
      {F({ k: 'description', label: 'Summary', rows: 2 })}
      <div className="rounded-lg border border-gold bg-gold/10 p-3">{F({ k: 'hypothesis', label: 'Experiment hypothesis', rows: 3 })}</div>
      {F({ k: 'content', label: 'Brief content', rows: 10 })}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" type="submit" disabled={!dirty || !valid || conflict || update.isPending} data-testid="button-save">{update.isPending ? 'Saving...' : 'Save as new version'}</button>
        {dirty && <button type="button" className="btn btn-ghost" onClick={() => { base.current = c; setF(toForm(c)); setConflict(false); }} data-testid="button-discard">Discard changes</button>}
        {!valid && <span className="text-accent">Name, objective and a non-negative whole-number budget are required.</span>}
        {update.isError && <span role="alert" className="text-accent" data-testid="text-save-error">{errMsg(update.error)}</span>}
        {saved && !dirty && <span className="text-moss" data-testid="text-saved">Saved. A new revision was recorded.</span>}
      </div>
    </form>
  );
}
