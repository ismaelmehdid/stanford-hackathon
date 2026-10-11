import { useEffect, useState } from 'react';
import { useGetCampaigns } from '@workspace/api-client-react';
import { PageHeader, ErrorBox, Skeleton, Empty, CampaignRow } from '@/components/bits';
import { STAGES, CHANNELS } from '@/lib/format';
import { Search } from 'lucide-react';

export default function Campaigns() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  const params = { ...(q && { q }), ...(status && { status }) };
  const res = useGetCampaigns(params, { query: { queryKey: ['/api/campaigns', params], staleTime: 15000 } });
  const campaigns = res.data?.filter(c => !channel || c.channel === channel);
  return (
    <>
      <PageHeader title="Campaigns" sub="Browse and search campaign repositories. Open one to read its brief, edit it and see revisions." />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input className="input pl-9" placeholder="Search by name, objective, owner" value={text} onChange={(e) => setText(e.target.value)} data-testid="input-search" />
        </div>
        <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-status-filter">
          <option value="">All statuses</option>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className="input w-auto" aria-label="Filter by channel" value={channel} onChange={e => setChannel(e.target.value)} data-testid="select-channel-filter">
          <option value="">All channels</option>
          {CHANNELS.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      {res.isLoading && <Skeleton rows={6} />}
      {res.isError && <ErrorBox error={res.error} onRetry={() => res.refetch()} />}
      {campaigns && (campaigns.length === 0
        ? <Empty title="No matching campaigns" body={q || status || channel ? 'Nothing matches these filters. Clear them to see every repository.' : 'Create a campaign from the sidebar to start.'} />
        : <div className="panel overflow-hidden" data-testid="list-campaigns">{campaigns.map((c) => <CampaignRow key={c.id} c={c} />)}</div>)}
    </>
  );
}
