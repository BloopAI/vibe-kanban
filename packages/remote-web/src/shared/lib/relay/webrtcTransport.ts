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

const FRAME_VERSION = 1;

type FrameKind =
  | "ping"
  | "pong"
  | "api_request"
  | "api_response"
  | "ws_open"
  | "ws_opened"
  | "ws_send"
  | "ws_message"
  | "ws_close"
  | "ws_closed"
  | "error";

interface SignedFrame {
  version: number;
  session_id: string;
  request_nonce: string;
  seq: number;
  kind: FrameKind;
  payload_b64: string;
  signature_b64: string;
}

interface WeRtcTransportOptions {
  sessionId: string;
  requestNonce: string;
  dataChannel: RTCDataChannel;
  pairedHost: PairedRelayHost;
}

interface PendingApiRequest {
  resolve: (value: Response) => void;
  reject: (reason: unknown) => void;
}

interface VirtualSocketRecord {
  socket: RelayVirtualWebSocket;
}

export class RelayWebRtcTransport {
  private readonly sessionId: string;
  private readonly requestNonce: string;
  private readonly dataChannel: RTCDataChannel;
  private readonly pairedHost: PairedRelayHost;

  private readonly pendingApiRequests = new Map<string, PendingApiRequest>();
  private readonly virtualSockets = new Map<string, VirtualSocketRecord>();
  private readonly pendingPings = new Map<string, () => void>();

  private signingKeyPromise: Promise<CryptoKey>;
  private serverVerifyKeyPromise: Promise<CryptoKey>;

  private outboundSeq = 0;
  private inboundSeq = 0;
  private nextApiRequestId = 0;
  private nextSocketId = 0;

  constructor(options: WeRtcTransportOptions) {
    this.sessionId = options.sessionId;
    this.requestNonce = options.requestNonce;
    this.dataChannel = options.dataChannel;
    this.pairedHost = options.pairedHost;

    this.signingKeyPromise = getSigningKey(this.pairedHost);
    this.serverVerifyKeyPromise = getServerVerifyKey(this.pairedHost);

    this.dataChannel.addEventListener("message", (event) => {
      void this.handleInboundFrame(event.data);
    });
    this.dataChannel.addEventListener("close", () => {
      this.rejectAllPending(new Error("WebRTC transport closed"));
    });
    this.dataChannel.addEventListener("error", () => {
      this.rejectAllPending(new Error("WebRTC transport error"));
    });
  }

