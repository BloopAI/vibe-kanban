import type {
  ApiResponse,
  Workspace,
  WorkspaceSummary,
  WorkspaceSummaryResponse,
} from "shared/types";
import {
  type PairedRelayHost,
  listPairedRelayHosts,
} from "@/shared/lib/relayPairingStorage";
import { createRelaySession } from "@/shared/lib/remoteApi";
import {
  createRelaySessionAuthCode,
  establishRelaySessionBaseUrl,
} from "@/shared/lib/relayBackendApi";

const TEXT_ENCODER = new TextEncoder();
const CONTENT_TYPE_JSON = "application/json";

const signingKeyCache = new Map<string, CryptoKey>();

export interface RelayHostWorkspaceData {
  workspaces: Workspace[];
  summariesByWorkspaceId: Map<string, WorkspaceSummary>;
}

export async function loadRelayHostWorkspaces(
  hostId: string,
): Promise<RelayHostWorkspaceData> {
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

  const relaySessionBaseUrl = await createRelaySessionBaseUrl(hostId);

  const [workspaces, activeSummaries, archivedSummaries] = await Promise.all([
    fetchLocalApiJson<Workspace[]>(
      relaySessionBaseUrl,
      pairedHost,
      "/api/task-attempts",
      { method: "GET" },
      "Failed to load workspaces",
    ),
    fetchWorkspaceSummaryMap(relaySessionBaseUrl, pairedHost, false),
    fetchWorkspaceSummaryMap(relaySessionBaseUrl, pairedHost, true),
  ]);

  const summariesByWorkspaceId = new Map<string, WorkspaceSummary>();
  for (const [workspaceId, summary] of activeSummaries) {
    summariesByWorkspaceId.set(workspaceId, summary);
  }
  for (const [workspaceId, summary] of archivedSummaries) {
    summariesByWorkspaceId.set(workspaceId, summary);
  }

  return {
    workspaces,
    summariesByWorkspaceId,
  };
}

async function fetchWorkspaceSummaryMap(
  relaySessionBaseUrl: string,
  pairedHost: PairedRelayHost,
  archived: boolean,
): Promise<Map<string, WorkspaceSummary>> {
  const response = await fetchLocalApiJson<WorkspaceSummaryResponse>(
    relaySessionBaseUrl,
    pairedHost,
    "/api/task-attempts/summary",
    {
      method: "POST",
      body: JSON.stringify({ archived }),
    },
    "Failed to load workspace summaries",
  );

  const summaryMap = new Map<string, WorkspaceSummary>();
  for (const summary of response.summaries) {
    summaryMap.set(summary.workspace_id, summary);
  }

  return summaryMap;
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

async function fetchLocalApiJson<T>(
  relaySessionBaseUrl: string,
  pairedHost: PairedRelayHost,
  pathAndQuery: string,
  requestInit: RequestInit,
  fallbackError: string,
): Promise<T> {
  const normalizedPath = normalizePath(pathAndQuery);
  const bodyText = serializeBody(requestInit.body);
  const bodyBytes = TEXT_ENCODER.encode(bodyText);

  const headers = await buildSignedHeaders(
    pairedHost,
    requestInit.method ?? "GET",
    normalizedPath,
    bodyBytes,
    requestInit.headers,
  );

  if (bodyText.length > 0 && !headers.has("Content-Type")) {
    headers.set("Content-Type", CONTENT_TYPE_JSON);
  }

  const response = await fetch(`${relaySessionBaseUrl}${normalizedPath}`, {
    ...requestInit,
    body: bodyText.length > 0 ? bodyText : undefined,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(await extractResponseError(response, fallbackError));
  }

  const payload = (await response.json()) as ApiResponse<T>;
  if (!payload.success) {
    throw new Error(payload.message || fallbackError);
  }
  if (payload.data == null) {
    throw new Error(fallbackError);
  }

  return payload.data as T;
}

async function buildSignedHeaders(
  pairedHost: PairedRelayHost,
  method: string,
  pathAndQuery: string,
  bodyBytes: Uint8Array,
  incomingHeaders?: HeadersInit,
): Promise<Headers> {
  const signingSessionId = pairedHost.signing_session_id;
  if (!signingSessionId) {
    throw new Error(
      "This host pairing is missing signing metadata. Re-pair the host.",
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

  const headers = new Headers(incomingHeaders);
  headers.set("x-vk-sig-session", signingSessionId);
  headers.set("x-vk-sig-ts", String(timestamp));
  headers.set("x-vk-sig-nonce", nonce);
  headers.set("x-vk-sig-signature", bytesToBase64(new Uint8Array(signature)));
  return headers;
}

async function getSigningKey(pairedHost: PairedRelayHost): Promise<CryptoKey> {
  const signingSessionId = pairedHost.signing_session_id;
  if (!signingSessionId) {
    throw new Error("Missing signing session for paired host");
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

function serializeBody(body: BodyInit | null | undefined): string {
  if (body == null) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  throw new Error("Relay request body must be a string.");
}

function normalizePath(pathAndQuery: string): string {
  if (pathAndQuery.startsWith("/")) {
    return pathAndQuery;
  }
  return `/${pathAndQuery}`;
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

async function extractResponseError(
  response: Response,
  fallbackError: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as {
      message?: string;
      error?: string;
    };
    const message = payload.message || payload.error;
    if (message) {
      return `${message} (${response.status})`;
    }
  } catch {
    // Ignore parse errors and use fallback.
  }

  return `${fallbackError} (${response.status})`;
}
