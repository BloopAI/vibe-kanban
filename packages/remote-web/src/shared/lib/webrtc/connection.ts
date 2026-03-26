import type {
  DataChannelMessage,
  DataChannelResponse,
  WsOpened,
  WsFrame,
  WsClose,
  WsError,
  SdpOffer,
  SdpAnswer,
  ApiResponse,
} from "shared/types";
import { bytesToBase64 } from "@remote/shared/lib/relay/bytes";
import { requestRelayHostApi } from "@remote/shared/lib/relayHostApi";
import { Defragmenter, fragment } from "./chunking";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const HTTP_TIMEOUT_MS = 30_000;

export interface WebRtcConnectionCallbacks {
  onDisconnect: () => void;
}

interface PendingHttp {
  resolve: (resp: DataChannelResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface WsHandlers {
  onFrame: (frame: WsFrame) => void;
  onClose: (close: WsClose) => void;
  onError: (error: WsError) => void;
}

export class WebRtcConnection {
  private peerConnection: RTCPeerConnection;
  private dataChannel: RTCDataChannel;
  private defragmenter = new Defragmenter();
  private connected = false;

  private pendingHttp = new Map<string, PendingHttp>();
  private pendingWsOpen = new Map<
    string,
    {
      resolve: (opened: WsOpened) => void;
      reject: (err: Error) => void;
    }
  >();
  private activeWs = new Map<string, WsHandlers>();

  private constructor(
    pc: RTCPeerConnection,
    dc: RTCDataChannel,
    private callbacks: WebRtcConnectionCallbacks,
  ) {
    this.peerConnection = pc;
    this.dataChannel = dc;
    this.setupDataChannel();
    this.setupIceStateMonitoring();
  }

  static async connect(
    hostId: string,
    callbacks: WebRtcConnectionCallbacks,
  ): Promise<WebRtcConnection> {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const dc = pc.createDataChannel("relay", { ordered: true });

    const gatheringDone = new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const timeout = setTimeout(() => {
        done();
      }, 5000);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          if (event.candidate.type === "srflx") {
            clearTimeout(timeout);
            done();
          }
        } else {
          clearTimeout(timeout);
          done();
        }
      };
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await gatheringDone;

    const sessionId = crypto.randomUUID();
    const offerSdp = pc.localDescription!.sdp;

    const sdpOffer: SdpOffer = { sdp: offerSdp, session_id: sessionId };
    const response = await requestRelayHostApi(hostId, "/api/webrtc/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sdpOffer),
    });

    if (!response.ok) {
      pc.close();
      throw new Error(
        `WebRTC offer failed: ${response.status} ${response.statusText}`,
      );
    }

    const answerResponse: ApiResponse<SdpAnswer> = await response.json();
    if (!answerResponse.success || !answerResponse.data) {
      pc.close();
      throw new Error(
        answerResponse.message ?? "WebRTC offer response missing SDP answer",
      );
    }

    await pc.setRemoteDescription({
      type: "answer",
      sdp: answerResponse.data.sdp,
    });

