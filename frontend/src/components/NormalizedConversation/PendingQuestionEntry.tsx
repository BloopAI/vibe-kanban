import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { ApprovalStatus, ToolStatus, Question } from 'shared/types';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { approvalsApi } from '@/lib/api';
import { Send } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

import { useHotkeysContext } from 'react-hotkeys-hook';
import { TabNavContext } from '@/contexts/TabNavigationContext';
import { Scope } from '@/keyboard';

// ---------- Types ----------
interface PendingQuestionEntryProps {
  pendingStatus: Extract<ToolStatus, { status: 'pending_question' }>;
  executionProcessId?: string;
  children: ReactNode;
}

function useQuestionCountdown(
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

interface QuestionFormProps {
  questions: Question[];
  isResponding: boolean;
  disabled: boolean;
  answers: Record<string, string | string[]>;
  otherTexts: Record<string, string>;
  onAnswerChange: (header: string, value: string | string[]) => void;
  onOtherTextChange: (header: string, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function QuestionForm({
  questions,
  isResponding,
  disabled,
  answers,
  otherTexts,
  onAnswerChange,
  onOtherTextChange,
  onSubmit,
  onCancel,
}: QuestionFormProps) {
  // Auto-submit: If this is the last question, it's single-select, and user selected a non-Other option
  const isLastQuestion = questions.length === 1;
  const lastQuestion = questions[0];
  const canAutoSubmit =
    isLastQuestion && lastQuestion && !lastQuestion.multiSelect;

  const handleOptionClick = (
    question: Question,
    optionLabel: string,
    isOther: boolean
  ) => {
    if (disabled) return;

    if (question.multiSelect) {
      // Multi-select: toggle the option
      const currentAnswers = (answers[question.header] as string[]) || [];
      const isSelected = currentAnswers.includes(optionLabel);
      if (isSelected) {
        onAnswerChange(
          question.header,
          currentAnswers.filter((a) => a !== optionLabel)
        );
      } else {
        onAnswerChange(question.header, [...currentAnswers, optionLabel]);
      }
    } else {
      // Single-select: set the option
      onAnswerChange(question.header, optionLabel);

      // Auto-submit if this is the last question and not "Other"
      if (canAutoSubmit && !isOther) {
        // Use setTimeout to allow state to update first
        setTimeout(() => onSubmit(), 0);
      }
    }
  };

  return (
    <div className="mt-3 bg-background px-3 py-3 text-sm space-y-4">
      {questions.map((question) => {
        const currentAnswer = answers[question.header];
        const isOtherSelected = question.multiSelect
          ? ((currentAnswer as string[]) || []).includes('Other')
          : currentAnswer === 'Other';
        const otherText = otherTexts[question.header] || '';

        return (
          <div key={question.header} className="space-y-2">
            <div className="font-medium text-foreground">
              {question.question}
            </div>
            <div className="flex flex-wrap gap-2">
              {question.options.map((option) => {
                const isSelected = question.multiSelect
                  ? ((currentAnswer as string[]) || []).includes(option.label)
                  : currentAnswer === option.label;

                return (
                  <Tooltip key={option.label}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isSelected ? 'default' : 'outline'}
                        size="sm"
                        onClick={() =>
                          handleOptionClick(question, option.label, false)
                        }
                        disabled={disabled}
                        className="h-auto py-1.5 px-3"
                      >
                        {option.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p>{option.description}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}

              {/* "Other" option - always available per spec */}
              <Button
                variant={isOtherSelected ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleOptionClick(question, 'Other', true)}
                disabled={disabled}
                className="h-auto py-1.5 px-3"
              >
                Other
              </Button>
            </div>

            {/* Other text input - shown when "Other" is selected */}
            {isOtherSelected && (
              <Textarea
                value={otherText}
                onChange={(e) =>
                  onOtherTextChange(question.header, e.target.value)
                }
                placeholder="Please specify..."
                disabled={disabled}
                className="w-full bg-transparent border px-3 py-2 text-sm resize-none min-h-[60px] mt-2"
              />
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isResponding}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={isResponding || disabled}
        >
          <Send className="h-4 w-4 mr-1.5" />
          Submit
        </Button>
      </div>
    </div>
  );
}

// ---------- Main Component ----------
const PendingQuestionEntry = ({
  pendingStatus,
  executionProcessId,
  children,
}: PendingQuestionEntryProps) => {
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track answers for each question by header
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  // Track "Other" text inputs separately
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});

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

  const { timeLeft } = useQuestionCountdown(
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

  const handleAnswerChange = useCallback(
    (header: string, value: string | string[]) => {
      setAnswers((prev) => ({ ...prev, [header]: value }));
    },
    []
  );

  const handleOtherTextChange = useCallback((header: string, value: string) => {
    setOtherTexts((prev) => ({ ...prev, [header]: value }));
  }, []);

  const buildFinalAnswers = useCallback((): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const question of pendingStatus.questions) {
      const answer = answers[question.header];
      if (question.multiSelect) {
        const selectedOptions = (answer as string[]) || [];
        // Replace "Other" with the actual text if provided
        const finalOptions = selectedOptions.map((opt) =>
          opt === 'Other' ? otherTexts[question.header] || 'Other' : opt
        );
        result[question.header] = finalOptions.join(', ');
      } else {
        const selectedOption = answer as string;
        if (selectedOption === 'Other') {
          result[question.header] = otherTexts[question.header] || 'Other';
        } else {
          result[question.header] = selectedOption || '';
        }
      }
    }
    return result;
  }, [answers, otherTexts, pendingStatus.questions]);

  const handleSubmit = useCallback(async () => {
    if (disabled) return;
    if (!executionProcessId) {
      setError('Missing executionProcessId');
      return;
    }

    setIsResponding(true);
    setError(null);

    const finalAnswers = buildFinalAnswers();

    const status: ApprovalStatus = { status: 'approved' };

    try {
      await approvalsApi.respond(pendingStatus.question_id, {
        execution_process_id: executionProcessId,
        status,
        answers: finalAnswers,
      });
      setHasResponded(true);
    } catch (e: unknown) {
      console.error('Question respond failed:', e);
      const errorMessage =
        e instanceof Error ? e.message : 'Failed to send response';
      setError(errorMessage);
    } finally {
      setIsResponding(false);
    }
  }, [
    disabled,
    executionProcessId,
    pendingStatus.question_id,
    buildFinalAnswers,
  ]);

  const handleCancel = useCallback(async () => {
    if (disabled) return;
    if (!executionProcessId) {
      setError('Missing executionProcessId');
      return;
    }

    setIsResponding(true);
    setError(null);

    const status: ApprovalStatus = {
      status: 'denied',
      reason: 'User cancelled',
    };

    try {
      await approvalsApi.respond(pendingStatus.question_id, {
        execution_process_id: executionProcessId,
        status,
      });
      setHasResponded(true);
    } catch (e: unknown) {
      console.error('Question cancel failed:', e);
      const errorMessage =
        e instanceof Error ? e.message : 'Failed to send response';
      setError(errorMessage);
    } finally {
      setIsResponding(false);
    }
  }, [disabled, executionProcessId, pendingStatus.question_id]);

  return (
    <div className="relative mt-3">
      <div className="overflow-hidden border">
        {children}

        <div className="border-t bg-background px-2 py-1.5 text-xs sm:text-sm">
          <TooltipProvider>
            {!hasResponded && (
              <QuestionForm
                questions={pendingStatus.questions}
                isResponding={isResponding}
                disabled={disabled}
                answers={answers}
                otherTexts={otherTexts}
                onAnswerChange={handleAnswerChange}
                onOtherTextChange={handleOtherTextChange}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
              />
            )}

            {error && (
              <div
                className="mt-1 text-xs text-red-600"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            )}

            {hasResponded && (
              <div className="text-muted-foreground text-center py-2">
                Response submitted
              </div>
            )}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};

export default PendingQuestionEntry;
