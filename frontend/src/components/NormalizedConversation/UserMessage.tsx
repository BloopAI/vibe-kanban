import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Button } from '@/components/ui/button';
import { Pencil, Send, X } from 'lucide-react';
import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useProcessRetry } from '@/hooks/useProcessRetry';
import { TaskAttempt, type BaseAgentCapability } from 'shared/types';
import { useUserSystem } from '@/components/config-provider';

const UserMessage = ({
  content,
  executionProcessId,
  taskAttempt,
}: {
  content: string;
  executionProcessId?: string;
  taskAttempt?: TaskAttempt;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const retryHook = useProcessRetry(taskAttempt);
  const { capabilities } = useUserSystem();

  const canFork = !!(
    taskAttempt?.executor &&
    capabilities?.[taskAttempt.executor]?.includes(
      'SESSION_FORK' as BaseAgentCapability
    )
  );

  const handleEdit = () => {
    if (!executionProcessId) return;
    retryHook?.retryProcess(executionProcessId, editContent).then(() => {
      setIsEditing(false);
    });
  };

  return (
    <div className="py-2">
      <div className="bg-background px-4 py-2 text-sm border-y border-dashed flex gap-2">
        <div className="flex-1">
          {isEditing ? (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
            />
          ) : (
            <MarkdownRenderer
              content={content}
              className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light py-3"
            />
          )}
        </div>
        {executionProcessId && canFork && (
          <div className="flex flex-col">
            <Button
              onClick={() => setIsEditing(!isEditing)}
              variant="ghost"
              className="p-2"
            >
              {isEditing ? (
                <X className="w-3 h-3" />
              ) : (
                <Pencil className="w-3 h-3" />
              )}
            </Button>
            {isEditing && (
              <Button onClick={handleEdit} variant="ghost" className="p-2">
                <Send className="w-3 h-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserMessage;
