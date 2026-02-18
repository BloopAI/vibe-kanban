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
  alignOffset: number;
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

function getAlignOffset(anchorRect: DOMRect): number {
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const rightOverflow =
    anchorRect.left + MAX_MENU_WIDTH - viewportWidth + VIEWPORT_PADDING;
  return rightOverflow > 0 ? -rightOverflow : 0;
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
    alignOffset: getAlignOffset(anchorRect),
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
  const [placement, setPlacement] = useState<TypeaheadPlacement>(() =>
    getPlacement(anchorEl)
  );

  const syncPlacement = useCallback(() => {
    setPlacement((previous) => {
      const next = getPlacement(anchorEl, previous.side);
      // Use a tolerance for maxHeight to prevent re-renders from sub-pixel
      // anchor rect changes. Without this, tiny fluctuations in the anchor
      // position cause maxHeight to change by 1-2px, triggering a state
      // update → re-render → @floating-ui reposition cycle that manifests
      // as the popover visually jumping.
      const maxHeightStable =
        Math.abs(next.maxHeight - previous.maxHeight) < 10;
      if (
        next.side === previous.side &&
        maxHeightStable &&
        next.alignOffset === previous.alignOffset
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
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateOnFrame);
      vv.addEventListener('scroll', updateOnFrame);
    }
    const observer = new ResizeObserver(updateOnFrame);
    observer.observe(anchorEl);

    return () => {
      window.removeEventListener('resize', updateOnFrame);
      window.removeEventListener('scroll', updateOnFrame, true);
      if (vv) {
        vv.removeEventListener('resize', updateOnFrame);
        vv.removeEventListener('scroll', updateOnFrame);
      }
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
        maxHeight: `${placement.maxHeight}px`,
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
        alignOffset={placement.alignOffset}
        avoidCollisions={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          e.preventDefault();
          onClickOutside?.();
        }}
        style={contentStyle}
        className="w-auto min-w-80 max-w-[370px] p-0 overflow-hidden !bg-panel flex flex-col"
      >
        {children}
      </PopoverContent>
    </Popover>
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
  return <div className="py-half overflow-auto flex-1 min-h-0">{children}</div>;
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
