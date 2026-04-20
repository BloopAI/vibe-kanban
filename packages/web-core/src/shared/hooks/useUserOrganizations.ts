import type { ListOrganizationsResponse } from 'shared/types';

const EMPTY: ListOrganizationsResponse = { organizations: [] };

/**
 * Local-first stub — organizations are a cloud-only concept.
 * Always returns empty data so all consumers that read `orgsData?.organizations`
 * see an empty array without making any network requests.
 */
export function useUserOrganizations() {
  return {
    data: EMPTY,
    isLoading: false,
    error: null as Error | null,
    refetch: () => Promise.resolve(),
  };
}
