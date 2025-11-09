import { useCallback, useState, type ReactNode } from 'react';
import type { NormalizedEntryType, QuestionResponseStatus } from 'shared/types';
import { Button } from '@/components/ui/button';
import { questionsApi } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

// ---------- Types ----------
interface PendingQuestionEntryProps {
  questionEntry: Extract<NormalizedEntryType, { type: 'user_question' }>;
  executionProcessId?: string;
  children: ReactNode;
}

// ---------- Main Component ----------
const PendingQuestionEntry = ({
  questionEntry,
  executionProcessId,
  children,
}: PendingQuestionEntryProps) => {
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for selected options
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');

  const isPending = questionEntry.status.status === 'pending';
  const disabled = isResponding || hasResponded || !isPending;

  const handleSingleSelect = (value: string) => {
    setSelectedOptions([value]);
  };

  const handleMultiSelect = (option: string, checked: boolean) => {
    if (checked) {
      setSelectedOptions((prev) => [...prev, option]);
    } else {
      setSelectedOptions((prev) => prev.filter((o) => o !== option));
    }
  };

  const handleSubmit = useCallback(async () => {
    if (disabled) return;
    if (!executionProcessId) {
      setError('Missing executionProcessId');
      return;
    }

    if (selectedOptions.length === 0 && !otherText.trim()) {
      setError('Please select at least one option or provide an answer');
      return;
    }

    setIsResponding(true);
    setError(null);

    const status: QuestionResponseStatus = {
      status: 'answered',
      selected_options: selectedOptions,
      other_text: otherText.trim() || undefined,
    };

    try {
      await questionsApi.respond(questionEntry.question_id, {
        execution_process_id: executionProcessId,
        status,
      });
      setHasResponded(true);
    } catch (e: any) {
      console.error('Question respond failed:', e);
      setError(e?.message || 'Failed to send response');
    } finally {
      setIsResponding(false);
    }
  }, [
    disabled,
    executionProcessId,
    questionEntry.question_id,
    selectedOptions,
    otherText,
  ]);

  return (
    <div className="relative mt-3">
      <div className="overflow-hidden border">
        {children}

        <div className="border-t bg-background px-4 py-3 text-xs sm:text-sm">
          <div className="mb-3">
            <p className="font-medium text-foreground mb-2">
              {questionEntry.question}
            </p>

            {questionEntry.allow_multiple ? (
              <div className="space-y-2">
                {questionEntry.options.map((option) => (
                  <div key={option} className="flex items-center space-x-2">
                    <Checkbox
                      id={`option-${option}`}
                      checked={selectedOptions.includes(option)}
                      onCheckedChange={(checked) =>
                        handleMultiSelect(option, checked as boolean)
                      }
                      disabled={disabled}
                    />
                    <Label
                      htmlFor={`option-${option}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {option}
                    </Label>
                  </div>
                ))}
              </div>
            ) : (
              <RadioGroup
                value={selectedOptions[0] || ''}
                onValueChange={handleSingleSelect}
                disabled={disabled}
              >
                {questionEntry.options.map((option) => (
                  <div key={option} className="flex items-center space-x-2">
                    <RadioGroupItem value={option} id={`radio-${option}`} />
                    <Label
                      htmlFor={`radio-${option}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {option}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            {questionEntry.allow_other && (
              <div className="mt-3">
                <Label htmlFor="other-text" className="text-sm mb-1 block">
                  Other (please specify):
                </Label>
                <Input
                  id="other-text"
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  placeholder="Type your answer here..."
                  disabled={disabled}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {error && (
            <div
              className="mb-2 text-xs text-red-600"
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={disabled} size="sm">
              {isResponding ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PendingQuestionEntry;
