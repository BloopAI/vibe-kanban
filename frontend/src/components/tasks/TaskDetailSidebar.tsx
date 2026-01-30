import { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { TaskWithAttemptStatus } from 'shared/types';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { useTaskAttemptWithSession } from '@/hooks/useTaskAttempt';
import { useBranchStatus, useAttemptExecution } from '@/hooks';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import TodoPanel from '@/components/tasks/TodoPanel';
import { AttemptHeaderActions } from '@/components/panels/AttemptHeaderActions';
import { PreviewPanel } from '@/components/panels/PreviewPanel';
import { DiffsPanel } from '@/components/panels/DiffsPanel';
import { NewCardHeader } from '@/components/ui/new-card';
import { LayoutMode } from '@/components/layout/TasksLayout';
import { WorkspaceWithSession } from '@/types/attempt';

// Context Providers
import { GitOperationsProvider, useGitOperationsError } from '@/contexts/GitOperationsContext';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';

function GitErrorBanner() {
  const { error: gitError } = useGitOperationsError();
  if (!gitError) return null;
  return (
    <div className="mx-4 mt-4 p-3 border border-destructive rounded bg-destructive/10">
      <div className="text-destructive text-sm">{gitError}</div>
    </div>
  );
}

// --- Child Component (Consumes Context) ---
interface TaskDetailContentProps {
  task: TaskWithAttemptStatus;
  attempt: WorkspaceWithSession | null;
  onClose: () => void;
}

function TaskDetailContent({ task, attempt, onClose }: TaskDetailContentProps) {
  const [mode, setMode] = useState<LayoutMode>(null);
  
  // These hooks consume Context provided by the Parent
  const { data: branchStatus, error: branchStatusError } = useBranchStatus(attempt?.id);
  const { isAttemptRunning } = useAttemptExecution(attempt?.id);

  const headerContent = (
    <div className="flex flex-col min-w-0">
      <h2 className="text-lg font-semibold truncate">{task.title}</h2>
      <span className="text-xs text-muted-foreground">
        {attempt?.branch || task.id}
      </span>
    </div>
  );

  return (
    <div className="relative w-full max-w-4xl h-full bg-background border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      {attempt ? (
        <NewCardHeader
          className="shrink-0 border-b"
          actions={
            <AttemptHeaderActions
              mode={mode}
              onModeChange={setMode}
              task={task}
              attempt={attempt ?? null}
              onClose={onClose}
            />
          }
        >
          {headerContent}
        </NewCardHeader>
      ) : (
        <div className="flex items-center justify-between p-4 border-b shrink-0 h-[69px]">
          {headerContent}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
        <div className="h-full flex flex-col relative">
          {mode === 'preview' ? (
            <div className="flex-1 min-h-0 relative">
              <PreviewPanel />
            </div>
          ) : mode === 'diffs' ? (
            <div className="flex-1 min-h-0 relative">
              <DiffsPanel
                selectedAttempt={attempt}
                gitOps={{
                  task,
                  branchStatus: branchStatus ?? null,
                  branchStatusError: branchStatusError ?? null,
                  isAttemptRunning,
                  selectedBranch: branchStatus?.[0]?.target_branch_name ?? null,
                }}
              />
            </div>
          ) : (
            <TaskAttemptPanel attempt={attempt ?? undefined} task={task}>
              {({ logs, followUp }) => (
                <>
                  <GitErrorBanner />
                  <div className="flex-1 min-h-0 flex flex-col h-full">
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                      {logs}
                    </div>
                    <div className="shrink-0 border-t bg-background">
                      <div className="mx-auto w-full max-w-[50rem]">
                        <TodoPanel />
                      </div>
                    </div>
                    <div className="min-h-0 max-h-[40%] border-t overflow-hidden bg-background">
                      <div className="mx-auto w-full max-w-[50rem] h-full min-h-0 p-2">
                        {followUp}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </TaskAttemptPanel>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Parent Component (Provides Context) ---
interface TaskDetailSidebarProps {
  task: TaskWithAttemptStatus;
  projectId: string;
  onClose: () => void;
}

export function TaskDetailSidebar({ task, projectId, onClose }: TaskDetailSidebarProps) {
  // Esc key to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // 1. Fetch Attempts
  const { data: attempts = [], isLoading: isAttemptsLoading } = useTaskAttempts(
    task.id,
    { enabled: !!task.id }
  );

  const latestAttemptId = useMemo(() => {
    if (!attempts?.length) return undefined;
    return [...attempts].sort((a, b) => {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    })[0].id;
  }, [attempts]);

  // 2. Fetch Session
  const { data: attempt, isLoading: isAttemptLoading, error: attemptError } = useTaskAttemptWithSession(latestAttemptId);

  const isLoading = isAttemptsLoading || (latestAttemptId && isAttemptLoading);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {isLoading ? (
        <div className="relative w-full max-w-4xl h-full bg-background border-l shadow-2xl flex items-center justify-center animate-in slide-in-from-right duration-300">
          <Loader message="Loading task details..." />
        </div>
      ) : attemptError ? (
        <div className="relative w-full max-w-4xl h-full bg-background border-l shadow-2xl p-4 animate-in slide-in-from-right duration-300">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load task attempt. {attemptError.message}
            </AlertDescription>
          </Alert>
          <Button variant="outline" className="mt-4" onClick={onClose}>Close</Button>
        </div>
      ) : !latestAttemptId ? (
        <div className="relative w-full max-w-4xl h-full bg-background border-l shadow-2xl p-8 text-center text-muted-foreground animate-in slide-in-from-right duration-300">
           No activity found for this task yet.
           <Button variant="outline" className="mt-4 block mx-auto" onClick={onClose}>Close</Button>
        </div>
      ) : (
        <GitOperationsProvider attemptId={latestAttemptId}>
          <ClickedElementsProvider attempt={attempt}>
            <ReviewProvider attemptId={latestAttemptId}>
              <ExecutionProcessesProvider
                attemptId={latestAttemptId}
                sessionId={attempt?.session?.id}
              >
                <TaskDetailContent 
                  task={task} 
                  attempt={attempt ?? null} 
                  onClose={onClose} 
                />
              </ExecutionProcessesProvider>
            </ReviewProvider>
          </ClickedElementsProvider>
        </GitOperationsProvider>
      )}
    </div>
  );
}
