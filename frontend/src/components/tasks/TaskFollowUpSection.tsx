import { AlertCircle, Send, Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import { ImageUpload, type ImageFile } from '@/components/ui/image-upload';
import { useContext, useMemo, useState, useCallback } from 'react';
import { attemptsApi } from '@/lib/api.ts';
import {
  TaskAttemptDataContext,
  TaskDetailsContext,
  TaskSelectedAttemptContext,
} from '@/components/context/taskDetailsContext.ts';
import { Loader } from '@/components/ui/loader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function TaskFollowUpSection() {
  const { task, projectId } = useContext(TaskDetailsContext);
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const { attemptData, fetchAttemptData, isAttemptRunning } = useContext(
    TaskAttemptDataContext
  );

  const [followUpMessage, setFollowUpMessage] = useState('');
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ImageFile[]>([]);
  const [showImageUpload, setShowImageUpload] = useState(false);

  const canSendFollowUp = useMemo(() => {
    if (
      !selectedAttempt ||
      attemptData.processes.length === 0 ||
      isAttemptRunning ||
      isSendingFollowUp
    ) {
      return false;
    }

    const completedOrKilledCodingAgentProcesses = attemptData.processes.filter(
      (process) =>
        process.process_type === 'codingagent' &&
        (process.status === 'completed' || process.status === 'killed')
    );

    return completedOrKilledCodingAgentProcesses.length > 0;
  }, [
    selectedAttempt,
    attemptData.processes,
    isAttemptRunning,
    isSendingFollowUp,
  ]);

  const onSendFollowUp = async () => {
    if (!task || !selectedAttempt || !followUpMessage.trim()) return;

    try {
      setIsSendingFollowUp(true);
      setFollowUpError(null);
      await attemptsApi.followUp(
        projectId!,
        selectedAttempt.task_id,
        selectedAttempt.id,
        {
          prompt: followUpMessage.trim(),
          attachments: attachments.map(img => ({
            file_name: img.file_name,
            file_type: img.file_type,
            data: img.data,
          })),
        }
      );
      setFollowUpMessage('');
      setAttachments([]);
      fetchAttemptData(selectedAttempt.id, selectedAttempt.task_id);
    } catch (error: unknown) {
      // @ts-expect-error it is type ApiError
      setFollowUpError(`Failed to start follow-up execution: ${error.message}`);
    } finally {
      setIsSendingFollowUp(false);
    }
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        const dt = new DataTransfer();
        imageFiles.forEach(file => dt.items.add(file));
        handleFiles(dt.files);
      }
    },
    []
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files || !canSendFollowUp) return;

    const newImages: ImageFile[] = [];
    const maxSize = 10 * 1024 * 1024; // 10MB

    for (let i = 0; i < files.length && attachments.length + newImages.length < 5; i++) {
      const file = files[i];
      
      if (!file.type.startsWith('image/')) {
        console.warn(`File ${file.name} is not an image`);
        continue;
      }

      if (file.size > maxSize) {
        console.warn(`File ${file.name} exceeds 10MB limit`);
        continue;
      }

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = (e) => {
          const result = e.target?.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      
      reader.readAsDataURL(file);
      
      try {
        const base64Data = await base64Promise;
        newImages.push({
          file_name: file.name,
          file_type: file.type,
          data: base64Data,
          preview: `data:${file.type};base64,${base64Data}`,
        });
      } catch (error) {
        console.error('Error reading file:', error);
      }
    }

    if (newImages.length > 0) {
      setAttachments([...attachments, ...newImages]);
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...attachments];
    newImages.splice(index, 1);
    setAttachments(newImages);
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
          
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-md">
              {attachments.map((img, index) => (
                <div key={index} className="relative group">
                  <img
                    src={img.preview}
                    alt={img.file_name}
                    className="h-16 w-16 object-cover rounded border"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-1 -right-1 p-0.5 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={!canSendFollowUp}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <div className="text-xs text-muted-foreground self-center">
                {attachments.length}/5 images
              </div>
            </div>
          )}

          <div className="flex gap-2 items-start">
            <div className="flex-1 relative">
              <FileSearchTextarea
                placeholder="Continue working on this task... Type @ to search files. Paste images with Ctrl+V."
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
                onPaste={handlePaste}
                className="flex-1 min-h-[40px] resize-none pr-10"
                disabled={!canSendFollowUp}
                projectId={projectId}
                rows={1}
                maxRows={6}
              />
              
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 bottom-1 h-8 w-8"
                disabled={!canSendFollowUp || attachments.length >= 5}
                onClick={() => setShowImageUpload(true)}
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
            </div>

            <Button
              onClick={onSendFollowUp}
              disabled={
                !canSendFollowUp || (!followUpMessage.trim() && attachments.length === 0) || isSendingFollowUp
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

        <Dialog open={showImageUpload} onOpenChange={setShowImageUpload}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Add Images</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <ImageUpload
                value={attachments}
                onChange={setAttachments}
                maxFiles={5}
                maxSizeMB={10}
                disabled={!canSendFollowUp}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  );
}