import { cn } from '@/lib/utils';

interface ChangesPanelProps {
  className?: string;
}

export function ChangesPanel({ className }: ChangesPanelProps) {
  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col items-center justify-center text-low',
        className
      )}
    >
      <p className="text-base">Changes</p>
    </div>
  );
}
