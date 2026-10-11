import type { Campaign, CampaignStatus } from '@workspace/api-client-react';

export const CHANNELS = ['Paid', 'Content', 'Social', 'Email', 'SEO', 'Brand'] as const;
export const STAGES: { key: CampaignStatus; label: string; hint: string }[] = [
  { key: 'idea', label: 'Idea', hint: 'Hypothesis captured, no brief yet' },
  { key: 'draft', label: 'Draft', hint: 'Brief being written or revised' },
  { key: 'in_review', label: 'In review', hint: 'Waiting on an approver' },
  { key: 'approved', label: 'Approved', hint: 'Signed off, ready to launch' },
  { key: 'live', label: 'Live', hint: 'Marked live in GrowthOS' },
];
export const STATUS_STYLE: Record<string, string> = {
  idea: 'bg-[#e9e3d2] text-[#5a5a4e]',
  draft: 'bg-[#f6e3b0] text-[#6b4e07]',
  in_review: 'bg-[#f8d3c9] text-[#8c2c19]',
  approved: 'bg-[#cfe3d5] text-[#27492f]',
  live: 'bg-ink text-paper',
};
export const statusLabel = (s: string) => STAGES.find((x) => x.key === s)?.label ?? s;
export const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Request failed');
export type { Campaign };
