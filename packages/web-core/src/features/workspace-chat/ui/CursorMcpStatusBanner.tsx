import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type CursorMcpPatch,
  type CursorMcpSessionSnapshot,
} from 'shared/types';
import { cursorMcpApi } from '@/shared/lib/api';

type Props = {
  sessionId: string;
};

/**
 * Top-of-chat banner for `CURSOR_MCP` sessions. Surfaces:
 * - whether the stdio bridge in Cursor IDE is currently connected,
 * - how many wait_for_user_input calls are queued,
 * - a one-click "Copy MCP config" button (with a manual-copy fallback for
 *   environments where the Clipboard API is blocked, e.g. non-secure
 *   contexts or restricted webviews).
 *
 * Subscribes to `/api/cursor-mcp/sessions/:id/stream/ws` for live patches.
 *
 * v1: deliberately scoped — no auto-edit of `~/.cursor/mcp.json`, no
 * prompt-rules injection. The user copies the snippet themselves (matches
 * the `manual_only` install policy).
 */
export function CursorMcpStatusBanner({ sessionId }: Props) {
  const [snapshot, setSnapshot] = useState<CursorMcpSessionSnapshot | null>(
    null
  );
  // Fatal load error (snapshot fetch failed). Replaces banner.
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Transient feedback for the copy button. Does NOT replace the banner.
  type CopyStatus = 'idle' | 'copied' | 'fallback' | 'error';
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [copyMessage, setCopyMessage] = useState<string>('');
  // Lazily-fetched, cached MCP json snippet (used both by the copy flow and
  // by the manual-copy textarea fallback).
  const [snippet, setSnippet] = useState<string | null>(null);
  const [showManualCopy, setShowManualCopy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resetCopyTimerRef = useRef<number | null>(null);

  // REST snapshot fetch on mount.
  useEffect(() => {
    let cancelled = false;
    cursorMcpApi
      .getState(sessionId)
      .then((s) => {
        if (!cancelled) setSnapshot(s);
      })
      .catch((err) => {
        if (!cancelled) setFetchError(err?.message ?? 'failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Live WS subscription for patches.
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/api/cursor-mcp/sessions/stream/ws?session_id=${sessionId}`;
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      try {
        const patch = JSON.parse(ev.data) as CursorMcpPatch;
        applyPatch(patch);
      } catch (e) {
        console.warn('[cursor-mcp] failed to parse patch', e);
      }
    };
    ws.onerror = () => {
      // ignore — the next reconnect attempt will retry
    };
    return () => {
      ws.close();
    };

    function applyPatch(patch: CursorMcpPatch) {
      setSnapshot((prev) => {
        if (!prev) return prev;
        switch (patch.type) {
          case 'snapshot':
            return patch.payload;
          case 'message_appended':
            return { ...prev, messages: [...prev.messages, patch.payload] };
          case 'wait_enqueued':
            return {
              ...prev,
              pending_waits: [...prev.pending_waits, patch.payload],
            };
          case 'wait_resolved':
            return {
              ...prev,
              pending_waits: prev.pending_waits.filter(
                (w) => w.request_id !== patch.payload.request_id
              ),
            };
          case 'bridge_connected':
            return { ...prev, bridge_connected: patch.payload };
          default:
            return prev;
        }
      });
    }
  }, [sessionId]);

  // Reset transient copy feedback after a short delay.
  const flashCopyStatus = useCallback(
    (status: CopyStatus, message: string, ms = 2500) => {
      setCopyStatus(status);
      setCopyMessage(message);
      if (resetCopyTimerRef.current != null) {
        window.clearTimeout(resetCopyTimerRef.current);
      }
      resetCopyTimerRef.current = window.setTimeout(() => {
        setCopyStatus('idle');
        setCopyMessage('');
        resetCopyTimerRef.current = null;
      }, ms);
    },
    []
  );

  // Cleanup pending timer on unmount.
  useEffect(() => {
    return () => {
      if (resetCopyTimerRef.current != null) {
        window.clearTimeout(resetCopyTimerRef.current);
      }
    };
  }, []);

  // Best-effort copy with multiple fallbacks. Returns true if any succeeded.
  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    // Modern Clipboard API. Requires a secure context (https / localhost),
    // user permission, and a non-restricted webview.
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('[cursor-mcp] navigator.clipboard.writeText failed', err);
      }
    }

    // Legacy fallback: temporary textarea + execCommand('copy'). Works in
    // most browsers and many restricted webviews where the modern API does
    // not. Deprecated but still very widely supported.
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch (err) {
      console.warn('[cursor-mcp] execCommand copy fallback failed', err);
      return false;
    }
  }, []);

  const handleCopy = useCallback(async () => {
    let text = snippet;
    if (!text) {
      try {
        const cfg = await cursorMcpApi.getLaunchConfig(sessionId);
        text = cfg.mcp_json_snippet;
        setSnippet(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        flashCopyStatus('error', `Failed to load MCP config: ${msg}`, 4000);
        return;
      }
    }

    const ok = await copyToClipboard(text);
    if (ok) {
      flashCopyStatus('copied', 'Copied to clipboard');
    } else {
      // Reveal the manual-copy textarea so the user can still get the JSON.
      setShowManualCopy(true);
      flashCopyStatus(
        'fallback',
        'Clipboard blocked — select & copy manually below',
        4000
      );
      // Pre-select the text in the next paint so Cmd/Ctrl+C just works.
      window.requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.select();
        }
      });
    }
  }, [snippet, sessionId, copyToClipboard, flashCopyStatus]);

  const handleToggleManualCopy = useCallback(async () => {
    if (!showManualCopy && !snippet) {
      try {
        const cfg = await cursorMcpApi.getLaunchConfig(sessionId);
        setSnippet(cfg.mcp_json_snippet);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        flashCopyStatus('error', `Failed to load MCP config: ${msg}`, 4000);
        return;
      }
    }
    setShowManualCopy((v) => !v);
  }, [showManualCopy, snippet, sessionId, flashCopyStatus]);

  if (fetchError) {
    return (
      <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
        Cursor MCP banner error: {fetchError}
      </div>
    );
  }

  const connected = snapshot?.bridge_connected ?? false;
  const queueLen = snapshot?.pending_waits.length ?? 0;

  const buttonLabel =
    copyStatus === 'copied'
      ? 'Copied!'
      : copyStatus === 'fallback'
        ? 'See below ↓'
        : 'Copy MCP config';
  const buttonClass =
    copyStatus === 'copied'
      ? 'rounded border border-green-500 bg-green-50 px-2 py-0.5 font-medium text-green-800'
      : copyStatus === 'fallback' || copyStatus === 'error'
        ? 'rounded border border-red-400 bg-white px-2 py-0.5 font-medium text-red-700 hover:bg-red-50'
        : 'rounded border border-amber-400 bg-white px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-100';

  return (
    <div className="space-y-1 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected ? 'bg-green-500' : 'bg-gray-400'
            }`}
            aria-hidden
          />
          <strong>Cursor MCP</strong>
          <span>
            {connected
              ? `bridge connected${queueLen > 0 ? ` · ${queueLen} waiting` : ''}`
              : 'waiting for Cursor IDE to connect'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className={buttonClass}
          >
            {buttonLabel}
          </button>
          <button
            type="button"
            onClick={handleToggleManualCopy}
            className="rounded border border-amber-400 bg-white px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-100"
            title="Show the MCP JSON to copy by hand"
          >
            {showManualCopy ? 'Hide' : 'Show JSON'}
          </button>
        </div>
      </div>

      {copyMessage && copyStatus !== 'copied' && (
        <div
          className={`text-[11px] leading-snug ${
            copyStatus === 'error' || copyStatus === 'fallback'
              ? 'text-red-700'
              : 'opacity-80'
          }`}
        >
          {copyMessage}
        </div>
      )}

      {!connected && !showManualCopy && (
        <div className="text-[11px] leading-snug opacity-80">
          Click <em>Copy MCP config</em>, then paste the JSON under{' '}
          <code>mcpServers</code> in <code>~/.cursor/mcp.json</code>. Refresh
          Cursor's MCP list and start a Composer chat — its{' '}
          <code>wait_for_user_input</code> tool calls will land here.
        </div>
      )}

      {showManualCopy && (
        <div className="space-y-1">
          <div className="text-[11px] leading-snug opacity-80">
            Select all (
            <kbd className="rounded border border-amber-400 bg-white px-1">
              {navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'}
            </kbd>
            +<kbd className="rounded border border-amber-400 bg-white px-1">A</kbd>
            ) and copy (
            <kbd className="rounded border border-amber-400 bg-white px-1">
              {navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'}
            </kbd>
            +<kbd className="rounded border border-amber-400 bg-white px-1">C</kbd>
            ), then paste under <code>mcpServers</code> in{' '}
            <code>~/.cursor/mcp.json</code>.
          </div>
          <textarea
            ref={textareaRef}
            readOnly
            value={snippet ?? '// loading…'}
            spellCheck={false}
            className="w-full rounded border border-amber-300 bg-white p-2 font-mono text-[11px] text-amber-900"
            rows={Math.min(12, Math.max(4, (snippet?.split('\n').length ?? 4)))}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}
