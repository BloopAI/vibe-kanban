const STORAGE_KEY = "vk-active-relay-host-id";

function readPersistedHostId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// Seed from persisted storage so that API calls on non-host-scoped routes
// (e.g. /projects/$projectId) succeed immediately after a page refresh,
// before the async hosts query completes and the useEffect in __root.tsx fires.
let persistedHostId: string | null = readPersistedHostId();
let activeRelayHostId: string | null = null;

export function setActiveRelayHostId(hostId: string | null): void {
  activeRelayHostId = hostId;
  if (hostId) {
    persistedHostId = hostId;
    try {
      localStorage.setItem(STORAGE_KEY, hostId);
    } catch {
      // Ignore storage errors (e.g. private browsing quota)
    }
  }
}

export function getActiveRelayHostId(): string | null {
  // Fall back to the persisted value while the in-memory state is still null
  // (i.e. before the first useEffect in __root.tsx has run).
  return activeRelayHostId ?? persistedHostId;
}
