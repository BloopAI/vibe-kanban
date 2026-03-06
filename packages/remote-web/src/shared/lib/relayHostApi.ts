import {
  invalidateRelaySessionBaseUrl,
  resolveRelayHostContext,
  tryRefreshRelayHostSigningSession,
} from "@remote/shared/lib/relay/context";
import { getActiveRelayHostId } from "@remote/shared/lib/relay/activeHostContext";
import {
  isAuthFailureStatus,
  sendRelayHostRequest,
} from "@remote/shared/lib/relay/http";
import {
  isWorkspaceRoutePath,
  normalizePath,
  openBrowserWebSocket,
  resolveRelayHostIdForCurrentPage,
  shouldRelayApiPath,
  toPathAndQuery,
} from "@remote/shared/lib/relay/routing";
import {
  appendSignatureToPath,
  buildRelaySignature,
  normalizeRequestBody,
} from "@remote/shared/lib/relay/signing";
import {
  createRelaySignedWebSocket,
  createRelayWsSigningContext,
} from "@remote/shared/lib/relay/ws";

const EMPTY_BYTES = new Uint8Array();
const WEBRTC_NEGOTIATION_TIMEOUT_MS = 7000;

type RelayTransportMode = "relay" | "upgrading" | "webrtc" | "fallback";

interface RelayTransportState {
  mode: RelayTransportMode;
  sessionId: string | null;
}

const hostTransportState = new Map<string, RelayTransportState>();
const hostUpgradeAttempt = new Map<string, Promise<void>>();

export { isWorkspaceRoutePath };

export async function requestLocalApiViaRelay(
  pathOrUrl: string,
  requestInit: RequestInit = {},
): Promise<Response> {
  const pathAndQuery = toPathAndQuery(pathOrUrl);

  if (!shouldRelayApiPath(pathAndQuery)) {
    return fetch(pathOrUrl, requestInit);
  }

  const hostId = resolveRelayHostIdForCurrentPage() ?? getActiveRelayHostId();
  if (!hostId) {
    throw new Error(
      "Host context is required for local API requests. Navigate under /hosts/{hostId}/...",
    );
  }

  void ensureWebRtcUpgradeAttempt(hostId);
  return requestRelayHostApi(hostId, pathAndQuery, requestInit);
}

export async function openLocalApiWebSocketViaRelay(
  pathOrUrl: string,
): Promise<WebSocket> {
  const pathAndQuery = toPathAndQuery(pathOrUrl);

  if (!shouldRelayApiPath(pathAndQuery)) {
    return openBrowserWebSocket(pathOrUrl);
  }

  const hostId = resolveRelayHostIdForCurrentPage() ?? getActiveRelayHostId();
  if (!hostId) {
    throw new Error(
      "Host context is required for local API WebSocket requests. Navigate under /hosts/{hostId}/...",
    );
  }

  void ensureWebRtcUpgradeAttempt(hostId);
  return openRelayHostWebSocket(hostId, pathAndQuery);
}

export async function requestRelayHostApi(
  hostId: string,
  pathOrUrl: string,
  requestInit: RequestInit = {},
  options: { skipWebRtcAttempt?: boolean } = {},
): Promise<Response> {
  if (!options.skipWebRtcAttempt) {
    void ensureWebRtcUpgradeAttempt(hostId);
  }

  const pathAndQuery = toPathAndQuery(pathOrUrl);
  const normalizedPath = normalizePath(pathAndQuery);
  const method = (requestInit.method ?? "GET").toUpperCase();

  const { body, bodyBytes, contentType } = await normalizeRequestBody(
    requestInit.body,
  );

  const context = await resolveRelayHostContext(hostId);
  const initialResponse = await sendRelayHostRequest(context, {
    normalizedPath,
    method,
    body,
    bodyBytes,
    contentType,
    requestInit,
  });
  if (!isAuthFailureStatus(initialResponse.status)) {
    return initialResponse;
  }

  invalidateRelaySessionBaseUrl(hostId);
  const refreshedContext = await tryRefreshRelayHostSigningSession(context);
  if (!refreshedContext) {
    return initialResponse;
  }

  const retryResponse = await sendRelayHostRequest(refreshedContext, {
    normalizedPath,
    method,
    body,
    bodyBytes,
    contentType,
    requestInit,
  });
  if (isAuthFailureStatus(retryResponse.status)) {
    invalidateRelaySessionBaseUrl(hostId);
  }

  return retryResponse;
}

