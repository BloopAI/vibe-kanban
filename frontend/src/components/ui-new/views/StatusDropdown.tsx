import type { ProjectStatus } from 'shared/remote-types';
import { cn } from '@/lib/utils';
import { StatusDot } from '@/components/ui-new/primitives/StatusDot';

export interface StatusDropdownProps {
  statusId: string;
  statuses: ProjectStatus[];
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Status trigger button that displays the current status and opens
 * the ChangeStatusDialog when clicked.
 */
export function StatusDropdown({
  statusId,
  statuses,
  onClick,
  disabled,
}: StatusDropdownProps) {
  const currentStatus = statuses.find((s) => s.id === statusId);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-base px-base py-half bg-panel rounded-sm',
        'text-sm text-normal hover:bg-secondary transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      <StatusDot color={currentStatus?.color ?? '0 0% 50%'} />
      {currentStatus?.name ?? 'Select status'}
    </button>
  );
}
