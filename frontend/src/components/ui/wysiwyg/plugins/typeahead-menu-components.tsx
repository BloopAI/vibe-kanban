import {
  useRef,
  useEffect,
  useCallback,
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
const MIN_RENDERED_MENU_HEIGHT = 96;
const FLIP_HYSTERESIS_PX = 72;

function getViewportHeight() {
  return window.visualViewport?.height ?? window.innerHeight;
}

function getAvailableVerticalSpace(anchorRect: DOMRect, editorRect?: DOMRect) {
  const viewportHeight = getViewportHeight();
  // When an editor rect is available, measure space above the entire editor
  // input so the menu doesn't overlap earlier lines of text.
  const topEdge = editorRect ? editorRect.top : anchorRect.top;
  return {
    above: topEdge - VIEWPORT_PADDING - MENU_SIDE_OFFSET,
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
  previousSide?: VerticalSide,
  editorEl?: HTMLElement | null
): TypeaheadPlacement {
  const anchorRect = anchorEl.getBoundingClientRect();
  const editorRect = editorEl?.getBoundingClientRect();
  const { above, below } = getAvailableVerticalSpace(anchorRect, editorRect);
  const side = chooseStableSide(previousSide, above, below);
  const rawHeight = side === 'bottom' ? below : above;

  // Horizontal: align to anchor left, but shift left if it would overflow
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const rightOverflow =
    anchorRect.left + MAX_MENU_WIDTH - viewportWidth + VIEWPORT_PADDING;
  const left =
    rightOverflow > 0 ? anchorRect.left - rightOverflow : anchorRect.left;

  // Vertical: below the anchor or above the editor (if available)
  let top: number;
  if (side === 'bottom') {
    top = anchorRect.bottom + MENU_SIDE_OFFSET;
  } else {
    // Position above the editor top edge (or anchor if no editor)
    const topEdge = editorRect ? editorRect.top : anchorRect.top;
    top = topEdge - MENU_SIDE_OFFSET;
  }

  return {
    side,
    maxHeight: clampMenuHeight(rawHeight),
    left,
    top,
  };
}

interface TypeaheadMenuProps {
  anchorEl: HTMLElement;
  editorEl?: HTMLElement | null;
  onClickOutside?: () => void;
  children: ReactNode;
}

function TypeaheadMenuRoot({
  anchorEl,
  editorEl,
  onClickOutside,
  children,
}: TypeaheadMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<TypeaheadPlacement>(() =>
    getPlacement(anchorEl, undefined, editorEl)
  );

  const syncPlacement = useCallback(() => {
    setPlacement((previous) => {
      const next = getPlacement(anchorEl, previous.side, editorEl);
      const maxHeightStable =
        Math.abs(next.maxHeight - previous.maxHeight) < 10;
      const leftStable = Math.abs(next.left - previous.left) < 2;
      // Use a line-height–sized tolerance for vertical position so that
      // sub-pixel anchor movements within the same line don't cause updates.
      // The position only needs to change on line wraps (~20px jump).
      const topStable = Math.abs(next.top - previous.top) < 10;
      if (
        next.side === previous.side &&
        maxHeightStable &&
        leftStable &&
        topStable
      ) {
        return previous;
      }
      return next;
    });
  }, [anchorEl, editorEl]);

  useEffect(() => {
    syncPlacement();

    const updateOnFrame = () => {
      window.requestAnimationFrame(syncPlacement);
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
  }, [anchorEl, syncPlacement]);

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
