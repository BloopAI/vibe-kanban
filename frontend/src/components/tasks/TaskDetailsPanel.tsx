import { useEffect, useState } from 'react';
import TaskDetailsHeader from './TaskDetailsHeader';
import { TaskFollowUpSection } from './TaskFollowUpSection';
import { EditorSelectionDialog } from './EditorSelectionDialog';
import { TaskTitleDescription } from './TaskDetails/TaskTitleDescription';
import type { TaskAttempt } from 'shared/types';
import {
  getBackdropClasses,
  getTaskPanelClasses,
  getTaskPanelInnerClasses,
} from '@/lib/responsive-config';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { TabType } from '@/types/tabs';
import DiffTab from '@/components/tasks/TaskDetails/DiffTab.tsx';
import LogsTab from '@/components/tasks/TaskDetails/LogsTab.tsx';
import ProcessesTab from '@/components/tasks/TaskDetails/ProcessesTab.tsx';
import DeleteFileConfirmationDialog from '@/components/tasks/DeleteFileConfirmationDialog.tsx';
import TabNavigation from '@/components/tasks/TaskDetails/TabNavigation.tsx';
import TaskDetailsToolbar from './TaskDetailsToolbar.tsx';
import TodoPanel from '@/components/tasks/TodoPanel';
import { TabNavContext } from '@/contexts/TabNavigationContext';
import { ProcessSelectionProvider } from '@/contexts/ProcessSelectionContext';
import { AttemptHeaderCard } from './AttemptHeaderCard';
import { inIframe } from '@/vscode/bridge';

interface TaskDetailsPanelProps {
  task: TaskWithAttemptStatus | null;
  projectHasDevScript?: boolean;
  projectId: string;
  onClose: () => void;
  onEditTask?: (task: TaskWithAttemptStatus) => void;
  onDeleteTask?: (taskId: string) => void;
  isDialogOpen?: boolean;
  hideBackdrop?: boolean;
  className?: string;
  hideHeader?: boolean;
  isFullScreen?: boolean;
  setFullScreen?: (value: boolean) => void;
  forceCreateAttempt?: boolean;
  onLeaveForceCreateAttempt?: () => void;
  onNewAttempt?: () => void;
  selectedAttempt: TaskAttempt | null;
  attempts: TaskAttempt[];
  setSelectedAttempt: (attempt: TaskAttempt | null) => void;
}

