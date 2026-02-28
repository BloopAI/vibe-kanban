import { useQuery } from "@tanstack/react-query";
import { makeLocalApiRequest } from "@/shared/lib/localApiTransport";

interface UseRelayWorkspaceHostHealthResult {
  isChecking: boolean;
  isError: boolean;
  errorMessage: string | null;
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return null;
}

export function useRelayWorkspaceHostHealth(
  hostId: string | null,
): UseRelayWorkspaceHostHealthResult {
  const hostHealthQuery = useQuery({
    queryKey: ["remote-workspaces-host-health", hostId],
    enabled: !!hostId,
    retry: false,
    staleTime: 5_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<true> => {
      const response = await makeLocalApiRequest("/api/info", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Host returned HTTP ${response.status}`);
      }

      return true;
    },
  });

  const isHostUnavailable =
    hostHealthQuery.isError || hostHealthQuery.isRefetchError;

  return {
    isChecking: hostHealthQuery.isPending,
    isError: isHostUnavailable,
    errorMessage: isHostUnavailable
      ? getErrorMessage(hostHealthQuery.error)
      : null,
  };
}
