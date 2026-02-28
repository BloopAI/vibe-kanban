import type { RelaySigningSessionRefreshPayload } from '@/shared/lib/relayBackendApi';

const TEXT_ENCODER = new TextEncoder();

export function buildRelaySigningSessionRefreshMessage(
  timestamp: number,
  nonce: string,
  clientId: string
): string {
  return `v1|refresh|${timestamp}|${nonce}|${clientId}`;
}

export async function buildRelaySigningSessionRefreshPayload(
  clientId: string,
  privateKeyJwk: JsonWebKey
): Promise<RelaySigningSessionRefreshPayload> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const message = buildRelaySigningSessionRefreshMessage(
    timestamp,
    nonce,
    clientId
  );
  const key = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'Ed25519' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'Ed25519',
    key,
    toArrayBuffer(TEXT_ENCODER.encode(message))
  );

  return {
    client_id: clientId,
    timestamp,
    nonce,
    signature_b64: bytesToBase64(new Uint8Array(signature)),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}
