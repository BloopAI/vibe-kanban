import { useCursorMcpInboxStream } from '@/shared/hooks/useCursorMcpInboxStream';
import { useCursorMcpSession } from '@/shared/hooks/useCursorMcpSession';

type Props = {
  sessionId: string;
};

export function CursorMcpStatusBanner({ sessionId }: Props) {
  const inbox = useCursorMcpInboxStream();
  const { snapshot, pendingCount, fetchError } = useCursorMcpSession(sessionId);

  if (fetchError) {
    return (
      <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
        Cursor MCP banner error: {fetchError}
      </div>
    );
  }

  const bridgeId = snapshot?.bridge_session_id ?? null;
  const bridgeCount = inbox.bridges.length;
  const hasPending = pendingCount > 0;
  const connected = bridgeCount > 0 || hasPending;

  // When a wait is pending, the banner becomes the call-to-action
  // ("→ reply below"). The amber → green flip plus the pulsing dot
  // mirrors how the rest of the app announces "you have to act".
  const containerClass = hasPending
    ? 'space-y-1 rounded border border-amber-400 bg-amber-100 px-3 py-2 text-xs text-amber-900 shadow-sm'
    : 'space-y-1 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900';

  const dotClass = hasPending
    ? 'bg-amber-500 animate-pulse'
    : connected
      ? 'bg-green-500'
      : 'bg-gray-400';

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${dotClass}`}
          aria-hidden
        />
        <strong>Cursor MCP</strong>
        {bridgeId ? (
          <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px]">
            {bridgeId}
          </code>
        ) : (
          <span className="opacity-70">no bridge id yet</span>
        )}
        <span className="opacity-80">
          {hasPending
            ? `${pendingCount} waiting for your reply — type below ↓`
            : bridgeCount > 0
              ? `${bridgeCount} bridge${bridgeCount === 1 ? '' : 's'} connected`
              : bridgeId
                ? 'bridge offline'
                : 'waiting for first wait_for_user_input call'}
        </span>
      </div>

      {!bridgeId && (
        <div className="text-[11px] leading-snug opacity-80">
          This session will attach once Cursor calls{' '}
          <code>wait_for_user_input</code> from the configured global MCP
          bridge.
        </div>
      )}
    </div>
  );
}
