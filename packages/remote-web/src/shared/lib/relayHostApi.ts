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
import {
  getActiveRelayHostId,
  parseRelayHostIdFromSearch,
  setActiveRelayHostId,
} from "@remote/shared/lib/activeRelayHost";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const EMPTY_BYTES = new Uint8Array();
const CONTENT_TYPE_HEADER = "Content-Type";
const WS_ENVELOPE_VERSION = 1;

const SIGNING_SESSION_HEADER = "x-vk-sig-session";
const TIMESTAMP_HEADER = "x-vk-sig-ts";
const NONCE_HEADER = "x-vk-sig-nonce";
const REQUEST_SIGNATURE_HEADER = "x-vk-sig-signature";

const signingKeyCache = new Map<string, CryptoKey>();
const serverVerifyKeyCache = new Map<string, CryptoKey>();
const relaySessionBaseUrlCache = new Map<string, Promise<string>>();

subscribeRelayPairingChanges(({ hostId }) => {
  clearRelayHostCryptoCaches(hostId);
  relaySessionBaseUrlCache.delete(hostId);
});

interface RelaySignature {
  signingSessionId: string;
  timestamp: number;
  nonce: string;
  signature: string;
}

interface RelayHostContext {
  pairedHost: PairedRelayHost;
  relaySessionBaseUrl: string;
}

type RelayWsMessageType = "text" | "binary" | "ping" | "pong" | "close";

interface RelaySignedWsEnvelope {
  version: number;
  seq: number;
  msg_type: RelayWsMessageType;
  payload_b64: string;
  signature_b64: string;
}

interface RelayWsSigningContext {
  signingSessionId: string;
  requestNonce: string;
  inboundSeq: number;
  outboundSeq: number;
  signingKey: CryptoKey;
  serverVerifyKey: CryptoKey;
}

