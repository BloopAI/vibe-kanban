import {
  type PairedRelayHost,
  listPairedRelayHosts,
} from "@/shared/lib/relayPairingStorage";
import { createRelaySession } from "@/shared/lib/remoteApi";
import {
  createRelaySessionAuthCode,
  establishRelaySessionBaseUrl,
} from "@/shared/lib/relayBackendApi";
import {
  getActiveRelayHostId,
  parseRelayHostIdFromSearch,
  setActiveRelayHostId,
} from "@remote/shared/lib/activeRelayHost";

const TEXT_ENCODER = new TextEncoder();
const EMPTY_BYTES = new Uint8Array();
const CONTENT_TYPE_HEADER = "Content-Type";

const SIGNING_SESSION_HEADER = "x-vk-sig-session";
const TIMESTAMP_HEADER = "x-vk-sig-ts";
const NONCE_HEADER = "x-vk-sig-nonce";
const REQUEST_SIGNATURE_HEADER = "x-vk-sig-signature";

const signingKeyCache = new Map<string, CryptoKey>();
const relaySessionBaseUrlCache = new Map<string, Promise<string>>();

interface RelaySignature {
  signingSessionId: string;
  timestamp: number;
  nonce: string;
  signature: string;
}

interface RelayHostContext {
  hostId: string;
  pairedHost: PairedRelayHost;
  relaySessionBaseUrl: string;
}

export function isWorkspaceRoutePath(pathname: string): boolean {
  return pathname === "/workspaces" || pathname.startsWith("/workspaces/");
}

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
  const context = await resolveRelayHostContext(hostId);
  const pathAndQuery = toPathAndQuery(pathOrUrl);
  const normalizedPath = normalizePath(pathAndQuery);
  const method = (requestInit.method ?? "GET").toUpperCase();

  const { body, bodyBytes, contentType } = await normalizeRequestBody(
    requestInit.body,
  );

  const headers = await buildSignedHeaders(
    context.pairedHost,
    method,
    normalizedPath,
    bodyBytes,
    requestInit.headers,
  );

  if (contentType && !headers.has(CONTENT_TYPE_HEADER)) {
    headers.set(CONTENT_TYPE_HEADER, contentType);
  }

  const response = await fetch(
    `${context.relaySessionBaseUrl}${normalizedPath}`,
    {
      ...requestInit,
      body,
      headers,
      credentials: "include",
    },
  );

  if (response.status === 401 || response.status === 403) {
    relaySessionBaseUrlCache.delete(hostId);
  }

  return response;
}

export async function openRelayHostWebSocket(
  hostId: string,
  pathOrUrl: string,
): Promise<WebSocket> {
  const context = await resolveRelayHostContext(hostId);
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

  return new WebSocket(wsUrl);
}

function resolveRelayHostIdForCurrentPage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (!isWorkspaceRoutePath(window.location.pathname)) {
    return null;
  }

  const hostIdFromSearch = parseRelayHostIdFromSearch(window.location.search);
  if (hostIdFromSearch) {
    setActiveRelayHostId(hostIdFromSearch);
    return hostIdFromSearch;
  }

  return getActiveRelayHostId();
}

function shouldRelayApiPath(pathAndQuery: string): boolean {
  const [path] = pathAndQuery.split("?");
  if (!path.startsWith("/api/")) {
    return false;
  }

  return !path.startsWith("/api/remote/");
}

async function resolveRelayHostContext(
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
    hostId,
    pairedHost,
    relaySessionBaseUrl,
  };
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
  return establishRelaySessionBaseUrl(
    authCode.relay_url,
    hostId,
    authCode.code,
  );
}

async function findPairedHost(hostId: string): Promise<PairedRelayHost | null> {
  const pairedHosts = await listPairedRelayHosts();
  return pairedHosts.find((host) => host.host_id === hostId) ?? null;
}

async function buildSignedHeaders(
  pairedHost: PairedRelayHost,
  method: string,
  pathAndQuery: string,
  bodyBytes: Uint8Array,
  incomingHeaders?: HeadersInit,
): Promise<Headers> {
  const signature = await buildRelaySignature(
    pairedHost,
    method,
    pathAndQuery,
    bodyBytes,
  );

  const headers = new Headers(incomingHeaders);
  headers.set(SIGNING_SESSION_HEADER, signature.signingSessionId);
  headers.set(TIMESTAMP_HEADER, String(signature.timestamp));
  headers.set(NONCE_HEADER, signature.nonce);
  headers.set(REQUEST_SIGNATURE_HEADER, signature.signature);
  return headers;
}

