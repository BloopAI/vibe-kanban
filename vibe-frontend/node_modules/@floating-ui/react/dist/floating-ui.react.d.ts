import { AlignedPlacement } from '@floating-ui/react-dom';
import { Alignment } from '@floating-ui/react-dom';
import { arrow } from '@floating-ui/react-dom';
import { ArrowOptions } from '@floating-ui/react-dom';
import { autoPlacement } from '@floating-ui/react-dom';
import { AutoPlacementOptions } from '@floating-ui/react-dom';
import { autoUpdate } from '@floating-ui/react-dom';
import { AutoUpdateOptions } from '@floating-ui/react-dom';
import { Axis } from '@floating-ui/react-dom';
import { Boundary } from '@floating-ui/react-dom';
import { ClientRectObject } from '@floating-ui/react-dom';
import { computePosition } from '@floating-ui/react-dom';
import { ComputePositionConfig } from '@floating-ui/react-dom';
import { ComputePositionReturn } from '@floating-ui/react-dom';
import { Coords } from '@floating-ui/react-dom';
import { Derivable } from '@floating-ui/react-dom';
import { detectOverflow } from '@floating-ui/react-dom';
import { DetectOverflowOptions } from '@floating-ui/react-dom';
import { Dimensions } from '@floating-ui/react-dom';
import { ElementContext } from '@floating-ui/react-dom';
import { ElementRects } from '@floating-ui/react-dom';
import { Elements } from '@floating-ui/react-dom';
import { flip } from '@floating-ui/react-dom';
import { FlipOptions } from '@floating-ui/react-dom';
import { FloatingElement } from '@floating-ui/react-dom';
import { getOverflowAncestors } from '@floating-ui/react-dom';
import { hide } from '@floating-ui/react-dom';
import { HideOptions } from '@floating-ui/react-dom';
import { inline } from '@floating-ui/react-dom';
import { InlineOptions } from '@floating-ui/react-dom';
import { Length } from '@floating-ui/react-dom';
import { limitShift } from '@floating-ui/react-dom';
import { Middleware } from '@floating-ui/react-dom';
import { MiddlewareArguments } from '@floating-ui/react-dom';
import { MiddlewareData } from '@floating-ui/react-dom';
import { MiddlewareReturn } from '@floating-ui/react-dom';
import { MiddlewareState } from '@floating-ui/react-dom';
import { NodeScroll } from '@floating-ui/react-dom';
import { offset } from '@floating-ui/react-dom';
import { OffsetOptions } from '@floating-ui/react-dom';
import { Padding } from '@floating-ui/react-dom';
import { Placement } from '@floating-ui/react-dom';
import { Platform } from '@floating-ui/react-dom';
import { platform } from '@floating-ui/react-dom';
import * as React from 'react';
import { Rect } from '@floating-ui/react-dom';
import { ReferenceElement } from '@floating-ui/react-dom';
import { RootBoundary } from '@floating-ui/react-dom';
import { shift } from '@floating-ui/react-dom';
import { ShiftOptions } from '@floating-ui/react-dom';
import { Side } from '@floating-ui/react-dom';
import { SideObject } from '@floating-ui/react-dom';
import { size } from '@floating-ui/react-dom';
import { SizeOptions } from '@floating-ui/react-dom';
import { Strategy } from '@floating-ui/react-dom';
import type { UseFloatingOptions as UseFloatingOptions_2 } from '@floating-ui/react-dom';
import type { UseFloatingReturn as UseFloatingReturn_2 } from '@floating-ui/react-dom';
import { VirtualElement } from '@floating-ui/react-dom';

declare const ACTIVE_KEY = "active";

export { AlignedPlacement }

export { Alignment }

declare type AriaRole = 'tooltip' | 'dialog' | 'alertdialog' | 'menu' | 'listbox' | 'grid' | 'tree';

export { arrow }

export { ArrowOptions }

export { autoPlacement }

export { AutoPlacementOptions }

export { autoUpdate }

export { AutoUpdateOptions }

export { Axis }

export { Boundary }

export { ClientRectObject }

declare type ComponentRole = 'select' | 'label' | 'combobox';

/**
 * Creates a single tab stop whose items are navigated by arrow keys, which
 * provides list navigation outside of floating element contexts.
 *
 * This is useful to enable navigation of a list of items that aren’t part of a
 * floating element. A menubar is an example of a composite, with each reference
 * element being an item.
 * @see https://floating-ui.com/docs/Composite
 */
export declare const Composite: React.ForwardRefExoticComponent<Omit<React.HTMLProps<HTMLElement> & CompositeProps, "ref"> & React.RefAttributes<HTMLElement>>;

/**
 * @see https://floating-ui.com/docs/Composite
 */
export declare const CompositeItem: React.ForwardRefExoticComponent<Omit<React.HTMLProps<HTMLElement> & CompositeItemProps, "ref"> & React.RefAttributes<HTMLElement>>;

export declare interface CompositeItemProps {
    /**
     * Determines the element to render.
     * @example
     * ```jsx
     * <CompositeItem render={<li />} />
     * <CompositeItem render={(htmlProps) => <li {...htmlProps} />} />
     * ```
     */
    render?: RenderProp;
}

