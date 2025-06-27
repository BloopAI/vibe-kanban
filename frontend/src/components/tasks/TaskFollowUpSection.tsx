import { Send, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';

interface TaskFollowUpSectionProps {
  followUpMessage: string;
  setFollowUpMessage: (message: string) => void;
  isSendingFollowUp: boolean;
  followUpError: string | null;
  setFollowUpError: (error: string | null) => void;
  canSendFollowUp: boolean;
  isAttemptRunning: boolean;
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
  isAttemptRunning,
  projectId,
  onSendFollowUp,
}: TaskFollowUpSectionProps) {
  return (
    <div className="border-t p-6">
      <div className="space-y-3">
        <Label className="text-sm font-medium">Follow-up question</Label>
        {followUpError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{followUpError}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-3">
          <FileSearchTextarea
            placeholder="Ask a follow-up question about this task... Type @ to search files."
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
            className="w-full min-h-[80px] resize-none"
            disabled={!canSendFollowUp}
            projectId={projectId}
            rows={4}
          />
          <div className="flex justify-end">
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
        <p className="text-xs text-muted-foreground">
          {!canSendFollowUp
            ? isAttemptRunning
              ? 'Wait for current execution to complete before asking follow-up questions'
              : 'Complete at least one coding agent execution to enable follow-up questions'
            : 'Continue the conversation with the most recent executor session'}
        </p>
      </div>
    </div>
  );
}
