import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { FunnelIcon, CaretDownIcon, type Icon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { IssuePriority } from 'shared/remote-types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui-new/primitives/Dropdown';
import { Badge } from '@/components/ui/badge';
import { PriorityIcon } from './Icons';

// =============================================================================
// Multi-Select Dropdown (Generic)
// =============================================================================

export interface MultiSelectDropdownOption<T extends string = string> {
  value: T;
  label: string;
  renderOption?: () => ReactNode;
}

export interface MultiSelectDropdownProps<T extends string = string> {
  values: T[];
  options: MultiSelectDropdownOption<T>[];
  onChange: (values: T[]) => void;
  icon: Icon;
  label: string;
  menuLabel?: string;
  disabled?: boolean;
}

export function MultiSelectDropdown<T extends string = string>({
  values,
  options,
  onChange,
  icon: IconComponent,
  label,
  menuLabel,
  disabled,
}: MultiSelectDropdownProps<T>) {
  const toggleValue = useCallback(
    (value: T) => {
      const newValues = values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value];
      onChange(newValues);
    },
    [values, onChange]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex items-center gap-half px-base py-half bg-panel rounded-sm',
            'text-sm text-normal hover:bg-secondary transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <IconComponent className="size-icon-xs" weight="bold" />
          <span>{label}</span>
          {values.length > 0 && (
            <Badge
              variant="secondary"
              className="px-1.5 py-0 text-xs h-5 min-w-5 justify-center bg-brand text-on-brand border-none"
            >
              {values.length}
            </Badge>
          )}
          <CaretDownIcon className="size-icon-2xs text-low" weight="bold" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {menuLabel && (
          <>
            <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={values.includes(option.value)}
            onCheckedChange={() => toggleValue(option.value)}
          >
            {option.renderOption?.() ?? option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =============================================================================
// Priority Filter Dropdown (Multi-Select)
// =============================================================================

const PRIORITIES: IssuePriority[] = ['urgent', 'high', 'medium', 'low'];

const priorityLabels: Record<IssuePriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export interface PriorityFilterDropdownProps {
  values: IssuePriority[];
  onChange: (values: IssuePriority[]) => void;
}

export function PriorityFilterDropdown({
  values,
  onChange,
}: PriorityFilterDropdownProps) {
  const { t } = useTranslation('common');

  const options = PRIORITIES.map((p) => ({
    value: p,
    label: priorityLabels[p],
    renderOption: () => (
      <div className="flex items-center gap-base">
        <PriorityIcon priority={p} />
        {priorityLabels[p]}
      </div>
    ),
  }));

  return (
    <MultiSelectDropdown
      values={values}
      options={options}
      onChange={onChange}
      icon={FunnelIcon}
      label={t('kanban.priority', 'Priority')}
      menuLabel={t('kanban.filterByPriority', 'Filter by priority')}
    />
  );
}