  async ping(timeoutMs = 5000): Promise<void> {
    const pingId = crypto.randomUUID();
    const pongPromise = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingPings.delete(pingId);
        reject(new Error("WebRTC ping timed out"));
      }, timeoutMs);

      this.pendingPings.set(pingId, () => {
        window.clearTimeout(timeout);
        resolve();
      });
    });

    await this.sendFrame("ping", { ping_id: pingId });
    await pongPromise;
  }

  async request(
    method: string,
    path: string,
    headers: Headers,
    bodyBytes: Uint8Array,
  ): Promise<Response> {
    const requestId = `req-${++this.nextApiRequestId}`;

    const headerPairs = Array.from(headers.entries());
    const payload: Record<string, unknown> = {
      request_id: requestId,
      method,
      path,
      headers: headerPairs,
    };
    if (bodyBytes.length > 0) {
      payload.body_b64 = bytesToBase64(bodyBytes);
    }

    const resultPromise = new Promise<Response>((resolve, reject) => {
      this.pendingApiRequests.set(requestId, { resolve, reject });
    });

    try {
      await this.sendFrame("api_request", payload);
      return await resultPromise;
    } catch (error) {
      this.pendingApiRequests.delete(requestId);
      throw error;
    }
  }

  async openVirtualWebSocket(path: string): Promise<RelayVirtualWebSocket> {
    const wsId = `ws-${++this.nextSocketId}`;
    const socket = new RelayVirtualWebSocket(wsId, path, (kind, payload) =>
      this.sendFrame(kind, payload),
    );

    this.virtualSockets.set(wsId, { socket });
    await this.sendFrame("ws_open", { ws_id: wsId, path });
    return socket;
  }

  private async sendFrame(kind: FrameKind, payload: unknown): Promise<void> {
    if (this.dataChannel.readyState !== "open") {
      throw new Error("WebRTC data channel is not open");
    }

    const seq = ++this.outboundSeq;
    const payloadBytes = TEXT_ENCODER.encode(JSON.stringify(payload));
    const payloadB64 = bytesToBase64(payloadBytes);

    const signature = await this.signFrame(seq, kind, payloadBytes);
    const frame: SignedFrame = {
      version: FRAME_VERSION,
      session_id: this.sessionId,
      request_nonce: this.requestNonce,
      seq,
      kind,
      payload_b64: payloadB64,
      signature_b64: signature,
    };

    this.dataChannel.send(JSON.stringify(frame));
  }

  private async handleInboundFrame(rawData: unknown): Promise<void> {
    const dataBytes = await decodeRawFrame(rawData);
    const frame = JSON.parse(TEXT_DECODER.decode(dataBytes)) as SignedFrame;

    if (frame.version !== FRAME_VERSION) {
      throw new Error("Unsupported WebRTC frame version");
    }
    if (frame.session_id !== this.sessionId) {
      throw new Error("WebRTC session id mismatch");
    }
    if (frame.request_nonce !== this.requestNonce) {
      throw new Error("WebRTC request nonce mismatch");
    }

    const expectedSeq = this.inboundSeq + 1;
    if (frame.seq !== expectedSeq) {
      throw new Error(
        `Invalid WebRTC sequence: expected ${expectedSeq}, got ${frame.seq}`,
      );
    }

    const payloadBytes = base64ToBytes(frame.payload_b64);
    const signatureValid = await this.verifyFrame(frame, payloadBytes);
    if (!signatureValid) {
      throw new Error("Invalid WebRTC frame signature");
    }

    this.inboundSeq = frame.seq;
    const payload = JSON.parse(TEXT_DECODER.decode(payloadBytes)) as Record<
      string,
      unknown
    >;

    switch (frame.kind) {
      case "pong": {
        const pingId = String(payload.ping_id ?? "");
        const resolver = this.pendingPings.get(pingId);
        if (resolver) {
          this.pendingPings.delete(pingId);
          resolver();
        }
        return;
      }
      case "api_response": {
        const requestId = String(payload.request_id ?? "");
        const pending = this.pendingApiRequests.get(requestId);
        if (!pending) return;
        this.pendingApiRequests.delete(requestId);

        const status = Number(payload.status ?? 500);
        const rawHeaderPairs = (payload.headers as unknown[] | undefined) ?? [];
        const headerPairs: Array<[string, string]> = rawHeaderPairs
          .map((entry) =>
            Array.isArray(entry) && entry.length === 2
              ? [String(entry[0]), String(entry[1])]
              : null,
          )
          .filter((entry): entry is [string, string] => entry !== null);
        const headers = new Headers(headerPairs);
        const bodyB64 = String(payload.body_b64 ?? "");
        const bodyBytes = bodyB64 ? base64ToBytes(bodyB64) : new Uint8Array();
        pending.resolve(
          new Response(toArrayBuffer(bodyBytes), { status, headers }),
        );
        return;
      }
      case "ws_opened": {
        const wsId = String(payload.ws_id ?? "");
        this.virtualSockets.get(wsId)?.socket.emitOpen();
        return;
      }
      case "ws_message": {
        const wsId = String(payload.ws_id ?? "");
        const msgType = String(payload.msg_type ?? "text");
        const messageB64 = String(payload.payload_b64 ?? "");
        const socket = this.virtualSockets.get(wsId)?.socket;
        if (!socket) return;

        const bytes = messageB64 ? base64ToBytes(messageB64) : new Uint8Array();
        if (msgType === "binary") {
          socket.emitMessage(toArrayBuffer(bytes));
        } else {
          socket.emitMessage(TEXT_DECODER.decode(bytes));
        }
        return;
      }
      case "ws_closed": {
        const wsId = String(payload.ws_id ?? "");
        const code = Number(payload.code ?? 1000);
        const reason = String(payload.reason ?? "");
        const socket = this.virtualSockets.get(wsId)?.socket;
        if (!socket) return;
        this.virtualSockets.delete(wsId);
        socket.emitClose(code, reason);
        return;
      }
      case "error": {
        const requestId = payload.request_id
          ? String(payload.request_id)
          : null;
        const wsId = payload.ws_id ? String(payload.ws_id) : null;
        const message = String(
          payload.message ?? "Unknown WebRTC transport error",
        );

        if (requestId) {
          const pending = this.pendingApiRequests.get(requestId);
          if (pending) {
            this.pendingApiRequests.delete(requestId);
            pending.reject(new Error(message));
          }
        }

        if (wsId) {
          const socket = this.virtualSockets.get(wsId)?.socket;
          if (socket) {
            this.virtualSockets.delete(wsId);
            socket.emitClose(1011, message);
          }
        }
        return;
      }
      default:
        return;
    }
  }

  private async signFrame(
    seq: number,
    kind: FrameKind,
    payloadBytes: Uint8Array,
  ): Promise<string> {
    const payloadHash = await sha256Base64(payloadBytes);
    const message = [
      "v1",
      "webrtc",
      this.sessionId,
      this.requestNonce,
      String(seq),
      kind,
      payloadHash,
    ].join("|");

    const signingKey = await this.signingKeyPromise;
    const signatureBytes = await crypto.subtle.sign(
      "Ed25519",
      signingKey,
      toArrayBuffer(TEXT_ENCODER.encode(message)),
    );
    return bytesToBase64(new Uint8Array(signatureBytes));
  }

  private async verifyFrame(
    frame: SignedFrame,
    payloadBytes: Uint8Array,
  ): Promise<boolean> {
    const payloadHash = await sha256Base64(payloadBytes);
    const message = [
      "v1",
      "webrtc",
      frame.session_id,
      frame.request_nonce,
      String(frame.seq),
      frame.kind,
      payloadHash,
    ].join("|");

    const verifyKey = await this.serverVerifyKeyPromise;
    return crypto.subtle.verify(
      "Ed25519",
      verifyKey,
      toArrayBuffer(base64ToBytes(frame.signature_b64)),
      toArrayBuffer(TEXT_ENCODER.encode(message)),
    );
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingApiRequests.values()) {
      pending.reject(error);
    }
    this.pendingApiRequests.clear();

    for (const socketRecord of this.virtualSockets.values()) {
      socketRecord.socket.emitClose(1011, error.message);
    }
    this.virtualSockets.clear();

    for (const resolve of this.pendingPings.values()) {
      resolve();
    }
    this.pendingPings.clear();
  }
}