export function isWorkspaceRoutePath(pathname: string): boolean {
  if (pathname === "/workspaces" || pathname.startsWith("/workspaces/")) {
    return true;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "projects" || !segments[1]) {
    return false;
  }

  const isIssueWorkspacePath =
    segments[2] === "issues" &&
    !!segments[3] &&
    segments[4] === "workspaces" &&
    !!segments[5];

  const isProjectWorkspaceCreatePath =
    segments[2] === "workspaces" && segments[3] === "create" && !!segments[4];

  return isIssueWorkspacePath || isProjectWorkspaceCreatePath;
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

  relaySessionBaseUrlCache.delete(hostId);
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
    relaySessionBaseUrlCache.delete(hostId);
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

function isAuthFailureStatus(status: number): boolean {
  return status === 401 || status === 403;
}

async function sendRelayHostRequest(
  context: RelayHostContext,
  params: {
    normalizedPath: string;
    method: string;
    body: BodyInit | undefined;
    bodyBytes: Uint8Array;
    contentType: string | null;
    requestInit: RequestInit;
  },
): Promise<Response> {
  const headers = await buildSignedHeaders(
    context.pairedHost,
    params.method,
    params.normalizedPath,
    params.bodyBytes,
    params.requestInit.headers,
  );

  if (params.contentType && !headers.has(CONTENT_TYPE_HEADER)) {
    headers.set(CONTENT_TYPE_HEADER, params.contentType);
  }

  return fetch(`${context.relaySessionBaseUrl}${params.normalizedPath}`, {
    ...params.requestInit,
    body: params.body,
    headers,
    credentials: "include",
  });
}

async function tryRefreshRelayHostSigningSession(
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
  const relayApiUrl = getRelayApiUrl();
  return establishRelaySessionBaseUrl(relayApiUrl, hostId, authCode.code);
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

  const cacheKey = pairedHost.host_id;
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

async function getServerVerifyKey(
  pairedHost: PairedRelayHost,
): Promise<CryptoKey> {
  const signingSessionId = pairedHost.signing_session_id;
  if (!signingSessionId) {
    throw new Error("Missing signing session for paired host.");
  }

  const cacheKey = pairedHost.host_id;
  const cachedKey = serverVerifyKeyCache.get(cacheKey);
  if (cachedKey) {
    return cachedKey;
  }

  const serverPublicKeyB64 = pairedHost.server_public_key_b64;
  if (!serverPublicKeyB64) {
    throw new Error("Missing server signing key for paired host.");
  }

  const importedKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(base64ToBytes(serverPublicKeyB64)),
    { name: "Ed25519" },
    false,
    ["verify"],
  );

  serverVerifyKeyCache.set(cacheKey, importedKey);
  return importedKey;
}

async function createRelayWsSigningContext(
  pairedHost: PairedRelayHost,
  requestSignature: RelaySignature,
): Promise<RelayWsSigningContext> {
  const [signingKey, serverVerifyKey] = await Promise.all([
    getSigningKey(pairedHost),
    getServerVerifyKey(pairedHost),
  ]);

  return {
    signingSessionId: requestSignature.signingSessionId,
    requestNonce: requestSignature.nonce,
    inboundSeq: 0,
    outboundSeq: 0,
    signingKey,
    serverVerifyKey,
  };
}

function createRelaySignedWebSocket(
  rawSocket: WebSocket,
  signingContext: RelayWsSigningContext,
): WebSocket {
  return new RelaySignedWebSocket(
    rawSocket,
    signingContext,
  ) as unknown as WebSocket;
}

class RelaySignedWebSocket extends EventTarget {
  onopen: WebSocket["onopen"] = null;
  onerror: WebSocket["onerror"] = null;
  onclose: WebSocket["onclose"] = null;
  onmessage: WebSocket["onmessage"] = null;

  private outboundQueue: Promise<void> = Promise.resolve();
  private inboundQueue: Promise<void> = Promise.resolve();
  private binaryTypeValue: BinaryType = "blob";

  constructor(
    private readonly rawSocket: WebSocket,
    private readonly signingContext: RelayWsSigningContext,
  ) {
    super();
    this.rawSocket.binaryType = "arraybuffer";
    this.attachRawSocketListeners();
  }

  get url(): string {
    return this.rawSocket.url;
  }

  get protocol(): string {
    return this.rawSocket.protocol;
  }

  get extensions(): string {
    return this.rawSocket.extensions;
  }

  get bufferedAmount(): number {
    return this.rawSocket.bufferedAmount;
  }

  get readyState(): number {
    return this.rawSocket.readyState;
  }

  get binaryType(): BinaryType {
    return this.binaryTypeValue;
  }

  set binaryType(value: BinaryType) {
    this.binaryTypeValue = value;
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.outboundQueue = this.outboundQueue
      .then(async () => {
        if (this.rawSocket.readyState !== WebSocket.OPEN) {
          return;
        }

        const { msgType, payload } = await normalizeOutboundWsPayload(data);
        const envelope = await buildRelayWsEnvelope(
          this.signingContext,
          msgType,
          payload,
        );
        this.rawSocket.send(JSON.stringify(envelope));
      })
      .catch((error) => {
        this.emitProtocolError(error);
      });
  }

  close(code?: number, reason?: string): void {
    this.rawSocket.close(code, reason);
  }

  private attachRawSocketListeners(): void {
    this.rawSocket.addEventListener("open", () => {
      this.emitOpen();
    });

    this.rawSocket.addEventListener("message", (event) => {
      this.inboundQueue = this.inboundQueue
        .then(async () => {
          const envelope = await decodeRelayWsEnvelope(
            this.signingContext,
            event.data,
          );
          await this.forwardDecodedFrame(envelope.msg_type, envelope.payload);
        })
        .catch((error) => {
          this.emitProtocolError(error);
        });
    });

    this.rawSocket.addEventListener("error", () => {
      this.emitError();
    });

    this.rawSocket.addEventListener("close", (event) => {
      this.emitClose(event.code, event.reason, event.wasClean);
    });
  }

  private async forwardDecodedFrame(
    msgType: RelayWsMessageType,
    payload: Uint8Array,
  ): Promise<void> {
    switch (msgType) {
      case "text":
        this.emitMessage(TEXT_DECODER.decode(payload));
        return;
      case "binary":
        this.emitMessage(await this.toBinaryMessageData(payload));
        return;
      case "close": {
        const closePayload = decodeClosePayload(payload);
        if (closePayload.code == null) {
          this.close();
          return;
        }

        try {
          this.close(closePayload.code, closePayload.reason);
        } catch {
          this.close();
        }
        return;
      }
      case "ping":
      case "pong":
        return;
    }
  }

  private async toBinaryMessageData(
    payload: Uint8Array,
  ): Promise<ArrayBuffer | Blob> {
    if (this.binaryTypeValue === "arraybuffer") {
      return toArrayBuffer(payload);
    }
    return new Blob([toArrayBuffer(payload)]);
  }

  private emitOpen(): void {
    const event = new Event("open");
    this.onopen?.call(this.asWebSocket(), event);
    this.dispatchEvent(event);
  }

  private emitError(): void {
    const event = new Event("error");
    this.onerror?.call(this.asWebSocket(), event);
    this.dispatchEvent(event);
  }

  private emitClose(code: number, reason: string, wasClean: boolean): void {
    const event = new CloseEvent("close", { code, reason, wasClean });
    this.onclose?.call(this.asWebSocket(), event);
    this.dispatchEvent(event);
  }

  private emitMessage(data: string | ArrayBuffer | Blob): void {
    const event = new MessageEvent("message", { data });
    this.onmessage?.call(this.asWebSocket(), event);
    this.dispatchEvent(event);
  }

  private emitProtocolError(error: unknown): void {
    console.error("Failed to process relay WebSocket frame:", error);
    this.emitError();
    if (
      this.rawSocket.readyState === WebSocket.OPEN ||
      this.rawSocket.readyState === WebSocket.CONNECTING
    ) {
      this.rawSocket.close(1002, "Invalid relay frame");
    }
  }

  private asWebSocket(): WebSocket {
    return this as unknown as WebSocket;
  }
}

async function normalizeOutboundWsPayload(
  data: string | ArrayBufferLike | Blob | ArrayBufferView,
): Promise<{ msgType: RelayWsMessageType; payload: Uint8Array }> {
  if (typeof data === "string") {
    return { msgType: "text", payload: TEXT_ENCODER.encode(data) };
  }

  if (data instanceof Blob) {
    return {
      msgType: "binary",
      payload: new Uint8Array(await data.arrayBuffer()),
    };
  }

  if (ArrayBuffer.isView(data)) {
    return {
      msgType: "binary",
      payload: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    };
  }

  if (data instanceof ArrayBuffer) {
    return { msgType: "binary", payload: new Uint8Array(data) };
  }

  throw new Error("Unsupported WebSocket payload type.");
}

async function decodeRelayWsEnvelope(
  signingContext: RelayWsSigningContext,
  rawData: unknown,
): Promise<RelaySignedWsEnvelope & { payload: Uint8Array }> {
  const rawFrame = await decodeWsFrameBytes(rawData);
  const parsedEnvelope = parseRelayWsEnvelope(rawFrame);

  if (parsedEnvelope.version !== WS_ENVELOPE_VERSION) {
    throw new Error("Unsupported relay WS envelope version.");
  }

  const expectedSeq = signingContext.inboundSeq + 1;
  if (parsedEnvelope.seq !== expectedSeq) {
    throw new Error(
      `Invalid relay WS sequence: expected ${expectedSeq}, got ${parsedEnvelope.seq}.`,
    );
  }

  const payload = base64ToBytes(parsedEnvelope.payload_b64);
  const signatureBytes = base64ToBytes(parsedEnvelope.signature_b64);
  const signingInput = await buildRelayWsSigningInput(
    signingContext.signingSessionId,
    signingContext.requestNonce,
    parsedEnvelope.seq,
    parsedEnvelope.msg_type,
    payload,
  );

  const isValid = await crypto.subtle.verify(
    "Ed25519",
    signingContext.serverVerifyKey,
    toArrayBuffer(signatureBytes),
    toArrayBuffer(TEXT_ENCODER.encode(signingInput)),
  );

  if (!isValid) {
    throw new Error("Invalid relay WS frame signature.");
  }

  signingContext.inboundSeq = parsedEnvelope.seq;
  return { ...parsedEnvelope, payload };
}

async function buildRelayWsEnvelope(
  signingContext: RelayWsSigningContext,
  msgType: RelayWsMessageType,
  payload: Uint8Array,
): Promise<RelaySignedWsEnvelope> {
  const nextSeq = signingContext.outboundSeq + 1;
  const signingInput = await buildRelayWsSigningInput(
    signingContext.signingSessionId,
    signingContext.requestNonce,
    nextSeq,
    msgType,
    payload,
  );

  const signature = await crypto.subtle.sign(
    "Ed25519",
    signingContext.signingKey,
    toArrayBuffer(TEXT_ENCODER.encode(signingInput)),
  );

  signingContext.outboundSeq = nextSeq;

  return {
    version: WS_ENVELOPE_VERSION,
    seq: nextSeq,
    msg_type: msgType,
    payload_b64: bytesToBase64(payload),
    signature_b64: bytesToBase64(new Uint8Array(signature)),
  };
}

async function buildRelayWsSigningInput(
  signingSessionId: string,
  requestNonce: string,
  seq: number,
  msgType: RelayWsMessageType,
  payload: Uint8Array,
): Promise<string> {
  const payloadHashB64 = await sha256Base64(payload);
  return [
    "v1",
    signingSessionId,
    requestNonce,
    String(seq),
    msgType,
    payloadHashB64,
  ].join("|");
}

async function decodeWsFrameBytes(rawData: unknown): Promise<Uint8Array> {
  if (typeof rawData === "string") {
    return TEXT_ENCODER.encode(rawData);
  }

  if (rawData instanceof Blob) {
    return new Uint8Array(await rawData.arrayBuffer());
  }

  if (ArrayBuffer.isView(rawData)) {
    return new Uint8Array(
      rawData.buffer,
      rawData.byteOffset,
      rawData.byteLength,
    );
  }

  if (rawData instanceof ArrayBuffer) {
    return new Uint8Array(rawData);
  }

  throw new Error("Unsupported relay WebSocket frame.");
}

function parseRelayWsEnvelope(rawFrame: Uint8Array): RelaySignedWsEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(TEXT_DECODER.decode(rawFrame));
  } catch {
    throw new Error("Invalid relay WS envelope JSON.");
  }

  if (typeof parsed !== "object" || parsed == null) {
    throw new Error("Invalid relay WS envelope.");
  }

  const envelope = parsed as Partial<RelaySignedWsEnvelope>;
  if (
    typeof envelope.version !== "number" ||
    typeof envelope.seq !== "number" ||
    !isRelayWsMessageType(envelope.msg_type) ||
    typeof envelope.payload_b64 !== "string" ||
    typeof envelope.signature_b64 !== "string"
  ) {
    throw new Error("Invalid relay WS envelope shape.");
  }

  return {
    version: envelope.version,
    seq: envelope.seq,
    msg_type: envelope.msg_type,
    payload_b64: envelope.payload_b64,
    signature_b64: envelope.signature_b64,
  };
}

function isRelayWsMessageType(value: unknown): value is RelayWsMessageType {
  return (
    value === "text" ||
    value === "binary" ||
    value === "ping" ||
    value === "pong" ||
    value === "close"
  );
}

function decodeClosePayload(payload: Uint8Array): {
  code?: number;
  reason?: string;
} {
  if (payload.length === 0) {
    return {};
  }

  if (payload.length < 2) {
    throw new Error("Invalid relay WS close payload.");
  }

  const code = (payload[0] << 8) | payload[1];
  const reason =
    payload.length > 2 ? TEXT_DECODER.decode(payload.slice(2)) : "";
  return { code, reason };
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

  const serializedBody = new Uint8Array(await probeRequest.arrayBuffer());
  return {
    // Use the exact serialized bytes for both signing and transport.
    body: serializedBody,
    bodyBytes: serializedBody,
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

function clearRelayHostCryptoCaches(hostId: string): void {
  signingKeyCache.delete(hostId);
  serverVerifyKeyCache.delete(hostId);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
