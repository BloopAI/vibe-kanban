import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { TaskAttempt } from 'shared/types';

const UserMessage = ({
  content,
  taskAttempt,
}: {
  content: string;
  executionProcessId?: string;
  taskAttempt?: TaskAttempt;
}) => {
  return (
    <div className="py-2">
      <div className="group bg-background px-4 py-2 text-sm flex gap-2">
        <div className="flex-1 py-3">
          <WYSIWYGEditor
            value={content}
            disabled
            className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light"
            taskAttemptId={taskAttempt?.id}
          />
        </div>
      </div>
    </div>
  );
};

export default UserMessage;
