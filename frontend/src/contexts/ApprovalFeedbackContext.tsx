import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { approvalsApi } from '@/lib/api';
import type { ApprovalStatus } from 'shared/types';

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
  createContext<ApprovalFeedbackContextType | null>(null);

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTimedOut = activeApproval
    ? new Date() > new Date(activeApproval.timeoutAt)
    : false;

  const enterFeedbackMode = useCallback((approval: ActiveApproval) => {
    setActiveApproval(approval);
    setError(null);
  }, []);

  const exitFeedbackMode = useCallback(() => {
    setActiveApproval(null);
    setError(null);
  }, []);

  const submitFeedback = useCallback(
    async (message: string) => {
      if (!activeApproval) return;

      // Check timeout before submitting
      if (new Date() > new Date(activeApproval.timeoutAt)) {
        setError('Approval has timed out');
        return;
      }

      setIsSubmitting(true);
      setError(null);

      const status: ApprovalStatus = {
        status: 'denied',
        reason: message.trim() || 'User denied this request.',
      };

      try {
        await approvalsApi.respond(activeApproval.approvalId, {
          execution_process_id: activeApproval.executionProcessId,
          status,
        });
        setActiveApproval(null);
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : 'Failed to submit feedback';
        setError(errorMessage);
        throw e;
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeApproval]
  );

  return (
    <ApprovalFeedbackContext.Provider
      value={{
        activeApproval,
        enterFeedbackMode,
        exitFeedbackMode,
        submitFeedback,
        isSubmitting,
        error,
        isTimedOut,
      }}
    >
      {children}
    </ApprovalFeedbackContext.Provider>
  );
}
