import { AlertCircle, Send, ChevronDown, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageUploadSection } from '@/components/ui/ImageUploadSection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import {
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from 'react';
import { attemptsApi, imagesApi } from '@/lib/api.ts';
import type { ImageResponse } from 'shared/types';
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
  const variantButtonRef = useRef<HTMLButtonElement>(null);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>(
    []
  );

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
    if (!task || !selectedAttempt || !followUpMessage.trim()) return;

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

      await attemptsApi.followUp(selectedAttempt.id, {
        prompt: followUpMessage.trim(),
        variant: selectedVariant,
        image_ids: imageIds,
      });
      setFollowUpMessage('');
      // Clear images and newly uploaded IDs after successful submission
      setImages([]);
      setNewlyUploadedImageIds([]);
      setShowImageUpload(false);
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

              {/* Image button */}
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-10 p-0"
                onClick={() => setShowImageUpload(!showImageUpload)}
                disabled={!canSendFollowUp}
              >
                <ImageIcon
                  className={cn('h-4 w-4', images.length > 0 && 'text-primary')}
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
