import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import {
  ChartBarIcon,
  SparkleIcon,
  ArrowsDownUpIcon,
} from '@phosphor-icons/react';
import { defineModal } from '@/lib/modals';
import { cn } from '@/lib/utils';

export interface PrioritizeTasksDialogProps {
  projectId?: string;
  taskCount?: number;
}

export type PrioritizeTasksResult = 'prioritized' | 'canceled';

type PriorityMethod = 'ai' | 'impact' | 'urgency';

const priorityMethods: {
  value: PriorityMethod;
  label: string;
  description: string;
  icon: typeof ChartBarIcon;
}[] = [
  {
    value: 'ai',
    label: 'AI-Assisted',
    description: 'Use AI to analyze and prioritize based on context',
    icon: SparkleIcon,
  },
  {
    value: 'impact',
    label: 'By Impact',
    description: 'Prioritize by estimated business impact',
    icon: ChartBarIcon,
  },
  {
    value: 'urgency',
    label: 'By Urgency',
    description: 'Prioritize by deadline and time sensitivity',
    icon: ArrowsDownUpIcon,
  },
];

const PrioritizeTasksDialogImpl = NiceModal.create<PrioritizeTasksDialogProps>(
  (props) => {
    const modal = useModal();
    const { taskCount = 0 } = props;
    const [selectedMethod, setSelectedMethod] = useState<PriorityMethod>('ai');
    const [isPrioritizing, setIsPrioritizing] = useState(false);

    const handlePrioritize = async () => {
      setIsPrioritizing(true);
      try {
        // TODO: Implement actual prioritization logic
        console.log('Prioritizing tasks using method:', selectedMethod);

        // Simulate processing
        await new Promise((resolve) => setTimeout(resolve, 1500));

        modal.resolve('prioritized' as PrioritizeTasksResult);
        modal.hide();
      } catch (error) {
        console.error('Prioritization failed:', error);
      } finally {
        setIsPrioritizing(false);
      }
    };

    const handleCancel = () => {
      modal.resolve('canceled' as PrioritizeTasksResult);
      modal.hide();
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleCancel}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <ChartBarIcon className="h-6 w-6 text-brand" />
              <DialogTitle>Prioritize Tasks</DialogTitle>
            </div>
            <DialogDescription className="text-left pt-2">
              Automatically assign priorities to{' '}
              {taskCount > 0 ? `${taskCount} tasks` : 'your tasks'}.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <label className="text-sm font-medium mb-3 block">
              Prioritization Method
            </label>
            <div className="space-y-2">
              {priorityMethods.map(
                ({ value, label, description, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectedMethod(value)}
                    className={cn(
                      'w-full flex items-start gap-3 p-3 rounded-md border text-left',
                      'transition-colors duration-150',
                      selectedMethod === value
                        ? 'border-brand bg-brand/10'
                        : 'border-input hover:border-brand/50 hover:bg-muted/50'
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-icon-base mt-0.5',
                        selectedMethod === value
                          ? 'text-brand'
                          : 'text-muted-foreground'
                      )}
                    />
                    <div className="flex-1">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          selectedMethod === value && 'text-brand'
                        )}
                      >
                        {label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </button>
                )
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handlePrioritize} disabled={isPrioritizing}>
              {isPrioritizing ? 'Prioritizing...' : 'Apply Priorities'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const PrioritizeTasksDialog = defineModal<
  PrioritizeTasksDialogProps,
  PrioritizeTasksResult
>(PrioritizeTasksDialogImpl);
