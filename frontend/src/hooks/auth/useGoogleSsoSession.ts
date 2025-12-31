import { useQuery } from '@tanstack/react-query';
import { googleSsoApi, GoogleSsoSessionResponse } from '@/lib/api';

/**
 * Hook to check the current Google SSO session status.
 * Only fetches when SSO is enabled to avoid unnecessary requests.
 *
 * @param enabled - Whether SSO is enabled (from config)
 * @returns Query result with session data
 */
export function useGoogleSsoSession(enabled: boolean) {
  return useQuery<GoogleSsoSessionResponse>({
    queryKey: ['google-sso', 'session'],
    queryFn: () => googleSsoApi.session(),
    enabled, // Only fetch when SSO is enabled
    staleTime: 60 * 1000, // 1 minute
    retry: false, // Don't retry on failure - likely means not authenticated
  });
}
