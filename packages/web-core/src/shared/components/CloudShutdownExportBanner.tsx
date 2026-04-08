import type { KeyboardEvent, MouseEvent } from 'react';

import { cn } from '@/shared/lib/utils';

interface CloudShutdownExportBannerProps {
  onClick: () => void;
}

export function CloudShutdownExportBanner({
  onClick,
}: CloudShutdownExportBannerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'w-full cursor-pointer border-b border-border bg-brand px-base py-half text-center',
        'text-sm font-medium text-on-brand hover:bg-brand-hover'
      )}
    >
      Vibe Kanban Cloud is shutting down. Export your data within 30 days.{' '}
      <a
        href="https://vibekanban.com/shutdown"
        target="_blank"
        rel="noreferrer"
        onClick={handleLinkClick}
        className="underline underline-offset-2"
      >
        Read more here.
      </a>
    </div>
  );
}
