import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { tasksApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { cn } from '@/lib/utils';
import { Loader } from '@/components/ui/loader';

interface PmDocsPanelProps {
  pmTaskId: string | null | undefined;
  className?: string;
}

export function PmDocsPanel({ pmTaskId, className }: PmDocsPanelProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const [isExpanded, setIsExpanded] = useState(true);

  const {
    data: pmTask,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['pm-task', pmTaskId],
    queryFn: () => (pmTaskId ? tasksApi.getById(pmTaskId) : null),
    enabled: !!pmTaskId,
  });

  // Don't render if no PM task ID
  if (!pmTaskId) {
    return null;
  }

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  return (
    <div
      className={cn(
        'h-full flex flex-col bg-muted/30 border-r transition-all duration-200',
        isExpanded ? 'w-80' : 'w-10',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/50">
        {isExpanded && (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileText size={16} />
            <span>{t('tasks:pmDocs.title', 'PM Docs')}</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleExpanded}
          className={cn('h-6 w-6 p-0', !isExpanded && 'mx-auto')}
        >
          {isExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </Button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <Loader size={24} className="py-4" />
          ) : error ? (
            <div className="text-sm text-destructive p-2">
              {t('common:states.error')}
            </div>
          ) : pmTask ? (
            <div className="space-y-3">
              {/* PM Task Title */}
              <div className="text-sm font-medium border-b pb-2">
                {pmTask.title}
              </div>

              {/* PM Task Description (Requirements/Specs) */}
              {pmTask.description ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <WYSIWYGEditor value={pmTask.description} disabled />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  {t('tasks:pmDocs.noDescription', 'No documentation available')}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              {t('tasks:pmDocs.notFound', 'PM task not found')}
            </div>
          )}
        </div>
      )}

      {/* Collapsed state indicator */}
      {!isExpanded && (
        <div className="flex-1 flex items-center justify-center">
          <FileText size={16} className="text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
