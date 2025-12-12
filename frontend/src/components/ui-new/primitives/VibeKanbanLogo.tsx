import { cn } from '@/lib/utils';

interface VibeKanbanLogoProps {
  className?: string;
}

/**
 * Vibe Kanban logo icon - a snowflake/asterisk pattern
 * Used in the SessionChatBox header to indicate session/diff context
 */
export function VibeKanbanLogo({ className }: VibeKanbanLogoProps) {
  return (
    <svg
      width="10"
      height="12"
      viewBox="0 0 10 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-low', className)}
    >
      {/* Vertical line */}
      <line
        x1="5"
        y1="0"
        x2="5"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Top-left diagonal */}
      <line
        x1="5"
        y1="6"
        x2="1"
        y2="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Top-right diagonal */}
      <line
        x1="5"
        y1="6"
        x2="9"
        y2="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Bottom-left diagonal */}
      <line
        x1="5"
        y1="6"
        x2="1"
        y2="10"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Bottom-right diagonal */}
      <line
        x1="5"
        y1="6"
        x2="9"
        y2="10"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
