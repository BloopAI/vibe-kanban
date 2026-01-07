import { CaretLeftIcon } from '@phosphor-icons/react';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from './Command';
import type { ActionDefinition } from '../actions';
import type { ResolvedGroup, ResolvedGroupItem } from '../actions/pages';

// Resolved page structure with pre-processed groups
interface ResolvedCommandBarPage {
  id: string;
  title?: string;
  groups: ResolvedGroup[];
}

interface CommandBarProps {
  // Resolved page with groups already processed
  page: ResolvedCommandBarPage;
  // Whether back navigation is available
  canGoBack: boolean;
  // Called when user clicks back
  onGoBack: () => void;
  // Called when user selects an item (action or page)
  onSelect: (item: ResolvedGroupItem) => void;
  // Get resolved label for an action
  getLabel: (action: ActionDefinition) => string;
  // Controlled search value
  search: string;
  // Called when search changes
  onSearchChange: (search: string) => void;
}

export function CommandBar({
  page,
  canGoBack,
  onGoBack,
  onSelect,
  getLabel,
  search,
  onSearchChange,
}: CommandBarProps) {
  return (
    <Command
      className="rounded-sm border border-border"
      loop
      filter={(value, search) => {
        // Always show the back option
        if (value === '__back__') return 1;
        // Default filtering for other items
        if (value.toLowerCase().includes(search.toLowerCase())) return 1;
        return 0;
      }}
    >
      <div className="flex items-center border-b border-border">
        <CommandInput
          placeholder={page.title || 'Type a command or search...'}
          value={search}
          onValueChange={onSearchChange}
        />
      </div>
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {canGoBack && !search && (
          <CommandGroup>
            <CommandItem value="__back__" onSelect={onGoBack}>
              <CaretLeftIcon className="h-4 w-4" weight="bold" />
              <span>Back</span>
            </CommandItem>
          </CommandGroup>
        )}
        {/* Render groups directly - order is explicit from page definition */}
        {page.groups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => {
              if (item.type === 'page') {
                const IconComponent = item.icon;
                return (
                  <CommandItem
                    key={item.pageId}
                    value={item.pageId}
                    onSelect={() => onSelect(item)}
                  >
                    <IconComponent className="h-4 w-4" weight="regular" />
                    <span>{item.label}</span>
                  </CommandItem>
                );
              } else if (item.type === 'action') {
                const IconComponent = item.action.icon;
                const label = getLabel(item.action);
                return (
                  <CommandItem
                    key={item.action.id}
                    value={`${item.action.id} ${label}`}
                    onSelect={() => onSelect(item)}
                    className={
                      item.action.variant === 'destructive'
                        ? 'text-error'
                        : undefined
                    }
                  >
                    <IconComponent className="h-4 w-4" weight="regular" />
                    <span>{label}</span>
                    {item.action.shortcut && (
                      <CommandShortcut>{item.action.shortcut}</CommandShortcut>
                    )}
                  </CommandItem>
                );
              }
              return null;
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