export declare interface CompositeProps {
    /**
     * Determines the element to render.
     * @example
     * ```jsx
     * <Composite render={<ul />} />
     * <Composite render={(htmlProps) => <ul {...htmlProps} />} />
     * ```
     */
    render?: RenderProp;
    /**
     * Determines the orientation of the composite.
     */
    orientation?: 'horizontal' | 'vertical' | 'both';
    /**
     * Determines whether focus should loop around when navigating past the first
     * or last item.
     */
    loop?: boolean;
    /**
     * Whether the direction of the composite’s navigation is in RTL layout.
     */
    rtl?: boolean;
    /**
     * Determines the number of columns there are in the composite
     * (i.e. it’s a grid).
     */
    cols?: number;
    /**
     * Determines which items are disabled. The `disabled` or `aria-disabled`
     * attributes are used by default.
     */
    disabledIndices?: number[] | ((index: number) => boolean);
    /**
     * Determines which item is active. Used to externally control the active
     * item.
     */
    activeIndex?: number;
    /**
     * Called when the user navigates to a new item. Used to externally control
     * the active item.
     */
    onNavigate?(index: number): void;
    /**
     * Only for `cols > 1`, specify sizes for grid items.
     * `{ width: 2, height: 2 }` means an item is 2 columns wide and 2 rows tall.
     */
    itemSizes?: Dimensions[];
    /**
     * Only relevant for `cols > 1` and items with different sizes, specify if
     * the grid is dense (as defined in the CSS spec for grid-auto-flow).
     */
    dense?: boolean;
}

export { computePosition }

export { ComputePositionConfig }

export { ComputePositionReturn }

export declare interface ContextData {
    openEvent?: Event;
    floatingContext?: FloatingContext;
    /** @deprecated use `onTypingChange` prop in `useTypeahead` */
    typing?: boolean;
    [key: string]: any;
}

export { Coords }

declare type CSSStylesProperty = React.CSSProperties | ((params: {
    side: Side;
    placement: Placement;
}) => React.CSSProperties);

export declare type Delay = number | Partial<{
    open: number;
    close: number;
}>;

declare type Delay_2 = number | Partial<{
    open: number;
    close: number;
}>;

export { detectOverflow }

export { DetectOverflowOptions }

export { Dimensions }

declare type Duration = number | {
    open?: number;
    close?: number;
};

export { ElementContext }

export declare interface ElementProps {
    reference?: React.HTMLProps<Element>;
    floating?: React.HTMLProps<HTMLElement>;
    item?: React.HTMLProps<HTMLElement> | ((props: ExtendedUserProps) => React.HTMLProps<HTMLElement>);
}

export { ElementRects }

export { Elements }

export declare interface ExtendedElements<RT> {
    reference: ReferenceType | null;
    floating: HTMLElement | null;
    domReference: NarrowedElement<RT> | null;
}

export declare interface ExtendedRefs<RT> {
    reference: React.MutableRefObject<ReferenceType | null>;
    floating: React.MutableRefObject<HTMLElement | null>;
    domReference: React.MutableRefObject<NarrowedElement<RT> | null>;
    setReference(node: RT | null): void;
    setFloating(node: HTMLElement | null): void;
    setPositionReference(node: ReferenceType | null): void;
}

declare type ExtendedUserProps = {
    [ACTIVE_KEY]?: boolean;
    [SELECTED_KEY]?: boolean;
};

export { flip }

export { FlipOptions }

/**
 * Renders a pointing arrow triangle.
 * @see https://floating-ui.com/docs/FloatingArrow
 */
export declare const FloatingArrow: React.ForwardRefExoticComponent<Omit<FloatingArrowProps, "ref"> & React.RefAttributes<SVGSVGElement>>;

export declare interface FloatingArrowProps extends React.ComponentPropsWithRef<'svg'> {
    /**
     * The floating context.
     */
    context: Omit<FloatingContext, 'refs'> & {
        refs: any;
    };
    /**
     * Width of the arrow.
     * @default 14
     */
    width?: number;
    /**
     * Height of the arrow.
     * @default 7
     */
    height?: number;
    /**
     * The corner radius (rounding) of the arrow tip.
     * @default 0 (sharp)
     */
    tipRadius?: number;
    /**
     * Forces a static offset over dynamic positioning under a certain condition.
     * If the shift() middleware causes the popover to shift, this value will be
     * ignored.
     */
    staticOffset?: string | number | null;
    /**
     * Custom path string.
     */
    d?: string;
    /**
     * Stroke (border) color of the arrow.
     */
    stroke?: string;
    /**
     * Stroke (border) width of the arrow.
     */
    strokeWidth?: number;
}

export declare type FloatingContext<RT extends ReferenceType = ReferenceType> = Omit<UseFloatingReturn_2<RT>, 'refs' | 'elements'> & {
    open: boolean;
    onOpenChange(open: boolean, event?: Event, reason?: OpenChangeReason): void;
    events: FloatingEvents;
    dataRef: React.MutableRefObject<ContextData>;
    nodeId: string | undefined;
    floatingId: string | undefined;
    refs: ExtendedRefs<RT>;
    elements: ExtendedElements<RT>;
};

/**
 * Provides context for a group of floating elements that should share a
 * `delay`.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 */
export declare function FloatingDelayGroup(props: FloatingDelayGroupProps): React.JSX.Element;

export declare interface FloatingDelayGroupProps {
    children?: React.ReactNode;
    /**
     * The delay to use for the group.
     */
    delay: Delay_2;
    /**
     * An optional explicit timeout to use for the group, which represents when
     * grouping logic will no longer be active after the close delay completes.
     * This is useful if you want grouping to “last” longer than the close delay,
     * for example if there is no close delay at all.
     */
    timeoutMs?: number;
}

export { FloatingElement }

export declare interface FloatingEvents {
    emit<T extends string>(event: T, data?: any): void;
    on(event: string, handler: (data: any) => void): void;
    off(event: string, handler: (data: any) => void): void;
}

