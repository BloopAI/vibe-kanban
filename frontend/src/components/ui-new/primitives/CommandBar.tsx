import {
  CaretLeftIcon,
  CopyIcon,
  FolderIcon,
  GitBranchIcon,
  ArrowFatLineUpIcon,
  ArrowUpIcon,
  MinusIcon,
  ArrowDownIcon,
  PlusIcon,
} from '@phosphor-icons/react';
import { useDeferredValue, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from './Command';
import type { ActionDefinition, ActionIcon } from '../actions';
import { isSpecialIcon } from '../actions';
import type {
  ResolvedGroup,
  ResolvedGroupItem,
  StatusItem,
} from '../actions/pages';
import { IdeIcon } from '@/components/ide/IdeIcon';

/**
 * Render an action icon, handling special icon types
 */
function ActionItemIcon({ icon }: { icon: ActionIcon }) {
  if (isSpecialIcon(icon)) {
    if (icon === 'ide-icon') {
      return <IdeIcon className="h-4 w-4" />;
    }
    if (icon === 'copy-icon') {
      return <CopyIcon className="h-4 w-4" weight="regular" />;
    }
  }
  // Regular phosphor icon
  const IconComponent = icon;
  return <IconComponent className="h-4 w-4" weight="regular" />;
}

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
  // Statuses for looking up issue status colors
  statuses?: StatusItem[];
}

const BRANCH_SEARCH_RESULT_LIMIT = 300;

