import {
  BookOpenIcon,
  FolderIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export type MigrationStep =
  | 'introduction'
  | 'choose-projects'
  | 'migrate'
  | 'finish';

interface MigrateSidebarProps {
  currentStep: MigrationStep;
  onStepChange: (step: MigrationStep) => void;
}

const steps: Array<{
  id: MigrationStep;
  label: string;
  icon: typeof BookOpenIcon;
}> = [
  { id: 'introduction', label: 'Introduction', icon: BookOpenIcon },
  { id: 'choose-projects', label: 'Choose projects', icon: FolderIcon },
  { id: 'migrate', label: 'Migrate', icon: CloudArrowUpIcon },
  { id: 'finish', label: 'Finish', icon: CheckCircleIcon },
];

export function MigrateSidebar({
  currentStep,
  onStepChange,
}: MigrateSidebarProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="w-64 bg-secondary shrink-0 h-full flex flex-col border-r">
      {/* Header */}
      <div className="p-base border-b">
        <h2 className="text-lg font-medium text-high">Migration</h2>
        <p className="text-sm text-low">Upgrade to cloud projects</p>
      </div>

      {/* Navigation steps */}
      <nav className="flex-1 py-base">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isPast = currentIndex > index;
          const isDisabled = !isActive && !isPast;

          return (
            <button
              key={step.id}
              onClick={() => !isDisabled && onStepChange(step.id)}
              disabled={isDisabled}
              className={cn(
                'w-full flex items-center gap-base px-base py-half text-sm transition-colors',
                isActive
                  ? 'text-high bg-panel border-l-2 border-brand'
                  : isPast
                    ? 'text-normal hover:text-high hover:bg-panel/50 cursor-pointer border-l-2 border-transparent'
                    : 'text-low cursor-not-allowed opacity-50 border-l-2 border-transparent'
              )}
            >
              <Icon
                className={cn(
                  'size-icon-sm shrink-0',
                  isActive ? 'text-brand' : isPast ? 'text-success' : ''
                )}
                weight={isActive ? 'fill' : 'regular'}
              />
              <span>{step.label}</span>
              {isPast && (
                <CheckCircleIcon
                  className="ml-auto size-icon-xs text-success"
                  weight="fill"
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
