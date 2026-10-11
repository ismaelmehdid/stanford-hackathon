import { useGetCampaignVersions, useRestoreCampaignVersion } from '@workspace/api-client-react';
import { ago, errMsg } from '@/lib/format';
import { Empty, ErrorBox, Skeleton } from '@/components/bits';
import { useInvalidateAll } from '@/lib/invalidate';

const show = (v: unknown) => (v === undefined || v === null || v === '' ? 'empty' : String(v));

export function Revisions({ id, blocked = false }: { id: string; blocked?: boolean }) {
  const restore = useRestoreCampaignVersion();
  const invalidate = useInvalidateAll();
  const q = useGetCampaignVersions(id, { query: { queryKey: [`/api/campaigns/${id}/versions`], staleTime: 15000 } });
  if (q.isLoading) return <Skeleton rows={3} h={60} />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} label="Could not load revisions" />;
  const list = [...(q.data ?? [])].sort((a, b) => b.version - a.version);
  if (!list.length) return <Empty title="No revisions yet" body="Saving an edit to the brief records a version here." />;
  return (
    <>
    {restore.isError && <p role="alert" className="mb-2 text-accent">{errMsg(restore.error)}</p>}
    <ol className="space-y-3" data-testid="list-revisions">
      {list.map((v) => {
        const prev = list.find((p) => p.version === v.version - 1);
        const changed = prev ? Object.keys(v.snapshot).filter((k) => !['updatedAt', 'createdAt', 'created_at', 'updated_at', 'revision', 'status'].includes(k) && JSON.stringify(v.snapshot[k]) !== JSON.stringify(prev.snapshot[k])) : [];
        return (
          <li key={v.id} className="panel p-3" data-testid={`revision-${v.version}`}>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-sm font-semibold">v{v.version}</span>
              <span className="font-mono text-xs text-muted">{ago(v.createdAt)}</span>
            </div>
            <p>{v.summary}</p>
            {v.version !== list[0]?.version && <button type="button" className="mt-2 text-xs font-semibold text-moss hover:underline" disabled={restore.isPending || blocked} data-testid={`button-restore-${v.version}`} onClick={() => {
              if (window.confirm(`Restore v${v.version} as a new draft? Existing history stays intact and approval must be requested again.`)) {
                restore.mutate({ id, versionId: v.id }, { onSuccess: () => invalidate(id) });
              }
            }}>{restore.isPending ? 'Restoring...' : 'Restore this version'}</button>}
            {changed.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs">
                {changed.map((k) => (
                  <li key={k}><span className="font-mono text-muted">{k}</span>: <s className="text-accent">{show(prev!.snapshot[k]).slice(0, 80)}</s> <span className="text-moss">{show(v.snapshot[k]).slice(0, 80)}</span></li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
    </>
  );
}
