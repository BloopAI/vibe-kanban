import { useEffect, useState } from 'react';
import { TaskDetailsHeader } from './TaskDetailsHeader';
import { TaskFollowUpSection } from './TaskFollowUpSection';
import { EditorSelectionDialog } from './EditorSelectionDialog';
import {
  getBackdropClasses,
  getTaskPanelClasses,
} from '@/lib/responsive-config';
import type { TaskWithAttemptStatus } from 'shared/types';
import DiffTab from '@/components/tasks/TaskDetails/DiffTab.tsx';
import LogsTab from '@/components/tasks/TaskDetails/LogsTab.tsx';
import DeleteFileConfirmationDialog from '@/components/tasks/DeleteFileConfirmationDialog.tsx';
import TabNavigation from '@/components/tasks/TaskDetails/TabNavigation.tsx';
import CollapsibleToolbar from '@/components/tasks/TaskDetails/CollapsibleToolbar.tsx';
import TaskDetailsProvider from '../context/TaskDetailsContextProvider.tsx';

interface TaskDetailsPanelProps {
  task: TaskWithAttemptStatus | null;
  projectHasDevScript?: boolean;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onEditTask?: (task: TaskWithAttemptStatus) => void;
  onDeleteTask?: (taskId: string) => void;
  isDialogOpen?: boolean;
}

export function TaskDetailsPanel({
  task,
  projectHasDevScript,
  projectId,
  isOpen,
  onClose,
  onEditTask,
  onDeleteTask,
  isDialogOpen = false,
}: TaskDetailsPanelProps) {
  const [showEditorDialog, setShowEditorDialog] = useState(false);

  // Tab and collapsible state
  const [activeTab, setActiveTab] = useState<'logs' | 'diffs'>('logs');
  const [userSelectedTab, setUserSelectedTab] = useState<boolean>(false);

  // Reset to logs tab when task changes
  useEffect(() => {
    if (task?.id) {
      setActiveTab('logs');
      setUserSelectedTab(true); // Treat this as a user selection to prevent auto-switching
    }
  }, [task?.id]);

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

  return (
    <>
      {!task || !isOpen ? null : (
        <TaskDetailsProvider
          task={task}
          projectId={projectId}
          setShowEditorDialog={setShowEditorDialog}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isOpen={isOpen}
          userSelectedTab={userSelectedTab}
        >
          {/* Backdrop - only on smaller screens (overlay mode) */}
          <div className={getBackdropClasses()} onClick={onClose} />

          {/* Panel */}
          <div className={getTaskPanelClasses()}>
            <div className="flex flex-col h-full">
              <TaskDetailsHeader
                onClose={onClose}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
              />

              <CollapsibleToolbar projectHasDevScript={projectHasDevScript} />

              <TabNavigation
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                setUserSelectedTab={setUserSelectedTab}
              />

              {/* Tab Content */}
              <div
                className={`flex-1 flex flex-col min-h-0 ${activeTab === 'logs' ? 'p-4' : 'pt-4'}`}
              >
                {activeTab === 'diffs' ? <DiffTab /> : <LogsTab />}
              </div>

              <TaskFollowUpSection />
            </div>
          </div>

          <EditorSelectionDialog
            isOpen={showEditorDialog}
            onClose={() => setShowEditorDialog(false)}
          />

          <DeleteFileConfirmationDialog />
        </TaskDetailsProvider>
      )}
    </>
  );
}
