import {
  invalidateRelaySessionBaseUrl,
  resolveRelayHostContext,
  tryRefreshRelayHostSigningSession,
} from "@remote/shared/lib/relay/context";
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

export { isWorkspaceRoutePath };

export async function requestLocalApiViaRelay(
  pathOrUrl: string,
  requestInit: RequestInit = {},
): Promise<Response> {
  const pathAndQuery = toPathAndQuery(pathOrUrl);

  if (!shouldRelayApiPath(pathAndQuery)) {
    return fetch(pathOrUrl, requestInit);
  }

  const hostId = resolveRelayHostIdForCurrentPage();
  if (!hostId) {
    return fetch(pathOrUrl, requestInit);
  }

  return requestRelayHostApi(hostId, pathAndQuery, requestInit);
}

export async function openLocalApiWebSocketViaRelay(
  pathOrUrl: string,
): Promise<WebSocket> {
  const pathAndQuery = toPathAndQuery(pathOrUrl);

  if (!shouldRelayApiPath(pathAndQuery)) {
    return openBrowserWebSocket(pathOrUrl);
  }

  const hostId = resolveRelayHostIdForCurrentPage();
  if (!hostId) {
    return openBrowserWebSocket(pathOrUrl);
  }

  return openRelayHostWebSocket(hostId, pathAndQuery);
}

export async function requestRelayHostApi(
  hostId: string,
  pathOrUrl: string,
  requestInit: RequestInit = {},
): Promise<Response> {
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
