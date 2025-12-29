import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchInput,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './Dropdown';

interface SearchableDropdownProps<T> {
  /** Array of items to display */
  items: T[];
  /** Currently selected value (matched against getItemKey) */
  selectedValue?: string | null;

  /** Extract unique key from item */
  getItemKey: (item: T) => string;
  /** Extract display label from item */
  getItemLabel: (item: T) => string;
  /** Custom filter function (defaults to label.includes(query)) */
  filterItem?: (item: T, query: string) => boolean;

  /** Called when an item is selected */
  onSelect: (item: T) => void;

  /** Trigger element (uses asChild pattern) */
  trigger: React.ReactNode;

  /** Class name for dropdown content */
  contentClassName?: string;
  /** Placeholder text for search input */
  placeholder?: string;
  /** Message shown when no items match */
  emptyMessage?: string;

  /** Optional badge text for each item */
  getItemBadge?: (item: T) => string | undefined;
}

export function SearchableDropdown<T>({
  items,
  selectedValue,
  getItemKey,
  getItemLabel,
  filterItem,
  onSelect,
  trigger,
  contentClassName,
  placeholder = 'Search',
  emptyMessage = 'No items found',
  getItemBadge,
}: SearchableDropdownProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const query = searchTerm.toLowerCase();
    if (filterItem) {
      return items.filter((item) => filterItem(item, query));
    }
    return items.filter((item) =>
      getItemLabel(item).toLowerCase().includes(query)
    );
  }, [items, searchTerm, filterItem, getItemLabel]);

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightedIndex(null);
  }, [searchTerm]);

  // Reset highlight if it exceeds list length
  useEffect(() => {
    if (highlightedIndex !== null && highlightedIndex >= filteredItems.length) {
      setHighlightedIndex(null);
    }
  }, [filteredItems, highlightedIndex]);

  const moveHighlight = useCallback(
    (delta: 1 | -1) => {
      if (filteredItems.length === 0) return;
      const start = highlightedIndex ?? -1;
      const next =
        (start + delta + filteredItems.length) % filteredItems.length;
      setHighlightedIndex(next);
      virtuosoRef.current?.scrollIntoView({ index: next, behavior: 'auto' });
    },
    [filteredItems, highlightedIndex]
  );

  const attemptSelect = useCallback(() => {
    if (highlightedIndex == null) return;
    const item = filteredItems[highlightedIndex];
    if (!item) return;
    onSelect(item);
    setDropdownOpen(false);
  }, [highlightedIndex, filteredItems, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          moveHighlight(1);
          return;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          moveHighlight(-1);
          return;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          attemptSelect();
          return;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          setDropdownOpen(false);
          return;
        case 'Tab':
          return;
        default:
          e.stopPropagation(); // Prevents Radix typeahead from stealing focus
      }
    },
    [moveHighlight, attemptSelect]
  );

  return (
    <DropdownMenu
      open={dropdownOpen}
      onOpenChange={(next) => {
        setDropdownOpen(next);
        if (!next) {
          setSearchTerm('');
          setHighlightedIndex(null);
        }
      }}
    >
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className={contentClassName}>
        <DropdownMenuSearchInput
          placeholder={placeholder}
          value={searchTerm}
          onValueChange={setSearchTerm}
          onKeyDown={handleKeyDown}
        />
        <DropdownMenuSeparator />
        {filteredItems.length === 0 ? (
          <div className="px-base py-half text-sm text-low text-center">
            {emptyMessage}
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            style={{ height: '16rem' }}
            totalCount={filteredItems.length}
            computeItemKey={(idx) =>
              getItemKey(filteredItems[idx]) ?? String(idx)
            }
            itemContent={(idx) => {
              const item = filteredItems[idx];
              const key = getItemKey(item);
              const isHighlighted = idx === highlightedIndex;
              const isSelected = selectedValue === key;
              return (
                <DropdownMenuItem
                  onSelect={() => {
                    onSelect(item);
                    setDropdownOpen(false);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  badge={getItemBadge?.(item)}
                  className={cn(
                    isSelected && 'bg-secondary',
                    isHighlighted && 'bg-secondary'
                  )}
                >
                  {getItemLabel(item)}
                </DropdownMenuItem>
              );
            }}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
