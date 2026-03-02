import {
  type PairedRelayHost,
  listPairedRelayHosts,
  savePairedRelayHost,
  subscribeRelayPairingChanges,
} from "@/shared/lib/relayPairingStorage";
import { createRelaySession } from "@/shared/lib/remoteApi";
import {
  createRelaySessionAuthCode,
  establishRelaySessionBaseUrl,
  getRelayApiUrl,
  refreshRelaySigningSession,
} from "@/shared/lib/relayBackendApi";
import { buildRelaySigningSessionRefreshPayload } from "@/shared/lib/relaySigningSessionRefresh";

import type { RelayHostContext } from "@remote/shared/lib/relay/types";

const relaySessionBaseUrlCache = new Map<string, Promise<string>>();

/** Dedup in-flight refresh calls per host so concurrent callers share one request. */
const refreshInFlight = new Map<string, Promise<RelayHostContext | null>>();
/** Timestamp of the last successful refresh per host — used for cooldown. */
const lastRefreshAt = new Map<string, number>();
/** Backoff until timestamp per host — set when we receive a 429. */
let rateLimitedUntil = 0;

/** Minimum interval between successful refreshes (ms). */
const REFRESH_COOLDOWN_MS = 15_000;
/** Backoff duration after a 429 response (ms). */
const RATE_LIMIT_BACKOFF_MS = 65_000;

subscribeRelayPairingChanges(({ hostId }) => {
  relaySessionBaseUrlCache.delete(hostId);
});

export async function resolveRelayHostContext(
  hostId: string,
): Promise<RelayHostContext> {
  const pairedHost = await findPairedHost(hostId);
  if (!pairedHost) {
    throw new Error(
      "This host is not paired with your browser. Pair it in Relay settings.",
    );
  }

  if (!pairedHost.signing_session_id) {
    throw new Error(
      "This host pairing is outdated. Re-pair it in Relay settings.",
    );
  }

  const relaySessionBaseUrl = await getRelaySessionBaseUrl(hostId);
  return {
    pairedHost,
    relaySessionBaseUrl,
  };
}

export function invalidateRelaySessionBaseUrl(hostId: string): void {
  relaySessionBaseUrlCache.delete(hostId);
}

export async function tryRefreshRelayHostSigningSession(
  context: RelayHostContext,
): Promise<RelayHostContext | null> {
  const clientId = context.pairedHost.client_id;
  if (!clientId) {
    return null;
  }

  const hostId = context.pairedHost.host_id;

  // Skip if we're in a rate-limit backoff window.
  if (Date.now() < rateLimitedUntil) {
    return null;
  }

  // Skip if we refreshed recently (cooldown).
  const last = lastRefreshAt.get(hostId);
  if (last && Date.now() - last < REFRESH_COOLDOWN_MS) {
    return null;
  }

  // Dedup: if a refresh is already in flight for this host, piggyback on it.
  const existing = refreshInFlight.get(hostId);
  if (existing) {
    return existing;
  }

  const promise = doRefresh(context, hostId);
  refreshInFlight.set(hostId, promise);
  promise.finally(() => refreshInFlight.delete(hostId));
  return promise;
}

async function doRefresh(
  context: RelayHostContext,
  hostId: string,
): Promise<RelayHostContext | null> {
  try {
    const payload = await buildRelaySigningSessionRefreshPayload(
      context.pairedHost.client_id!,
      context.pairedHost.private_key_jwk,
    );
    const refreshed = await refreshRelaySigningSession(
      context.relaySessionBaseUrl,
      payload,
    );
    const updatedPairedHost: PairedRelayHost = {
      ...context.pairedHost,
      signing_session_id: refreshed.signing_session_id,
    };
    await savePairedRelayHost(updatedPairedHost);
    lastRefreshAt.set(hostId, Date.now());

    return {
      ...context,
      pairedHost: updatedPairedHost,
    };
  } catch (error) {
    // If the server returned 429, back off globally.
    if (error instanceof Error && error.message.includes("429")) {
      rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
    }
    console.warn("Failed to refresh relay signing session", error);
    return null;
  }
}

async function getRelaySessionBaseUrl(hostId: string): Promise<string> {
  const cached = relaySessionBaseUrlCache.get(hostId);
  if (cached) {
    return cached;
  }

  const created = createRelaySessionBaseUrl(hostId).catch((error) => {
    relaySessionBaseUrlCache.delete(hostId);
    throw error;
  });

  relaySessionBaseUrlCache.set(hostId, created);
  return created;
}

async function createRelaySessionBaseUrl(hostId: string): Promise<string> {
  const relaySession = await createRelaySession(hostId);
  const authCode = await createRelaySessionAuthCode(relaySession.id);
  const relayApiUrl = getRelayApiUrl();
  return establishRelaySessionBaseUrl(relayApiUrl, hostId, authCode.code);
}

async function findPairedHost(hostId: string): Promise<PairedRelayHost | null> {
  const pairedHosts = await listPairedRelayHosts();
  return pairedHosts.find((host) => host.host_id === hostId) ?? null;
}
