import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { NewCardContent } from '@/components/ui/new-card';
import MarkdownRenderer from '@/components/ui/markdown-renderer';

interface SharedTaskPanelProps {
  task: SharedTaskRecord;
}

const SharedTaskPanel = ({ task }: SharedTaskPanelProps) => {
  return (
    <NewCardContent>
      <div className="p-6 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold leading-tight break-words">
              {task.title}
            </h1>
          </div>
        </div>
        {task.description ? (
          <MarkdownRenderer content={task.description} />
        ) : null}
      </div>
    </NewCardContent>
  );
};

export default SharedTaskPanel;
