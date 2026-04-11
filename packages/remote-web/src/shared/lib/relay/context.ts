import {
  type PairedRelayHost,
  listPairedRelayHosts,
  savePairedRelayHost,
  subscribeRelayPairingChanges,
} from "@/shared/lib/relayPairingStorage";
import {
  createRemoteSession,
  refreshRelaySigningSession,
} from "@/shared/lib/relayBackendApi";
import { buildRelaySigningSessionRefreshPayload } from "@/shared/lib/relaySigningSessionRefresh";

import type { RelayHostContext } from "@remote/shared/lib/relay/types";

const remoteSessionIdCache = new Map<string, string>();

subscribeRelayPairingChanges(({ hostId }) => {
  remoteSessionIdCache.delete(hostId);
});

export async function resolveRemoteHostContext(
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

  const browserSessionId = await getRemoteSessionId(hostId);
  return {
    pairedHost,
    sessionId: browserSessionId,
  };
}

export function invalidateRemoteSessionId(hostId: string): void {
  remoteSessionIdCache.delete(hostId);
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
      context.pairedHost.host_id,
      context.sessionId,
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

async function getRemoteSessionId(hostId: string): Promise<string> {
  const cached = remoteSessionIdCache.get(hostId);
  if (cached) {
    return cached;
  }

  const resp = await createRemoteSession(hostId).catch((error) => {
    remoteSessionIdCache.delete(hostId);
    throw error;
  });

  remoteSessionIdCache.set(hostId, resp.session_id);
  return resp.session_id;
}

async function findPairedHost(hostId: string): Promise<PairedRelayHost | null> {
  const pairedHosts = await listPairedRelayHosts();
  return pairedHosts.find((host) => host.host_id === hostId) ?? null;
}