class RelayVirtualWebSocket extends EventTarget {
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;

  private opened = false;
  private closed = false;
  private readyStateValue: number = WebSocket.CONNECTING;
  binaryType: BinaryType = "arraybuffer";

  get readyState(): number {
    return this.readyStateValue;
  }

  constructor(
    private readonly wsId: string,
    private readonly path: string,
    private readonly sendFrame: (
      kind: FrameKind,
      payload: unknown,
    ) => Promise<void>,
  ) {
    super();
  }

  send(data: string | ArrayBuffer | Uint8Array): void {
    if (!this.opened || this.closed) {
      throw new Error("Virtual WebSocket is not open");
    }

    let msgType: "text" | "binary" = "text";
    let payloadBytes: Uint8Array;

    if (typeof data === "string") {
      payloadBytes = TEXT_ENCODER.encode(data);
    } else if (data instanceof ArrayBuffer) {
      msgType = "binary";
      payloadBytes = new Uint8Array(data);
    } else {
      msgType = "binary";
      payloadBytes = data;
    }

    void this.sendFrame("ws_send", {
      ws_id: this.wsId,
      msg_type: msgType,
      payload_b64: bytesToBase64(payloadBytes),
    }).catch((error) => {
      this.emitError(error);
    });
  }

  close(code?: number, reason?: string): void {
    if (this.closed) return;
    this.readyStateValue = WebSocket.CLOSING;
    void this.sendFrame("ws_close", {
      ws_id: this.wsId,
      code,
      reason,
    }).catch(() => {
      // Ignore close propagation errors.
    });
    this.emitClose(code ?? 1000, reason ?? "");
  }

  emitOpen(): void {
    if (this.opened || this.closed) return;
    this.opened = true;
    this.readyStateValue = WebSocket.OPEN;
    const event = new Event("open");
    this.onopen?.(event);
    this.dispatchEvent(event);
  }

  emitMessage(data: string | ArrayBuffer): void {
    if (!this.opened || this.closed) return;
    const event = new MessageEvent("message", { data });
    this.onmessage?.(event);
    this.dispatchEvent(event);
  }

  emitClose(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.readyStateValue = WebSocket.CLOSED;
    const event = new CloseEvent("close", {
      code,
      reason,
      wasClean: true,
    });
    this.onclose?.(event);
    this.dispatchEvent(event);
  }

  private emitError(error: unknown): void {
    console.error(
      `Virtual WebSocket ${this.path} (${this.wsId}) transport error`,
      error,
    );
    const event = new Event("error");
    this.onerror?.(event);
    this.dispatchEvent(event);
  }
}

async function decodeRawFrame(rawData: unknown): Promise<Uint8Array> {
  if (typeof rawData === "string") {
    return TEXT_ENCODER.encode(rawData);
  }

  if (rawData instanceof ArrayBuffer) {
    return new Uint8Array(rawData);
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

  throw new Error("Unsupported WebRTC frame payload");
}