    const conn = new WebRtcConnection(pc, dc, callbacks);
    await conn.waitForOpen();
    return conn;
  }

  get isConnected(): boolean {
    return this.connected && this.dataChannel.readyState === "open";
  }

  sendHttpRequest(
    method: string,
    path: string,
    headers: Record<string, string[]>,
    body?: Uint8Array,
  ): Promise<DataChannelResponse> {
    if (!this.isConnected) {
      return Promise.reject(new Error("WebRTC not connected"));
    }

    const id = crypto.randomUUID();
    const bodyB64 = body ? bytesToBase64(body) : undefined;

    const msg: DataChannelMessage = {
      type: "http_request",
      id,
      method,
      path,
      headers,
      body_b64: bodyB64,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingHttp.delete(id);
        reject(new Error("WebRTC HTTP request timed out"));
      }, HTTP_TIMEOUT_MS);

      this.pendingHttp.set(id, { resolve, reject, timer });
      this.sendMessage(msg);
    });
  }

  openWs(
    path: string,
    protocols: string | undefined,
    handlers: WsHandlers,
  ): Promise<{
    connId: string;
    selectedProtocol?: string;
    send: (frame: WsFrame) => void;
    close: (code?: number, reason?: string) => void;
  }> {
    if (!this.isConnected) {
      return Promise.reject(new Error("WebRTC not connected"));
    }

    const connId = crypto.randomUUID();
    this.activeWs.set(connId, handlers);

    const msg: DataChannelMessage = {
      type: "ws_open",
      conn_id: connId,
      path,
      protocols,
    };

    return new Promise((resolve, reject) => {
      this.pendingWsOpen.set(connId, {
        resolve: (opened) => {
          resolve({
            connId: opened.conn_id,
            selectedProtocol: opened.selected_protocol ?? undefined,
            send: (frame) => this.sendMessage({ type: "ws_frame", ...frame }),
            close: (code, reason) => {
              this.activeWs.delete(connId);
              this.sendMessage({
                type: "ws_close",
                conn_id: connId,
                code,
                reason,
              } as DataChannelMessage);
            },
          });
        },
        reject: (err) => {
          this.activeWs.delete(connId);
          reject(err);
        },
      });

      this.sendMessage(msg);
    });
  }

  close(): void {
    this.connected = false;
    try {
      this.dataChannel.close();
    } catch {
      // ignore
    }
    try {
      this.peerConnection.close();
    } catch {
      // ignore
    }
  }

  // --- Private ---

  private waitForOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.dataChannel.readyState === "open") {
        this.connected = true;
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        reject(new Error("Data channel open timed out"));
      }, 10_000);
      this.dataChannel.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          this.connected = true;
          resolve();
        },
        { once: true },
      );
      this.dataChannel.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new Error("Data channel error during open"));
        },
        { once: true },
      );
    });
  }

  private setupDataChannel(): void {
    this.dataChannel.binaryType = "arraybuffer";

    this.dataChannel.onmessage = (event: MessageEvent) => {
      const complete = this.defragmenter.process(event.data);
      if (complete) {
        this.handleMessage(complete);
      }
    };

    this.dataChannel.onclose = () => this.handleDisconnect();
    this.dataChannel.onerror = () => this.handleDisconnect();
  }

  private setupIceStateMonitoring(): void {
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection.iceConnectionState;
      if (
        state === "disconnected" ||
        state === "failed" ||
        state === "closed"
      ) {
        this.handleDisconnect();
      }
    };
  }

  private handleDisconnect(): void {
    if (!this.connected) return;
    this.connected = false;

    for (const [id, pending] of this.pendingHttp) {
      clearTimeout(pending.timer);
      pending.reject(new Error("WebRTC disconnected"));
      this.pendingHttp.delete(id);
    }

    for (const [connId, pending] of this.pendingWsOpen) {
      pending.reject(new Error("WebRTC disconnected"));
      this.pendingWsOpen.delete(connId);
    }

    for (const [connId, handlers] of this.activeWs) {
      handlers.onClose({
        conn_id: connId,
        code: 1006,
        reason: "WebRTC disconnected",
      });
      this.activeWs.delete(connId);
    }

    this.callbacks.onDisconnect();
  }

  private handleMessage(raw: Uint8Array): void {
    let msg: DataChannelMessage;
    try {
      msg = JSON.parse(TEXT_DECODER.decode(raw));
    } catch {
      return;
    }

    switch (msg.type) {
      case "http_response": {
        const pending = this.pendingHttp.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingHttp.delete(msg.id);
          pending.resolve(msg);
        }
        break;
      }
      case "ws_opened": {
        const pending = this.pendingWsOpen.get(msg.conn_id);
        if (pending) {
          this.pendingWsOpen.delete(msg.conn_id);
          pending.resolve(msg);
        }
        break;
      }
      case "ws_frame":
        this.activeWs.get(msg.conn_id)?.onFrame(msg);
        break;
      case "ws_close": {
        const handlers = this.activeWs.get(msg.conn_id);
        if (handlers) {
          this.activeWs.delete(msg.conn_id);
          handlers.onClose(msg);
        }
        break;
      }
      case "ws_error": {
        const pending = this.pendingWsOpen.get(msg.conn_id);
        if (pending) {
          this.pendingWsOpen.delete(msg.conn_id);
          pending.reject(new Error(msg.error));
        } else {
          const handlers = this.activeWs.get(msg.conn_id);
          if (handlers) {
            this.activeWs.delete(msg.conn_id);
            handlers.onError(msg);
          }
        }
        break;
      }
    }
  }

  private sendRaw(data: Uint8Array): void {
    const chunks = fragment(data);
    for (const chunk of chunks) {
      this.dataChannel.send(new Uint8Array(chunk) as Uint8Array<ArrayBuffer>);
    }
  }

  private sendMessage(msg: DataChannelMessage): void {
    this.sendRaw(TEXT_ENCODER.encode(JSON.stringify(msg)));
  }
}
