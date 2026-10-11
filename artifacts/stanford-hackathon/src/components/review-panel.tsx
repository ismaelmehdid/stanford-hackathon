import { useState } from 'react';
import { useReviewCampaign, useSubmitCampaign, useActivateCampaign, type Campaign } from '@workspace/api-client-react';
import { useInvalidateAll } from '@/lib/invalidate';
import { errMsg } from '@/lib/format';

export function ReviewPanel({ c, compact = false, blocked = false }: { c: Campaign; compact?: boolean; blocked?: boolean }) {
  const invalidate = useInvalidateAll();
  const review = useReviewCampaign();
  const submit = useSubmitCampaign();
  const activate = useActivateCampaign();
  const [note, setNote] = useState('');
  const [done, setDone] = useState('');
  const err = review.error ?? submit.error;
  const busy = review.isPending || submit.isPending || blocked;

  const decide = (decision: 'approve' | 'request_changes') =>
    review.mutate({ id: c.id, data: { decision, ...(note.trim() && { note: note.trim() }) } }, {
      onSuccess: () => { invalidate(c.id); setNote(''); setDone(decision === 'approve' ? 'Approved.' : 'Sent back to draft.'); },
    });

  if (c.status === 'idea' || c.status === 'draft') {
    return (
      <div data-testid={`review-panel-${c.id}`}>
        <p className="mb-2 text-muted">Ready for sign-off? Unsaved edits are not included.</p>
        <button className="btn" disabled={busy} data-testid="button-submit-review"
          onClick={() => submit.mutate({ id: c.id }, { onSuccess: () => { invalidate(c.id); setDone('Submitted for review.'); } })}>
          {submit.isPending ? 'Submitting...' : 'Submit for review'}
        </button>
        {submit.isError && <p role="alert" className="mt-2 text-accent">{errMsg(err)}</p>}
        {done && <p className="mt-2 text-moss" data-testid="text-review-done">{done}</p>}
      </div>
    );
  }
  if (c.status === 'approved') {
    return <div className="space-y-2">
      <p className="text-muted">Approved. Once you publish in your marketing tools, mark this campaign live here.</p>
      <button className="btn" disabled={activate.isPending || blocked} data-testid="button-mark-live" onClick={() => {
        activate.mutate({ id: c.id }, { onSuccess: () => { invalidate(c.id); setDone('Marked live internally.'); } });
      }}>{activate.isPending ? 'Updating...' : 'Mark as live'}</button>
      <p className="text-xs text-muted">This updates GrowthOS only; it does not publish to external channels.</p>
      {activate.isError && <p role="alert" className="text-accent">{errMsg(activate.error)}</p>}
    </div>;
  }
  if (c.status !== 'in_review') {
    return <p className="text-muted" data-testid="text-no-review">{done || 'No review action is available for this status.'}</p>;
  }
  return (
    <div className="space-y-2" data-testid={`review-panel-${c.id}`}>
      <textarea rows={compact ? 2 : 3} className="input" placeholder="Review note (optional)" value={note} onChange={(e) => setNote(e.target.value)} data-testid={`input-note-${c.id}`} />
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy} onClick={() => decide('approve')} data-testid={`button-approve-${c.id}`}>Approve</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => decide('request_changes')} data-testid={`button-request-changes-${c.id}`}>Request changes</button>
      </div>
      {review.isError && <p role="alert" className="text-accent">{errMsg(err)}</p>}
    </div>
  );
}
