// VS Code webview integration - install keyboard/clipboard bridge
import '@/vscode/bridge';

import { useParams } from 'react-router-dom';
import { AppWithStyleOverride } from '@/utils/StyleOverride';
import { WebviewContextMenu } from '@/vscode/ContextMenu';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import { useTaskAttemptWithSession } from '@/hooks/useTaskAttempt';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { isElectronDesktopApp } from '@/utils/runtime';

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

  const { data: attempt } = useTaskAttemptWithSession(attemptId);
  const { tasksById } = useProjectTasks(projectId);
  const task = taskId ? (tasksById[taskId] ?? null) : null;
  const isElectronDesktop = isElectronDesktopApp();
  const electronTopInset = isElectronDesktop ? 40 : 0;

  return (
    <AppWithStyleOverride>
      <div
        className="relative flex flex-col bg-muted"
        style={{
          height: electronTopInset ? `calc(100vh - ${electronTopInset}px)` : '100vh',
          paddingTop: electronTopInset || undefined,
        }}
      >
        {isElectronDesktop ? (
          <div className="electron-drag-region absolute top-0 left-0 right-0 h-10" />
        ) : null}
        <WebviewContextMenu />

        <main className="flex-1 min-h-0">
          {attempt ? (
            <ClickedElementsProvider attempt={attempt}>
              <ReviewProvider key={attempt.id}>
                <ExecutionProcessesProvider
                  key={attempt.id}
                  attemptId={attempt.id}
                  sessionId={attempt.session?.id}
                >
                  <TaskAttemptPanel attempt={attempt} task={task}>
                    {({ logs, followUp }) => (
                      <div className="h-full min-h-0 flex flex-col">
                        <div className="flex-1 min-h-0 flex flex-col">
                          {logs}
                        </div>
                        <div className="min-h-0 max-h-[50%] border-t overflow-hidden">
                          <div className="mx-auto w-full max-w-[50rem] h-full min-h-0">
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
                <div className="h-full min-h-0 flex flex-col">
                  <div className="flex-1 min-h-0 flex flex-col">{logs}</div>
                  <div className="min-h-0 max-h-[50%] border-t overflow-hidden">
                    <div className="mx-auto w-full max-w-[50rem] h-full min-h-0">
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
