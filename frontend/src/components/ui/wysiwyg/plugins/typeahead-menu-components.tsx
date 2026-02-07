import {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
  type ReactNode,
  type MouseEvent,
  type CSSProperties,
} from 'react';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui-new/primitives/Popover';

// --- Headless Compound Components ---

type VerticalSide = 'top' | 'bottom';

interface TypeaheadPlacement {
  side: VerticalSide;
  maxHeight: number;
}

const VIEWPORT_PADDING = 16;
const MENU_SIDE_OFFSET = 8;
const MAX_MENU_HEIGHT = 360;
const MIN_RENDERED_MENU_HEIGHT = 96;
const FLIP_HYSTERESIS_PX = 72;

function getViewportHeight() {
  return window.visualViewport?.height ?? window.innerHeight;
}

function getAvailableVerticalSpace(anchorRect: DOMRect) {
  const viewportHeight = getViewportHeight();
  return {
    above: anchorRect.top - VIEWPORT_PADDING - MENU_SIDE_OFFSET,
    below:
      viewportHeight - anchorRect.bottom - VIEWPORT_PADDING - MENU_SIDE_OFFSET,
  };
}

function chooseInitialSide(above: number, below: number): VerticalSide {
  return below >= above ? 'bottom' : 'top';
}

function chooseStableSide(
  previousSide: VerticalSide | undefined,
  above: number,
  below: number
): VerticalSide {
  if (!previousSide) {
    return chooseInitialSide(above, below);
  }

  if (previousSide === 'bottom') {
    const shouldFlipToTop =
      below < MIN_RENDERED_MENU_HEIGHT && above > below + FLIP_HYSTERESIS_PX;
    return shouldFlipToTop ? 'top' : 'bottom';
  }

  const shouldFlipToBottom =
    above < MIN_RENDERED_MENU_HEIGHT && below > above + FLIP_HYSTERESIS_PX;
  return shouldFlipToBottom ? 'bottom' : 'top';
}

function clampMenuHeight(height: number) {
  return Math.min(
    MAX_MENU_HEIGHT,
    Math.max(MIN_RENDERED_MENU_HEIGHT, Math.floor(height))
  );
}

function getPlacement(
  anchorEl: HTMLElement,
  previousSide?: VerticalSide
): TypeaheadPlacement {
  const anchorRect = anchorEl.getBoundingClientRect();
  const { above, below } = getAvailableVerticalSpace(anchorRect);
  const side = chooseStableSide(previousSide, above, below);
  const rawHeight = side === 'bottom' ? below : above;

  return {
    side,
    maxHeight: clampMenuHeight(rawHeight),
  };
}

interface TypeaheadMenuProps {
  anchorEl: HTMLElement;
  children: ReactNode;
}

function TypeaheadMenuRoot({ anchorEl, children }: TypeaheadMenuProps) {
  const [placement, setPlacement] = useState<TypeaheadPlacement>(() =>
    getPlacement(anchorEl)
  );

  const syncPlacement = useCallback(() => {
    setPlacement((previous) => {
      const next = getPlacement(anchorEl, previous.side);
      if (
        next.side === previous.side &&
        next.maxHeight === previous.maxHeight
      ) {
        return previous;
      }
      return next;
    });
  }, [anchorEl]);

  useEffect(() => {
    syncPlacement();

    const updateOnFrame = () => {
      window.requestAnimationFrame(syncPlacement);
    };

    window.addEventListener('resize', updateOnFrame);
    window.addEventListener('scroll', updateOnFrame, true);
    const observer = new ResizeObserver(updateOnFrame);
    observer.observe(anchorEl);

    return () => {
      window.removeEventListener('resize', updateOnFrame);
      window.removeEventListener('scroll', updateOnFrame, true);
      observer.disconnect();
    };
  }, [anchorEl, syncPlacement]);

  // Reposition during normal React renders too (e.g. typeahead cursor movement).
  useEffect(() => {
    syncPlacement();
  });

  const contentStyle = useMemo(
    () =>
      ({
        '--typeahead-menu-max-height': `${placement.maxHeight}px`,
      }) as CSSProperties,
    [placement.maxHeight]
  );

  return (
    <Popover open>
      <PopoverAnchor virtualRef={{ current: anchorEl }} />
      <PopoverContent
        side={placement.side}
        align="start"
        sideOffset={MENU_SIDE_OFFSET}
        avoidCollisions={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        style={contentStyle}
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
  return (
    <div
      className="py-1 overflow-auto"
      style={{ maxHeight: 'var(--typeahead-menu-max-height, 40vh)' }}
    >
      {children}
    </div>
  );
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

interface TypeaheadMenuActionProps {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

function TypeaheadMenuAction({
  onClick,
  disabled = false,
  children,
}: TypeaheadMenuActionProps) {
  return (
    <button
      type="button"
      className="w-full px-3 py-2 text-left text-sm border-l-2 border-l-transparent text-muted-foreground hover:bg-muted hover:text-high disabled:opacity-50 disabled:cursor-not-allowed"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
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
  Action: TypeaheadMenuAction,
  Item: TypeaheadMenuItemComponent,
});