/**
 * Provides focus management for the floating element.
 * @see https://floating-ui.com/docs/FloatingFocusManager
 */
export declare function FloatingFocusManager(props: FloatingFocusManagerProps): React.JSX.Element;

export declare interface FloatingFocusManagerProps {
    children: React.JSX.Element;
    /**
     * The floating context returned from `useFloatingRootContext`.
     */
    context: FloatingRootContext;
    /**
     * Whether or not the focus manager should be disabled. Useful to delay focus
     * management until after a transition completes or some other conditional
     * state.
     * @default false
     */
    disabled?: boolean;
    /**
     * The order in which focus cycles.
     * @default ['content']
     */
    order?: Array<'reference' | 'floating' | 'content'>;
    /**
     * Which element to initially focus. Can be either a number (tabbable index as
     * specified by the `order`) or a ref.
     * @default 0
     */
    initialFocus?: number | React.MutableRefObject<HTMLElement | null>;
    /**
     * Determines if the focus guards are rendered. If not, focus can escape into
     * the address bar/console/browser UI, like in native dialogs.
     * @default true
     */
    guards?: boolean;
    /**
     * Determines if focus should be returned to the reference element once the
     * floating element closes/unmounts (or if that is not available, the
     * previously focused element). This prop is ignored if the floating element
     * lost focus.
     * It can be also set to a ref to explicitly control the element to return focus to.
     * @default true
     */
    returnFocus?: boolean | React.MutableRefObject<HTMLElement | null>;
    /**
     * Determines if focus should be restored to the nearest tabbable element if
     * focus inside the floating element is lost (such as due to the removal of
     * the currently focused element from the DOM).
     * @default false
     */
    restoreFocus?: boolean;
    /**
     * Determines if focus is “modal”, meaning focus is fully trapped inside the
     * floating element and outside content cannot be accessed. This includes
     * screen reader virtual cursors.
     * @default true
     */
    modal?: boolean;
    /**
     * If your focus management is modal and there is no explicit close button
     * available, you can use this prop to render a visually-hidden dismiss
     * button at the start and end of the floating element. This allows
     * touch-based screen readers to escape the floating element due to lack of
     * an `esc` key.
     * @default undefined
     */
    visuallyHiddenDismiss?: boolean | string;
    /**
     * Determines whether `focusout` event listeners that control whether the
     * floating element should be closed if the focus moves outside of it are
     * attached to the reference and floating elements. This affects non-modal
     * focus management.
     * @default true
     */
    closeOnFocusOut?: boolean;
    /**
     * Determines whether outside elements are `inert` when `modal` is enabled.
     * This enables pointer modality without a backdrop.
     * @default false
     */
    outsideElementsInert?: boolean;
    /**
     * Returns a list of elements that should be considered part of the
     * floating element.
     */
    getInsideElements?: () => Element[];
}

/**
 * Provides context for a list of items within the floating element.
 * @see https://floating-ui.com/docs/FloatingList
 */
export declare function FloatingList(props: FloatingListProps): React.JSX.Element;

declare interface FloatingListProps {
    children: React.ReactNode;
    /**
     * A ref to the list of HTML elements, ordered by their index.
     * `useListNavigation`'s `listRef` prop.
     */
    elementsRef: React.MutableRefObject<Array<HTMLElement | null>>;
    /**
     * A ref to the list of element labels, ordered by their index.
     * `useTypeahead`'s `listRef` prop.
     */
    labelsRef?: React.MutableRefObject<Array<string | null>>;
}

/**
 * Provides parent node context for nested floating elements.
 * @see https://floating-ui.com/docs/FloatingTree
 */
export declare function FloatingNode(props: FloatingNodeProps): React.JSX.Element;

export declare interface FloatingNodeProps {
    children?: React.ReactNode;
    id: string | undefined;
}

export declare interface FloatingNodeType<RT extends ReferenceType = ReferenceType> {
    id: string | undefined;
    parentId: string | null;
    context?: FloatingContext<RT>;
}

/**
 * Provides base styling for a fixed overlay element to dim content or block
 * pointer events behind a floating element.
 * It's a regular `<div>`, so it can be styled via any CSS solution you prefer.
 * @see https://floating-ui.com/docs/FloatingOverlay
 */
export declare const FloatingOverlay: React.ForwardRefExoticComponent<Omit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "ref"> & FloatingOverlayProps & React.RefAttributes<HTMLDivElement>>;

export declare interface FloatingOverlayProps {
    /**
     * Whether the overlay should lock scrolling on the document body.
     * @default false
     */
    lockScroll?: boolean;
}

/**
 * Portals the floating element into a given container element — by default,
 * outside of the app root and into the body.
 * This is necessary to ensure the floating element can appear outside any
 * potential parent containers that cause clipping (such as `overflow: hidden`),
 * while retaining its location in the React tree.
 * @see https://floating-ui.com/docs/FloatingPortal
 */
export declare function FloatingPortal(props: FloatingPortalProps): React.JSX.Element;

export declare interface FloatingPortalProps {
    children?: React.ReactNode;
    /**
     * Optionally selects the node with the id if it exists, or create it and
     * append it to the specified `root` (by default `document.body`).
     */
    id?: string;
    /**
     * Specifies the root node the portal container will be appended to.
     */
    root?: HTMLElement | ShadowRoot | null | React.MutableRefObject<HTMLElement | ShadowRoot | null>;
    /**
     * When using non-modal focus management using `FloatingFocusManager`, this
     * will preserve the tab order context based on the React tree instead of the
     * DOM tree.
     */
    preserveTabOrder?: boolean;
}

