import type { DataChannelResponse } from "shared/types";
import { base64ToBytes } from "@remote/shared/lib/relay/bytes";
import { getActiveRelayHostId } from "@remote/shared/lib/relay/activeHostContext";
import {
  shouldRelayApiPath,
  toPathAndQuery,
  resolveRelayHostIdForCurrentPage,
} from "@remote/shared/lib/relay/routing";
import {
  requestLocalApiViaRelay,
  openLocalApiWebSocketViaRelay,
} from "@remote/shared/lib/relayHostApi";
import type {
  LocalApiRequestOptions,
  LocalApiWebSocketOptions,
} from "@/shared/lib/localApiTransport";
import { getWebRtcConnection } from "./connectionManager";
import { createDataChannelWebSocket } from "./dataChannelWebSocket";

function resolveHostId(
  options: { relayHostId?: string | null } = {},
): string | null {
  return (
    options.relayHostId ??
    resolveRelayHostIdForCurrentPage() ??
    getActiveRelayHostId()
  );
}

function normalizeWebSocketUrl(pathOrUrl: string): string {
  const url = new URL(pathOrUrl, window.location.href);
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }
  return url.toString();
}

export async function requestLocalApiViaWebRtc(
  pathOrUrl: string,
  requestInit: LocalApiRequestOptions = {},
): Promise<Response> {
  const pathAndQuery = toPathAndQuery(pathOrUrl);

  if (!shouldRelayApiPath(pathAndQuery)) {
    return fetch(pathOrUrl, requestInit);
  }

  const hostId = resolveHostId(requestInit);
  if (!hostId) {
    return requestLocalApiViaRelay(pathOrUrl, requestInit);
  }

  const conn = getWebRtcConnection(hostId);
  if (!conn) {
    return requestLocalApiViaRelay(pathOrUrl, requestInit);
  }

  const method = (requestInit.method ?? "GET").toUpperCase();
  const headers: Record<string, string[]> = {};
  if (requestInit.headers) {
    const h = new Headers(requestInit.headers);
    h.forEach((v, k) => {
      if (!headers[k]) headers[k] = [];
      headers[k].push(v);
    });
  }

  let bodyBytes: Uint8Array | undefined;
  if (requestInit.body != null) {
    if (typeof requestInit.body === "string") {
      bodyBytes = new TextEncoder().encode(requestInit.body);
    } else if (requestInit.body instanceof ArrayBuffer) {
      bodyBytes = new Uint8Array(requestInit.body);
    } else if (ArrayBuffer.isView(requestInit.body)) {
      bodyBytes = new Uint8Array(
        requestInit.body.buffer,
        requestInit.body.byteOffset,
        requestInit.body.byteLength,
      );
    } else if (requestInit.body instanceof Blob) {
      bodyBytes = new Uint8Array(await requestInit.body.arrayBuffer());
    } else {
      return requestLocalApiViaRelay(pathOrUrl, requestInit);
    }
  }

  try {
    const dcResp = await conn.sendHttpRequest(
      method,
      pathAndQuery,
      headers,
      bodyBytes,
    );
    return dataChannelResponseToResponse(dcResp);
  } catch (err) {
    console.warn("[webrtc] request failed, falling back to relay:", err);
    return requestLocalApiViaRelay(pathOrUrl, requestInit);
  }
}

export async function openLocalApiWebSocketViaWebRtc(
  pathOrUrl: string,
  options: LocalApiWebSocketOptions = {},
): Promise<WebSocket> {
  const pathAndQuery = toPathAndQuery(pathOrUrl);

  if (!shouldRelayApiPath(pathAndQuery)) {
    return new WebSocket(normalizeWebSocketUrl(pathOrUrl));
  }

  const hostId = resolveHostId(options);
  if (!hostId) {
    return openLocalApiWebSocketViaRelay(pathOrUrl, options);
  }

  const conn = getWebRtcConnection(hostId);
  if (!conn) {
    return openLocalApiWebSocketViaRelay(pathOrUrl, options);
  }

  return createDataChannelWebSocket(conn, pathAndQuery);
}

function dataChannelResponseToResponse(dcResp: DataChannelResponse): Response {
  const body = dcResp.body_b64
    ? (new Uint8Array(
        base64ToBytes(dcResp.body_b64),
      ) as Uint8Array<ArrayBuffer>)
    : null;

  const headers = new Headers();
  for (const [k, values] of Object.entries(dcResp.headers)) {
    if (values != null) {
      for (const v of values) {
        headers.append(k, v);
      }
    }
  }
  return new Response(body, {
    status: dcResp.status,
    headers,
  });
}
