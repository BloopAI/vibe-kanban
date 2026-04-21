import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type InboxLobbyItem } from 'shared/types';
import { cursorMcpApi } from '@/shared/lib/api';
import { useCursorMcpInboxStream } from '@/shared/hooks/useCursorMcpInboxStream';
import { copyToClipboard } from '@/shared/lib/clipboard';

// ===========================================================================
// Inbox lobby picker (drop-in replacement for the model selector slot)
// ===========================================================================

type LobbyPickerProps = {
  /** Called when the user picks a lobby conversation. The Create Workspace
   * page uses this as the trigger to create a workspace bound to the
   * picked `bridge_session_id`. */
  onPick: (item: InboxLobbyItem) => void;
};

/**
 * Compact dropdown listing all unadopted Cursor MCP conversations.
 * Slots into the `modelSelector` position when the user picks
 * `Cursor Mcp` as the executor on the Create Workspace page.
 *
 * Live (no polling) — backed by [`useCursorMcpInboxStream`].
 */
export function CursorMcpLobbyPicker({ onPick }: LobbyPickerProps) {
  const { t } = useTranslation('tasks');
  const { lobby, bridges, isLoading } = useCursorMcpInboxStream();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(ev.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label =
    lobby.length === 0
      ? bridges.length > 0
        ? t('cursorMcpLobby.buttonNoChatsConnected')
        : t('cursorMcpLobby.buttonNoChatsNoBridges')
      : t('cursorMcpLobby.buttonWithChats', { count: lobby.length });

  return (
    <div ref={wrapperRef} className="relative inline-block text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded border border-medium bg-primary px-2 py-1 text-mid hover:bg-secondary"
        title={t('cursorMcpLobby.pickTooltip')}
      >
        <span
          aria-hidden
          className={`inline-block h-2 w-2 rounded-full ${
            bridges.length > 0 ? 'bg-green-500' : 'bg-gray-400'
          }`}
        />
        <span>{label}</span>
        <span className="opacity-60">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-96 max-w-[90vw] rounded border border-medium bg-primary p-1.5 shadow-lg">
          <div className="px-2 py-1 text-[11px] font-medium text-high">
            {t('cursorMcpLobby.panelTitle')}
          </div>
          <div className="px-2 pb-1 text-[10px] leading-snug text-mid opacity-80">
            {t('cursorMcpLobby.panelHint')}
          </div>
          {isLoading ? (
            <div className="px-2 py-2 text-xs text-mid">
              {t('cursorMcpLobby.loading')}
            </div>
          ) : lobby.length === 0 ? (
            <div className="px-2 py-2 text-xs text-mid leading-snug">
              {bridges.length === 0
                ? t('cursorMcpLobby.emptyNoBridges')
                : t('cursorMcpLobby.emptyNoChats')}
            </div>
          ) : (
            <ul className="m-0 max-h-72 overflow-y-auto pl-0">
              {lobby.map((item) => (
                <li key={item.bridge_session_id} className="list-none">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onPick(item);
                    }}
                    className="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-secondary"
                  >
                    <div className="flex items-center gap-2 truncate text-[11px] text-high">
                      <code className="rounded bg-secondary px-1.5 py-0.5">
                        {item.bridge_session_id}
                      </code>
                      {item.title && (
                        <span className="truncate">{item.title}</span>
                      )}
                      {item.pending_count > 0 && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">
                          {t('cursorMcpLobby.pendingWaits', {
                            count: item.pending_count,
                          })}
                        </span>
                      )}
                    </div>
                    {item.first_message && (
                      <div className="line-clamp-2 text-[11px] text-mid opacity-80">
                        {item.first_message}
                      </div>
                    )}
                    {item.bridge_label && (
                      <div className="text-[10px] opacity-60">
                        from {item.bridge_label}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Connect hint (shown above the input on the Create Workspace page when no
// bridges are connected)
// ===========================================================================

/**
 * Setup banner shown on the Create Workspace page when the user picks
 * `Cursor Mcp` as the executor.
 *
 * Always visible — even after a bridge connects the user may want to
 * copy the config again (new machine, fresh Cursor install, or the
 * currently-connected bridge is a stale v3 entry they haven't migrated
 * yet). When `bridges.length > 0` we collapse to a one-liner with the
 * Copy / Show JSON buttons still accessible.
 */
export function CursorMcpConnectHint() {
  const { bridges } = useCursorMcpInboxStream();
  type CopyStatus = 'idle' | 'copied' | 'fallback' | 'error';
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [copyMessage, setCopyMessage] = useState<string>('');
  const [snippet, setSnippet] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [launchInfo, setLaunchInfo] = useState<{
    binaryPath: string | null;
    binaryExists: boolean;
    binarySource: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    },
    []
  );

  const flash = useCallback(
    (status: CopyStatus, message: string, ms = 2500) => {
      setCopyStatus(status);
      setCopyMessage(message);
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => {
        setCopyStatus('idle');
        setCopyMessage('');
        resetTimer.current = null;
      }, ms);
    },
    []
  );

  // copyToClipboard moved to @/shared/lib/clipboard

  const ensureSnippet = useCallback(async (): Promise<string | null> => {
    if (snippet) return snippet;
    try {
      const cfg = await cursorMcpApi.getLaunchConfig();
      setSnippet(cfg.mcp_json_snippet);
      setLaunchInfo({
        binaryPath: cfg.binary_path,
        binaryExists: cfg.binary_exists,
        binarySource: cfg.binary_source,
      });
      return cfg.mcp_json_snippet;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      flash('error', `Failed to load MCP config: ${msg}`, 4000);
      return null;
    }
  }, [snippet, flash]);

  const handleCopy = useCallback(async () => {
    const text = await ensureSnippet();
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      flash('copied', 'Copied to clipboard');
    } else {
      setShowManual(true);
      flash(
        'fallback',
        'Clipboard blocked — select and copy manually below',
        4000
      );
      window.requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.select();
        }
      });
    }
  }, [ensureSnippet, flash]);

  const handleToggleManual = useCallback(async () => {
    if (!showManual) {
      const text = await ensureSnippet();
      if (text == null) return;
    }
    setShowManual((v) => !v);
  }, [showManual, ensureSnippet]);

  const isConnected = bridges.length > 0;

  const buttonClass =
    copyStatus === 'copied'
      ? 'rounded border border-green-500 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800'
      : copyStatus === 'fallback' || copyStatus === 'error'
        ? 'rounded border border-red-400 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50'
        : 'rounded border border-amber-400 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100';

  return (
    <div
      className={`space-y-1.5 rounded border px-3 py-2 text-xs ${
        isConnected
          ? 'border-green-300 bg-green-50 text-green-900'
          : 'border-amber-300 bg-amber-50 text-amber-900'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-amber-500'
            }`}
          />
          <strong>
            {isConnected
              ? `Cursor MCP connected · ${bridges.length} bridge${
                  bridges.length === 1 ? '' : 's'
                }`
              : 'Cursor MCP — connect once, use anywhere'}
          </strong>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleCopy} className={buttonClass}>
            {copyStatus === 'copied'
              ? 'Copied!'
              : copyStatus === 'fallback'
                ? 'See below ↓'
                : 'Copy MCP config'}
          </button>
          <button
            type="button"
            onClick={handleToggleManual}
            className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
              isConnected
                ? 'border-green-400 bg-white text-green-900 hover:bg-green-100'
                : 'border-amber-400 bg-white text-amber-900 hover:bg-amber-100'
            }`}
            title="Reveal the MCP JSON to copy by hand"
          >
            {showManual ? 'Hide JSON' : 'Show JSON'}
          </button>
        </div>
      </div>

      {copyMessage && (
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

      {!isConnected && (
        <div className="text-[11px] leading-snug opacity-90">
          Drop the snippet under <code>mcpServers</code> in{' '}
          <code>~/.cursor/mcp.json</code> ONCE — no per-workspace setup. Refresh
          Cursor's MCP list, then start any Composer chat. The first call to{' '}
          <code>wait_for_user_input</code> shows up below as a lobby
          conversation; pick it, fill in repos, and 创建 to bind it to a
          vibe-kanban workspace.
        </div>
      )}

      {isConnected && !showManual && (
        <div className="text-[11px] leading-snug opacity-80">
          {bridges.some((b) => (b.label ?? '').length > 0)
            ? `From: ${bridges
                .map((b) => b.label ?? '?')
                .slice(0, 3)
                .join(', ')}${bridges.length > 3 ? '…' : ''}`
            : 'Bridge registered. Pick a Cursor MCP conversation from the dropdown below once your Composer chat calls wait_for_user_input.'}
        </div>
      )}

      {launchInfo && !launchInfo.binaryExists && (
        <div className="rounded border border-orange-300 bg-orange-50 px-2 py-1.5 text-[11px] leading-snug text-orange-900">
          <strong>vibe-kanban-mcp binary not found at</strong>{' '}
          <code className="break-all">
            {launchInfo.binaryPath ?? '(unknown)'}
          </code>{' '}
          (resolved via <code>{launchInfo.binarySource}</code>). The snippet
          above will fail in Cursor until you build it (
          <code>cargo build --release -p mcp --bin vibe-kanban-mcp</code>) or
          point <code>VK_MCP_BINARY</code> at an existing binary.
        </div>
      )}

      {showManual && (
        <div className="space-y-1">
          <div className="text-[11px] leading-snug opacity-80">
            Select all (
            <kbd className="rounded border border-amber-400 bg-white px-1">
              {navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'}
            </kbd>
            +
            <kbd className="rounded border border-amber-400 bg-white px-1">
              A
            </kbd>
            ) and copy.
          </div>
          <textarea
            ref={textareaRef}
            readOnly
            value={snippet ?? '// loading…'}
            spellCheck={false}
            className="w-full rounded border border-amber-300 bg-white p-2 font-mono text-[11px] text-amber-900"
            rows={Math.min(12, Math.max(4, snippet?.split('\n').length ?? 4))}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}
