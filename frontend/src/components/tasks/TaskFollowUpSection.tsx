import {
  AlertCircle,
  Send,
  ChevronDown,
  ImageIcon,
  StopCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageUploadSection } from '@/components/ui/ImageUploadSection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { attemptsApi, imagesApi } from '@/lib/api.ts';
import type { ImageResponse, TaskWithAttemptStatus } from 'shared/types';
import { useBranchStatus } from '@/hooks';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { Loader } from '@/components/ui/loader';
import { useUserSystem } from '@/components/config-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useVariantCyclingShortcut } from '@/lib/keyboard-shortcuts';

interface TaskFollowUpSectionProps {
  task: TaskWithAttemptStatus;
  projectId: string;
  selectedAttemptId?: string;
  selectedAttemptProfile?: string;
}

export function TaskFollowUpSection({
  task,
  projectId,
  selectedAttemptId,
  selectedAttemptProfile,
}: TaskFollowUpSectionProps) {
  const {
    attemptData,
    isAttemptRunning,
    stopExecution,
    isStopping,
    processes,
  } = useAttemptExecution(selectedAttemptId, task.id);
  const { data: branchStatus } = useBranchStatus(selectedAttemptId);
  const { profiles } = useUserSystem();

  // Inline defaultFollowUpVariant logic
  const defaultFollowUpVariant = useMemo(() => {
    if (!processes.length) return null;

    // Find most recent coding agent process with variant
    const latestProfile = processes
      .filter((p) => p.run_reason === 'codingagent')
      .reverse()
      .map((process) => {
        if (
          process.executor_action?.typ.type === 'CodingAgentInitialRequest' ||
          process.executor_action?.typ.type === 'CodingAgentFollowUpRequest'
        ) {
          return process.executor_action?.typ.profile_variant_label;
        }
        return undefined;
      })
      .find(Boolean);

    if (latestProfile?.variant) {
      return latestProfile.variant;
    } else if (latestProfile) {
      return null;
    } else if (selectedAttemptProfile && profiles) {
      // No processes yet, check if profile has default variant
      const profile = profiles.find((p) => p.label === selectedAttemptProfile);
      if (profile?.variants && profile.variants.length > 0) {
        return profile.variants[0].label;
      }
    }

    return null;
  }, [processes, selectedAttemptProfile, profiles]);

  const [followUpMessage, setFollowUpMessage] = useState('');
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(
    defaultFollowUpVariant
  );
  const [isAnimating, setIsAnimating] = useState(false);
  const variantButtonRef = useRef<HTMLButtonElement>(null);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>(
    []
  );

  // Get the profile from the attempt data
  const selectedProfile = selectedAttemptProfile;

  const canSendFollowUp = useMemo(() => {
    if (
      !selectedAttemptId ||
      attemptData.processes.length === 0 ||
      isSendingFollowUp
    ) {
      return false;
    }

    // Check if PR is merged - if so, block follow-ups
    if (branchStatus?.merges) {
      const mergedPR = branchStatus.merges.find(
        (m) => m.type === 'pr' && m.pr_info.status === 'merged'
      );
      if (mergedPR) {
        return false;
      }
    }

    return true;
  }, [
    selectedAttemptId,
    attemptData.processes,
    isSendingFollowUp,
    branchStatus?.merges,
  ]);
  const currentProfile = useMemo(() => {
    if (!selectedProfile || !profiles) return null;
    return profiles.find((p) => p.label === selectedProfile);
  }, [selectedProfile, profiles]);

  // Update selectedVariant when defaultFollowUpVariant changes
  useEffect(() => {
    setSelectedVariant(defaultFollowUpVariant);
  }, [defaultFollowUpVariant]);

  const handleImageUploaded = useCallback((image: ImageResponse) => {
    const markdownText = `![${image.original_name}](${image.file_path})`;
    setFollowUpMessage((prev) => {
      if (prev.trim() === '') {
        return markdownText;
      } else {
        return prev + ' ' + markdownText;
      }
    });

    setImages((prev) => [...prev, image]);
    setNewlyUploadedImageIds((prev) => [...prev, image.id]);
  }, []);

  // Use the centralized keyboard shortcut hook for cycling through variants
  useVariantCyclingShortcut({
    currentProfile,
    selectedVariant,
    setSelectedVariant,
    setIsAnimating,
  });

  const onSendFollowUp = async () => {
    if (!task || !selectedAttemptId || !followUpMessage.trim()) return;

    try {
      setIsSendingFollowUp(true);
      setFollowUpError(null);
      // Use newly uploaded image IDs if available, otherwise use all image IDs
      const imageIds =
        newlyUploadedImageIds.length > 0
          ? newlyUploadedImageIds
          : images.length > 0
            ? images.map((img) => img.id)
            : null;

      await attemptsApi.followUp(selectedAttemptId, {
        prompt: followUpMessage.trim(),
        variant: selectedVariant,
        image_ids: imageIds,
      });
      setFollowUpMessage('');
      // Clear images and newly uploaded IDs after successful submission
      setImages([]);
      setNewlyUploadedImageIds([]);
      setShowImageUpload(false);
      // No need to manually refetch - React Query will handle this
    } catch (error: unknown) {
      // @ts-expect-error it is type ApiError
      setFollowUpError(`Failed to start follow-up execution: ${error.message}`);
    } finally {
      setIsSendingFollowUp(false);
    }
  };

  return (
    selectedAttemptId && (
      <div className="border-t p-4 focus-within:ring ring-inset">
        <div className="space-y-2">
          {followUpError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{followUpError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            {showImageUpload && (
              <div className="mb-2">
                <ImageUploadSection
                  images={images}
                  onImagesChange={setImages}
                  onUpload={imagesApi.upload}
                  onDelete={imagesApi.delete}
                  onImageUploaded={handleImageUploaded}
                  disabled={!canSendFollowUp}
                  collapsible={false}
                  defaultExpanded={true}
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <div>
                <FileSearchTextarea
                  placeholder="Continue working on this task attempt... Type @ to search files."
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
              </div>
              <div className="flex flex-row">
                <div className="flex-1 flex gap-2">
                  {/* Image button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 p-0"
                    onClick={() => setShowImageUpload(!showImageUpload)}
                    disabled={!canSendFollowUp}
                  >
                    <ImageIcon
                      className={cn(
                        'h-4 w-4',
                        images.length > 0 && 'text-primary'
                      )}
                    />
                  </Button>

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
                                onClick={() =>
                                  setSelectedVariant(variant.label)
                                }
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
                </div>
                {isAttemptRunning ? (
                  <Button
                    onClick={stopExecution}
                    disabled={isStopping}
                    size="sm"
                    variant="destructive"
                  >
                    {isStopping ? (
                      <Loader size={16} className="mr-2" />
                    ) : (
                      <>
                        <StopCircle className="h-4 w-4 mr-2" />
                        Stop
                      </>
                    )}
                  </Button>
                ) : (
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
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  );
}
