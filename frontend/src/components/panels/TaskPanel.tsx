import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '@/contexts/ProjectContext';
import { useWorkspacesStream } from '@/hooks/useWorkspacesStream';
import { useNavigateWithSearch } from '@/hooks';
import { paths } from '@/lib/paths';
import type { TaskWithAttemptStatus } from 'shared/types';
import { NewCardContent } from '../ui/new-card';
import { Button } from '../ui/button';
import { PlusIcon } from 'lucide-react';
import { CreateAttemptDialog } from '@/components/dialogs/tasks/CreateAttemptDialog';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { WorkspaceRow } from './WorkspaceRow';

interface TaskPanelProps {
  task: TaskWithAttemptStatus | null;
}

const TaskPanel = ({ task }: TaskPanelProps) => {
  const { t } = useTranslation('tasks');
  const navigate = useNavigateWithSearch();
  const { projectId } = useProject();

  const { workspaces: allWorkspaces } = useWorkspacesStream();

  const taskWorkspaces = useMemo(() => {
    if (!task?.id) return [];
    return allWorkspaces
      .filter((w) => w.task_id === task.id)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }, [allWorkspaces, task?.id]);

  const parentWorkspace = useMemo(() => {
    if (!task?.parent_workspace_id) return null;
    return allWorkspaces.find((w) => w.id === task.parent_workspace_id) ?? null;
  }, [allWorkspaces, task?.parent_workspace_id]);

  if (!task) {
    return (
      <div className="text-muted-foreground">
        {t('taskPanel.noTaskSelected')}
      </div>
    );
  }

  const titleContent = `# ${task.title || 'Task'}`;
  const descriptionContent = task.description || '';

  return (
    <>
      <NewCardContent>
        <div className="p-6 flex flex-col h-full max-h-[calc(100vh-8rem)]">
          <div className="space-y-3 overflow-y-auto flex-shrink min-h-0">
            <WYSIWYGEditor value={titleContent} disabled />
            {descriptionContent && (
              <WYSIWYGEditor value={descriptionContent} disabled />
            )}
          </div>

          <div className="mt-6 flex-shrink-0 space-y-4">
            {parentWorkspace && (
              <div>
                <div className="text-sm text-muted-foreground mb-2">
                  Parent Attempt
                </div>
                <WorkspaceRow
                  workspace={parentWorkspace}
                  onClick={() => {
                    if (projectId) {
                      navigate(
                        paths.attempt(
                          projectId,
                          parentWorkspace.task_id,
                          parentWorkspace.id
                        )
                      );
                    }
                  }}
                />
              </div>
            )}

            <div>
              <div className="w-full flex text-left mb-2">
                <span className="flex-1 text-sm text-muted-foreground">
                  {t('taskPanel.attemptsCount', {
                    count: taskWorkspaces.length,
                  })}
                </span>
                <span>
                  <Button
                    variant="icon"
                    onClick={() =>
                      CreateAttemptDialog.show({
                        taskId: task.id,
                      })
                    }
                  >
                    <PlusIcon size={16} />
                  </Button>
                </span>
              </div>
              {taskWorkspaces.length === 0 ? (
                <div className="text-muted-foreground">
                  {t('taskPanel.noAttempts')}
                </div>
              ) : (
                <div className="space-y-2">
                  {taskWorkspaces.map((workspace) => (
                    <WorkspaceRow
                      key={workspace.id}
                      workspace={workspace}
                      onClick={() => {
                        if (projectId && task.id) {
                          navigate(
                            paths.attempt(projectId, task.id, workspace.id)
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </NewCardContent>
    </>
  );
};

export default TaskPanel;