export function CommandBar({
  page,
  canGoBack,
  onGoBack,
  onSelect,
  getLabel,
  search,
  onSearchChange,
  statuses = [],
}: CommandBarProps) {
  const { t } = useTranslation('common');
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;

  const filteredGroups = useMemo(() => {
    if (!isSearching) {
      return page.groups;
    }

    const isBranchSelectionPage = page.id === 'selectBranch';
    const groups: ResolvedGroup[] = [];
    let remainingBranchResults = BRANCH_SEARCH_RESULT_LIMIT;

    for (const group of page.groups) {
      const matchedItems: ResolvedGroupItem[] = [];

      for (const item of group.items) {
        const label = getItemSearchLabel(item, getLabel);
        if (!label) continue;
        if (!label.toLowerCase().includes(normalizedSearch)) continue;

        if (isBranchSelectionPage && item.type === 'branch') {
          if (remainingBranchResults <= 0) {
            continue;
          }
          remainingBranchResults -= 1;
        }

        matchedItems.push(item);
      }

      if (matchedItems.length > 0) {
        groups.push({
          label: group.label,
          items: matchedItems,
        });
      }

      if (isBranchSelectionPage && remainingBranchResults <= 0) {
        break;
      }
    }

    return groups;
  }, [isSearching, page.groups, page.id, normalizedSearch, getLabel]);

  return (
    <Command
      className="rounded-sm border border-border [&_[cmdk-group-heading]]:px-base [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-low [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-half [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-base [&_[cmdk-item]]:py-half"
      shouldFilter={false}
      loop
    >
      <div className="flex items-center border-b border-border">
        <CommandInput
          placeholder={page.title || t('commandBar.defaultPlaceholder')}
          value={search}
          onValueChange={onSearchChange}
        />
      </div>
      <CommandList>
        <CommandEmpty>{t('commandBar.noResults')}</CommandEmpty>
        {canGoBack && !search && (
          <CommandGroup>
            <CommandItem value="__back__" onSelect={onGoBack}>
              <CaretLeftIcon className="h-4 w-4" weight="bold" />
              <span>{t('commandBar.back')}</span>
            </CommandItem>
          </CommandGroup>
        )}
        {/* Render groups directly - order is explicit from page definition */}
        {filteredGroups.map((group) => (
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
              } else if (item.type === 'repo') {
                return (
                  <CommandItem
                    key={item.repo.id}
                    value={`${item.repo.id} ${item.repo.display_name}`}
                    onSelect={() => onSelect(item)}
                  >
                    <FolderIcon className="h-4 w-4" weight="regular" />
                    <span>{item.repo.display_name}</span>
                  </CommandItem>
                );
              } else if (item.type === 'branch') {
                return (
                  <CommandItem
                    key={item.branch.name}
                    value={item.branch.name}
                    onSelect={() => onSelect(item)}
                  >
                    <GitBranchIcon className="h-4 w-4" weight="regular" />
                    <span>{item.branch.name}</span>
                    {item.branch.isCurrent && (
                      <span className="ml-auto text-xs capitalize text-low">
                        {t('branchSelector.badges.current')}
                      </span>
                    )}
                  </CommandItem>
                );
              } else if (item.type === 'status') {
                return (
                  <CommandItem
                    key={item.status.id}
                    value={`${item.status.id} ${item.status.name}`}
                    onSelect={() => onSelect(item)}
                  >
                    <div
                      className="h-4 w-4 rounded-full shrink-0"
                      style={{ backgroundColor: `hsl(${item.status.color})` }}
                    />
                    <span>{item.status.name}</span>
                  </CommandItem>
                );
              } else if (item.type === 'priority') {
                const priorityConfig = {
                  urgent: {
                    icon: ArrowFatLineUpIcon,
                    colorClass: 'text-error',
                  },
                  high: { icon: ArrowUpIcon, colorClass: 'text-brand' },
                  medium: { icon: MinusIcon, colorClass: 'text-low' },
                  low: { icon: ArrowDownIcon, colorClass: 'text-success' },
                } as const;
                const config = item.priority.id
                  ? priorityConfig[item.priority.id]
                  : null;
                const IconComponent = config?.icon;
                return (
                  <CommandItem
                    key={item.priority.id ?? 'no-priority'}
                    value={`${item.priority.id ?? 'none'} ${item.priority.name}`}
                    onSelect={() => onSelect(item)}
                  >
                    {IconComponent && (
                      <IconComponent
                        className={`h-4 w-4 ${config?.colorClass}`}
                        weight="bold"
                      />
                    )}
                    <span>{item.priority.name}</span>
                  </CommandItem>
                );
              } else if (item.type === 'createSubIssue') {
                return (
                  <CommandItem
                    key="create-sub-issue"
                    value="create new issue"
                    onSelect={() => onSelect(item)}
                  >
                    <PlusIcon
                      className="h-4 w-4 shrink-0 text-brand"
                      weight="bold"
                    />
                    <span>{t('kanban.createNewIssue')}</span>
                  </CommandItem>
                );
              } else if (item.type === 'issue') {
                const priorityConfig = {
                  urgent: {
                    icon: ArrowFatLineUpIcon,
                    colorClass: 'text-error',
                  },
                  high: { icon: ArrowUpIcon, colorClass: 'text-brand' },
                  medium: { icon: MinusIcon, colorClass: 'text-low' },
                  low: { icon: ArrowDownIcon, colorClass: 'text-success' },
                } as const;
                const config = item.issue.priority
                  ? priorityConfig[item.issue.priority]
                  : null;
                const PriorityIconComponent = config?.icon;
                const statusColor =
                  statuses.find((s) => s.id === item.issue.status_id)?.color ??
                  '0 0% 50%';
                return (
                  <CommandItem
                    key={item.issue.id}
                    value={`${item.issue.id} ${item.issue.simple_id} ${item.issue.title}`}
                    onSelect={() => onSelect(item)}
                  >
                    {PriorityIconComponent && (
                      <PriorityIconComponent
                        className={`h-4 w-4 shrink-0 ${config?.colorClass}`}
                        weight="bold"
                      />
                    )}
                    <span className="font-mono text-low shrink-0">
                      {item.issue.simple_id}
                    </span>
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: `hsl(${statusColor})`,
                      }}
                    />
                    <span className="truncate">{item.issue.title}</span>
                  </CommandItem>
                );
              } else if (item.type === 'action') {
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
                    <ActionItemIcon icon={item.action.icon} />
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

function getItemSearchLabel(
  item: ResolvedGroupItem,
  getLabel: (action: ActionDefinition) => string
): string {
  if (item.type === 'page') {
    return `${item.pageId} ${item.label}`;
  }
  if (item.type === 'repo') {
    return `${item.repo.id} ${item.repo.display_name}`;
  }
  if (item.type === 'branch') {
    return item.branch.name;
  }
  if (item.type === 'status') {
    return `${item.status.id} ${item.status.name}`;
  }
  if (item.type === 'priority') {
    return `${item.priority.id ?? 'none'} ${item.priority.name}`;
  }
  if (item.type === 'issue') {
    return `${item.issue.id} ${item.issue.simple_id} ${item.issue.title}`;
  }
  if (item.type === 'createSubIssue') {
    return 'create new issue';
  }
  if (item.type === 'action') {
    const keywords = item.action.keywords?.join(' ') ?? '';
    return `${item.action.id} ${getLabel(item.action)} ${keywords}`.trim();
  }
  return '';
}
