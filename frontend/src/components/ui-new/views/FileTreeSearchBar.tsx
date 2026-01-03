import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon } from '@phosphor-icons/react';
import { InputField } from '../primitives/InputField';

interface FileTreeSearchBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  isAllExpanded: boolean;
  onToggleExpandAll: () => void;
  className?: string;
}

export function FileTreeSearchBar({
  searchQuery,
  onSearchChange,
  isAllExpanded,
  onToggleExpandAll,
  className,
}: FileTreeSearchBarProps) {
  const ExpandIcon = isAllExpanded ? ArrowsInSimpleIcon : ArrowsOutSimpleIcon;

  return (
    <InputField
      value={searchQuery}
      onChange={onSearchChange}
      placeholder="Filter files..."
      variant="search"
      actionIcon={ExpandIcon}
      onAction={onToggleExpandAll}
      className={className}
    />
  );
}