export async function openRelayHostWebSocket(
  hostId: string,
  pathOrUrl: string,
): Promise<WebSocket> {
  void ensureWebRtcUpgradeAttempt(hostId);
  const baseContext = await resolveRelayHostContext(hostId);
  const context =
    (await tryRefreshRelayHostSigningSession(baseContext)) ?? baseContext;
  const pathAndQuery = toPathAndQuery(pathOrUrl);
  const normalizedPath = normalizePath(pathAndQuery);

  const signature = await buildRelaySignature(
    context.pairedHost,
    "GET",
    normalizedPath,
    EMPTY_BYTES,
  );

  const signedPath = appendSignatureToPath(normalizedPath, signature);
  const wsUrl = `${context.relaySessionBaseUrl}${signedPath}`.replace(
    /^http/i,
    "ws",
  );

  const signingContext = await createRelayWsSigningContext(
    context.pairedHost,
    signature,
  );
  return createRelaySignedWebSocket(new WebSocket(wsUrl), signingContext);
}

async function ensureWebRtcUpgradeAttempt(hostId: string): Promise<void> {
  const current = hostTransportState.get(hostId);
  if (current && current.mode !== "relay") {
    return;
  }

  const pending = hostUpgradeAttempt.get(hostId);
  if (pending) {
    return pending;
  }

  hostTransportState.set(hostId, { mode: "upgrading", sessionId: null });
  const attempt = attemptWebRtcUpgrade(hostId)
    .catch((error) => {
      console.debug("WebRTC transport upgrade failed; staying on relay", error);
      hostTransportState.set(hostId, { mode: "fallback", sessionId: null });
    })
    .finally(() => {
      hostUpgradeAttempt.delete(hostId);
    });
  hostUpgradeAttempt.set(hostId, attempt);
  return attempt;
}

async function attemptWebRtcUpgrade(hostId: string): Promise<void> {
  const peerConnection = new RTCPeerConnection({
    iceServers: parseIceServersFromEnv(),
  });
  const dataChannel = peerConnection.createDataChannel("vk-transport");

  const opened = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("WebRTC data channel open timeout"));
    }, WEBRTC_NEGOTIATION_TIMEOUT_MS);

    dataChannel.onopen = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    dataChannel.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("WebRTC data channel error"));
    };
  });

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await waitForIceGatheringComplete(peerConnection);

  const startResponse = await requestRelayHostApi(
    hostId,
    "/api/relay-webrtc/start",
    {
      method: "POST",
      body: JSON.stringify({
        offer_sdp: peerConnection.localDescription?.sdp ?? "",
      }),
    },
    { skipWebRtcAttempt: true },
  );

  if (!startResponse.ok) {
    hostTransportState.set(hostId, { mode: "fallback", sessionId: null });
    peerConnection.close();
    return;
  }

  const startEnvelope = (await startResponse.json()) as {
    success?: boolean;
    data?: {
      session_id?: string;
      status?: RelayTransportMode;
      answer_sdp?: string | null;
    };
  };
  const startData = startEnvelope?.data;
  if (!startEnvelope?.success || !startData?.session_id) {
    hostTransportState.set(hostId, { mode: "fallback", sessionId: null });
    peerConnection.close();
    return;
  }

  hostTransportState.set(hostId, {
    mode: startData.status ?? "fallback",
    sessionId: startData.session_id,
  });

  // Current host implementation may return fallback without SDP.
  if (!startData.answer_sdp) {
    peerConnection.close();
    return;
  }

  await peerConnection.setRemoteDescription({
    type: "answer",
    sdp: startData.answer_sdp,
  });
  await opened;

  // Placeholder: proxying HTTP/WS over data-channel is not wired yet, so we
  // preserve relay transport despite successful channel establishment.
  hostTransportState.set(hostId, {
    mode: "fallback",
    sessionId: startData.session_id,
  });

  try {
    await requestRelayHostApi(
      hostId,
      "/api/relay-webrtc/finalize",
      {
        method: "POST",
        body: JSON.stringify({ session_id: startData.session_id }),
      },
      { skipWebRtcAttempt: true },
    );
  } catch (error) {
    console.debug("WebRTC finalize request failed", error);
  } finally {
    peerConnection.close();
  }
}

function waitForIceGatheringComplete(
  peerConnection: RTCPeerConnection,
): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const onStateChange = () => {
      if (peerConnection.iceGatheringState === "complete") {
        peerConnection.removeEventListener(
          "icegatheringstatechange",
          onStateChange,
        );
        resolve();
      }
    };

    peerConnection.addEventListener("icegatheringstatechange", onStateChange);
  });
}

function parseIceServersFromEnv(): RTCIceServer[] {
  const envValue = import.meta.env.VITE_WEBRTC_STUN_URLS;
  if (typeof envValue !== "string" || envValue.trim().length === 0) {
    return [];
  }

  const urls = envValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (urls.length === 0) {
    return [];
  }

  return [{ urls }];
}