export declare interface FloatingRootContext<RT extends ReferenceType = ReferenceType> {
    dataRef: React.MutableRefObject<ContextData>;
    open: boolean;
    onOpenChange: (open: boolean, event?: Event, reason?: OpenChangeReason) => void;
    elements: {
        domReference: Element | null;
        reference: RT | null;
        floating: HTMLElement | null;
    };
    events: FloatingEvents;
    floatingId: string | undefined;
    refs: {
        setPositionReference(node: ReferenceType | null): void;
    };
}

/**
 * Provides context for nested floating elements when they are not children of
 * each other on the DOM.
 * This is not necessary in all cases, except when there must be explicit communication between parent and child floating elements. It is necessary for:
 * - The `bubbles` option in the `useDismiss()` Hook
 * - Nested virtual list navigation
 * - Nested floating elements that each open on hover
 * - Custom communication between parent and child floating elements
 * @see https://floating-ui.com/docs/FloatingTree
 */
export declare function FloatingTree(props: FloatingTreeProps): React.JSX.Element;

export declare interface FloatingTreeProps {
    children?: React.ReactNode;
}

export declare interface FloatingTreeType<RT extends ReferenceType = ReferenceType> {
    nodesRef: React.MutableRefObject<Array<FloatingNodeType<RT>>>;
    events: FloatingEvents;
    addNode(node: FloatingNodeType): void;
    removeNode(node: FloatingNodeType): void;
}

export { getOverflowAncestors }

declare interface GroupContext extends GroupState {
    setCurrentId: React.Dispatch<React.SetStateAction<any>>;
    setState: React.Dispatch<Partial<GroupState>>;
}

declare interface GroupState {
    delay: Delay_2;
    initialDelay: Delay_2;
    currentId: any;
    timeoutMs: number;
    isInstantPhase: boolean;
}

export declare interface HandleClose {
    (context: HandleCloseContext): (event: MouseEvent) => void;
    __options?: SafePolygonOptions;
}

export declare interface HandleCloseContext extends FloatingContext {
    onClose: () => void;
    tree?: FloatingTreeType | null;
    leave?: boolean;
}

export { hide }

export { HideOptions }

export { inline }

export { InlineOptions }

/**
 * Positions the floating element such that an inner element inside of it is
 * anchored to the reference element.
 * @see https://floating-ui.com/docs/inner
 * @deprecated
 */
export declare const inner: (props: InnerProps | Derivable<InnerProps>) => Middleware;

export declare interface InnerProps extends DetectOverflowOptions {
    /**
     * A ref which contains an array of HTML elements.
     * @default empty list
     */
    listRef: React.MutableRefObject<Array<HTMLElement | null>>;
    /**
     * The index of the active (focused or highlighted) item in the list.
     * @default 0
     */
    index: number;
    /**
     * Callback invoked when the fallback state changes.
     */
    onFallbackChange?: null | ((fallback: boolean) => void);
    /**
     * The offset to apply to the floating element.
     * @default 0
     */
    offset?: number;
    /**
     * A ref which contains the overflow of the floating element.
     */
    overflowRef?: React.MutableRefObject<SideObject | null>;
    /**
     * An optional ref containing an HTMLElement. This may be used as the
     * scrolling container instead of the floating element — for instance,
     * to position inner elements as direct children without being interfered by
     * scrolling layout.
     */
    scrollRef?: React.MutableRefObject<HTMLElement | null>;
    /**
     * The minimum number of items that should be visible in the list.
     * @default 4
     */
    minItemsVisible?: number;
    /**
     * The threshold for the reference element's overflow in pixels.
     * @default 0
     */
    referenceOverflowThreshold?: number;
}

export { Length }

export { limitShift }

export { Middleware }

export { MiddlewareArguments }

export { MiddlewareData }

export { MiddlewareReturn }

export { MiddlewareState }

export declare type NarrowedElement<T> = T extends Element ? T : Element;

/**
 * Experimental next version of `FloatingDelayGroup` to become the default
 * in the future. This component is not yet stable.
 * Provides context for a group of floating elements that should share a
 * `delay`. Unlike `FloatingDelayGroup`, `useNextDelayGroup` with this
 * component does not cause a re-render of unrelated consumers of the
 * context when the delay changes.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 */
export declare function NextFloatingDelayGroup(props: NextFloatingDelayGroupProps): React.JSX.Element;

export declare interface NextFloatingDelayGroupProps {
    children?: React.ReactNode;
    /**
     * The delay to use for the group when it's not in the instant phase.
     */
    delay: Delay;
    /**
     * An optional explicit timeout to use for the group, which represents when
     * grouping logic will no longer be active after the close delay completes.
     * This is useful if you want grouping to “last” longer than the close delay,
     * for example if there is no close delay at all.
     */
    timeoutMs?: number;
}

export { NodeScroll }

export { offset }

export { OffsetOptions }

export declare type OpenChangeReason = 'outside-press' | 'escape-key' | 'ancestor-scroll' | 'reference-press' | 'click' | 'hover' | 'focus' | 'focus-out' | 'list-navigation' | 'safe-polygon';

export { Padding }

export { Placement }

export { Platform }

export { platform }

declare type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};

export { Rect }

export { ReferenceElement }

export declare type ReferenceType = Element | VirtualElement;

declare type RenderProp = React.JSX.Element | ((props: React.HTMLAttributes<HTMLElement>) => React.JSX.Element);

export { RootBoundary }

/**
 * Generates a safe polygon area that the user can traverse without closing the
 * floating element once leaving the reference element.
 * @see https://floating-ui.com/docs/useHover#safepolygon
 */
export declare function safePolygon(options?: SafePolygonOptions): HandleClose;

