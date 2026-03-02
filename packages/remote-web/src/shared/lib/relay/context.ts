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

  try {
    const payload = await buildRelaySigningSessionRefreshPayload(
      clientId,
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

    return {
      ...context,
      pairedHost: updatedPairedHost,
    };
  } catch (error) {
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
