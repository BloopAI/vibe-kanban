import {
  useRef,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type MouseEvent,
  type CSSProperties,
} from 'react';

// --- Headless Compound Components ---

type VerticalSide = 'top' | 'bottom';

interface TypeaheadPlacement {
  side: VerticalSide;
  maxHeight: number;
  left: number;
  top: number;
}

const VIEWPORT_PADDING = 16;
const MENU_SIDE_OFFSET = 8;
const MAX_MENU_HEIGHT = 360;
const MAX_MENU_WIDTH = 370;
const MIN_VISIBLE_MENU_HEIGHT = 96;

function getViewportHeight() {
  return window.visualViewport?.height ?? window.innerHeight;
}

function getViewportWidth() {
  return window.visualViewport?.width ?? window.innerWidth;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function computePlacement(anchorEl: HTMLElement): TypeaheadPlacement {
  const anchorRect = anchorEl.getBoundingClientRect();
  const viewportWidth = getViewportWidth();
  const viewportHeight = getViewportHeight();
  const above = anchorRect.top - VIEWPORT_PADDING - MENU_SIDE_OFFSET;
  const below =
    viewportHeight - anchorRect.bottom - VIEWPORT_PADDING - MENU_SIDE_OFFSET;
  const side: VerticalSide =
    below < MIN_VISIBLE_MENU_HEIGHT && above > below ? 'top' : 'bottom';
  const availableSpace = side === 'bottom' ? below : above;
  const measuredHeight = Math.floor(Math.max(availableSpace, 0));
  const maxHeight = Math.min(
    MAX_MENU_HEIGHT,
    Math.max(MIN_VISIBLE_MENU_HEIGHT, measuredHeight)
  );

  // Horizontal: align to anchor left, but shift left if it would overflow
  const minLeft = VIEWPORT_PADDING;
  const maxLeft = Math.max(
    VIEWPORT_PADDING,
    viewportWidth - MAX_MENU_WIDTH - VIEWPORT_PADDING
  );
  const left = clamp(anchorRect.left, minLeft, maxLeft);
  const top =
    side === 'bottom'
      ? anchorRect.bottom + MENU_SIDE_OFFSET
      : anchorRect.top - MENU_SIDE_OFFSET;

  return {
    side,
    maxHeight,
    left,
    top,
  };
}

interface TypeaheadMenuProps {
  anchorEl: HTMLElement;
  onClickOutside?: () => void;
  children: ReactNode;
}

function TypeaheadMenuRoot({
  anchorEl,
  onClickOutside,
  children,
}: TypeaheadMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [viewportTick, setViewportTick] = useState(0);
  const placement = useMemo(
    () => computePlacement(anchorEl),
    [anchorEl, viewportTick]
  );

  useEffect(() => {
    const updateOnFrame = () => {
      window.requestAnimationFrame(() => {
        setViewportTick((tick) => tick + 1);
      });
    };

    window.addEventListener('resize', updateOnFrame);
    window.addEventListener('scroll', updateOnFrame, true);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateOnFrame);
      vv.addEventListener('scroll', updateOnFrame);
    }

    return () => {
      window.removeEventListener('resize', updateOnFrame);
      window.removeEventListener('scroll', updateOnFrame, true);
      if (vv) {
        vv.removeEventListener('resize', updateOnFrame);
        vv.removeEventListener('scroll', updateOnFrame);
      }
    };
  }, []);

  // Click-outside detection
  useEffect(() => {
    if (!onClickOutside) return;
    const handlePointerDown = (e: PointerEvent) => {
      const menu = menuRef.current;
      if (menu && !menu.contains(e.target as Node)) {
        onClickOutside();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClickOutside]);

  // When side is 'top' the menu grows upward — use bottom-anchored positioning
  // so the menu expands upward from a fixed bottom edge.
  const style =
    placement.side === 'bottom'
      ? ({
          position: 'fixed',
          left: placement.left,
          top: placement.top,
          '--typeahead-menu-max-height': `${placement.maxHeight}px`,
        } as CSSProperties)
      : ({
          position: 'fixed',
          left: placement.left,
          bottom: getViewportHeight() - placement.top,
          '--typeahead-menu-max-height': `${placement.maxHeight}px`,
        } as CSSProperties);

  return (
    <div
      ref={menuRef}
      style={style as CSSProperties}
      className="z-[10000] w-auto min-w-80 max-w-[370px] p-0 overflow-hidden bg-panel border border-border rounded-sm shadow-md flex flex-col"
    >
      {children}
    </div>
  );
}

function TypeaheadMenuHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`px-base py-half border-b border-border ${className ?? ''}`}
    >
      <div className="flex items-center gap-half text-xs font-medium text-low">
        {children}
      </div>
    </div>
  );
}

function TypeaheadMenuScrollArea({ children }: { children: ReactNode }) {
  return (
    <div
      className="py-half overflow-auto flex-1 min-h-0"
      style={{ maxHeight: 'var(--typeahead-menu-max-height, 360px)' }}
    >
      {children}
    </div>
  );
}

function TypeaheadMenuSectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-base py-half text-xs font-medium text-low">
      {children}
    </div>
  );
}

function TypeaheadMenuDivider() {
  return <div className="h-px bg-border my-half" />;
}

function TypeaheadMenuEmpty({ children }: { children: ReactNode }) {
  return <div className="px-base py-half text-sm text-low">{children}</div>;
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
      className="w-full px-base py-half text-left text-sm text-low hover:bg-secondary hover:text-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      className={`px-base py-half rounded-sm cursor-pointer text-sm transition-colors ${
        isSelected ? 'bg-secondary text-high' : 'hover:bg-secondary text-normal'
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
