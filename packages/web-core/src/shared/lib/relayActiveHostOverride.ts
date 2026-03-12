const RELAY_ACTIVE_HOST_OVERRIDE_KEY = '__vibeActiveRelayHostOverride';

function getRelayOverrideStore(): Record<string, unknown> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window as unknown as Record<string, unknown>;
}

export function getRelayActiveHostOverride(): string | null {
  const store = getRelayOverrideStore();
  if (!store) {
    return null;
  }

  const value = store[RELAY_ACTIVE_HOST_OVERRIDE_KEY];
  return typeof value === 'string' ? value : null;
}

export function setRelayActiveHostOverride(hostId: string | null): void {
  const store = getRelayOverrideStore();
  if (!store) {
    return;
  }

  if (hostId) {
    store[RELAY_ACTIVE_HOST_OVERRIDE_KEY] = hostId;
    return;
  }

  delete store[RELAY_ACTIVE_HOST_OVERRIDE_KEY];
}
