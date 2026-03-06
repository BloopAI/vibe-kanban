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
import { RelayWebRtcTransport } from "@remote/shared/lib/relay/webrtcTransport";

const EMPTY_BYTES = new Uint8Array();
const WEBRTC_NEGOTIATION_TIMEOUT_MS = 7000;

type RelayTransportMode = "relay" | "upgrading" | "webrtc" | "fallback";

interface RelayTransportState {
  mode: RelayTransportMode;
  sessionId: string | null;
}

const hostTransportState = new Map<string, RelayTransportState>();
const hostUpgradeAttempt = new Map<string, Promise<void>>();
const hostWebRtcTransport = new Map<string, RelayWebRtcTransport>();

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
  const webrtcTransport = hostWebRtcTransport.get(hostId);
  if (webrtcTransport) {
    try {
      return await requestViaWebRtc(pathOrUrl, requestInit, webrtcTransport);
    } catch (error) {
      console.warn("WebRTC API request failed, falling back to relay", error);
      hostWebRtcTransport.delete(hostId);
      hostTransportState.set(hostId, { mode: "fallback", sessionId: null });
    }
  }

  if (!options.skipWebRtcAttempt && !hostWebRtcTransport.has(hostId)) {
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
  const webrtcTransport = hostWebRtcTransport.get(hostId);
  if (webrtcTransport) {
    try {
      return (await webrtcTransport.openVirtualWebSocket(
        normalizePath(toPathAndQuery(pathOrUrl)),
      )) as unknown as WebSocket;
    } catch (error) {
      console.warn(
        "WebRTC websocket open failed, falling back to relay",
        error,
      );
      hostWebRtcTransport.delete(hostId);
      hostTransportState.set(hostId, { mode: "fallback", sessionId: null });
    }
  }

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
  if (current && (current.mode === "upgrading" || current.mode === "webrtc")) {
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
  const baseContext = await resolveRelayHostContext(hostId);
  const context =
    (await tryRefreshRelayHostSigningSession(baseContext)) ?? baseContext;

  const signingSessionId = context.pairedHost.signing_session_id;
  if (!signingSessionId) {
    hostTransportState.set(hostId, {
      mode: "fallback",
      sessionId: null,
    });
    return;
  }

  const requestNonce = crypto.randomUUID().replace(/-/g, "");
  const peerConnection = new RTCPeerConnection({
    iceServers: parseIceServersFromEnv(),
  });
  const dataChannel = peerConnection.createDataChannel("vk-transport", {
    ordered: true,
  });

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
        signing_session_id: signingSessionId,
        request_nonce: requestNonce,
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
    mode: "upgrading",
    sessionId: startData.session_id,
  });

  if (!startData.answer_sdp) {
    hostTransportState.set(hostId, {
      mode: "fallback",
      sessionId: startData.session_id,
    });
    peerConnection.close();
    return;
  }

  await peerConnection.setRemoteDescription({
    type: "answer",
    sdp: startData.answer_sdp,
  });
  await opened;

  const transport = new RelayWebRtcTransport({
    sessionId: startData.session_id,
    requestNonce,
    dataChannel,
    pairedHost: context.pairedHost,
  });
  await transport.ping();

  try {
    const finalizeResponse = await requestRelayHostApi(
      hostId,
      "/api/relay-webrtc/finalize",
      {
        method: "POST",
        body: JSON.stringify({ session_id: startData.session_id }),
      },
      { skipWebRtcAttempt: true },
    );
    if (!finalizeResponse.ok) {
      throw new Error(`Finalize failed with status ${finalizeResponse.status}`);
    }
    const finalizeEnvelope = (await finalizeResponse.json()) as {
      success?: boolean;
      data?: {
        status?: RelayTransportMode;
      };
    };
    if (
      !finalizeEnvelope.success ||
      finalizeEnvelope.data?.status !== "webrtc"
    ) {
      throw new Error("Finalize response did not confirm webrtc mode");
    }

    hostWebRtcTransport.set(hostId, transport);
    hostTransportState.set(hostId, {
      mode: "webrtc",
      sessionId: startData.session_id,
    });
  } catch (error) {
    console.debug("WebRTC finalize request failed", error);
    hostTransportState.set(hostId, {
      mode: "fallback",
      sessionId: startData.session_id,
    });
    peerConnection.close();
  }
}

async function requestViaWebRtc(
  pathOrUrl: string,
  requestInit: RequestInit,
  transport: RelayWebRtcTransport,
): Promise<Response> {
  const pathAndQuery = toPathAndQuery(pathOrUrl);
  const normalizedPath = normalizePath(pathAndQuery);
  const method = (requestInit.method ?? "GET").toUpperCase();
  const normalizedBody = await normalizeRequestBody(requestInit.body);
  const headers = new Headers(requestInit.headers ?? {});

  if (
    normalizedBody.contentType &&
    !headers.has("Content-Type") &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    headers.set("Content-Type", normalizedBody.contentType);
  }

  return transport.request(
    method,
    normalizedPath,
    headers,
    normalizedBody.bodyBytes,
  );
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