export declare interface SafePolygonOptions {
    buffer?: number;
    blockPointerEvents?: boolean;
    requireIntent?: boolean;
}

declare const SELECTED_KEY = "selected";

export { shift }

export { ShiftOptions }

export { Side }

export { SideObject }

export { size }

export { SizeOptions }

export { Strategy }

declare type TransitionStatus = 'unmounted' | 'initial' | 'open' | 'close';

/**
 * Opens or closes the floating element when clicking the reference element.
 * @see https://floating-ui.com/docs/useClick
 */
export declare function useClick(context: FloatingRootContext, props?: UseClickProps): ElementProps;

export declare interface UseClickProps {
    /**
     * Whether the Hook is enabled, including all internal Effects and event
     * handlers.
     * @default true
     */
    enabled?: boolean;
    /**
     * The type of event to use to determine a “click” with mouse input.
     * Keyboard clicks work as normal.
     * @default 'click'
     */
    event?: 'click' | 'mousedown';
    /**
     * Whether to toggle the open state with repeated clicks.
     * @default true
     */
    toggle?: boolean;
    /**
     * Whether to ignore the logic for mouse input (for example, if `useHover()`
     * is also being used).
     * @default false
     */
    ignoreMouse?: boolean;
    /**
     * Whether to add keyboard handlers (Enter and Space key functionality) for
     * non-button elements (to open/close the floating element via keyboard
     * “click”).
     * @default true
     */
    keyboardHandlers?: boolean;
    /**
     * If already open from another event such as the `useHover()` Hook,
     * determines whether to keep the floating element open when clicking the
     * reference element for the first time.
     * @default true
     */
    stickIfOpen?: boolean;
}

/**
 * Positions the floating element relative to a client point (in the viewport),
 * such as the mouse position. By default, it follows the mouse cursor.
 * @see https://floating-ui.com/docs/useClientPoint
 */
export declare function useClientPoint(context: FloatingRootContext, props?: UseClientPointProps): ElementProps;

export declare interface UseClientPointProps {
    /**
     * Whether the Hook is enabled, including all internal Effects and event
     * handlers.
     * @default true
     */
    enabled?: boolean;
    /**
     * Whether to restrict the client point to an axis and use the reference
     * element (if it exists) as the other axis. This can be useful if the
     * floating element is also interactive.
     * @default 'both'
     */
    axis?: 'x' | 'y' | 'both';
    /**
     * An explicitly defined `x` client coordinate.
     * @default null
     */
    x?: number | null;
    /**
     * An explicitly defined `y` client coordinate.
     * @default null
     */
    y?: number | null;
}

/**
 * Enables grouping when called inside a component that's a child of a
 * `FloatingDelayGroup`.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 */
export declare function useDelayGroup(context: FloatingRootContext, options?: UseGroupOptions): GroupContext;

/**
 * @deprecated
 * Use the return value of `useDelayGroup()` instead.
 */
export declare const useDelayGroupContext: () => GroupContext;

/**
 * Closes the floating element when a dismissal is requested — by default, when
 * the user presses the `escape` key or outside of the floating element.
 * @see https://floating-ui.com/docs/useDismiss
 */
export declare function useDismiss(context: FloatingRootContext, props?: UseDismissProps): ElementProps;

export declare interface UseDismissProps {
    /**
     * Whether the Hook is enabled, including all internal Effects and event
     * handlers.
     * @default true
     */
    enabled?: boolean;
    /**
     * Whether to dismiss the floating element upon pressing the `esc` key.
     * @default true
     */
    escapeKey?: boolean;
    /**
     * Whether to dismiss the floating element upon pressing the reference
     * element. You likely want to ensure the `move` option in the `useHover()`
     * Hook has been disabled when this is in use.
     * @default false
     */
    referencePress?: boolean;
    /**
     * The type of event to use to determine a “press”.
     * - `pointerdown` is eager on both mouse + touch input.
     * - `mousedown` is eager on mouse input, but lazy on touch input.
     * - `click` is lazy on both mouse + touch input.
     * @default 'pointerdown'
     */
    referencePressEvent?: 'pointerdown' | 'mousedown' | 'click';
    /**
     * Whether to dismiss the floating element upon pressing outside of the
     * floating element.
     * If you have another element, like a toast, that is rendered outside the
     * floating element’s React tree and don’t want the floating element to close
     * when pressing it, you can guard the check like so:
     * ```jsx
     * useDismiss(context, {
     *   outsidePress: (event) => !event.target.closest('.toast'),
     * });
     * ```
     * @default true
     */
    outsidePress?: boolean | ((event: MouseEvent) => boolean);
    /**
     * The type of event to use to determine an outside “press”.
     * - `pointerdown` is eager on both mouse + touch input.
     * - `mousedown` is eager on mouse input, but lazy on touch input.
     * - `click` is lazy on both mouse + touch input.
     * @default 'pointerdown'
     */
    outsidePressEvent?: 'pointerdown' | 'mousedown' | 'click';
    /**
     * Whether to dismiss the floating element upon scrolling an overflow
     * ancestor.
     * @default false
     */
    ancestorScroll?: boolean;
    /**
     * Determines whether event listeners bubble upwards through a tree of
     * floating elements.
     */
    bubbles?: boolean | {
        escapeKey?: boolean;
        outsidePress?: boolean;
    };
    /**
     * Determines whether to use capture phase event listeners.
     */
    capture?: boolean | {
        escapeKey?: boolean;
        outsidePress?: boolean;
    };
}

/**
 * Provides data to position a floating element and context to add interactions.
 * @see https://floating-ui.com/docs/useFloating
 */
