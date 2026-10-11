import { useQueryClient } from '@tanstack/react-query';
import {
  getGetActivityQueryKey,
  getGetCampaignQueryKey,
  getGetCampaignVersionsQueryKey,
  getGetCampaignsQueryKey,
  getGetDashboardQueryKey,
  getGetGrowthAnalyticsQueryKey,
} from '@workspace/api-client-react';

export function useInvalidateAll() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: getGetCampaignsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    qc.invalidateQueries({ queryKey: getGetGrowthAnalyticsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetActivityQueryKey() });
    if (id) {
      qc.invalidateQueries({ queryKey: getGetCampaignQueryKey(id) });
      qc.invalidateQueries({ queryKey: getGetCampaignVersionsQueryKey(id) });
    }
  };
}
