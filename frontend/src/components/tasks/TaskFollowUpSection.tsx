import { Send, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';

interface TaskFollowUpSectionProps {
  followUpMessage: string;
  setFollowUpMessage: (message: string) => void;
  isSendingFollowUp: boolean;
  followUpError: string | null;
  setFollowUpError: (error: string | null) => void;
  canSendFollowUp: boolean;
  projectId: string;
  onSendFollowUp: () => void;
}

export function TaskFollowUpSection({
  followUpMessage,
  setFollowUpMessage,
  isSendingFollowUp,
  followUpError,
  setFollowUpError,
  canSendFollowUp,
  projectId,
  onSendFollowUp,
}: TaskFollowUpSectionProps) {
  return (
    <div className="border-t p-4">
      <div className="space-y-2">
        {followUpError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{followUpError}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2 items-start">
          <FileSearchTextarea
            placeholder="Ask a follow-up question... Type @ to search files."
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
          />
          <Button
            onClick={onSendFollowUp}
            disabled={
              !canSendFollowUp || !followUpMessage.trim() || isSendingFollowUp
            }
            size="sm"
          >
            {isSendingFollowUp ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
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
  );
}
