import { useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { VirtuosoHandle } from 'react-virtuoso';
import { PlusIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchInput,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui-new/primitives/Dropdown';
import { Virtuoso } from 'react-virtuoso';
import type { Project } from 'shared/types';

interface ProjectSelectorContainerProps {
  projects: Project[];
  selectedProjectId: string | null;
  selectedProjectName: string | undefined;
  onProjectSelect: (project: Project) => void;
  onCreateProject: () => void;
}

export function ProjectSelectorContainer({
  projects,
  selectedProjectId,
  selectedProjectName,
  onProjectSelect,
  onCreateProject,
}: ProjectSelectorContainerProps) {
  const { t } = useTranslation('common');
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return projects;
    const query = searchTerm.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(query));
  }, [projects, searchTerm]);

  const safeHighlightedIndex = useMemo(() => {
    if (highlightedIndex === null) return null;
    // Account for the "Create new project" item at index 0
    if (highlightedIndex >= filteredItems.length + 1) return null;
    return highlightedIndex;
  }, [highlightedIndex, filteredItems.length]);

  const handleSearchTermChange = useCallback((value: string) => {
    setSearchTerm(value);
    setHighlightedIndex(null);
  }, []);

  const moveHighlight = useCallback(
    (delta: 1 | -1) => {
      // Total items = create button + filtered projects
      const totalItems = filteredItems.length + 1;
      if (totalItems === 0) return;
      const start = safeHighlightedIndex ?? -1;
      const next = (start + delta + totalItems) % totalItems;
      setHighlightedIndex(next);
      if (next > 0) {
        virtuosoRef.current?.scrollIntoView({
          index: next - 1,
          behavior: 'auto',
        });
      }
    },
    [filteredItems, safeHighlightedIndex]
  );

  const attemptSelect = useCallback(() => {
    if (safeHighlightedIndex == null) return;
    if (safeHighlightedIndex === 0) {
      // Create new project button
      onCreateProject();
      setDropdownOpen(false);
      return;
    }
    const item = filteredItems[safeHighlightedIndex - 1];
    if (!item) return;
    onProjectSelect(item);
    setDropdownOpen(false);
  }, [safeHighlightedIndex, filteredItems, onProjectSelect, onCreateProject]);

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
          e.stopPropagation();
      }
    },
    [moveHighlight, attemptSelect]
  );

  const handleOpenChange = useCallback((next: boolean) => {
    setDropdownOpen(next);
    if (!next) {
      setSearchTerm('');
      setHighlightedIndex(null);
    }
  }, []);

  const handleSelect = useCallback(
    (project: Project) => {
      onProjectSelect(project);
      setDropdownOpen(false);
    },
    [onProjectSelect]
  );

  const handleCreateClick = useCallback(() => {
    onCreateProject();
    setDropdownOpen(false);
  }, [onCreateProject]);

  return (
    <div className="p-base w-full">
      <DropdownMenu open={dropdownOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center justify-between w-full px-base py-half',
              'text-sm text-left rounded border bg-secondary',
              'hover:bg-tertiary transition-colors',
              'focus:outline-none focus:ring-1 focus:ring-accent'
            )}
          >
            <span className={selectedProjectName ? '' : 'text-low'}>
              {selectedProjectName ?? 'Select project'}
            </span>
            <svg
              className="h-4 w-4 text-low"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSearchInput
            placeholder="Search projects..."
            value={searchTerm}
            onValueChange={handleSearchTermChange}
            onKeyDown={handleKeyDown}
          />
          <DropdownMenuSeparator />
          {/* Create new project button */}
          <DropdownMenuItem
            onSelect={handleCreateClick}
            onMouseEnter={() => setHighlightedIndex(0)}
            preventFocusOnHover
            icon={PlusIcon}
            className={cn(
              'text-accent',
              safeHighlightedIndex === 0 && 'bg-secondary'
            )}
          >
            {t('projects.createNew')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {filteredItems.length === 0 ? (
            <div className="px-base py-half text-sm text-low text-center">
              {t('projects.noProjectsFound')}
            </div>
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: '14rem' }}
              totalCount={filteredItems.length}
              computeItemKey={(idx) => filteredItems[idx]?.id ?? String(idx)}
              itemContent={(idx) => {
                const item = filteredItems[idx];
                // Highlight index is offset by 1 (create button is at 0)
                const isHighlighted = idx + 1 === safeHighlightedIndex;
                const isSelected = selectedProjectId === item.id;
                return (
                  <DropdownMenuItem
                    onSelect={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(idx + 1)}
                    preventFocusOnHover
                    className={cn(
                      isSelected && 'bg-secondary',
                      isHighlighted && 'bg-secondary'
                    )}
                  >
                    {item.name}
                  </DropdownMenuItem>
                );
              }}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
