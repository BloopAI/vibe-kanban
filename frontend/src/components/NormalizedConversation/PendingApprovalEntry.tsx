import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

import { useHotkeysContext } from 'react-hotkeys-hook';
import { TabNavContext } from '@/contexts/TabNavigationContext';
import { useKeyApproveRequest, useKeyDenyApproval, Scope } from '@/keyboard';

const DEFAULT_DENIAL_REASON = 'User denied this tool use request.';

// ---------- Types ----------
interface PendingApprovalEntryProps {
  pendingStatus: Extract<ToolStatus, { status: 'pending_approval' }>;
  executionProcessId?: string;
  children: ReactNode;
}

// ---------- Utils ----------
function formatSeconds(s: number) {
  if (s <= 0) return '0s';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

// ---------- Hooks ----------
function useAbortController() {
  const ref = useRef<AbortController | null>(null);
  useEffect(() => () => ref.current?.abort(), []);
  return ref;
}

function useApprovalCountdown(
  requestedAt: string | number | Date,
  timeoutAt: string | number | Date,
  paused: boolean
) {
  const totalSeconds = useMemo(() => {
    const total = Math.floor(
      (new Date(timeoutAt).getTime() - new Date(requestedAt).getTime()) / 1000
    );
    return Math.max(1, total);
  }, [requestedAt, timeoutAt]);

  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const remaining = new Date(timeoutAt).getTime() - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  });

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      const remaining = new Date(timeoutAt).getTime() - Date.now();
      const next = Math.max(0, Math.floor(remaining / 1000));
      setTimeLeft(next);
      if (next <= 0) window.clearInterval(id);
    }, 1000);

    return () => window.clearInterval(id);
  }, [timeoutAt, paused]);

  const percent = useMemo(
    () =>
      Math.max(0, Math.min(100, Math.round((timeLeft / totalSeconds) * 100))),
    [timeLeft, totalSeconds]
  );

  return { timeLeft, percent };
}

// ---------- Subcomponents ----------
function ProgressWithTooltip({
  visible,
  timeLeft,
  percent,
}: {
  visible: boolean;
  timeLeft: number;
  percent: number;
}) {
  if (!visible) return null;
  return (
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
  );
}

