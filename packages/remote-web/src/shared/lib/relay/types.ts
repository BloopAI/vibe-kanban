import type { PairedRelayHost } from "@/shared/lib/relayPairingStorage";

export interface RelaySignature {
  signingSessionId: string;
  timestamp: number;
  nonce: string;
  signature: string;
}

export interface RelayHostContext {
  pairedHost: PairedRelayHost;
  relaySessionBaseUrl: string;
}

export type RelayWsMessageType = "text" | "binary" | "ping" | "pong" | "close";

export interface RelaySignedWsEnvelope {
  version: number;
  seq: number;
  msg_type: RelayWsMessageType;
  payload_b64: string;
  signature_b64: string;
}

export interface RelayWsSigningContext {
  signingSessionId: string;
  requestNonce: string;
  inboundSeq: number;
  outboundSeq: number;
  signingKey: CryptoKey;
  serverVerifyKey: CryptoKey;
}

export interface NormalizedRelayRequestBody {
  body: BodyInit | undefined;
  bodyBytes: Uint8Array;
  contentType: string | null;
}
