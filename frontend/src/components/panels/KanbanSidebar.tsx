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

type Panels = 'task' | 'task-attempt';

// Kanban sidebar state is managed internally
const KanbanSidebar = () => {
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
          {panel === 'task' ? <TaskPanel /> : <TaskAttemptPanel />}
        </NewCardContent>
      </NewCard>
    </ResponsiveSidebar>
  );
};

export default KanbanSidebar;