export declare function useFloating<RT extends ReferenceType = ReferenceType>(options?: UseFloatingOptions): UseFloatingReturn<RT>;

export declare type UseFloatingData = Prettify<UseFloatingReturn>;

/**
 * Registers a node into the `FloatingTree`, returning its id.
 * @see https://floating-ui.com/docs/FloatingTree
 */
export declare function useFloatingNodeId(customParentId?: string): string | undefined;

export declare interface UseFloatingOptions<RT extends ReferenceType = ReferenceType> extends Omit<UseFloatingOptions_2<RT>, 'elements'> {
    rootContext?: FloatingRootContext<RT>;
    /**
     * Object of external elements as an alternative to the `refs` object setters.
     */
    elements?: {
        /**
         * Externally passed reference element. Store in state.
         */
        reference?: Element | null;
        /**
         * Externally passed floating element. Store in state.
         */
        floating?: HTMLElement | null;
    };
    /**
     * An event callback that is invoked when the floating element is opened or
     * closed.
     */
    onOpenChange?(open: boolean, event?: Event, reason?: OpenChangeReason): void;
    /**
     * Unique node id when using `FloatingTree`.
     */
    nodeId?: string;
}

/**
 * Returns the parent node id for nested floating elements, if available.
 * Returns `null` for top-level floating elements.
 */
export declare const useFloatingParentNodeId: () => string | null;

/**
 * @see https://floating-ui.com/docs/FloatingPortal#usefloatingportalnode
 */
export declare function useFloatingPortalNode(props?: UseFloatingPortalNodeProps): HTMLElement | null;

export declare interface UseFloatingPortalNodeProps {
    id?: string;
    root?: HTMLElement | ShadowRoot | null | React.MutableRefObject<HTMLElement | ShadowRoot | null>;
}

export declare type UseFloatingReturn<RT extends ReferenceType = ReferenceType> = Prettify<UseFloatingReturn_2 & {
    /**
     * `FloatingContext`
     */
    context: Prettify<FloatingContext<RT>>;
    /**
     * Object containing the reference and floating refs and reactive setters.
     */
    refs: ExtendedRefs<RT>;
    elements: ExtendedElements<RT>;
}>;

export declare function useFloatingRootContext(options: UseFloatingRootContextOptions): FloatingRootContext;

export declare interface UseFloatingRootContextOptions {
    open?: boolean;
    onOpenChange?: (open: boolean, event?: Event, reason?: OpenChangeReason) => void;
    elements: {
        reference: Element | null;
        floating: HTMLElement | null;
    };
}

/**
 * Returns the nearest floating tree context, if available.
 */
export declare const useFloatingTree: <RT extends ReferenceType = ReferenceType>() => FloatingTreeType<RT> | null;

/**
 * Opens the floating element while the reference element has focus, like CSS
 * `:focus`.
 * @see https://floating-ui.com/docs/useFocus
 */
export declare function useFocus(context: FloatingRootContext, props?: UseFocusProps): ElementProps;

export declare interface UseFocusProps {
    /**
     * Whether the Hook is enabled, including all internal Effects and event
     * handlers.
     * @default true
     */
    enabled?: boolean;
    /**
     * Whether the open state only changes if the focus event is considered
     * visible (`:focus-visible` CSS selector).
     * @default true
     */
    visibleOnly?: boolean;
}

declare interface UseGroupOptions {
    /**
     * Whether delay grouping should be enabled.
     * @default true
     */
    enabled?: boolean;
    id?: any;
}

/**
 * Opens the floating element while hovering over the reference element, like
 * CSS `:hover`.
 * @see https://floating-ui.com/docs/useHover
 */
export declare function useHover(context: FloatingRootContext, props?: UseHoverProps): ElementProps;

export declare interface UseHoverProps {
    /**
     * Whether the Hook is enabled, including all internal Effects and event
     * handlers.
     * @default true
     */
    enabled?: boolean;
    /**
     * Accepts an event handler that runs on `mousemove` to control when the
     * floating element closes once the cursor leaves the reference element.
     * @default null
     */
    handleClose?: HandleClose | null;
    /**
     * Waits until the user’s cursor is at “rest” over the reference element
     * before changing the `open` state.
     * @default 0
     */
    restMs?: number | (() => number);
    /**
     * Waits for the specified time when the event listener runs before changing
     * the `open` state.
     * @default 0
     */
    delay?: Delay | (() => Delay);
    /**
     * Whether the logic only runs for mouse input, ignoring touch input.
     * Note: due to a bug with Linux Chrome, "pen" inputs are considered "mouse".
     * @default false
     */
    mouseOnly?: boolean;
    /**
     * Whether moving the cursor over the floating element will open it, without a
     * regular hover event required.
     * @default true
     */
    move?: boolean;
}

/**
 * Uses React 18's built-in `useId()` when available, or falls back to a
 * slightly less performant (requiring a double render) implementation for
 * earlier React versions.
 * @see https://floating-ui.com/docs/react-utils#useid
 */
export declare const useId: () => string | undefined;

/**
 * Changes the `inner` middleware's `offset` upon a `wheel` event to
 * expand the floating element's height, revealing more list items.
 * @see https://floating-ui.com/docs/inner
 * @deprecated
 */
export declare function useInnerOffset(context: FloatingRootContext, props: UseInnerOffsetProps): ElementProps;

