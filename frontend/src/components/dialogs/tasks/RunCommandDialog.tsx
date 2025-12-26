import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { attemptsApi } from '@/lib/api';
import { Loader2, Play, Terminal } from 'lucide-react';
import { useExecutionProcesses } from '@/hooks/useExecutionProcesses';
import { useExpandableStore } from '@/stores/useExpandableStore';

export interface RunCommandDialogProps {
  attemptId: string;
}

const RunCommandDialogImpl = NiceModal.create<RunCommandDialogProps>(
  ({ attemptId }) => {
    const modal = useModal();
    const { t } = useTranslation(['tasks', 'common']);
    const [command, setCommand] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const { isAttemptRunning } = useExecutionProcesses(attemptId);
    const setExpandedKey = useExpandableStore((s) => s.setKey);

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        modal.hide();
      }
    };

    const handleSubmit = async () => {
      const trimmedCommand = command.trim();
      if (!trimmedCommand || isSubmitting) return;

      setIsSubmitting(true);
      setError(null);

      try {
        const result = await attemptsApi.runCommand(attemptId, trimmedCommand);

        if (result.success) {
          // Expand the user command entry in the chat history
          const executionProcessId = result.data.id;
          setExpandedKey(`tool-entry:${executionProcessId}:0`, true);

          // Command submitted successfully - close dialog
          // Output will appear in the chat history
          modal.hide();
        } else {
          const errorData = result.error;
          if (errorData?.type === 'process_already_running') {
            setError(t('followUp.runCommand.errorProcessRunning'));
          } else if (errorData?.type === 'empty_command') {
            setError(t('followUp.runCommand.errorEmptyCommand'));
          } else {
            setError(t('followUp.runCommand.errorGeneric'));
          }
        }
      } catch (err) {
        console.error('Failed to run command:', err);
        setError(t('followUp.runCommand.errorGeneric'));
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    const isInputDisabled = isSubmitting || isAttemptRunning;

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              {t('followUp.runCommand.title')}
            </DialogTitle>
            <DialogDescription>
              {t('followUp.runCommand.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            {isAttemptRunning && (
              <p className="text-sm text-muted-foreground">
                {t('followUp.runCommand.waitForProcess')}
              </p>
            )}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">
                  $
                </span>
                <Input
                  ref={inputRef}
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('followUp.runCommand.placeholder')}
                  disabled={isInputDisabled}
                  className="pl-7 font-mono"
                  autoFocus
                />
              </div>
              <Button
                onClick={handleSubmit}
                disabled={isInputDisabled || !command.trim()}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    {t('followUp.runCommand.run')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

export const RunCommandDialog = defineModal<RunCommandDialogProps, void>(
  RunCommandDialogImpl
);
