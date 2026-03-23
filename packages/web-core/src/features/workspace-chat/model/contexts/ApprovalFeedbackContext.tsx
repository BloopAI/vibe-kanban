import {
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { createHmrContext } from '@/shared/lib/hmrContext';
import { useApprovalMutation } from '../hooks/useApprovalMutation';

interface ActiveApproval {
  approvalId: string;
  executionProcessId: string;
  timeoutAt: string;
  requestedAt: string;
}

interface ApprovalFeedbackContextType {
  activeApproval: ActiveApproval | null;
  enterFeedbackMode: (approval: ActiveApproval) => void;
  exitFeedbackMode: () => void;
  submitFeedback: (message: string) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
  isTimedOut: boolean;
}

const ApprovalFeedbackContext =
  createHmrContext<ApprovalFeedbackContextType | null>(
    'ApprovalFeedbackContext',
    null
  );

export function useApprovalFeedback() {
  const context = useContext(ApprovalFeedbackContext);
  if (!context) {
    throw new Error(
      'useApprovalFeedback must be used within ApprovalFeedbackProvider'
    );
  }
  return context;
}

// Optional hook that doesn't throw - for components that may render outside provider
export function useApprovalFeedbackOptional() {
  return useContext(ApprovalFeedbackContext);
}

export function ApprovalFeedbackProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [activeApproval, setActiveApproval] = useState<ActiveApproval | null>(
    null
  );
  const [nowTs, setNowTs] = useState(() => Date.now());
  const { denyAsync, isDenying, denyError, reset } = useApprovalMutation();

  useEffect(() => {
    if (!activeApproval) {
      setNowTs(Date.now());
      return;
    }

    const timeoutAtMs = new Date(activeApproval.timeoutAt).getTime();
    if (!Number.isFinite(timeoutAtMs)) {
      setNowTs(Date.now());
      return;
    }

    const delay = Math.max(timeoutAtMs - Date.now(), 0);
    const timer = setTimeout(() => {
      setNowTs(Date.now());
    }, delay + 10);

    return () => {
      clearTimeout(timer);
    };
  }, [activeApproval]);

  const timeoutAtMs = activeApproval
    ? new Date(activeApproval.timeoutAt).getTime()
    : Number.NaN;

  const isTimedOut = activeApproval
    ? Number.isFinite(timeoutAtMs) && nowTs > timeoutAtMs
    : false;

  const enterFeedbackMode = useCallback(
    (approval: ActiveApproval) => {
      setActiveApproval(approval);
      setNowTs(Date.now());
      reset();
    },
    [reset]
  );

  const exitFeedbackMode = useCallback(() => {
    setActiveApproval(null);
    setNowTs(Date.now());
    reset();
  }, [reset]);

  const submitFeedback = useCallback(
    async (message: string) => {
      if (!activeApproval) return;

      // Check timeout before submitting
      if (new Date() > new Date(activeApproval.timeoutAt)) {
        throw new Error('Approval has timed out');
      }

      await denyAsync({
        approvalId: activeApproval.approvalId,
        executionProcessId: activeApproval.executionProcessId,
        reason: message.trim() || undefined,
      });
      setActiveApproval(null);
    },
    [activeApproval, denyAsync]
  );

  const value = useMemo(
    () => ({
      activeApproval,
      enterFeedbackMode,
      exitFeedbackMode,
      submitFeedback,
      isSubmitting: isDenying,
      error: denyError?.message ?? null,
      isTimedOut,
    }),
    [
      activeApproval,
      enterFeedbackMode,
      exitFeedbackMode,
      submitFeedback,
      isDenying,
      denyError?.message,
      isTimedOut,
    ]
  );

  return (
    <ApprovalFeedbackContext.Provider value={value}>
      {children}
    </ApprovalFeedbackContext.Provider>
  );
}
