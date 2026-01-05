import { useTranslation } from 'react-i18next';
import { useTaskDiscoveryItem, useTaskFeedback } from '@/hooks/useDiscovery';
import type { TaskWithAttemptStatus, DiscoveryItem, FeedbackEntry } from 'shared/types';
import { NewCardContent } from '../ui/new-card';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { Badge } from '../ui/badge';
import { FileText, MessageSquare, Lightbulb, ClipboardList } from 'lucide-react';

interface DiscoveryTabProps {
  task: TaskWithAttemptStatus | null;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500',
  refining: 'bg-blue-500',
  ready: 'bg-green-500',
  promoted: 'bg-purple-500',
  archived: 'bg-gray-400',
};

const typeIcons: Record<string, React.ReactNode> = {
  scenario: <FileText size={14} />,
  spec: <ClipboardList size={14} />,
  story: <Lightbulb size={14} />,
  spike: <MessageSquare size={14} />,
};

const feedbackTypeColors: Record<string, string> = {
  execution: 'bg-blue-500',
  deploy: 'bg-green-500',
  user: 'bg-purple-500',
  system: 'bg-gray-500',
};

const DiscoveryTab = ({ task }: DiscoveryTabProps) => {
  const { t } = useTranslation('tasks');

  const {
    data: discoveryItem,
    isLoading: isDiscoveryLoading,
  } = useTaskDiscoveryItem(task?.id);

  const {
    data: feedback = [],
    isLoading: isFeedbackLoading,
  } = useTaskFeedback(task?.id);

  if (!task) {
    return (
      <div className="text-muted-foreground p-4">
        No task selected
      </div>
    );
  }

  if (isDiscoveryLoading || isFeedbackLoading) {
    return (
      <div className="text-muted-foreground p-4">
        Loading discovery context...
      </div>
    );
  }

  const hasDiscoveryContext = discoveryItem || feedback.length > 0;

  if (!hasDiscoveryContext) {
    return (
      <NewCardContent>
        <div className="p-6 text-muted-foreground text-center">
          <Lightbulb size={32} className="mx-auto mb-2 opacity-50" />
          <p>No discovery context for this task.</p>
          <p className="text-sm mt-1">
            Tasks created from Discovery items will show their original context here.
          </p>
        </div>
      </NewCardContent>
    );
  }

  return (
    <NewCardContent>
      <div className="p-6 space-y-6 max-h-[calc(100vh-8rem)] overflow-y-auto">
        {/* Discovery Item Section */}
        {discoveryItem && (
          <DiscoveryItemCard item={discoveryItem} />
        )}

        {/* Feedback Section */}
        {feedback.length > 0 && (
          <FeedbackSection feedback={feedback} />
        )}
      </div>
    </NewCardContent>
  );
};

const DiscoveryItemCard = ({ item }: { item: DiscoveryItem }) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{typeIcons[item.item_type]}</span>
        <h3 className="font-semibold">Discovery Context</h3>
        <Badge className={`${statusColors[item.status]} text-white text-xs`}>
          {item.status}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {item.item_type}
        </Badge>
      </div>

      <div className="border rounded-md p-4 bg-muted/30">
        <h4 className="font-medium mb-2">{item.title}</h4>

        {item.content && (
          <div className="prose prose-sm dark:prose-invert">
            <WYSIWYGEditor value={item.content} disabled />
          </div>
        )}

        {item.acceptance_criteria && (
          <div className="mt-4">
            <h5 className="text-sm font-medium text-muted-foreground mb-1">
              Acceptance Criteria
            </h5>
            <div className="prose prose-sm dark:prose-invert">
              <WYSIWYGEditor value={item.acceptance_criteria} disabled />
            </div>
          </div>
        )}

        {item.effort_estimate && (
          <div className="mt-4 text-sm text-muted-foreground">
            <span className="font-medium">Effort Estimate:</span>{' '}
            {item.effort_estimate}
          </div>
        )}
      </div>
    </div>
  );
};

const FeedbackSection = ({ feedback }: { feedback: FeedbackEntry[] }) => {
  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare size={14} className="text-muted-foreground" />
        <h3 className="font-semibold">Feedback & Learnings</h3>
        <Badge variant="outline" className="text-xs">
          {feedback.length}
        </Badge>
      </div>

      <div className="space-y-2">
        {feedback.map((entry) => (
          <div
            key={entry.id}
            className="border rounded-md p-3 bg-muted/30"
          >
            <div className="flex items-center gap-2 mb-2">
              <Badge className={`${feedbackTypeColors[entry.feedback_type]} text-white text-xs`}>
                {entry.feedback_type}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDate(entry.created_at)}
              </span>
            </div>

            {entry.summary && (
              <p className="text-sm font-medium mb-1">{entry.summary}</p>
            )}

            <div className="text-sm text-muted-foreground">
              <WYSIWYGEditor value={entry.content} disabled />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DiscoveryTab;
