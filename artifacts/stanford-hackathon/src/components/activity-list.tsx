import { Link } from 'wouter';
import { useGetActivity } from '@workspace/api-client-react';
import { ago } from '@/lib/format';
import { Empty, ErrorBox, Skeleton } from '@/components/bits';

export function ActivityList({ limit = 12 }: { limit?: number }) {
  const q = useGetActivity({ query: { queryKey: ['/api/activity'], staleTime: 15000 } });
  if (q.isLoading) return <Skeleton rows={5} h={36} />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} label="Could not load activity" />;
  if (!q.data?.length) return <Empty title="No activity yet" body="Edits, submissions and reviews will be logged here." />;
  return (
    <ol className="relative space-y-4 border-l border-line pl-4" data-testid="list-activity">
      {q.data.slice(0, limit).map((a) => (
        <li key={a.id} className="relative" data-testid={`activity-${a.id}`}>
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-accent" />
          <div><b className="font-medium">{a.actor}</b> <span className="text-muted">{a.action}</span></div>
          <div className="flex gap-2 text-xs">
            <Link href={`/campaigns/${a.campaignId}`} className="underline decoration-line underline-offset-2 hover:decoration-ink">{a.campaignName}</Link>
            <span className="font-mono text-muted">{ago(a.createdAt)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
