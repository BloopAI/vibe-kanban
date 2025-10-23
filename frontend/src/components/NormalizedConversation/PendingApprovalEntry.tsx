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
import { approvalsApi } from '@/lib/api';
import { Check, X } from 'lucide-react';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';

import { useHotkeysContext } from 'react-hotkeys-hook';
import { TabNavContext } from '@/contexts/TabNavigationContext';
import { useKeyApproveRequest, useKeyDenyApproval, Scope } from '@/keyboard';
import { useProject } from '@/contexts/project-context';
import { useApprovalForm } from '@/contexts/ApprovalFormContext';

const DEFAULT_DENIAL_REASON = 'User denied this tool use request.';

// ---------- Types ----------
interface PendingApprovalEntryProps {
  pendingStatus: Extract<ToolStatus, { status: 'pending_approval' }>;
  executionProcessId?: string;
  children: ReactNode;
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
  value,
  onChange,
  onCancel,
  onSubmit,
  inputRef,
  projectId,
}: {
  isResponding: boolean;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  projectId?: string;
}) {
  return (
    <div className="mt-3 bg-background px-3 py-3 text-sm">
      <FileSearchTextarea
        ref={inputRef}
        value={value}
        onChange={onChange}
        placeholder="Let the agent know why this request was denied... Type @ to insert tags or search files."
        disabled={isResponding}
        className="w-full bg-transparent border px-3 py-2 text-sm resize-none min-h-[80px] focus-visible:outline-none"
        projectId={projectId}
      />
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
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

  const {
    isEnteringReason,
    denyReason,
    setIsEnteringReason,
    setDenyReason,
    clear,
  } = useApprovalForm(pendingStatus.approval_id);

  const denyReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const { projectId } = useProject();

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

  const { timeLeft } = useApprovalCountdown(
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

      const status: ApprovalStatus = approved
        ? { status: 'approved' }
        : { status: 'denied', reason };

      try {
        await approvalsApi.respond(pendingStatus.approval_id, {
          execution_process_id: executionProcessId,
          status,
        });
        setHasResponded(true);
        clear();
      } catch (e: any) {
        console.error('Approval respond failed:', e);
        setError(e?.message || 'Failed to send response');
      } finally {
        setIsResponding(false);
      }
    },
    [disabled, executionProcessId, pendingStatus.approval_id, clear]
  );

  const handleApprove = useCallback(() => respond(true), [respond]);
  const handleStartDeny = useCallback(() => {
    if (disabled) return;
    setError(null);
    setIsEnteringReason(true);
  }, [disabled, setIsEnteringReason]);

  const handleCancelDeny = useCallback(() => {
    if (isResponding) return;
    clear();
  }, [isResponding, clear]);

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
      <div className="overflow-hidden border">
        {children}

        <div className="border-t bg-background px-2 py-1.5 text-xs sm:text-sm">
          <TooltipProvider>
            <div className="flex items-center justify-between gap-1.5 pl-4">
              <div className="flex items-center gap-1.5">
                {!isEnteringReason && (
                  <span className="text-muted-foreground">
                    Would you like to approve this?
                  </span>
                )}
              </div>
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
                value={denyReason}
                onChange={setDenyReason}
                onCancel={handleCancelDeny}
                onSubmit={handleSubmitDeny}
                inputRef={denyReasonRef}
                projectId={projectId}
              />
            )}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};

export default PendingApprovalEntry;
