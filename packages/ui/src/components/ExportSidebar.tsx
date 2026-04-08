import {
  BookOpenIcon,
  FolderIcon,
  DownloadSimpleIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react';
import { cn } from '../lib/cn';

export type ExportStep =
  | 'introduction'
  | 'choose-projects'
  | 'download';

interface ExportSidebarProps {
  currentStep: ExportStep;
  onStepChange: (step: ExportStep) => void;
}

const steps: Array<{
  id: ExportStep;
  label: string;
  icon: typeof BookOpenIcon;
}> = [
  { id: 'introduction', label: 'Introduction', icon: BookOpenIcon },
  { id: 'choose-projects', label: 'Choose projects', icon: FolderIcon },
  { id: 'download', label: 'Download', icon: DownloadSimpleIcon },
];

export function ExportSidebar({
  currentStep,
  onStepChange,
}: ExportSidebarProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <nav className="grid gap-half sm:grid-cols-3">
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
              'w-full flex items-center gap-half rounded-sm border px-base py-half text-sm text-left transition-colors',
              isActive
                ? 'border-brand bg-brand/10 text-high'
                : isPast
                  ? 'border-border bg-secondary text-normal hover:bg-primary hover:text-high cursor-pointer'
                  : 'border-border bg-secondary text-low cursor-not-allowed opacity-50'
            )}
          >
            <Icon
              className={cn(
                'size-icon-sm shrink-0',
                isActive ? 'text-brand' : isPast ? 'text-success' : 'text-low'
              )}
              weight={isActive ? 'fill' : 'regular'}
            />
            <span className="truncate">{step.label}</span>
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
  );
}
