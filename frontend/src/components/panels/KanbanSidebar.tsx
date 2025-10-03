import { useState } from 'react';
import TaskAttemptPanel from './TaskAttemptPanel';
import TaskPanel from './TaskPanel';
import { NewCard, NewCardContent, NewCardHeader } from '../ui/new-card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '../ui/breadcrumb';
import ResponsiveSidebar from './ResponsiveSidebar';
import type { TaskWithAttemptStatus } from 'shared/types';

type Panels = 'task' | 'task-attempt';

interface KanbanSidebarProps {
  selectedTask: TaskWithAttemptStatus | null;
}

const KanbanSidebar = ({ selectedTask }: KanbanSidebarProps) => {
  const [panel, setPanel] = useState<Panels>('task');

  return (
    <ResponsiveSidebar>
      <NewCard className="bg-background h-full">
        <NewCardHeader>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Task</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/components">Task Attempt</BreadcrumbLink>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </NewCardHeader>
        <NewCardContent>
          {panel === 'task' ? (
            <TaskPanel task={selectedTask} />
          ) : (
            <TaskAttemptPanel />
          )}
        </NewCardContent>
      </NewCard>
    </ResponsiveSidebar>
  );
};

export default KanbanSidebar;
