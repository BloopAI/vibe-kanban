import { cn } from '@/shared/lib/utils';

interface CloudShutdownExportBannerProps {
  onClick: () => void;
}

export function CloudShutdownExportBanner({
  onClick,
}: CloudShutdownExportBannerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full border-b border-border bg-brand px-base py-half text-center',
        'text-sm font-medium text-on-brand hover:bg-brand-hover'
      )}
    >
      Vibe Kanban Cloud is shutting down. Export your data within 30 days.
    </button>
  );
}
