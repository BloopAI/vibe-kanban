import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { ArrowDown, GitBranch as GitBranchIcon, Search } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx';
import { Input } from '@/components/ui/input.tsx';
import type { GitBranch } from 'shared/types';

type Props = {
  branches: GitBranch[];
  selectedBranch: string | null;
  onBranchSelect: (branch: string) => void;
  placeholder?: string;
  className?: string;
  excludeCurrentBranch?: boolean;
};

type RowProps = {
  branch: GitBranch;
  idx: number;
  isSelected: boolean;
  isHighlighted: boolean;
  isDisabled: boolean;
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
  setItemRef: (el: HTMLDivElement | null) => void;
};

const BranchRow = memo(function BranchRow({
  branch,
  idx,
  isSelected,
  isHighlighted,
  isDisabled,
  onMouseEnter,
  onClick,
  setItemRef,
}: RowProps) {
  const classes =
    (isSelected ? 'bg-accent ' : '') +
    (isDisabled ? 'opacity-50 cursor-not-allowed ' : '') +
    (isHighlighted ? 'bg-muted ' : '') +
    'transition-none';

  const nameClass = branch.is_current ? 'font-medium' : '';

  const item = (
    <DropdownMenuItem
      ref={setItemRef}
      data-index={idx}
      data-name={branch.name}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      disabled={isDisabled}
      className={classes.trim()}
    >
      <div className="flex items-center justify-between w-full">
        <span className={nameClass}>{branch.name}</span>
        <div className="flex gap-1">
          {branch.is_current && (
            <span className="text-xs bg-green-100 text-green-800 px-1 rounded">
              current
            </span>
          )}
          {branch.is_remote && (
            <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded">
              remote
            </span>
          )}
        </div>
      </div>
    </DropdownMenuItem>
  );

  if (isDisabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{item}</TooltipTrigger>
        <TooltipContent>
          <p>Cannot rebase a branch onto itself</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return item;
});

function BranchSelector({
  branches,
  selectedBranch,
  onBranchSelect,
  placeholder = 'Select a branch',
  className = '',
  excludeCurrentBranch = false,
}: Props) {
  const [branchSearchTerm, setBranchSearchTerm] = useState('');
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredBranches = useMemo(() => {
    let filtered = branches;

    if (branchSearchTerm.trim()) {
      const q = branchSearchTerm.toLowerCase();
      filtered = filtered.filter((b) => b.name.toLowerCase().includes(q));
    }
    return filtered;
  }, [branches, branchSearchTerm]);

  const handleBranchSelect = useCallback(
    (branchName: string) => {
      onBranchSelect(branchName);
      setBranchSearchTerm('');
      setHighlighted(null);
      setOpen(false);
    },
    [onBranchSelect]
  );

  useEffect(() => {
    if (highlighted !== null && highlighted >= filteredBranches.length) {
      setHighlighted(null);
    }
  }, [filteredBranches, highlighted]);

  useEffect(() => {
    setHighlighted(null);
  }, [branchSearchTerm]);

  useEffect(() => {
    if (highlighted == null) return;
    const container = listRef.current;
    const el = itemRefs.current[highlighted];
    if (!container || !el) return;

    const raf = requestAnimationFrame(() => {
      const cTop = container.scrollTop;
      const cBottom = cTop + container.clientHeight;
      const eTop = el.offsetTop;
      const eBottom = eTop + el.offsetHeight;

      if (eTop < cTop) {
        container.scrollTop = eTop;
      } else if (eBottom > cBottom) {
        container.scrollTop = eBottom - container.clientHeight;
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [highlighted]);

  const isDisabledIdx = useCallback(
    (i: number) => excludeCurrentBranch && filteredBranches[i]?.is_current,
    [excludeCurrentBranch, filteredBranches]
  );

  const moveHighlight = useCallback(
    (delta: 1 | -1) => {
      if (filteredBranches.length === 0) return;

      const start = highlighted ?? -1;
      let next = start;

      for (let attempts = 0; attempts < filteredBranches.length; attempts++) {
        next =
          (next + delta + filteredBranches.length) % filteredBranches.length;
        if (!isDisabledIdx(next)) {
          setHighlighted(next);
          return;
        }
      }
      setHighlighted(null);
    },
    [filteredBranches, highlighted, isDisabledIdx]
  );

  const attemptSelect = useCallback(() => {
    if (highlighted == null) return;
    const branch = filteredBranches[highlighted];
    if (!branch) return;
    if (excludeCurrentBranch && branch.is_current) return;
    handleBranchSelect(branch.name);
  }, [highlighted, filteredBranches, excludeCurrentBranch, handleBranchSelect]);

  const handleRowMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const i = Number((e.currentTarget as HTMLElement).dataset.index);
      if (!Number.isNaN(i)) setHighlighted(i);
    },
    []
  );

  const handleRowClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget as HTMLElement;
      const name = el.dataset.name;
      const idx = Number(el.dataset.index);
      if (excludeCurrentBranch && filteredBranches[idx]?.is_current) return;
      if (name) handleBranchSelect(name);
    },
    [excludeCurrentBranch, filteredBranches, handleBranchSelect]
  );

  const setItemRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const i = Number(el.dataset.index);
    if (!Number.isNaN(i)) {
      itemRefs.current[i] = el;
    }
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`w-full justify-between text-xs ${className}`}
        >
          <div className="flex items-center gap-1.5 w-full">
            <GitBranchIcon className="h-3 w-3" />
            <span className="truncate">{selectedBranch || placeholder}</span>
          </div>
          <ArrowDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>

      <TooltipProvider>
        <DropdownMenuContent
          className="w-80"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            searchInputRef.current?.focus();
          }}
        >
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Search branches..."
                value={branchSearchTerm}
                onChange={(e) => setBranchSearchTerm(e.target.value)}
                onKeyDown={(e) => {
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
                      setOpen(false);
                      return;
                    case 'Tab':
                      return;
                    default:
                      e.stopPropagation();
                  }
                }}
                className="pl-8"
                autoFocus
              />
            </div>
          </div>
          <DropdownMenuSeparator />
          <div ref={listRef} className="max-h-64 overflow-y-auto">
            {filteredBranches.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground text-center">
                No branches found
              </div>
            ) : (
              filteredBranches.map((branch, idx) => {
                const isDisabled = excludeCurrentBranch && !!branch.is_current;
                const isHighlighted = idx === highlighted;
                const isSelected = selectedBranch === branch.name;

                return (
                  <BranchRow
                    key={branch.name}
                    branch={branch}
                    idx={idx}
                    isSelected={isSelected}
                    isDisabled={isDisabled}
                    isHighlighted={isHighlighted}
                    onMouseEnter={handleRowMouseEnter}
                    onClick={handleRowClick}
                    setItemRef={setItemRef}
                  />
                );
              })
            )}
          </div>
        </DropdownMenuContent>
      </TooltipProvider>
    </DropdownMenu>
  );
}

export default BranchSelector;
