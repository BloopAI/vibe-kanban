import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { attemptsApi } from '@/lib/api';
import { Loader2, Play, Terminal } from 'lucide-react';
import { useExecutionProcesses } from '@/hooks/useExecutionProcesses';
import { useJsonPatchWsStream } from '@/hooks/useJsonPatchWsStream';

export interface RunCommandDialogProps {
  attemptId: string;
}

interface CommandOutput {
  id: string;
  command: string;
  output: string[];
  status: 'running' | 'completed' | 'failed';
  exitCode?: number;
}

type LogState = {
  stdout: string[];
  stderr: string[];
};

const CommandOutputView = ({
  executionProcessId,
  command,
  onCompleted,
}: {
  executionProcessId: string;
  command: string;
  onCompleted: (exitCode: number | null) => void;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialData = useCallback((): LogState => ({ stdout: [], stderr: [] }), []);

  const { data } = useJsonPatchWsStream<LogState>(
    `/api/execution-processes/${executionProcessId}/raw-logs/ws`,
    true,
    initialData
  );

  const { executionProcessesById } = useExecutionProcesses(undefined);
  const process = executionProcessesById[executionProcessId];
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    if (process && process.status !== 'running' && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      // Convert bigint to number for the callback
      const exitCodeNum = process.exit_code !== null && process.exit_code !== undefined
        ? Number(process.exit_code)
        : null;
      onCompleted(exitCodeNum);
    }
  }, [process, onCompleted]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data]);

  const allOutput = [...(data?.stdout ?? []), ...(data?.stderr ?? [])];

  // Convert bigint exit_code to number for display
  const exitCode = process?.exit_code !== null && process?.exit_code !== undefined
    ? Number(process.exit_code)
    : null;

  return (
    <div className="border rounded-md bg-muted/30 overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/50 flex items-center gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <code className="text-sm font-mono text-foreground">{command}</code>
        {process?.status === 'running' && (
          <Loader2 className="h-3 w-3 animate-spin ml-auto text-muted-foreground" />
        )}
        {process?.status === 'completed' && exitCode === 0 && (
          <span className="ml-auto text-xs text-green-600">exit 0</span>
        )}
        {process?.status === 'completed' && exitCode !== null && exitCode !== 0 && (
          <span className="ml-auto text-xs text-red-600">
            exit {exitCode}
          </span>
        )}
        {process?.status === 'failed' && (
          <span className="ml-auto text-xs text-red-600">failed</span>
        )}
        {process?.status === 'killed' && (
          <span className="ml-auto text-xs text-yellow-600">killed</span>
        )}
      </div>
      <div
        ref={scrollRef}
        className="h-48 overflow-y-auto p-3 font-mono text-sm whitespace-pre-wrap"
      >
        {allOutput.length === 0 ? (
          <span className="text-muted-foreground italic">Waiting for output...</span>
        ) : (
          allOutput.map((line, i) => (
            <div key={i} className="leading-relaxed">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const RunCommandDialogImpl = NiceModal.create<RunCommandDialogProps>(
  ({ attemptId }) => {
    const modal = useModal();
    const { t } = useTranslation(['tasks', 'common']);
    const [command, setCommand] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [commandHistory, setCommandHistory] = useState<CommandOutput[]>([]);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const { isAttemptRunning } = useExecutionProcesses(attemptId);

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
          const newEntry: CommandOutput = {
            id: result.data.id,
            command: trimmedCommand,
            output: [],
            status: 'running',
          };
          setCommandHistory((prev) => [...prev, newEntry]);
          setCommand('');
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
        inputRef.current?.focus();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    const handleCommandCompleted = useCallback(
      (commandId: string, exitCode: number | null) => {
        setCommandHistory((prev) =>
          prev.map((cmd) =>
            cmd.id === commandId
              ? {
                  ...cmd,
                  status: exitCode === 0 ? 'completed' : 'failed',
                  exitCode: exitCode ?? undefined,
                }
              : cmd
          )
        );
      },
      []
    );

    // Auto-scroll to bottom when new commands are added
    useEffect(() => {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
      }
    }, [commandHistory.length]);

    const isInputDisabled = isSubmitting || isAttemptRunning;

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              {t('followUp.runCommand.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 flex flex-col gap-4">
            {/* Command history and output */}
            <div ref={scrollAreaRef} className="flex-1 min-h-[200px] max-h-[50vh] overflow-y-auto">
              <div className="space-y-3 pr-2">
                {commandHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>{t('followUp.runCommand.noCommands')}</p>
                  </div>
                ) : (
                  commandHistory.map((cmd) => (
                    <CommandOutputView
                      key={cmd.id}
                      executionProcessId={cmd.id}
                      command={cmd.command}
                      onCompleted={(exitCode) =>
                        handleCommandCompleted(cmd.id, exitCode)
                      }
                    />
                  ))
                )}
              </div>
            </div>

            {/* Command input */}
            <div className="space-y-2">
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
                  size="icon"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              </div>
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