export declare interface UseInnerOffsetProps {
    /**
     * Whether the Hook is enabled, including all internal Effects and event
     * handlers.
     * @default true
     */
    enabled?: boolean;
    /**
     * A ref which contains the overflow of the floating element.
     */
    overflowRef: React.MutableRefObject<SideObject | null>;
    /**
     * An optional ref containing an HTMLElement. This may be used as the
     * scrolling container instead of the floating element — for instance,
     * to position inner elements as direct children without being interfered by
     * scrolling layout.
     */
    scrollRef?: React.MutableRefObject<HTMLElement | null>;
    /**
     * Callback invoked when the offset changes.
     */
    onChange: (offset: number | ((offset: number) => number)) => void;
}

/**
 * Merges an array of interaction hooks' props into prop getters, allowing
 * event handler functions to be composed together without overwriting one
 * another.
 * @see https://floating-ui.com/docs/useInteractions
 */
export declare function useInteractions(propsList?: Array<ElementProps | void>): UseInteractionsReturn;

export declare interface UseInteractionsReturn {
    getReferenceProps: (userProps?: React.HTMLProps<Element>) => Record<string, unknown>;
    getFloatingProps: (userProps?: React.HTMLProps<HTMLElement>) => Record<string, unknown>;
    getItemProps: (userProps?: Omit<React.HTMLProps<HTMLElement>, 'selected' | 'active'> & ExtendedUserProps) => Record<string, unknown>;
}

/**
 * Used to register a list item and its index (DOM position) in the
 * `FloatingList`.
 * @see https://floating-ui.com/docs/FloatingList#uselistitem
 */
export declare function useListItem(props?: UseListItemProps): {
    ref: (node: HTMLElement | null) => void;
    index: number;
};

declare interface UseListItemProps {
    label?: string | null;
}

/**
 * Adds arrow key-based navigation of a list of items, either using real DOM
 * focus or virtual focus.
 * @see https://floating-ui.com/docs/useListNavigation
 */
export declare function useListNavigation(context: FloatingRootContext, props: UseListNavigationProps): ElementProps;

export declare interface UseListNavigationProps {
    /**
     * A ref that holds an array of list items.
     * @default empty list
     */
    listRef: React.MutableRefObject<Array<HTMLElement | null>>;
    /**
     * The index of the currently active (focused or highlighted) item, which may
     * or may not be selected.
     * @default null
     */
    activeIndex: number | null;
    /**
     * A callback that is called when the user navigates to a new active item,
     * passed in a new `activeIndex`.
     */
    onNavigate?: (activeIndex: number | null) => void;
    /**
     * Whether the Hook is enabled, including all internal Effects and event
     * handlers.
     * @default true
     */
    enabled?: boolean;
    /**
     * The currently selected item index, which may or may not be active.
     * @default null
     */
    selectedIndex?: number | null;
    /**
     * Whether to focus the item upon opening the floating element. 'auto' infers
     * what to do based on the input type (keyboard vs. pointer), while a boolean
     * value will force the value.
     * @default 'auto'
     */
    focusItemOnOpen?: boolean | 'auto';
    /**
     * Whether hovering an item synchronizes the focus.
     * @default true
     */
    focusItemOnHover?: boolean;
    /**
     * Whether pressing an arrow key on the navigation’s main axis opens the
     * floating element.
     * @default true
     */
    openOnArrowKeyDown?: boolean;
    /**
     * By default elements with either a `disabled` or `aria-disabled` attribute
     * are skipped in the list navigation — however, this requires the items to
     * be rendered.
     * This prop allows you to manually specify indices which should be disabled,
     * overriding the default logic.
     * For Windows-style select menus, where the menu does not open when
     * navigating via arrow keys, specify an empty array.
     * @default undefined
     */
    disabledIndices?: Array<number> | ((index: number) => boolean);
    /**
     * Determines whether focus can escape the list, such that nothing is selected
     * after navigating beyond the boundary of the list. In some
     * autocomplete/combobox components, this may be desired, as screen
     * readers will return to the input.
     * `loop` must be `true`.
     * @default false
     */
    allowEscape?: boolean;
    /**
     * Determines whether focus should loop around when navigating past the first
     * or last item.
     * @default false
     */
    loop?: boolean;
    /**
     * If the list is nested within another one (e.g. a nested submenu), the
     * navigation semantics change.
     * @default false
     */
    nested?: boolean;
    /**
     * Allows to specify the orientation of the parent list, which is used to
     * determine the direction of the navigation.
     * This is useful when list navigation is used within a Composite,
     * as the hook can't determine the orientation of the parent list automatically.
     */
    parentOrientation?: UseListNavigationProps['orientation'];
    /**
     * Whether the direction of the floating element’s navigation is in RTL
     * layout.
     * @default false
     */
    rtl?: boolean;
    /**
     * Whether the focus is virtual (using `aria-activedescendant`).
     * Use this if you need focus to remain on the reference element
     * (such as an input), but allow arrow keys to navigate list items.
     * This is common in autocomplete listbox components.
     * Your virtually-focused list items must have a unique `id` set on them.
     * If you’re using a component role with the `useRole()` Hook, then an `id` is
     * generated automatically.
     * @default false
     */
    virtual?: boolean;
    /**
     * The orientation in which navigation occurs.
     * @default 'vertical'
     */
    orientation?: 'vertical' | 'horizontal' | 'both';
    /**
     * Specifies how many columns the list has (i.e., it’s a grid). Use an
     * orientation of 'horizontal' (e.g. for an emoji picker/date picker, where
     * pressing ArrowRight or ArrowLeft can change rows), or 'both' (where the
     * current row cannot be escaped with ArrowRight or ArrowLeft, only ArrowUp
     * and ArrowDown).
     * @default 1
     */
    cols?: number;
    /**
     * Whether to scroll the active item into view when navigating. The default
     * value uses nearest options.
     */
    scrollItemIntoView?: boolean | ScrollIntoViewOptions;
    /**
     * When using virtual focus management, this holds a ref to the
     * virtually-focused item. This allows nested virtual navigation to be
     * enabled, and lets you know when a nested element is virtually focused from
     * the root reference handling the events. Requires `FloatingTree` to be
     * setup.
     */
    virtualItemRef?: React.MutableRefObject<HTMLElement | null>;
    /**
     * Only for `cols > 1`, specify sizes for grid items.
     * `{ width: 2, height: 2 }` means an item is 2 columns wide and 2 rows tall.
     */
    itemSizes?: Dimensions[];
    /**
     * Only relevant for `cols > 1` and items with different sizes, specify if
     * the grid is dense (as defined in the CSS spec for `grid-auto-flow`).
     * @default false
     */
    dense?: boolean;
}

