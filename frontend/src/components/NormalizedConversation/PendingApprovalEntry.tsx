import { useEffect, useMemo, useRef, useState } from 'react';
import { useExpandableStore } from '@/stores/useExpandableStore';
import type {
  ApprovalRequest,
  ApprovalStatus,
  NormalizedEntry,
  TaskAttempt,
} from 'shared/types';
import DisplayConversationEntry from './DisplayConversationEntry';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CircularProgress } from '@/components/ui/circular-progress';
import { approvalsApi } from '@/lib/api';
import { Check, X } from 'lucide-react';

interface PendingApprovalEntryProps {
  entry: NormalizedEntry;
  expansionKey: string;
  approval: ApprovalRequest;
  executionProcessId: string;
  taskAttempt: TaskAttempt;
}

function formatSeconds(s: number) {
  if (s <= 0) return '0s';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

const PendingApprovalEntry = ({
  entry,
  expansionKey,
  approval,
  executionProcessId,
  taskAttempt,
}: PendingApprovalEntryProps) => {
  const setExpandableKey = useExpandableStore((s) => s.setKey);
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const remaining = new Date(approval.timeout_at).getTime() - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  });
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    if (hasResponded) return;

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

  useEffect(() => () => abortRef.current?.abort(), []);

  const disabled = isResponding || hasResponded || timeLeft <= 0;

  const respond = async (approved: boolean, reason?: string) => {
    if (disabled) return;
    if (!executionProcessId) {
      setError('Missing executionProcessId');
      return;
    }

    setIsResponding(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    const status: ApprovalStatus = approved
      ? { status: 'approved' }
      : { status: 'denied', reason };

    try {
      await approvalsApi.respond(
        approval.id,
        {
          execution_process_id: executionProcessId,
          status,
        },
        controller.signal
      );

      setHasResponded(true);
    } catch (e: any) {
      console.error('Approval respond failed:', e);
      setError(e?.message || 'Failed to send response');
    } finally {
      setIsResponding(false);
    }
  };

  const handleApprove = () => respond(true);
  const handleDeny = () => respond(false, 'User denied this tool call');

  useEffect(() => {
    if (hasResponded) {
      setExpandableKey(`tool-entry:${expansionKey}`, false);
    }
  }, [hasResponded, expansionKey, setExpandableKey]);

  return (
    <div className="relative mt-3">
      <div className="absolute -top-3 left-4 rounded-full border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm">
        Awaiting approval
      </div>
      <div className="overflow-hidden rounded-lg border">
        <DisplayConversationEntry
          entry={entry}
          expansionKey={expansionKey}
          executionProcessId={executionProcessId}
          taskAttempt={taskAttempt}
          autoExpand={!hasResponded}
        />
        <div className="border-t bg-background px-2 py-1.5 text-xs sm:text-sm">
          <TooltipProvider>
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 pl-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleApprove}
                      variant="ghost"
                      className="h-8 w-8 rounded-full p-0"
                      disabled={disabled}
                      aria-label={
                        isResponding ? 'Submitting approval' : 'Approve'
                      }
                    >
                      <Check className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isResponding ? 'Submitting…' : 'Approve request'}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleDeny}
                      variant="ghost"
                      className="h-8 w-8 rounded-full p-0"
                      disabled={disabled}
                      aria-label={isResponding ? 'Submitting denial' : 'Deny'}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isResponding ? 'Submitting…' : 'Deny request'}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {!hasResponded && timeLeft > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center pr-8">
                      <CircularProgress percent={percent} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{formatSeconds(timeLeft)} remaining</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
          {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
        </div>
      </div>
    </div>
  );
};

export default PendingApprovalEntry;
