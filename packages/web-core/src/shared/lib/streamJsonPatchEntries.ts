// streamJsonPatchEntries.ts - WebSocket JSON patch streaming utility
import { produce } from 'immer';
import type { Operation } from 'rfc6902';
import { applyUpsertPatch } from '@/shared/lib/jsonPatch';
import { openLocalApiWebSocket } from '@/shared/lib/localApiTransport';

type PatchContainer<E = unknown> = { entries: E[] };

export interface StreamOptions<E = unknown> {
  initial?: PatchContainer<E>;
  /** called after each successful patch application */
  onEntries?: (entries: E[]) => void;
  onConnect?: () => void;
  onError?: (err: unknown) => void;
  /** called once when a "finished" event is received */
  onFinished?: (entries: E[]) => void;
}

interface StreamController<E = unknown> {
  /** Current entries array (immutable snapshot) */
  getEntries(): E[];
  /** Full { entries } snapshot */
  getSnapshot(): PatchContainer<E>;
  /** Best-effort connection state */
  isConnected(): boolean;
  /** Subscribe to updates; returns an unsubscribe function */
  onChange(cb: (entries: E[]) => void): () => void;
  /** Close the stream */
  close(): void;
}

/**
 * Connect to a WebSocket endpoint that emits JSON messages containing:
 *   {"JsonPatch": [{"op": "add", "path": "/entries/0", "value": {...}}, ...]}
 *   {"Finished": ""}
 *
 * Maintains an in-memory { entries: [] } snapshot and returns a controller.
 *
 * Messages are batched per animation frame and applied using immer for
 * structural sharing, avoiding a full deep clone on every message.
 */
export function streamJsonPatchEntries<E = unknown>(
  url: string,
  opts: StreamOptions<E> = {}
): StreamController<E> {
  const initialSnapshot: PatchContainer<E> = structuredClone(
    opts.initial ?? ({ entries: [] } as PatchContainer<E>)
  );
  let connected = false;
  let closed = false;
  let finished = false;
  let ws: WebSocket | null = null;
  let snapshot: PatchContainer<E> = structuredClone(initialSnapshot);

  const subscribers = new Set<(entries: E[]) => void>();
  if (opts.onEntries) subscribers.add(opts.onEntries);

  let pendingOps: Operation[] = [];
  let rafId: number | null = null;
  let retryTimer: number | null = null;
  let retryAttempt = 0;

  const notify = () => {
    for (const cb of subscribers) {
      try {
        cb(snapshot.entries);
      } catch {
        /* swallow subscriber errors */
      }
    }
  };

  const clearRetryTimer = () => {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const resetReplayState = () => {
    snapshot = structuredClone(initialSnapshot);
    pendingOps = [];
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const flush = () => {
    rafId = null;
    if (pendingOps.length === 0) return;

    const ops = dedupeOps(pendingOps);
    pendingOps = [];

    snapshot = produce(snapshot, (draft) => {
      applyUpsertPatch(draft, ops);
    });
    notify();
  };

  const handleMessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.JsonPatch) {
        const raw = msg.JsonPatch as Operation[];
        pendingOps.push(...raw);
        if (rafId === null) {
          rafId = requestAnimationFrame(flush);
        }
      }

      if (msg.finished !== undefined) {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        flush();
        finished = true;
        opts.onFinished?.(snapshot.entries);
        ws?.close();
      }
    } catch (err) {
      opts.onError?.(err);
    }
  };

  const scheduleReconnect = () => {
    if (closed || finished || retryTimer !== null) return;

    const delay = Math.min(8000, 1000 * Math.pow(2, retryAttempt));
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      retryAttempt += 1;
      resetReplayState();
      connect();
    }, delay);
  };

  const connect = () => {
    void (async () => {
      try {
        const opened = await openLocalApiWebSocket(url);

        if (closed || finished) {
          opened.close();
          return;
        }

        ws = opened;
        ws.addEventListener('open', () => {
          connected = true;
          retryAttempt = 0;
          clearRetryTimer();
          opts.onConnect?.();
        });

        ws.addEventListener('message', handleMessage);

        ws.addEventListener('error', (err) => {
          connected = false;
          opts.onError?.(err);
        });

        ws.addEventListener('close', () => {
          connected = false;
          ws = null;
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          if (!closed && !finished) {
            scheduleReconnect();
          }
        });
      } catch (error) {
        if (!closed && !finished) {
          opts.onError?.(error);
          scheduleReconnect();
        }
      }
    })();
  };

  connect();

  return {
    getEntries(): E[] {
      return snapshot.entries;
    },
    getSnapshot(): PatchContainer<E> {
      return snapshot;
    },
    isConnected(): boolean {
      return connected;
    },
    onChange(cb: (entries: E[]) => void): () => void {
      subscribers.add(cb);
      cb(snapshot.entries);
      return () => subscribers.delete(cb);
    },
    close(): void {
      closed = true;
      clearRetryTimer();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      ws?.close();
      subscribers.clear();
      connected = false;
    },
  };
}

function dedupeOps(ops: Operation[]): Operation[] {
  const lastIndexByPath = new Map<string, number>();
  ops.forEach((op, i) => lastIndexByPath.set(op.path, i));

  const keptIndices = [...lastIndexByPath.values()].sort((a, b) => a - b);
  return keptIndices.map((i) => ops[i]!);
}