export function TaskDetailsPanel({
  task,
  projectHasDevScript,
  projectId,
  onClose,
  onEditTask,
  onDeleteTask,
  isDialogOpen = false,
  hideBackdrop = false,
  className,
  isFullScreen,
  setFullScreen,
  forceCreateAttempt,
  onLeaveForceCreateAttempt,
  selectedAttempt,
  attempts,
  setSelectedAttempt,
}: TaskDetailsPanelProps) {
  // selectedAttempt now comes from AttemptContext for child components
  const [showEditorDialog, setShowEditorDialog] = useState(false);

  // Attempt number, find the current attempt number
  const attemptNumber =
    attempts.length -
    attempts.findIndex((attempt) => attempt.id === selectedAttempt?.id);

  // Tab and collapsible state
  const [activeTab, setActiveTab] = useState<TabType>('logs');

  // Handler for jumping to diff tab in full screen
  const jumpToDiffFullScreen = () => {
    setFullScreen?.(true);
    setActiveTab('diffs');
  };

  // Reset to logs tab when task changes
  useEffect(() => {
    if (task?.id) {
      setActiveTab('logs');
    }
  }, [task?.id]);

  // Get selected attempt info for props
  // (now received as props instead of hook)

  // Handle ESC key locally to prevent global navigation
  useEffect(() => {
    if (isDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, isDialogOpen]);

  return (
    <>
      {!task ? null : (
        <TabNavContext.Provider value={{ activeTab, setActiveTab }}>
          <ProcessSelectionProvider>
            {/* Backdrop - only on smaller screens (overlay mode) */}
            {!hideBackdrop && (
              <div
                className={getBackdropClasses(isFullScreen || false)}
                onClick={onClose}
              />
            )}

            {/* Panel */}
            <div
              className={
                className || getTaskPanelClasses(isFullScreen || false)
              }
            >
              <div className={getTaskPanelInnerClasses()}>
                {!inIframe() && (
                  <TaskDetailsHeader
                    task={task}
                    onClose={onClose}
                    onEditTask={onEditTask}
                    onDeleteTask={onDeleteTask}
                    hideCloseButton={hideBackdrop}
                    isFullScreen={isFullScreen}
                    setFullScreen={setFullScreen}
                  />
                )}

                {isFullScreen ? (
                  <div className="flex-1 min-h-0 flex">
                    {/* Sidebar */}
                    <aside
                      className={`w-[28rem] shrink-0 border-r overflow-y-auto ${inIframe() ? 'hidden' : ''}`}
                    >
                      {/* Fullscreen sidebar shows title and description above edit/delete */}
                      <div className="space-y-2 p-3">
                        <TaskTitleDescription task={task} />
                      </div>

                      {/* Current Attempt / Actions */}
                      <TaskDetailsToolbar
                        task={task}
                        projectId={projectId}
                        projectHasDevScript={projectHasDevScript}
                        forceCreateAttempt={forceCreateAttempt}
                        onLeaveForceCreateAttempt={onLeaveForceCreateAttempt}
                        attempts={attempts}
                        selectedAttempt={selectedAttempt}
                        setSelectedAttempt={setSelectedAttempt}
                        // hide actions in sidebar; moved to header in fullscreen
                      />

                      {/* Task Breakdown (TODOs) */}
                      <TodoPanel selectedAttempt={selectedAttempt} />
                    </aside>

                    {/* Main content */}
                    <main className="flex-1 min-h-0 min-w-0 flex flex-col">
                      <TabNavigation
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        selectedAttempt={selectedAttempt}
                      />

                      <div className="flex-1 flex flex-col min-h-0">
                        {activeTab === 'diffs' ? (
                          <DiffTab selectedAttempt={selectedAttempt} />
                        ) : activeTab === 'processes' ? (
                          <ProcessesTab attemptId={selectedAttempt?.id} />
                        ) : (
                          <LogsTab selectedAttempt={selectedAttempt} />
                        )}
                      </div>

                      <TaskFollowUpSection
                        task={task}
                        projectId={projectId}
                        selectedAttemptId={selectedAttempt?.id}
                        selectedAttemptProfile={selectedAttempt?.executor}
                      />
                    </main>
                  </div>
                ) : (
                  <>
                    {attempts.length === 0 ? (
                      <TaskDetailsToolbar
                        task={task}
                        projectId={projectId}
                        projectHasDevScript={projectHasDevScript}
                        forceCreateAttempt={forceCreateAttempt}
                        onLeaveForceCreateAttempt={onLeaveForceCreateAttempt}
                        attempts={attempts}
                        selectedAttempt={selectedAttempt}
                        setSelectedAttempt={setSelectedAttempt}
                        // hide actions in sidebar; moved to header in fullscreen
                      />
                    ) : (
                      <>
                        <AttemptHeaderCard
                          attemptNumber={attemptNumber}
                          totalAttempts={attempts.length}
                          selectedAttempt={selectedAttempt}
                          task={task}
                          projectId={projectId}
                          // onCreateNewAttempt={() => {
                          //   // TODO: Implement create new attempt
                          //   console.log('Create new attempt');
                          // }}
                          onJumpToDiffFullScreen={jumpToDiffFullScreen}
                        />

                        <LogsTab selectedAttempt={selectedAttempt} />

                        <TaskFollowUpSection
                          task={task}
                          projectId={projectId}
                          selectedAttemptId={selectedAttempt?.id}
                          selectedAttemptProfile={selectedAttempt?.executor}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            <EditorSelectionDialog
              isOpen={showEditorDialog}
              onClose={() => setShowEditorDialog(false)}
              selectedAttempt={selectedAttempt}
            />

            <DeleteFileConfirmationDialog
              task={task}
              projectId={projectId}
              selectedAttempt={selectedAttempt}
            />
          </ProcessSelectionProvider>
        </TabNavContext.Provider>
      )}
    </>
  );
}
