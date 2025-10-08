import {
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
} from '@/components/ui/shadcn-io/kanban';
import { statusBoardColors, statusLabels } from '@/utils/status-labels';
import { ProjectSetupWizard } from './ProjectSetupWizard';
import type { Project } from 'shared/types';

interface ProjectSetupViewProps {
  project: Project;
  onCreateTask: () => void;
}

/**
 * ProjectSetupView displays an empty TODO kanban column alongside the project
 * setup wizard. This view is shown when a project has no tasks, providing
 * users with configuration options while making it clear they can immediately
 * start creating tasks via the "+" button.
 */
export function ProjectSetupView({
  project,
  onCreateTask,
}: ProjectSetupViewProps) {
  return (
    <div className="flex h-full gap-6">
      {/* Single TODO column - DnD disabled in empty state */}
      <div className="flex-shrink-0 w-80 border-r">
        <KanbanBoard id="todo">
          <KanbanHeader
            name={statusLabels.todo}
            color={statusBoardColors.todo}
            onAddTask={onCreateTask}
          />
          <KanbanCards />
        </KanbanBoard>
      </div>
      {/* Setup wizard on the right */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <ProjectSetupWizard project={project} />
      </div>
    </div>
  );
}
