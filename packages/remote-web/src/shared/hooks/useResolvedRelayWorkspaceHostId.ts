import { useEffect, useMemo } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  getActiveRelayHostId,
  parseRelayHostIdFromSearch,
  setActiveRelayHostId,
} from "@remote/shared/lib/activeRelayHost";

export function useResolvedRelayWorkspaceHostId(): string | null {
  const location = useLocation();

  const hostIdFromSearch = useMemo(
    () => parseRelayHostIdFromSearch(location.searchStr),
    [location.searchStr],
  );

  useEffect(() => {
    if (hostIdFromSearch) {
      setActiveRelayHostId(hostIdFromSearch);
    }
  }, [hostIdFromSearch]);

  return hostIdFromSearch ?? getActiveRelayHostId();
}
