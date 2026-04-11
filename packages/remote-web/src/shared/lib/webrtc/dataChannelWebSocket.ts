import type { WsFrame, WsClose, WsError } from "shared/types";
import {
  base64ToBytes,
  bytesToBase64,
  TEXT_ENCODER,
  toArrayBuffer,
} from "@remote/shared/lib/relay/bytes";
import type { WebRtcConnection } from "./connection";

export function createDataChannelWebSocket(
  conn: WebRtcConnection,
  path: string,
  protocols?: string,
): WebSocket {
  return new DataChannelWebSocket(
    conn,
    path,
    protocols,
  ) as unknown as WebSocket;
}

class DataChannelWebSocket extends EventTarget {
  onopen: WebSocket["onopen"] = null;
  onerror: WebSocket["onerror"] = null;
  onclose: WebSocket["onclose"] = null;
  onmessage: WebSocket["onmessage"] = null;

  private binaryTypeValue: BinaryType = "blob";
  private connId: string | null = null;
  private sendFn: ((frame: WsFrame) => void) | null = null;
  private closeFn: ((code?: number, reason?: string) => void) | null = null;
  private readyStateValue: number = WebSocket.CONNECTING;

  readonly url: string;
  readonly protocol: string = "";
  readonly extensions: string = "";

  constructor(
    private readonly conn: WebRtcConnection,
    path: string,
    protocols?: string,
  ) {
    super();
    this.url = path;
    this.negotiate(path, protocols);
  }

  get readyState(): number {
    return this.readyStateValue;
  }

  get bufferedAmount(): number {
    return 0;
  }

  get binaryType(): BinaryType {
    return this.binaryTypeValue;
  }

  set binaryType(value: BinaryType) {
    this.binaryTypeValue = value;
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (!this.sendFn || this.readyStateValue !== WebSocket.OPEN) {
      throw new DOMException("WebSocket is not open", "InvalidStateError");
    }

    if (typeof data === "string") {
      this.sendFn({
        conn_id: this.connId!,
        msg_type: "text",
        payload_b64: bytesToBase64(TEXT_ENCODER.encode(data)),
      });
      return;
    }

    if (data instanceof Blob) {
      data.arrayBuffer().then((buf) => {
        this.sendFn!({
          conn_id: this.connId!,
          msg_type: "binary",
          payload_b64: bytesToBase64(new Uint8Array(buf)),
        });
      });
      return;
    }

    let bytes: Uint8Array;
    if (ArrayBuffer.isView(data)) {
      bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else {
      bytes = new Uint8Array(data);
    }

    this.sendFn({
      conn_id: this.connId!,
      msg_type: "binary",
      payload_b64: bytesToBase64(bytes),
    });
  }

  close(code?: number, reason?: string): void {
    if (
      this.readyStateValue === WebSocket.CLOSED ||
      this.readyStateValue === WebSocket.CLOSING
    ) {
      return;
    }
    this.readyStateValue = WebSocket.CLOSING;
    this.closeFn?.(code, reason);
  }

  private negotiate(path: string, protocols?: string): void {
    this.conn
      .openWs(path, protocols, {
        onFrame: (frame: WsFrame) => this.handleFrame(frame),
        onClose: (close: WsClose) => this.handleClose(close),
        onError: (error: WsError) => this.handleError(error),
      })
      .then((ws) => {
        this.connId = ws.connId;
        this.sendFn = ws.send;
        this.closeFn = ws.close;
        if (ws.selectedProtocol) {
          (this as { protocol: string }).protocol = ws.selectedProtocol;
        }
        this.readyStateValue = WebSocket.OPEN;
        this.emitOpen();
      })
      .catch(() => {
        this.readyStateValue = WebSocket.CLOSED;
        this.emitError();
        this.emitClose(1006, "", false);
      });
  }

  private handleFrame(frame: WsFrame): void {
    switch (frame.msg_type) {
      case "text": {
        const bytes = frame.payload_b64
          ? base64ToBytes(frame.payload_b64)
          : new Uint8Array();
        this.emitMessage(new TextDecoder().decode(bytes));
        break;
      }
      case "binary": {
        const bytes = frame.payload_b64
          ? base64ToBytes(frame.payload_b64)
          : new Uint8Array();
        if (this.binaryTypeValue === "arraybuffer") {
          this.emitMessage(toArrayBuffer(bytes));
        } else {
          this.emitMessage(new Blob([toArrayBuffer(bytes)]));
        }
        break;
      }
      case "close": {
        const bytes = frame.payload_b64
          ? base64ToBytes(frame.payload_b64)
          : new Uint8Array();
        if (bytes.length >= 2) {
          const code = (bytes[0] << 8) | bytes[1];
          const reason =
            bytes.length > 2 ? new TextDecoder().decode(bytes.subarray(2)) : "";
          this.readyStateValue = WebSocket.CLOSED;
          this.emitClose(code, reason, true);
        } else {
          this.readyStateValue = WebSocket.CLOSED;
          this.emitClose(1005, "", true);
        }
        break;
      }
      case "ping":
      case "pong":
        break;
    }
  }

  private handleClose(close: WsClose): void {
    this.readyStateValue = WebSocket.CLOSED;
    this.emitClose(close.code ?? 1005, close.reason ?? "", true);
  }

  private handleError(_error: WsError): void {
    this.readyStateValue = WebSocket.CLOSED;
    this.emitError();
    this.emitClose(1006, "", false);
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

  private asWebSocket(): WebSocket {
    return this as unknown as WebSocket;
  }
}
