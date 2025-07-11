import { memo, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import TaskDetailsToolbar from '@/components/tasks/TaskDetailsToolbar.tsx';

function CollapsibleToolbar() {
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  return (
    <div className="border-b">
      <div className="px-4 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Task Details
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsHeaderCollapsed((prev) => !prev)}
          className="h-6 w-6 p-0"
        >
          {isHeaderCollapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>
      </div>
      {!isHeaderCollapsed && <TaskDetailsToolbar />}
    </div>
  );
}

export default memo(CollapsibleToolbar);
