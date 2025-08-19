import { AlertCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { VariantChipInput } from '@/components/ui/variant-chip-input';
import { useContext, useEffect, useMemo, useState } from 'react';
import { attemptsApi } from '@/lib/api.ts';
import {
  TaskAttemptDataContext,
  TaskDetailsContext,
  TaskSelectedAttemptContext,
} from '@/components/context/taskDetailsContext.ts';
import { Loader } from '@/components/ui/loader';
import { useUserSystem } from '@/components/config-provider';
import { useVariantCyclingShortcut } from '@/lib/keyboard-shortcuts';

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

  // Prepare variants list for the chip input
  const variants = useMemo(() => {
    if (!currentProfile?.variants || currentProfile.variants.length === 0) {
      return [];
    }
    return ['Default', ...currentProfile.variants.map(v => v.label)];
  }, [currentProfile]);

  // Update selectedVariant when defaultFollowUpVariant changes
  useEffect(() => {
    setSelectedVariant(defaultFollowUpVariant);
  }, [defaultFollowUpVariant]);

  // Use the centralized keyboard shortcut hook for cycling through variants
  useVariantCyclingShortcut({
    currentProfile,
    selectedVariant,
    setSelectedVariant,
    setIsAnimating,
  });

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
              <VariantChipInput
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
                variants={variants}
                selectedVariant={selectedVariant}
                onVariantSelect={setSelectedVariant}
                isAnimating={isAnimating}
              />

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
