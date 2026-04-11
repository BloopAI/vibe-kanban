import { WebRtcConnection } from "./connection";

const FAILED_RETRY_COOLDOWN_MS = 5 * 60 * 1000;

type HostEntry =
  | { state: "connecting" }
  | { state: "connected"; connection: WebRtcConnection }
  | { state: "failed"; failedAt: number };

const hosts = new Map<string, HostEntry>();

export function getWebRtcConnection(hostId: string): WebRtcConnection | null {
  const entry = hosts.get(hostId);

  if (entry?.state === "connected") {
    if (entry.connection.isConnected) {
      return entry.connection;
    }
    hosts.delete(hostId);
  }

  if (entry?.state === "connecting") {
    return null;
  }

  if (
    entry?.state === "failed" &&
    Date.now() - entry.failedAt < FAILED_RETRY_COOLDOWN_MS
  ) {
    return null;
  }

  startConnect(hostId);
  return null;
}

export function closeWebRtcConnection(hostId: string): void {
  const entry = hosts.get(hostId);
  if (entry?.state === "connected") {
    entry.connection.close();
  }
  hosts.delete(hostId);
}

function startConnect(hostId: string): void {
  hosts.set(hostId, { state: "connecting" });

  WebRtcConnection.connect(hostId, {
    onDisconnect: () => {
      hosts.delete(hostId);
    },
  })
    .then((connection) => {
      hosts.set(hostId, { state: "connected", connection });
    })
    .catch((err) => {
      console.warn("[webrtc] connection failed for host", hostId, err);
      hosts.set(hostId, { state: "failed", failedAt: Date.now() });
    });
}