async function buildRelaySignature(
  pairedHost: PairedRelayHost,
  method: string,
  pathAndQuery: string,
  bodyBytes: Uint8Array,
): Promise<RelaySignature> {
  const signingSessionId = pairedHost.signing_session_id;
  if (!signingSessionId) {
    throw new Error(
      "This host pairing is missing signing metadata. Re-pair it.",
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const bodyHashB64 = await sha256Base64(bodyBytes);

  const message = [
    "v1",
    String(timestamp),
    method.toUpperCase(),
    pathAndQuery,
    signingSessionId,
    nonce,
    bodyHashB64,
  ].join("|");

  const signingKey = await getSigningKey(pairedHost);
  const signature = await crypto.subtle.sign(
    "Ed25519",
    signingKey,
    toArrayBuffer(TEXT_ENCODER.encode(message)),
  );

  return {
    signingSessionId,
    timestamp,
    nonce,
    signature: bytesToBase64(new Uint8Array(signature)),
  };
}

async function getSigningKey(pairedHost: PairedRelayHost): Promise<CryptoKey> {
  const signingSessionId = pairedHost.signing_session_id;
  if (!signingSessionId) {
    throw new Error("Missing signing session for paired host.");
  }

  const cacheKey = `${pairedHost.host_id}:${signingSessionId}`;
  const cachedKey = signingKeyCache.get(cacheKey);
  if (cachedKey) {
    return cachedKey;
  }

  const importedKey = await crypto.subtle.importKey(
    "jwk",
    pairedHost.private_key_jwk,
    { name: "Ed25519" },
    false,
    ["sign"],
  );

  signingKeyCache.set(cacheKey, importedKey);
  return importedKey;
}

async function sha256Base64(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    toArrayBuffer(bytes),
  );
  return bytesToBase64(new Uint8Array(hashBuffer));
}

async function normalizeRequestBody(
  body: BodyInit | null | undefined,
): Promise<{
  body: BodyInit | undefined;
  bodyBytes: Uint8Array;
  contentType: string | null;
}> {
  if (body == null) {
    return { body: undefined, bodyBytes: EMPTY_BYTES, contentType: null };
  }

  if (typeof body === "string") {
    return {
      body,
      bodyBytes: TEXT_ENCODER.encode(body),
      contentType: "text/plain;charset=UTF-8",
    };
  }

  const probeRequest = new Request("https://relay.local", {
    method: "POST",
    body,
  });

  const bodyBuffer = await probeRequest.arrayBuffer();
  return {
    body,
    bodyBytes: new Uint8Array(bodyBuffer),
    contentType: probeRequest.headers.get(CONTENT_TYPE_HEADER),
  };
}

function appendSignatureToPath(
  pathAndQuery: string,
  signature: RelaySignature,
): string {
  const url = new URL(pathAndQuery, "https://relay.local");
  url.searchParams.set(SIGNING_SESSION_HEADER, signature.signingSessionId);
  url.searchParams.set(TIMESTAMP_HEADER, String(signature.timestamp));
  url.searchParams.set(NONCE_HEADER, signature.nonce);
  url.searchParams.set(REQUEST_SIGNATURE_HEADER, signature.signature);
  return `${url.pathname}${url.search}`;
}

function openBrowserWebSocket(pathOrUrl: string): WebSocket {
  if (/^wss?:\/\//i.test(pathOrUrl)) {
    return new WebSocket(pathOrUrl);
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return new WebSocket(pathOrUrl.replace(/^http/i, "ws"));
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const normalizedPath = pathOrUrl.startsWith("/")
    ? pathOrUrl
    : `/${pathOrUrl}`;
  return new WebSocket(`${protocol}//${window.location.host}${normalizedPath}`);
}

function normalizePath(pathAndQuery: string): string {
  return pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
}

function toPathAndQuery(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl) || /^wss?:\/\//i.test(pathOrUrl)) {
    const url = new URL(pathOrUrl);
    return `${url.pathname}${url.search}`;
  }

  return pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