/**
 * Merges an array of refs into a single memoized callback ref or `null`.
 * @see https://floating-ui.com/docs/react-utils#usemergerefs
 */
export declare function useMergeRefs<Instance>(refs: Array<React.Ref<Instance> | undefined>): null | React.RefCallback<Instance>;

/**
 * Enables grouping when called inside a component that's a child of a
 * `NextFloatingDelayGroup`.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 */
export declare function useNextDelayGroup(context: FloatingRootContext, options?: UseNextDelayGroupOptions): UseNextDelayGroupReturn;

declare interface UseNextDelayGroupOptions {
    /**
     * Whether delay grouping should be enabled.
     * @default true
     */
    enabled?: boolean;
}

declare interface UseNextDelayGroupReturn {
    /**
     * The delay reference object.
     */
    delayRef: React.MutableRefObject<Delay>;
    /**
     * Whether animations should be removed.
     */
    isInstantPhase: boolean;
    /**
     * Whether a `<NextFloatingDelayGroup>` provider is present.
     */
    hasProvider: boolean;
}

/**
 * Adds base screen reader props to the reference and floating elements for a
 * given floating element `role`.
 * @see https://floating-ui.com/docs/useRole
 */
export declare function useRole(context: FloatingRootContext, props?: UseRoleProps): ElementProps;

export declare interface UseRoleProps {
    /**
     * Whether the Hook is enabled, including all internal Effects and event
     * handlers.
     * @default true
     */
    enabled?: boolean;
    /**
     * The role of the floating element.
     * @default 'dialog'
     */
    role?: AriaRole | ComponentRole;
}

/**
 * Provides a status string to apply CSS transitions to a floating element,
 * correctly handling placement-aware transitions.
 * @see https://floating-ui.com/docs/useTransition#usetransitionstatus
 */
export declare function useTransitionStatus(context: FloatingContext, props?: UseTransitionStatusProps): {
    isMounted: boolean;
    status: TransitionStatus;
};

export declare interface UseTransitionStatusProps {
    /**
     * The duration of the transition in milliseconds, or an object containing
     * `open` and `close` keys for different durations.
     */
    duration?: Duration;
}

/**
 * Provides styles to apply CSS transitions to a floating element, correctly
 * handling placement-aware transitions. Wrapper around `useTransitionStatus`.
 * @see https://floating-ui.com/docs/useTransition#usetransitionstyles
 */
export declare function useTransitionStyles<RT extends ReferenceType = ReferenceType>(context: FloatingContext<RT>, props?: UseTransitionStylesProps): {
    isMounted: boolean;
    styles: React.CSSProperties;
};

export declare interface UseTransitionStylesProps extends UseTransitionStatusProps {
    /**
     * The styles to apply when the floating element is initially mounted.
     */
    initial?: CSSStylesProperty;
    /**
     * The styles to apply when the floating element is transitioning to the
     * `open` state.
     */
    open?: CSSStylesProperty;
    /**
     * The styles to apply when the floating element is transitioning to the
     * `close` state.
     */
    close?: CSSStylesProperty;
    /**
     * The styles to apply to all states.
     */
    common?: CSSStylesProperty;
}

/**
 * Provides a matching callback that can be used to focus an item as the user
 * types, often used in tandem with `useListNavigation()`.
 * @see https://floating-ui.com/docs/useTypeahead
 */
export declare function useTypeahead(context: FloatingRootContext, props: UseTypeaheadProps): ElementProps;

export declare interface UseTypeaheadProps {
    /**
     * A ref which contains an array of strings whose indices match the HTML
     * elements of the list.
     * @default empty list
     */
    listRef: React.MutableRefObject<Array<string | null>>;
    /**
     * The index of the active (focused or highlighted) item in the list.
     * @default null
     */
    activeIndex: number | null;
    /**
     * Callback invoked with the matching index if found as the user types.
     */
    onMatch?: (index: number) => void;
    /**
     * Callback invoked with the typing state as the user types.
     */
    onTypingChange?: (isTyping: boolean) => void;
    /**
     * Whether the Hook is enabled, including all internal Effects and event
     * handlers.
     * @default true
     */
    enabled?: boolean;
    /**
     * A function that returns the matching string from the list.
     * @default lowercase-finder
     */
    findMatch?: null | ((list: Array<string | null>, typedString: string) => string | null | undefined);
    /**
     * The number of milliseconds to wait before resetting the typed string.
     * @default 750
     */
    resetMs?: number;
    /**
     * An array of keys to ignore when typing.
     * @default []
     */
    ignoreKeys?: Array<string>;
    /**
     * The index of the selected item in the list, if available.
     * @default null
     */
    selectedIndex?: number | null;
}

export { VirtualElement }

export { }
