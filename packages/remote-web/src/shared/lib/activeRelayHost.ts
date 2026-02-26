const ACTIVE_RELAY_HOST_STORAGE_KEY = "vk-active-relay-host-id";

let activeRelayHostIdCache: string | null | undefined;

function readStoredHostId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(ACTIVE_RELAY_HOST_STORAGE_KEY);
  return value && value.length > 0 ? value : null;
}

export function getActiveRelayHostId(): string | null {
  if (activeRelayHostIdCache !== undefined) {
    return activeRelayHostIdCache;
  }

  activeRelayHostIdCache = readStoredHostId();
  return activeRelayHostIdCache;
}

export function setActiveRelayHostId(hostId: string | null): void {
  activeRelayHostIdCache = hostId;

  if (typeof window === "undefined") {
    return;
  }

  if (hostId && hostId.length > 0) {
    window.localStorage.setItem(ACTIVE_RELAY_HOST_STORAGE_KEY, hostId);
  } else {
    window.localStorage.removeItem(ACTIVE_RELAY_HOST_STORAGE_KEY);
  }
}

export function parseRelayHostIdFromSearch(searchStr: string): string | null {
  const params = new URLSearchParams(searchStr);
  const hostId = params.get("hostId");
  return hostId && hostId.length > 0 ? hostId : null;
}
