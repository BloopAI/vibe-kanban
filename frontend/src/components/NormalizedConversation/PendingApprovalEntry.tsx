import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApprovalStatus, ToolStatus } from 'shared/types';
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
import { Textarea } from '@/components/ui/textarea';

const DEFAULT_DENIAL_REASON = 'User denied this tool use request.';

interface PendingApprovalEntryProps {
  pendingStatus: Extract<ToolStatus, { status: 'pending_approval' }>;
  executionProcessId?: string;
  children: ReactNode;
}

function formatSeconds(s: number) {
  if (s <= 0) return '0s';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

const PendingApprovalEntry = ({
  pendingStatus,
  executionProcessId,
  children,
}: PendingApprovalEntryProps) => {
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const remaining = new Date(pendingStatus.timeout_at).getTime() - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  });
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnteringReason, setIsEnteringReason] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const denyReasonRef = useRef<HTMLTextAreaElement | null>(null);

  const percent = useMemo(() => {
    const total = Math.max(
      1,
      Math.floor(
        (new Date(pendingStatus.timeout_at).getTime() -
          new Date(pendingStatus.requested_at).getTime()) /
          1000
      )
    );
    return Math.max(0, Math.min(100, Math.round((timeLeft / total) * 100)));
  }, [pendingStatus.requested_at, pendingStatus.timeout_at, timeLeft]);

  useEffect(() => {
    if (hasResponded) return;

    const id = window.setInterval(() => {
      const remaining =
        new Date(pendingStatus.timeout_at).getTime() - Date.now();
      const next = Math.max(0, Math.floor(remaining / 1000));
      setTimeLeft(next);
      if (next <= 0) {
        window.clearInterval(id);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [pendingStatus.timeout_at, hasResponded]);

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
        pendingStatus.approval_id,
        {
          execution_process_id: executionProcessId,
          status,
        },
        controller.signal
      );

      setHasResponded(true);
      setIsEnteringReason(false);
      setDenyReason('');
    } catch (e: any) {
      console.error('Approval respond failed:', e);
      setError(e?.message || 'Failed to send response');
    } finally {
      setIsResponding(false);
    }
  };

  const handleApprove = () => respond(true);
  const handleStartDeny = () => {
    if (disabled) return;
    setError(null);
    setIsEnteringReason(true);
  };

  const handleCancelDeny = () => {
    if (isResponding) return;
    setIsEnteringReason(false);
    setDenyReason('');
  };

  const handleSubmitDeny = () => {
    const trimmed = denyReason.trim();
    respond(false, trimmed || DEFAULT_DENIAL_REASON);
  };

  useEffect(() => {
    if (!hasResponded) return;
  }, [hasResponded]);

  useEffect(() => {
    if (!isEnteringReason) return;
    const id = window.setTimeout(() => denyReasonRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isEnteringReason]);

  return (
    <div className="relative mt-3">
      <div className="absolute -top-3 left-4 rounded-full border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm">
        Awaiting approval
      </div>
      <div className="overflow-hidden border">
        {children}
        <div className="border-t bg-background px-2 py-1.5 text-xs sm:text-sm">
          <TooltipProvider>
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 pl-4">
                {!isEnteringReason && (
                  <>
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
                        <p>
                          {isResponding ? 'Submitting…' : 'Approve request'}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleStartDeny}
                          variant="ghost"
                          className="h-8 w-8 rounded-full p-0"
                          disabled={disabled}
                          aria-label={
                            isResponding ? 'Submitting denial' : 'Deny'
                          }
                        >
                          <X className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {isResponding
                            ? 'Submitting…'
                            : 'Provide denial reason'}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
              {!isEnteringReason && !hasResponded && timeLeft > 0 && (
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
            {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
            {isEnteringReason && !hasResponded && (
              <div className="mt-3 bg-background px-3 py-3 text-sm">
                <Textarea
                  ref={denyReasonRef}
                  value={denyReason}
                  onChange={(e) => {
                    setDenyReason(e.target.value);
                  }}
                  placeholder="Let the agent know why this request was denied..."
                  disabled={isResponding}
                  className="text-sm"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelDeny}
                      disabled={isResponding}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSubmitDeny}
                      disabled={isResponding}
                    >
                      Submit denial
                    </Button>
                  </div>
                  {!hasResponded && timeLeft > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center pr-2">
                          <CircularProgress percent={percent} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatSeconds(timeLeft)} remaining</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            )}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};

export default PendingApprovalEntry;
