import {
  buildSignedHeaders,
  CONTENT_TYPE_HEADER,
} from "@remote/shared/lib/relay/signing";
import type { RelayHostContext } from "@remote/shared/lib/relay/types";

export function isAuthFailureStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export async function sendRelayHostRequest(
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
