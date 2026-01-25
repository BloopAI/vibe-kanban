import { useRef, useEffect, type ReactNode, type MouseEvent } from 'react';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui-new/primitives/Popover';

// --- Headless Compound Components ---

interface TypeaheadMenuProps {
  anchorEl: HTMLElement;
  children: ReactNode;
}

function TypeaheadMenuRoot({ anchorEl, children }: TypeaheadMenuProps) {
  return (
    <Popover open>
      <PopoverAnchor virtualRef={{ current: anchorEl }} />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={24}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-auto min-w-80 max-w-[370px] p-0 overflow-hidden !bg-background"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function TypeaheadMenuHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-2 border-b bg-muted/30">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {children}
      </div>
    </div>
  );
}

function TypeaheadMenuScrollArea({ children }: { children: ReactNode }) {
  return <div className="py-1 max-h-[40vh] overflow-auto">{children}</div>;
}

function TypeaheadMenuSectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">
      {children}
    </div>
  );
}

function TypeaheadMenuDivider() {
  return <div className="border-t my-1" />;
}

function TypeaheadMenuEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-2 text-sm text-muted-foreground">{children}</div>
  );
}

interface TypeaheadMenuItemProps {
  isSelected: boolean;
  index: number;
  setHighlightedIndex: (index: number) => void;
  onClick: () => void;
  children: ReactNode;
}

function TypeaheadMenuItemComponent({
  isSelected,
  index,
  setHighlightedIndex,
  onClick,
  children,
}: TypeaheadMenuItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isSelected]);

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const pos = { x: event.clientX, y: event.clientY };
    const last = lastMousePositionRef.current;
    if (!last || last.x !== pos.x || last.y !== pos.y) {
      lastMousePositionRef.current = pos;
      setHighlightedIndex(index);
    }
  };

  return (
    <div
      ref={ref}
      className={`px-3 py-2 cursor-pointer text-sm border-l-2 ${
        isSelected
          ? 'bg-secondary border-l-brand text-high'
          : 'hover:bg-muted border-l-transparent text-muted-foreground'
      }`}
      onMouseMove={handleMouseMove}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export const TypeaheadMenu = Object.assign(TypeaheadMenuRoot, {
  Header: TypeaheadMenuHeader,
  ScrollArea: TypeaheadMenuScrollArea,
  SectionHeader: TypeaheadMenuSectionHeader,
  Divider: TypeaheadMenuDivider,
  Empty: TypeaheadMenuEmpty,
  Item: TypeaheadMenuItemComponent,
});
