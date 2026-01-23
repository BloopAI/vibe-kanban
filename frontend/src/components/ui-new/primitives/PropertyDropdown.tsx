import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CaretDownIcon, type Icon } from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui-new/primitives/Dropdown';

export interface PropertyDropdownOption<T extends string = string> {
  value: T;
  label: string;
  renderOption?: () => ReactNode;
}

export interface PropertyDropdownProps<T extends string = string> {
  value: T;
  options: PropertyDropdownOption<T>[];
  onChange: (value: T) => void;
  icon?: Icon;
  label?: string;
  disabled?: boolean;
}

export function PropertyDropdown<T extends string = string>({
  value,
  options,
  onChange,
  icon: IconComponent,
  label,
  disabled,
}: PropertyDropdownProps<T>) {
  const selectedOption = options.find((opt) => opt.value === value);

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
          {IconComponent ? (
            <>
              <IconComponent className="size-icon-xs" weight="bold" />
              {label && <span>{label}:</span>}
              <span>{selectedOption?.label}</span>
            </>
          ) : (
            (selectedOption?.renderOption?.() ?? selectedOption?.label)
          )}
          <CaretDownIcon className="size-icon-2xs text-low" weight="bold" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            {option.renderOption?.() ?? <span>{option.label}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
