import type { PairedRelayHost } from "@/shared/lib/relayPairingStorage";

import {
  base64ToBytes,
  bytesToBase64,
  sha256Base64,
  TEXT_DECODER,
  TEXT_ENCODER,
  toArrayBuffer,
} from "@remote/shared/lib/relay/bytes";
import {
  getServerVerifyKey,
  getSigningKey,
} from "@remote/shared/lib/relay/keyCache";
import type {
  RelaySignature,
  RelaySignedWsEnvelope,
  RelayWsMessageType,
  RelayWsSigningContext,
} from "@remote/shared/lib/relay/types";

const WS_ENVELOPE_VERSION = 1;

export async function createRelayWsSigningContext(
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

export function createRelaySignedWebSocket(
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
