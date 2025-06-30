import { useEffect, useRef, useCallback, useState } from 'react';
import { TaskDetailsHeader } from './TaskDetailsHeader';
import { TaskDetailsToolbar } from './TaskDetailsToolbar';
import { TaskActivityHistory } from './TaskActivityHistory';
import { TaskFollowUpSection } from './TaskFollowUpSection';
import { EditorSelectionDialog } from './EditorSelectionDialog';
import { useTaskDetails } from '@/hooks/useTaskDetails';
import {
  getTaskPanelClasses,
  getBackdropClasses,
} from '@/lib/responsive-config';
import type { TaskWithAttemptStatus, EditorType, Project } from 'shared/types';

interface TaskDetailsPanelProps {
  task: TaskWithAttemptStatus | null;
  project: Project | null;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onEditTask?: (task: TaskWithAttemptStatus) => void;
  onDeleteTask?: (taskId: string) => void;
  isDialogOpen?: boolean; // New prop to indicate if any dialog is open
}

export function TaskDetailsPanel({
  task,
  project,
  projectId,
  isOpen,
  onClose,
  onEditTask,
  onDeleteTask,
  isDialogOpen = false,
}: TaskDetailsPanelProps) {
  const [showEditorDialog, setShowEditorDialog] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Use the custom hook for all task details logic
  const {
    taskAttempts,
    selectedAttempt,
    attemptData,
    loading,
    selectedExecutor,
    isStopping,
    followUpMessage,
    isSendingFollowUp,
    followUpError,
    isStartingDevServer,
    devServerDetails,
    branches,
    selectedBranch,

    runningDevServer,
    isAttemptRunning,
    canSendFollowUp,
    processedDevServerLogs,
    setFollowUpMessage,
    setFollowUpError,
    setIsHoveringDevServer,
    handleAttemptChange,
    createNewAttempt,
    stopAllExecutions,
    startDevServer,
    stopDevServer,
    openInEditor,
    handleSendFollowUp,
  } = useTaskDetails(task, projectId, isOpen);

  // Handle ESC key locally to prevent global navigation
  useEffect(() => {
    if (!isOpen || isDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, isDialogOpen]);

  // Auto-scroll to bottom when activities or execution processes change
  useEffect(() => {
    if (shouldAutoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [attemptData.activities, attemptData.processes, shouldAutoScroll]);

  // Handle scroll events to detect manual scrolling
  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        scrollContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;

      if (isAtBottom && !shouldAutoScroll) {
        setShouldAutoScroll(true);
      } else if (!isAtBottom && shouldAutoScroll) {
        setShouldAutoScroll(false);
      }
    }
  }, [shouldAutoScroll]);

  const handleOpenInEditor = async (editorType?: EditorType) => {
    try {
      await openInEditor(editorType);
    } catch (err) {
      if (!editorType) {
        setShowEditorDialog(true);
      }
    }
  };

  if (!task) return null;

  return (
    <>
      {isOpen && (
        <>
          {/* Backdrop - only on smaller screens (overlay mode) */}
          <div className={getBackdropClasses()} onClick={onClose} />

          {/* Panel */}
          <div className={getTaskPanelClasses()}>
            <div className="flex flex-col h-full">
              {/* Header */}
              <TaskDetailsHeader
                task={task}
                onClose={onClose}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
              />

              {/* Toolbar */}
              <TaskDetailsToolbar
                task={task}
                project={project}
                projectId={projectId}
                selectedAttempt={selectedAttempt}
                taskAttempts={taskAttempts}
                isAttemptRunning={isAttemptRunning}
                isStopping={isStopping}
                selectedExecutor={selectedExecutor}
                runningDevServer={runningDevServer}
                isStartingDevServer={isStartingDevServer}
                devServerDetails={devServerDetails}
                processedDevServerLogs={processedDevServerLogs}
                branches={branches}
                selectedBranch={selectedBranch}
                onAttemptChange={handleAttemptChange}
                onCreateNewAttempt={createNewAttempt}
                onStopAllExecutions={stopAllExecutions}
                onStartDevServer={startDevServer}
                onStopDevServer={stopDevServer}
                onOpenInEditor={handleOpenInEditor}
                onSetIsHoveringDevServer={setIsHoveringDevServer}
              />

              {/* Content */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-6 space-y-6"
              >
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading...</p>
                  </div>
                ) : (
                  <TaskActivityHistory
                    selectedAttempt={selectedAttempt}
                    activities={attemptData.activities}
                    runningProcessDetails={attemptData.runningProcessDetails}
                  />
                )}
              </div>

              {/* Footer - Follow-up section */}
              {selectedAttempt && (
                <TaskFollowUpSection
                  followUpMessage={followUpMessage}
                  setFollowUpMessage={setFollowUpMessage}
                  isSendingFollowUp={isSendingFollowUp}
                  followUpError={followUpError}
                  setFollowUpError={setFollowUpError}
                  canSendFollowUp={canSendFollowUp}
                  projectId={projectId}
                  onSendFollowUp={handleSendFollowUp}
                />
              )}
            </div>
          </div>

          {/* Editor Selection Dialog */}
          <EditorSelectionDialog
            isOpen={showEditorDialog}
            onClose={() => setShowEditorDialog(false)}
            onSelectEditor={handleOpenInEditor}
          />
        </>
      )}
    </>
  );
}
