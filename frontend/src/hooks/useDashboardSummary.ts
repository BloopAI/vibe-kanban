import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api';
import type { DashboardSummary } from 'shared/types';

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => dashboardApi.getSummary(),
    refetchInterval: 5000, // Poll every 5 seconds for updates
    staleTime: 2000,
  });
}
