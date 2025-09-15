// streamJsonPatchEntries.ts - Transport-agnostic JSON patch streaming utility
import { applyPatch, type Operation } from 'rfc6902';

type PatchContainer<E = unknown> = { entries: E[] };

export interface StreamOptions<E = unknown> {
  initial?: PatchContainer<E>;
  eventSourceInit?: EventSourceInit;
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
 * Create SSE-based stream controller
 */
function createSseStream<E = unknown>(
  url: string,
  opts: StreamOptions<E> = {}
): StreamController<E> {
  let connected = false;
  let snapshot: PatchContainer<E> = structuredClone(
    opts.initial ?? ({ entries: [] } as PatchContainer<E>)
  );

  const subscribers = new Set<(entries: E[]) => void>();
  if (opts.onEntries) subscribers.add(opts.onEntries);

  const es = new EventSource(url, opts.eventSourceInit);

  const notify = () => {
    for (const cb of subscribers) {
      try {
        cb(snapshot.entries);
      } catch {
        /* swallow subscriber errors */
      }
    }
  };

  const handlePatchEvent = (e: MessageEvent<string>) => {
    try {
      const raw = JSON.parse(e.data) as Operation[];
      const ops = dedupeOps(raw);

      // Apply to a working copy (applyPatch mutates)
      const next = structuredClone(snapshot);
      applyPatch(next as unknown as object, ops);

      snapshot = next;
      notify();
    } catch (err) {
      opts.onError?.(err);
    }
  };

  es.addEventListener('open', () => {
    connected = true;
    opts.onConnect?.();
  });

  // The server uses a named event: "json_patch"
  es.addEventListener('json_patch', handlePatchEvent);

  es.addEventListener('finished', () => {
    opts.onFinished?.(snapshot.entries);
    es.close();
  });

  es.addEventListener('error', (err) => {
    connected = false; // EventSource will auto-retry; this just reflects current state
    opts.onError?.(err);
  });

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
      // push current state immediately
      cb(snapshot.entries);
      return () => subscribers.delete(cb);
    },
    close(): void {
      es.close();
      subscribers.clear();
      connected = false;
    },
  };
}

/**
 * Create WebSocket-based stream controller
 */
function createWsStream<E = unknown>(
  url: string,
  opts: StreamOptions<E> = {}
): StreamController<E> {
  let connected = false;
  let snapshot: PatchContainer<E> = structuredClone(
    opts.initial ?? ({ entries: [] } as PatchContainer<E>)
  );

  const subscribers = new Set<(entries: E[]) => void>();
  if (opts.onEntries) subscribers.add(opts.onEntries);

  // Convert HTTP endpoint to WebSocket endpoint
  const wsUrl = url.replace(/^http/, 'ws');
  const ws = new WebSocket(wsUrl);

  const notify = () => {
    for (const cb of subscribers) {
      try {
        cb(snapshot.entries);
      } catch {
        /* swallow subscriber errors */
      }
    }
  };

  const handleMessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      
      // Handle JsonPatch messages (from LogMsg::to_ws_message)
      if (msg.JsonPatch) {
        const raw = msg.JsonPatch as Operation[];
        const ops = dedupeOps(raw);

        // Apply to a working copy (applyPatch mutates)
        const next = structuredClone(snapshot);
        applyPatch(next as unknown as object, ops);

        snapshot = next;
        notify();
      }
      
      // Handle Finished messages
      if (msg.Finished !== undefined) {
        opts.onFinished?.(snapshot.entries);
        ws.close();
      }
    } catch (err) {
      opts.onError?.(err);
    }
  };

  ws.addEventListener('open', () => {
    connected = true;
    opts.onConnect?.();
  });

  ws.addEventListener('message', handleMessage);

  ws.addEventListener('error', (err) => {
    connected = false;
    opts.onError?.(err);
  });

  ws.addEventListener('close', () => {
    connected = false;
  });

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
      // push current state immediately
      cb(snapshot.entries);
      return () => subscribers.delete(cb);
    },
    close(): void {
      ws.close();
      subscribers.clear();
      connected = false;
    },
  };
}

/**
 * Connect to an endpoint that emits JSON patches via SSE or WebSocket.
 * Auto-detects transport based on URL pattern (ends with /ws = WebSocket).
 * Maintains an in-memory { entries: [] } snapshot and returns a controller.
 */
export function streamJsonPatchEntries<E = unknown>(
  url: string,
  opts: StreamOptions<E> = {}
): StreamController<E> {
  if (url.endsWith('/ws')) {
    return createWsStream<E>(url, opts);
  }
  return createSseStream<E>(url, opts);
}

// Backward compatibility alias
export { streamJsonPatchEntries as streamSseJsonPatchEntries };

/**
 * Dedupe multiple ops that touch the same path within a single event.
 * Last write for a path wins, while preserving the overall left-to-right
 * order of the *kept* final operations.
 *
 * Example:
 *   add /entries/4, replace /entries/4  -> keep only the final replace
 */
function dedupeOps(ops: Operation[]): Operation[] {
  const lastIndexByPath = new Map<string, number>();
  ops.forEach((op, i) => lastIndexByPath.set(op.path, i));

  // Keep only the last op for each path, in ascending order of their final index
  const keptIndices = [...lastIndexByPath.values()].sort((a, b) => a - b);
  return keptIndices.map((i) => ops[i]!);
}
