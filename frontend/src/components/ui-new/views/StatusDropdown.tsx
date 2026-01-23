import type { ProjectStatus } from 'shared/remote-types';
import {
  PropertyDropdown,
  type PropertyDropdownOption,
} from '@/components/ui-new/primitives/PropertyDropdown';
import { StatusDot } from '@/components/ui-new/primitives/StatusDot';

export interface StatusDropdownProps {
  statusId: string;
  statuses: ProjectStatus[];
  onChange: (statusId: string) => void;
  disabled?: boolean;
}

export function StatusDropdown({
  statusId,
  statuses,
  onChange,
  disabled,
}: StatusDropdownProps) {
  const options: PropertyDropdownOption<string>[] = statuses.map((status) => ({
    value: status.id,
    label: status.name,
    renderOption: () => (
      <div className="flex items-center gap-base">
        <StatusDot color={status.color} />
        {status.name}
      </div>
    ),
  }));

  return (
    <PropertyDropdown
      value={statusId}
      options={options}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
