import type { IssuePriority } from 'shared/remote-types';
import {
  PropertyDropdown,
  type PropertyDropdownOption,
} from '@/components/ui-new/primitives/PropertyDropdown';
import { PriorityIcon } from '@/components/ui-new/primitives/PriorityIcon';

const PRIORITIES: IssuePriority[] = ['urgent', 'high', 'medium', 'low'];

const priorityLabels: Record<IssuePriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export interface PriorityDropdownProps {
  priority: IssuePriority;
  onChange: (priority: IssuePriority) => void;
  disabled?: boolean;
}

export function PriorityDropdown({
  priority,
  onChange,
  disabled,
}: PriorityDropdownProps) {
  const options: PropertyDropdownOption<IssuePriority>[] = PRIORITIES.map(
    (p) => ({
      value: p,
      label: priorityLabels[p],
      renderOption: () => (
        <div className="flex items-center gap-base">
          <PriorityIcon priority={p} />
          {priorityLabels[p]}
        </div>
      ),
    })
  );

  return (
    <PropertyDropdown
      value={priority}
      options={options}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
