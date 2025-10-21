// VS Code webview integration - install keyboard/clipboard bridge
import '@/vscode/bridge';

import { useParams } from 'react-router-dom';
import { AppWithStyleOverride } from '@/utils/style-override';
import { WebviewContextMenu } from '@/vscode/ContextMenu';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { Logo } from '@/components/logo';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';

export function FullAttemptLogsPage() {
  const {
    projectId = '',
    taskId = '',
    attemptId = '',
  } = useParams<{
    projectId: string;
    taskId: string;
    attemptId: string;
  }>();

  const { data: attempt } = useTaskAttempt(attemptId);
  const { tasksById } = useProjectTasks(projectId);
  const task = taskId ? (tasksById[taskId] ?? null) : null;

  return (
    <AppWithStyleOverride>
      <div className="h-screen flex flex-col bg-background">
        <WebviewContextMenu />

        <header className="h-12 border-b flex items-center px-4 shrink-0">
          <Logo />
        </header>

        <main className="flex-1 min-h-0">
          {attempt ? (
            <ClickedElementsProvider attempt={attempt}>
              <ReviewProvider key={attempt.id}>
                <ExecutionProcessesProvider
                  key={attempt.id}
                  attemptId={attempt.id}
                >
                  <TaskAttemptPanel attempt={attempt} task={task}>
                    {({ logs, followUp }) => (
                      <div className="h-full flex flex-col">
                        <div className="flex-1 min-h-0">{logs}</div>
                        <div className="border-t shrink-0">
                          <div className="mx-auto w-full max-w-[50rem]">
                            {followUp}
                          </div>
                        </div>
                      </div>
                    )}
                  </TaskAttemptPanel>
                </ExecutionProcessesProvider>
              </ReviewProvider>
            </ClickedElementsProvider>
          ) : (
            <TaskAttemptPanel attempt={attempt} task={task}>
              {({ logs, followUp }) => (
                <div className="h-full flex flex-col">
                  <div className="flex-1 min-h-0">{logs}</div>
                  <div className="border-t shrink-0">
                    <div className="mx-auto w-full max-w-[50rem]">
                      {followUp}
                    </div>
                  </div>
                </div>
              )}
            </TaskAttemptPanel>
          )}
        </main>
      </div>
    </AppWithStyleOverride>
  );
}