function ActionButtons({
  disabled,
  isResponding,
  onApprove,
  onStartDeny,
}: {
  disabled: boolean;
  isResponding: boolean;
  onApprove: () => void;
  onStartDeny: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 pr-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onApprove}
            variant="ghost"
            className="h-8 w-8 rounded-full p-0"
            disabled={disabled}
            aria-label={isResponding ? 'Submitting approval' : 'Approve'}
            aria-busy={isResponding}
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
            onClick={onStartDeny}
            variant="ghost"
            className="h-8 w-8 rounded-full p-0"
            disabled={disabled}
            aria-label={isResponding ? 'Submitting denial' : 'Deny'}
            aria-busy={isResponding}
          >
            <X className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isResponding ? 'Submitting…' : 'Provide denial reason'}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function DenyReasonForm({
  isResponding,
  timeLeft,
  percent,
  value,
  onChange,
  onCancel,
  onSubmit,
  inputRef,
}: {
  isResponding: boolean;
  timeLeft: number;
  percent: number;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}) {
  return (
    <div className="mt-3 bg-background px-3 py-3 text-sm">
      <Textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Let the agent know why this request was denied..."
        disabled={isResponding}
        className="text-sm"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <ProgressWithTooltip
          visible={timeLeft > 0}
          timeLeft={timeLeft}
          percent={percent}
        />
        <div className="flex items-center gap-2 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isResponding}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={isResponding}>
            Deny
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main Component ----------
const PendingApprovalEntry = ({
  pendingStatus,
  executionProcessId,
  children,
}: PendingApprovalEntryProps) => {
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnteringReason, setIsEnteringReason] = useState(false);
  const [denyReason, setDenyReason] = useState('');

  const abortRef = useAbortController();
  const denyReasonRef = useRef<HTMLTextAreaElement | null>(null);

  const { enableScope, disableScope, activeScopes } = useHotkeysContext();
  const tabNav = useContext(TabNavContext);
  const isLogsTabActive = tabNav ? tabNav.activeTab === 'logs' : true;
  const dialogScopeActive = activeScopes.includes(Scope.DIALOG);
  const shouldControlScopes = isLogsTabActive && !dialogScopeActive;
  const approvalsScopeEnabledRef = useRef(false);
  const dialogScopeActiveRef = useRef(dialogScopeActive);

  useEffect(() => {
    dialogScopeActiveRef.current = dialogScopeActive;
  }, [dialogScopeActive]);

  const { timeLeft, percent } = useApprovalCountdown(
    pendingStatus.requested_at,
    pendingStatus.timeout_at,
    hasResponded
  );

  const disabled = isResponding || hasResponded || timeLeft <= 0;

  const shouldEnableApprovalsScope = shouldControlScopes && !disabled;

  useEffect(() => {
    const shouldEnable = shouldEnableApprovalsScope;

    if (shouldEnable && !approvalsScopeEnabledRef.current) {
      enableScope(Scope.APPROVALS);
      disableScope(Scope.KANBAN);
      approvalsScopeEnabledRef.current = true;
    } else if (!shouldEnable && approvalsScopeEnabledRef.current) {
      disableScope(Scope.APPROVALS);
      if (!dialogScopeActive) {
        enableScope(Scope.KANBAN);
      }
      approvalsScopeEnabledRef.current = false;
    }

    return () => {
      if (approvalsScopeEnabledRef.current) {
        disableScope(Scope.APPROVALS);
        if (!dialogScopeActiveRef.current) {
          enableScope(Scope.KANBAN);
        }
        approvalsScopeEnabledRef.current = false;
      }
    };
  }, [
    disableScope,
    enableScope,
    dialogScopeActive,
    shouldEnableApprovalsScope,
  ]);

  const respond = useCallback(
    async (approved: boolean, reason?: string) => {
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
          { execution_process_id: executionProcessId, status },
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
    },
    [abortRef, disabled, executionProcessId, pendingStatus.approval_id]
  );

  const handleApprove = useCallback(() => respond(true), [respond]);
  const handleStartDeny = useCallback(() => {
    if (disabled) return;
    setError(null);
    setIsEnteringReason(true);
  }, [disabled]);

  const handleCancelDeny = useCallback(() => {
    if (isResponding) return;
    setIsEnteringReason(false);
    setDenyReason('');
  }, [isResponding]);

  const handleSubmitDeny = useCallback(() => {
    const trimmed = denyReason.trim();
    respond(false, trimmed || DEFAULT_DENIAL_REASON);
  }, [denyReason, respond]);

  const triggerDeny = useCallback(
    (event?: KeyboardEvent) => {
      if (!isEnteringReason || disabled || hasResponded) return;
      event?.preventDefault();
      handleSubmitDeny();
    },
    [isEnteringReason, disabled, hasResponded, handleSubmitDeny]
  );

  useKeyApproveRequest(handleApprove, {
    scope: Scope.APPROVALS,
    when: () => shouldEnableApprovalsScope && !isEnteringReason,
    preventDefault: true,
  });

  useKeyDenyApproval(triggerDeny, {
    scope: Scope.APPROVALS,
    when: () => shouldEnableApprovalsScope && !hasResponded,
    enableOnFormTags: ['textarea', 'TEXTAREA'],
    preventDefault: true,
  });

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
            <div className="flex items-center justify-between gap-1.5 pl-4">
              {!isEnteringReason && !hasResponded && (
                <ProgressWithTooltip
                  visible={timeLeft > 0}
                  timeLeft={timeLeft}
                  percent={percent}
                />
              )}
              {!isEnteringReason && (
                <ActionButtons
                  disabled={disabled}
                  isResponding={isResponding}
                  onApprove={handleApprove}
                  onStartDeny={handleStartDeny}
                />
              )}
            </div>

            {error && (
              <div
                className="mt-1 text-xs text-red-600"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            )}

            {isEnteringReason && !hasResponded && (
              <DenyReasonForm
                isResponding={isResponding}
                timeLeft={timeLeft}
                percent={percent}
                value={denyReason}
                onChange={setDenyReason}
                onCancel={handleCancelDeny}
                onSubmit={handleSubmitDeny}
                inputRef={denyReasonRef}
              />
            )}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};

export default PendingApprovalEntry;
