import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type ApprovalStatus =
  | { status: 'pending' }
  | { status: 'approved' }
  | { status: 'timed_out' }
  | { status: 'denied'; reason?: string };

export interface ApprovalRequest {
  id: string;
  tool_name: string;
  tool_input: unknown;
  session_id: string;
  created_at: string; // ISO
  timeout_at: string; // ISO
}

interface ApprovalLogEntryProps {
  approval: ApprovalRequest;
  executionProcessId: string; // UUID the backend expects for patching
  onRespond?: (approved: boolean, reason?: string) => void;
  onError?: (message: string) => void;
  className?: string;
}

function formatSeconds(s: number) {
  if (s <= 0) return '0s';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

export const ApprovalLogEntry: React.FC<ApprovalLogEntryProps> = ({
  approval,
  executionProcessId,
  onRespond,
  onError,
  className,
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const remaining = new Date(approval.timeout_at).getTime() - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  });
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Derived percentage for a tiny progress indicator
  const percent = useMemo(() => {
    const total = Math.max(
      1,
      Math.floor(
        (new Date(approval.timeout_at).getTime() -
          new Date(approval.created_at).getTime()) /
          1000
      )
    );
    return Math.max(0, Math.min(100, Math.round((timeLeft / total) * 100)));
  }, [approval.created_at, approval.timeout_at, timeLeft]);

  // Tick countdown every second
  useEffect(() => {
    if (hasResponded) return; // no need to tick after response

    const id = window.setInterval(() => {
      const remaining = new Date(approval.timeout_at).getTime() - Date.now();
      const next = Math.max(0, Math.floor(remaining / 1000));
      setTimeLeft(next);
      if (next <= 0) {
        window.clearInterval(id);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [approval.timeout_at, hasResponded]);

  // Ensure we abort any in-flight request when unmounting
  useEffect(() => () => abortRef.current?.abort(), []);

  const disabled = isResponding || hasResponded || timeLeft <= 0;

  const respond = async (approved: boolean, reason?: string) => {
    if (disabled) return;
    if (!executionProcessId) {
      onError?.('Missing executionProcessId');
      return;
    }

    setIsResponding(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const status: ApprovalStatus = approved
      ? { status: 'approved' }
      : { status: 'denied', reason };

    try {
      const res = await fetch(`/api/approvals/${approval.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          execution_process_id: executionProcessId,
          status,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        // Map common backend statuses to human messages
        let message = text || `${res.status} ${res.statusText}`;
        if (res.status === 404)
          message = 'Approval not found (maybe already expired).';
        if (res.status === 409)
          message = 'This approval was already completed.';
        throw new Error(message);
      }

      setHasResponded(true);
      onRespond?.(approved, reason);
    } catch (e: any) {
      console.error('Approval respond failed:', e);
      onError?.(e?.message || 'Failed to send response');
    } finally {
      setIsResponding(false);
    }
  };

  const handleApprove = () => respond(true);
  const handleDeny = () => respond(false, 'User denied via web interface');

  return (
    <div
      className={`border-l-4 border-l-orange-500 bg-orange-50 p-4 my-2 rounded-r ${className ?? ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="bg-orange-100">
            {approval.tool_name}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Approval Required
          </span>
        </div>

        <div className="flex flex-col items-end min-w-28">
          {!hasResponded && timeLeft > 0 ? (
            <span className="text-sm text-muted-foreground">
              {formatSeconds(timeLeft)} remaining
            </span>
          ) : hasResponded ? (
            <span className="text-sm text-muted-foreground">Response sent</span>
          ) : (
            <span className="text-sm text-red-600">Request timed out</span>
          )}

          {/* Simple progress bar without relying on shadcn Progress */}
          <div className="mt-1 h-1 w-24 bg-orange-200 rounded">
            <div
              className="h-1 bg-orange-500 rounded"
              style={{ width: `${percent}%`, transition: 'width 1s linear' }}
            />
          </div>
        </div>
      </div>

      <details
        className="mb-3"
        open={expanded}
        onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
      >
        <summary className="text-sm font-medium cursor-pointer select-none">
          Tool Arguments
        </summary>
        <pre className="bg-gray-100 p-2 rounded text-xs mt-1 overflow-auto max-h-40">
          {JSON.stringify(approval.tool_input, null, 2)}
        </pre>
      </details>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={disabled}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-60"
        >
          {isResponding ? 'Submitting…' : 'Approve'}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDeny}
          disabled={disabled}
        >
          {isResponding ? 'Submitting…' : 'Deny'}
        </Button>
      </div>

      {/* Hidden metadata for debugging (toggle by expanding args) */}
      <div className="sr-only" aria-hidden>
        <div>Approval ID: {approval.id}</div>
        <div>Exec Proc ID: {executionProcessId}</div>
      </div>
    </div>
  );
};

export default ApprovalLogEntry;
