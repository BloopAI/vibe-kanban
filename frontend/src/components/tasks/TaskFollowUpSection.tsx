import { AlertCircle, Send, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import { useContext, useEffect, useMemo, useState, useRef } from 'react';
import { attemptsApi } from '@/lib/api.ts';
import {
  TaskAttemptDataContext,
  TaskDetailsContext,
  TaskSelectedAttemptContext,
} from '@/components/context/taskDetailsContext.ts';
import { Loader } from '@/components/ui/loader';
import { useUserSystem } from '@/components/config-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function TaskFollowUpSection() {
  const { task, projectId } = useContext(TaskDetailsContext);
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const {
    attemptData,
    fetchAttemptData,
    isAttemptRunning,
    defaultFollowUpVariant,
  } = useContext(TaskAttemptDataContext);
  const { profiles } = useUserSystem();

  const [followUpMessage, setFollowUpMessage] = useState('');
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(
    defaultFollowUpVariant
  );
  const [isAnimating, setIsAnimating] = useState(false);
  const variantButtonRef = useRef<HTMLButtonElement>(null);

  // Get the profile from the selected attempt
  const selectedProfile = selectedAttempt?.profile || null;

  const canSendFollowUp = useMemo(() => {
    if (
      !selectedAttempt ||
      attemptData.processes.length === 0 ||
      isAttemptRunning ||
      isSendingFollowUp
    ) {
      return false;
    }
    return true;
  }, [
    selectedAttempt,
    attemptData.processes,
    isAttemptRunning,
    isSendingFollowUp,
  ]);
  const currentProfile = useMemo(() => {
    if (!selectedProfile || !profiles) return null;
    return profiles.find((p) => p.label === selectedProfile);
  }, [selectedProfile, profiles]);

  // Update selectedVariant when defaultFollowUpVariant changes
  useEffect(() => {
    setSelectedVariant(defaultFollowUpVariant);
  }, [defaultFollowUpVariant]);

  // Keyboard shortcut for cycling through variants (Left Shift + Tab)
  useEffect(() => {
    if (!currentProfile?.variants || currentProfile.variants.length === 0) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Left Shift + Tab
      if (e.shiftKey && e.key === 'Tab') {
        e.preventDefault();

        // Build the variant cycle: null (Default) → variant1 → variant2 → ... → null
        const variants = currentProfile.variants;
        const variantLabels = variants.map((v) => v.label);
        const allOptions = [null, ...variantLabels];

        // Find current index and cycle to next
        const currentIndex = allOptions.findIndex((v) => v === selectedVariant);
        const nextIndex = (currentIndex + 1) % allOptions.length;
        const nextVariant = allOptions[nextIndex];

        setSelectedVariant(nextVariant);

        // Trigger animation
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 300);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentProfile, selectedVariant]);

  const onSendFollowUp = async () => {
    if (!task || !selectedAttempt || !followUpMessage.trim()) return;

    try {
      setIsSendingFollowUp(true);
      setFollowUpError(null);
      await attemptsApi.followUp(selectedAttempt.id, {
        prompt: followUpMessage.trim(),
        variant: selectedVariant,
      });
      setFollowUpMessage('');
      fetchAttemptData(selectedAttempt.id);
    } catch (error: unknown) {
      // @ts-expect-error it is type ApiError
      setFollowUpError(`Failed to start follow-up execution: ${error.message}`);
    } finally {
      setIsSendingFollowUp(false);
    }
  };

  return (
    selectedAttempt && (
      <div className="border-t p-4">
        <div className="space-y-2">
          {followUpError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{followUpError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <div className="flex gap-2 items-start">
              <FileSearchTextarea
                placeholder="Continue working on this task... Type @ to search files."
                value={followUpMessage}
                onChange={(value) => {
                  setFollowUpMessage(value);
                  if (followUpError) setFollowUpError(null);
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    if (
                      canSendFollowUp &&
                      followUpMessage.trim() &&
                      !isSendingFollowUp
                    ) {
                      onSendFollowUp();
                    }
                  }
                }}
                className="flex-1 min-h-[40px] resize-none"
                disabled={!canSendFollowUp}
                projectId={projectId}
                rows={1}
                maxRows={6}
              />

              {/* Variant selector */}
              {(() => {
                const hasVariants =
                  currentProfile?.variants &&
                  currentProfile.variants.length > 0;

                if (hasVariants) {
                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          ref={variantButtonRef}
                          variant="outline"
                          size="sm"
                          className={cn(
                            'h-10 w-24 px-2 flex items-center justify-between transition-all',
                            isAnimating && 'scale-105 bg-accent'
                          )}
                        >
                          <span className="text-xs truncate flex-1 text-left">
                            {selectedVariant || 'Default'}
                          </span>
                          <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() => setSelectedVariant(null)}
                          className={!selectedVariant ? 'bg-accent' : ''}
                        >
                          Default
                        </DropdownMenuItem>
                        {currentProfile.variants.map((variant) => (
                          <DropdownMenuItem
                            key={variant.label}
                            onClick={() => setSelectedVariant(variant.label)}
                            className={
                              selectedVariant === variant.label
                                ? 'bg-accent'
                                : ''
                            }
                          >
                            {variant.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                } else if (currentProfile) {
                  // Show disabled button when profile exists but has no variants
                  return (
                    <Button
                      ref={variantButtonRef}
                      variant="outline"
                      size="sm"
                      className="h-10 w-24 px-2 flex items-center justify-between transition-all"
                      disabled
                    >
                      <span className="text-xs truncate flex-1 text-left">
                        Default
                      </span>
                    </Button>
                  );
                }
                return null;
              })()}

              <Button
                onClick={onSendFollowUp}
                disabled={
                  !canSendFollowUp ||
                  !followUpMessage.trim() ||
                  isSendingFollowUp
                }
                size="sm"
              >
                {isSendingFollowUp ? (
                  <Loader size={16} className="mr-2" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  );
}
