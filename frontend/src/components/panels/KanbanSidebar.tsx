import { useState } from 'react';
import TaskAttemptPanel from './TaskAttemptPanel';
import TaskPanel from './TaskPanel';
import { NewCard, NewCardHeader } from '../ui/new-card';
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
      <NewCard>
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
      </NewCard>
      {panel === 'task' ? <TaskPanel /> : <TaskAttemptPanel />}
    </ResponsiveSidebar>
  );
};

export default KanbanSidebar;
