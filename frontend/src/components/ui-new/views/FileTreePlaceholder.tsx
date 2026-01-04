import { cn } from '@/lib/utils';

interface FileTreePlaceholderProps {
  className?: string;
}

export function FileTreePlaceholder({ className }: FileTreePlaceholderProps) {
  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col items-center justify-center text-low',
        className
      )}
    >
      <p className="text-base">File Tree</p>
    </div>
  );
}
