import { default as default_2 } from 'react';

declare interface BaseTableVirtuosoHandle {
    /**
     * Obtains the internal size state of the component, so that it can be restored later. This does not include the data items.
     * @param stateCb - Callback that receives the state snapshot
     */
    getState(stateCb: StateCallback): void;
    /**
     * Scrolls the component by the specified amount.
     * @param location - The scroll offset options
     */
    scrollBy(location: ScrollToOptions): void;
    /**
     * Scrolls the component to the specified position.
     * @param location - The scroll position options
     */
    scrollTo(location: ScrollToOptions): void;
}

/**
 * @group Common
 */
export declare type CalculateViewLocation = (params: CalculateViewLocationParams) => IndexLocationWithAlign | null | number;

/**
 * @group Common
 */
export declare interface CalculateViewLocationParams {
    /** The bottom edge position of the item in pixels */
    itemBottom: number;
    /** The top edge position of the item in pixels */
    itemTop: number;
    /** The scroll location parameters including alignment and behavior options */
    locationParams: {
        align?: 'center' | 'end' | 'start';
        behavior?: 'auto' | 'smooth';
    } & ({
        groupIndex: number;
    } | {
        index: number;
    });
    /** The bottom edge position of the viewport in pixels */
    viewportBottom: number;
    /** The top edge position of the viewport in pixels */
    viewportTop: number;
}

/**
 * Customize the Virtuoso rendering by passing a set of custom components.
 *
 * @typeParam Data - The type of data items in the list
 * @typeParam Context - The type of additional context passed to components
 *
 * @example
 * ```tsx
 * const components: Components<User, AppContext> = {
 *   Item: ({ children, context }) => <div className="item">{children}</div>,
 *   Header: ({ context }) => <div>Header</div>,
 *   Footer: ({ context }) => <div>Footer</div>,
 * }
 * <Virtuoso components={components} />
 * ```
 *
 * @see {@link VirtuosoProps.components} for usage in Virtuoso
 * @group Virtuoso
 */
export declare interface Components<Data = unknown, Context = unknown> {
    /**
     * Set to render a custom UI when the list is empty.
     */
    EmptyPlaceholder?: default_2.ComponentType<ContextProp<Context>>;
    /**
     * Set to render a component at the bottom of the list.
     */
    Footer?: default_2.ComponentType<ContextProp<Context>>;
    /**
     * Set to customize the group item wrapping element. Use only if you would like to render list from elements different than a `div`.
     */
    Group?: default_2.ComponentType<GroupProps & ContextProp<Context>>;
    /**
     * Set to render a component at the top of the list.
     *
     * The header remains above the top items and does not remain sticky.
     */
    Header?: default_2.ComponentType<ContextProp<Context>>;
    /**
     * Set to customize the item wrapping element. Use only if you would like to render list from elements different than a `div`.
     */
    Item?: default_2.ComponentType<ItemProps<Data> & ContextProp<Context>>;
    /**
     * Set to customize the items wrapper. Use only if you would like to render list from elements different than a `div`.
     */
    List?: default_2.ComponentType<ListProps & ContextProp<Context>>;
    /**
     * Set to customize the outermost scrollable element. This should not be necessary in general,
     * as the component passes its HTML attribute props to it.
     */
    Scroller?: default_2.ComponentType<ScrollerProps & ContextProp<Context>>;
    /**
     * Set to render an item placeholder when the user scrolls fast.  See the `scrollSeek` property for more details.
     */
    ScrollSeekPlaceholder?: default_2.ComponentType<ScrollSeekPlaceholderProps & ContextProp<Context>>;
    /**
     * Set to customize the top list item wrapping element. Use if you would like to render list from elements different than a `div`
     * or you want to set a custom z-index for the sticky position.
     */
    TopItemList?: default_2.ComponentType<TopItemListProps & ContextProp<Context>>;
}

/**
 * Callback type for computing unique keys for list items.
 *
 * @typeParam Data - The type of the data item
 * @typeParam Context - The type of context passed from the component
 *
 * @see {@link VirtuosoProps.computeItemKey} for usage in Virtuoso
 * @group Common
 */
export declare type ComputeItemKey<Data, Context> = (index: number, item: Data, context: Context) => default_2.Key;

/**
 * @group Common
 */
export declare interface ContextProp<Context> {
    /** The context value passed from the parent component */
    context: Context;
}

/**
 * Dimensions of an element in pixels.
 *
 * @group VirtuosoGrid
 */
export declare interface ElementDimensions {
    /** Height in pixels */
    height: number;
    /** Width in pixels */
    width: number;
}

/**
 * Passed to the Components.FillerRow custom component
 * @group TableVirtuoso
 */
export declare interface FillerRowProps {
    /** The height of the filler row in pixels */
    height: number;
}

/**
 * Callback type for rendering fixed footer content in a table.
 * The footer remains visible at the bottom of the viewport.
 *
 * @example
 * ```tsx
 * const fixedFooterContent: FixedFooterContent = () => (
 *   <tr><td>Total: 100 items</td></tr>
 * )
 * <TableVirtuoso fixedFooterContent={fixedFooterContent} />
 * ```
 *
 * @see {@link TableVirtuosoProps.fixedFooterContent} for usage
 * @group TableVirtuoso
 */
export declare type FixedFooterContent = (() => default_2.ReactNode) | null;

/**
 * Callback type for rendering fixed header content in a table.
 * The header remains visible at the top of the viewport.
 *
 * @example
 * ```tsx
 * const fixedHeaderContent: FixedHeaderContent = () => (
 *   <tr><th>Name</th><th>Email</th></tr>
 * )
 * <TableVirtuoso fixedHeaderContent={fixedHeaderContent} />
 * ```
 *
 * @see {@link TableVirtuosoProps.fixedHeaderContent} for usage
 * @group TableVirtuoso
 */
export declare type FixedHeaderContent = (() => default_2.ReactNode) | null;

/**
 * @group Common
 */
export declare interface FlatIndexLocationWithAlign extends LocationOptions {
    /**
     * The index of the item to scroll to.
     */
    index: 'LAST' | number;
}

/**
 * @group Common
 */
export declare interface FlatScrollIntoViewLocation extends ScrollIntoViewLocationOptions {
    /** The index of the item to scroll into view */
    index: number;
}

/**
 * @group Common
 */
export declare type FollowOutput = FollowOutputCallback | FollowOutputScalarType;

/**
 * @group Common
 */
export declare type FollowOutputCallback = (isAtBottom: boolean) => FollowOutputScalarType;

/**
 * @group Common
 */
export declare type FollowOutputScalarType = 'auto' | 'smooth' | boolean;

/**
 * Gap between grid items in pixels.
 *
 * @group VirtuosoGrid
 */
export declare interface Gap {
    /** Horizontal gap between columns */
    column: number;
    /** Vertical gap between rows */
    row: number;
}

/**
 * Customize the VirtuosoGrid rendering by passing a set of custom components.
 *
 * @typeParam Context - The type of additional context passed to components
 *
 * @example
 * ```tsx
 * const components: GridComponents<AppContext> = {
 *   Item: ({ children, className }) => <div className={className}>{children}</div>,
 *   Header: ({ context }) => <div>Header</div>,
 * }
 * <VirtuosoGrid components={components} />
 * ```
 *
 * @see {@link VirtuosoGridProps.components} for usage in VirtuosoGrid
 * @group VirtuosoGrid
 */
export declare interface GridComponents<Context = any> {
    /**
     * Set to render a component at the bottom of the list.
     */
    Footer?: default_2.ComponentType<ContextProp<Context>>;
    /**
     * Set to render a component at the top of the list.
     *
     * The header remains above the top items and does not remain sticky.
     */
    Header?: default_2.ComponentType<ContextProp<Context>>;
    /**
     * Set to customize the item wrapping element. Use only if you would like to render list from elements different than a `div`.
     */
    Item?: default_2.ComponentType<GridItemProps & ContextProp<Context>>;
    /**
     * Set to customize the items wrapper. Use only if you would like to render list from elements different than a `div`.
     */
    List?: default_2.ComponentType<GridListProps & ContextProp<Context>>;
    /**
     * Set to customize the outermost scrollable element. This should not be necessary in general,
     * as the component passes its HTML attribute props to it.
     */
    Scroller?: default_2.ComponentType<ScrollerProps & ContextProp<Context>>;
    /**
     * Set to render an item placeholder when the user scrolls fast.
     * See the `scrollSeekConfiguration` property for more details.
     */
    ScrollSeekPlaceholder?: default_2.ComponentType<GridScrollSeekPlaceholderProps & ContextProp<Context>>;
}

/**
 * Callback type for computing unique keys for grid items.
 *
 * @typeParam Data - The type of the data item
 * @typeParam Context - The type of context passed from the component
 *
 * @see {@link VirtuosoGridProps.computeItemKey} for usage
 * @group VirtuosoGrid
 */
export declare type GridComputeItemKey<Data, Context> = (index: number, item: Data, context: Context) => default_2.Key;

/**
 * @group VirtuosoGrid
 */
export declare type GridIndexLocation = FlatIndexLocationWithAlign | number;

/**
 * @group VirtuosoGrid
 */
export declare interface GridItem<Data> {
    /** The data associated with this grid item */
    data?: Data;
    /** The index of the item in the grid */
    index: number;
}

/**
 * Callback type for rendering item content in a VirtuosoGrid.
 *
 * @typeParam Data - The type of the data item
 * @typeParam Context - The type of context passed from the component
 *
 * @example
 * ```tsx
 * const itemContent: GridItemContent<Product, AppContext> = (index, product, context) => (
 *   <div className="grid-item">{product.name}</div>
 * )
 * <VirtuosoGrid itemContent={itemContent} data={products} />
 * ```
 *
 * @see {@link VirtuosoGridProps.itemContent} for usage
 * @group VirtuosoGrid
 */
export declare type GridItemContent<Data, Context> = (index: number, data: Data, context: Context) => default_2.ReactNode;

/**
 * Passed to the GridComponents.Item custom component
 * @group VirtuosoGrid
 */
export declare type GridItemProps = Pick<default_2.ComponentProps<'div'>, 'children' | 'className' | 'style'> & default_2.RefAttributes<HTMLDivElement> & {
    'data-index': number;
};

/**
 * Passed to the GridComponents.List custom component
 * @group VirtuosoGrid
 */
export declare type GridListProps = Pick<default_2.ComponentProps<'div'>, 'children' | 'className' | 'style'> & default_2.RefAttributes<HTMLDivElement> & {
    'data-testid': string;
};

/**
 * @group VirtuosoGrid
 */
export declare type GridRootProps = Omit<default_2.HTMLProps<HTMLDivElement>, 'data' | 'ref'>;

/**
 * Passed to the GridComponents.ScrollSeekPlaceholder custom component
 * @group VirtuosoGrid
 */
export declare interface GridScrollSeekPlaceholderProps {
    /** The height of the placeholder in pixels */
    height: number;
    /** The index of the item being replaced by the placeholder */
    index: number;
    /** The width of the placeholder in pixels */
    width: number;
}

/**
 * A snapshot of the VirtuosoGrid state that can be saved and restored.
 * Use this to persist scroll position and layout across page reloads.
 *
 * @see {@link VirtuosoGridProps.restoreStateFrom} for restoring state
 * @see {@link VirtuosoGridProps.stateChanged} for capturing state
 * @group VirtuosoGrid
 */
export declare interface GridStateSnapshot {
    /** Gap between items */
    gap: Gap;
    /** Item dimensions */
    item: ElementDimensions;
    /** Scroll position in pixels */
    scrollTop: number;
    /** Viewport dimensions */
    viewport: ElementDimensions;
}

/**
 * Callback type for rendering group header content in GroupedVirtuoso.
 *
 * @typeParam Context - The type of context passed from the component
 *
 * @example
 * ```tsx
 * const groupContent: GroupContent<AppContext> = (index, context) => (
 *   <div className="group-header">Group {index}</div>
 * )
 * <GroupedVirtuoso groupContent={groupContent} />
 * ```
 *
 * @see {@link GroupedVirtuosoProps.groupContent} for usage
 * @group GroupedVirtuoso
 */
export declare type GroupContent<Context> = (index: number, context: Context) => default_2.ReactNode;

/**
 * @group GroupedVirtuoso
 */
export declare interface GroupedScrollIntoViewLocation extends ScrollIntoViewLocationOptions {
    /** The index of the group to scroll into view */
    groupIndex: number;
}

/**
 * A virtualized table component for rendering grouped tabular data with sticky group headers.
 * Combines TableVirtuoso functionality with group support for hierarchical data.
 *
 * @typeParam ItemData - The type of data items in the table
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @param props - {@link GroupedTableVirtuosoProps}
 *
 * @function
 * @group GroupedTableVirtuoso
 *
 * @example
 * ```tsx
 * <GroupedTableVirtuoso
 *   groupCounts={[10, 20, 15]}
 *   groupContent={(index) => (
 *     <td colSpan={2}>Group {index}</td>
 *   )}
 *   itemContent={(index, groupIndex) => (
 *     <>
 *       <td>Item {index}</td>
 *       <td>Group {groupIndex}</td>
 *     </>
 *   )}
 * />
 * ```
 *
 * @see {@link GroupedTableVirtuosoProps} for available props
 * @see {@link GroupedTableVirtuosoHandle} for imperative methods
 */
export declare const GroupedTableVirtuoso: <ItemData = any, Context = any>(props: GroupedTableVirtuosoProps<ItemData, Context> & {
    ref?: default_2.Ref<GroupedTableVirtuosoHandle>;
}) => default_2.ReactElement;

/**
 * Exposes the GroupedTableVirtuoso component methods for imperative control.
 * Access via ref on the GroupedTableVirtuoso component.
 *
 * @see {@link GroupedTableVirtuoso} for the component
 * @see {@link GroupedTableVirtuosoProps} for available props
 * @group GroupedTableVirtuoso
 */
export declare interface GroupedTableVirtuosoHandle extends BaseTableVirtuosoHandle {
    /**
     * Scrolls the specified item into view if it's not already visible.
     * @param location - The scroll into view location options
     */
    scrollIntoView(location: ScrollIntoViewLocationOptions): void;
    /**
     * Scrolls the component to the specified item index.
     * @param location - The item index or location with alignment options
     */
    scrollToIndex(location: IndexLocationWithAlign | number): void;
}

/**
 * The props for the GroupedTableVirtuoso component.
 *
 * @typeParam Data - The type of data items in the table
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @see {@link GroupedTableVirtuoso} for the component
 * @see {@link GroupedTableVirtuosoHandle} for imperative methods
 * @group GroupedTableVirtuoso
 */
export declare interface GroupedTableVirtuosoProps<Data, Context> extends Omit<TableVirtuosoProps<Data, Context>, 'itemContent' | 'totalCount'> {
    /**
     * Use when implementing inverse infinite scrolling, decrease the value this property
     * in combination with a change in `groupCounts` to prepend groups items to the top of the list.
     * Both new groups and extending the top group is supported.
     *
     * The delta of the firstItemIndex should equal the amount of new items introduced, without the group themselves.
     * As an example, if you prepend 2 groups with 20 and 30 items each, the firstItemIndex should be decreased with 50.
     *
     * You can also prepend more items to the first group, for example:
     * `{ groupCounts: [20, 30], firstItemIndex: 1000 }` can become `{ groupCounts: [10, 30, 30], firstItemIndex: 980 }`
     *
     * Warning: the firstItemIndex should **be a positive number**, based on the total amount of items to be displayed.
     */
    firstItemIndex?: number;
    /**
     * Specifies how each each group header gets rendered. The callback receives the zero-based index of the group.
     */
    groupContent?: GroupContent<Context>;
    /**
     * Specifies the amount of items in each group (and, actually, how many groups are there).
     * For example, passing [20, 30] will display 2 groups with 20 and 30 items each.
     */
    groupCounts?: number[];
    /**
     * Specifies how each each item gets rendered.
     */
    itemContent?: GroupItemContent<Data, Context>;
}

/**
 * A virtualized list component for rendering grouped data with sticky group headers.
 * Extends Virtuoso with support for collapsible groups and group-level navigation.
 *
 * @typeParam ItemData - The type of data items in the list
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @param props - {@link GroupedVirtuosoProps}
 *
 * @function
 * @group GroupedVirtuoso
 *
 * @example
 * ```tsx
 * <GroupedVirtuoso
 *   groupCounts={[10, 20, 15]}
 *   groupContent={(index) => <div>Group {index}</div>}
 *   itemContent={(index, groupIndex) => <div>Item {index} in group {groupIndex}</div>}
 * />
 * ```
 *
 * @see {@link GroupedVirtuosoProps} for available props
 * @see {@link GroupedVirtuosoHandle} for imperative methods
 */
export declare const GroupedVirtuoso: <ItemData = any, Context = any>(props: GroupedVirtuosoProps<ItemData, Context> & {
    ref?: default_2.Ref<GroupedVirtuosoHandle>;
}) => default_2.ReactElement;

/**
 * Exposes the GroupedVirtuoso component methods for imperative control.
 * Access via ref on the GroupedVirtuoso component.
 *
 * @see {@link GroupedVirtuoso} for the component
 * @see {@link GroupedVirtuosoProps} for available props
 * @group GroupedVirtuoso
 */
export declare interface GroupedVirtuosoHandle {
    /**
     * Scrolls to the bottom of the list if follow output is active. Useful when images load in the list.
     */
    autoscrollToBottom(): void;
    /**
     * Obtains the internal size state of the component, so that it can be restored later. This does not include the data items.
     * @param stateCb - Callback that receives the state snapshot
     */
    getState(stateCb: StateCallback): void;
    /**
     * Scrolls the component by the specified amount.
     * @param location - The scroll offset options
     */
    scrollBy(location: ScrollToOptions): void;
    /**
     * Scrolls the specified item into view if it's not already visible.
     * @param location - The item index or scroll location options
     */
    scrollIntoView(location: number | ScrollIntoViewLocation): void;
    /**
     * Scrolls the component to the specified position.
     * @param location - The scroll position options
     */
    scrollTo(location: ScrollToOptions): void;
    /**
     * Scrolls the component to the specified item index.
     * @param location - The item index or location with alignment options
     */
    scrollToIndex(location: IndexLocationWithAlign | number): void;
}

/**
 * The props for the GroupedVirtuoso component.
 *
 * @typeParam Data - The type of data items in the list
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @see {@link GroupedVirtuoso} for the component
 * @see {@link GroupedVirtuosoHandle} for imperative methods
 * @group GroupedVirtuoso
 */
export declare interface GroupedVirtuosoProps<Data, Context> extends Omit<VirtuosoProps<Data, Context>, 'itemContent' | 'totalCount'> {
    /**
     * Use when implementing inverse infinite scrolling, decrease the value this property
     * in combination with a change in `groupCounts` to prepend groups items to the top of the list.
     * Both new groups and extending the top group is supported.
     *
     * The delta of the firstItemIndex should equal the amount of new items introduced, without the group themselves.
     * As an example, if you prepend 2 groups with 20 and 30 items each, the firstItemIndex should be decreased with 50.
     *
     * You can also prepend more items to the first group, for example:
     * `{ groupCounts: [20, 30], firstItemIndex: 1000 }` can become `{ groupCounts: [10, 30, 30], firstItemIndex: 980 }`
     *
     * Warning: the firstItemIndex should **be a positive number**, based on the total amount of items to be displayed.
     */
    firstItemIndex?: number;
    /**
     * Specifies how each each group header gets rendered. The callback receives the zero-based index of the group.
     */
    groupContent?: GroupContent<Context>;
    /**
     * Specifies the amount of items in each group (and, actually, how many groups are there).
     * For example, passing [20, 30] will display 2 groups with 20 and 30 items each.
     */
    groupCounts?: number[];
    /**
     * Specifies how each each item gets rendered.
     */
    itemContent?: GroupItemContent<Data, Context>;
}

/**
 * @group GroupedVirtuoso
 */
export declare interface GroupIndexLocationWithAlign extends LocationOptions {
    /**
     * The group index of the item to scroll to.
     */
    groupIndex: number;
}

/**
 * @group GroupedVirtuoso
 */
export declare interface GroupItem<Data> extends Item<Data> {
    /** The original index before any transformations were applied */
    originalIndex?: number;
    /** Identifies this as a group header item */
    type: 'group';
}

/**
 * Callback type for rendering item content in a GroupedVirtuoso list.
 * Similar to ItemContent but includes the group index.
 *
 * @typeParam Data - The type of the data item
 * @typeParam Context - The type of context passed from the component
 *
 * @example
 * ```tsx
 * const itemContent: GroupItemContent<User, AppContext> = (index, groupIndex, user, context) => (
 *   <div>{user.name} (Group {groupIndex})</div>
 * )
 * <GroupedVirtuoso itemContent={itemContent} />
 * ```
 *
 * @see {@link GroupedVirtuosoProps.itemContent} for usage
 * @see {@link ItemContent} for non-grouped list variant
 * @group GroupedVirtuoso
 */
export declare type GroupItemContent<Data, Context> = (index: number, groupIndex: number, data: Data, context: Context) => default_2.ReactNode;

/**
 * Passed to the Components.Group custom component
 * @group GroupedVirtuoso
 */
export declare type GroupProps = Pick<default_2.ComponentProps<'div'>, 'children' | 'style'> & {
    /** The index of the group */
    'data-index': number;
    /** The item index within the flattened list */
    'data-item-index': number;
    /** The measured size of the group header in pixels */
    'data-known-size': number;
};

/**
 * @group Common
 */
export declare type IndexLocationWithAlign = FlatIndexLocationWithAlign | GroupIndexLocationWithAlign;

/**
 * Base interface for list items with position and size information.
 * @group Common
 */
export declare interface Item<Data> {
    /** The data associated with this item */
    data?: Data;
    /** The index of the item in the list */
    index: number;
    /** The offset position of the item from the start of the list in pixels */
    offset: number;
    /** The measured size of the item in pixels */
    size: number;
}

/**
 * Callback type for rendering item content in a Virtuoso list.
 *
 * @typeParam Data - The type of the data item
 * @typeParam Context - The type of context passed from the component
 *
 * @example
 * ```tsx
 * const itemContent: ItemContent<User, AppContext> = (index, user, context) => (
 *   <div>{user.name}</div>
 * )
 * <Virtuoso itemContent={itemContent} data={users} />
 * ```
 *
 * @see {@link VirtuosoProps.itemContent} for usage in Virtuoso
 * @see {@link GroupItemContent} for grouped list variant
 * @group Virtuoso
 */
export declare type ItemContent<Data, Context> = (index: number, data: Data, context: Context) => default_2.ReactNode;

/**
 * Passed to the Components.Item custom component
 * @group Virtuoso
 */
export declare type ItemProps<Data> = Pick<default_2.ComponentProps<'div'>, 'children' | 'style'> & {
    'data-index': number;
    'data-item-group-index'?: number;
    'data-item-index': number;
    'data-known-size': number;
    item: Data;
};

/**
 * Union type representing either a regular item or a group header item in the list.
 *
 * @typeParam Data - The type of the data item
 *
 * @see {@link RecordItem} for regular items
 * @see {@link GroupItem} for group header items
 * @group Common
 */
export declare type ListItem<Data> = GroupItem<Data> | RecordItem<Data>;

/**
 * Passed to the Components.List custom component
 * @group Virtuoso
 */
export declare type ListProps = Pick<default_2.ComponentProps<'div'>, 'children' | 'style'> & default_2.RefAttributes<HTMLDivElement> & {
    'data-testid': string;
};

/**
 * Represents a range of items in the list by their indices.
 * Used to track which items are currently visible in the viewport.
 *
 * @see {@link VirtuosoProps.rangeChanged} for visibility change events
 * @group Common
 */
export declare interface ListRange {
    /** The index of the last visible item */
    endIndex: number;
    /** The index of the first visible item */
    startIndex: number;
}

/**
 * @group Virtuoso
 */
export declare type ListRootProps = Omit<default_2.HTMLProps<HTMLDivElement>, 'data' | 'ref'>;

/**
 * @group Common
 */
export declare interface LocationOptions {
    /**
     * How to position the item in the viewport.
     */
    align?: 'center' | 'end' | 'start';
    /**
     * Set 'smooth' to have an animated transition to the specified location.
     */
    behavior?: 'auto' | 'smooth';
    /**
     * The offset to scroll.
     */
    offset?: number;
}

/**
 * Log levels for controlling virtuoso diagnostic output.
 * Use with the `logLevel` prop to enable debugging information.
 *
 * @example
 * ```tsx
 * import { Virtuoso, LogLevel } from 'react-virtuoso'
 *
 * <Virtuoso
 *   totalCount={1000}
 *   logLevel={LogLevel.DEBUG}
 *   itemContent={(index) => <div>Item {index}</div>}
 * />
 * ```
 *
 * @group Common
 */
export declare enum LogLevel {
    /** Detailed debugging information including item measurements */
    DEBUG = 0,
    /** General informational messages */
    INFO = 1,
    /** Warning messages for potential issues */
    WARN = 2,
    /** Error messages for failures (default level) */
    ERROR = 3
}

/**
 * Represents a regular data item (not a group header) in the list.
 * @group Common
 */
export declare interface RecordItem<Data> extends Item<Data> {
    /** The data associated with this item */
    data?: Data;
    /** The index of the group this item belongs to (if in a grouped list) */
    groupIndex?: number;
    /** The original index before any transformations were applied */
    originalIndex?: number;
    /** Undefined for regular items (used to distinguish from group items) */
    type?: undefined;
}

/**
 * Represents the current scroll state of the container.
 * @group Common
 */
export declare interface ScrollContainerState {
    /** The total scrollable height of the content in pixels */
    scrollHeight: number;
    /** The current scroll position from the top in pixels */
    scrollTop: number;
    /** The visible height of the viewport in pixels */
    viewportHeight: number;
}

/**
 * Passed to the Components.Scroller custom component
 * @group Common
 */
export declare type ScrollerProps = Pick<default_2.ComponentProps<'div'>, 'children' | 'style' | 'tabIndex'> & default_2.RefAttributes<HTMLDivElement> & {
    'data-testid'?: string;
    'data-virtuoso-scroller'?: boolean;
};

/**
 * @group Common
 */
export declare type ScrollIntoViewLocation = FlatScrollIntoViewLocation | GroupedScrollIntoViewLocation;

/**
 * Options for scrolling an item into view.
 * @group Common
 */
export declare interface ScrollIntoViewLocationOptions {
    /** How to align the item within the viewport */
    align?: 'center' | 'end' | 'start';
    /** The scroll behavior - 'smooth' for animated scrolling, 'auto' for instant */
    behavior?: 'auto' | 'smooth';
    /**
     * Use this function to fine-tune the scrollIntoView behavior.
     * The function receives the item's top and bottom position in the viewport, and the viewport top/bottom.
     * Return an location object to scroll, or null to prevent scrolling.
     * Here's the default implementation:
     * ```ts
     const defaultCalculateViewLocation: CalculateViewLocation = ({
     itemTop,
     itemBottom,
     viewportTop,
     viewportBottom,
     locationParams: { behavior, align, ...rest },
     }) => {
     if (itemTop < viewportTop) {
     return { ...rest, behavior, align: align ?? 'start' }
     }
     if (itemBottom > viewportBottom) {
     return { ...rest, behavior, align: align ?? 'end' }
     }
     return null
     }
     *```
     */
    calculateViewLocation?: CalculateViewLocation;
    /**
     * Will be called when the scroll is done, or immediately if no scroll is needed.
     */
    done?: () => void;
}

/**
 * Configuration for scroll seek mode, which renders placeholders during fast scrolling.
 * This improves performance when users scroll rapidly through large lists.
 *
 * @example
 * ```tsx
 * const scrollSeekConfiguration: ScrollSeekConfiguration = {
 *   enter: (velocity) => Math.abs(velocity) > 200,
 *   exit: (velocity) => Math.abs(velocity) < 30,
 *   change: (velocity, range) => console.log('Scrolling', range),
 * }
 * <Virtuoso scrollSeekConfiguration={scrollSeekConfiguration} />
 * ```
 *
 * @see {@link VirtuosoProps.scrollSeekConfiguration} for usage
 * @see {@link Components.ScrollSeekPlaceholder} for custom placeholder rendering
 * @group Common
 */
export declare interface ScrollSeekConfiguration {
    /**
     * Called during scrolling in scroll seek mode - use to display a hint where the list is.
     */
    change?: (velocity: number, range: ListRange) => void;
    /**
     * Callback to determine if the list should enter "scroll seek" mode.
     */
    enter: ScrollSeekToggle;
    /**
     * Callback to determine if the list should exit "scroll seek" mode.
     */
    exit: ScrollSeekToggle;
}

/**
 * Passed to the Components.ScrollSeekPlaceholder custom component
 * @group Virtuoso
 */
export declare interface ScrollSeekPlaceholderProps {
    /** The group index if this placeholder represents a group header */
    groupIndex?: number;
    /** The height of the placeholder in pixels */
    height: number;
    /** The index of the item being replaced by the placeholder */
    index: number;
    /** Whether this placeholder represents a group header or a regular item */
    type: 'group' | 'item';
}

/**
 * @group Common
 */
export declare type ScrollSeekToggle = (velocity: number, range: ListRange) => boolean;

/**
 * Custom function for calculating item sizes.
 * Override to account for margins, padding, or other layout considerations.
 *
 * @see {@link VirtuosoProps.itemSize} for usage
 * @group Common
 */
export declare type SizeFunction = (el: HTMLElement, field: 'offsetHeight' | 'offsetWidth') => number;

/**
 * Represents a range of items that share the same size.
 * @group Common
 */
export declare interface SizeRange {
    /** The ending index of items in this size range (inclusive) */
    endIndex: number;
    /** The size in pixels shared by items in this range */
    size: number;
    /** The starting index of items in this size range */
    startIndex: number;
}

/**
 * Callback type for receiving state snapshots for persistence.
 *
 * @see {@link VirtuosoProps.getState} for usage
 * @see {@link StateSnapshot} for the snapshot structure
 * @group Common
 */
export declare type StateCallback = (state: StateSnapshot) => void;

/**
 * A snapshot of the virtuoso state that can be saved and restored.
 * Use this to persist scroll position and item sizes across page reloads.
 *
 * @see {@link VirtuosoProps.restoreStateFrom} for restoring state
 * @see {@link VirtuosoHandle.getState} for capturing state
 * @group Common
 */
export declare interface StateSnapshot {
    /** The measured size ranges of items */
    ranges: SizeRange[];
    /** The scroll position in pixels */
    scrollTop: number;
}

/**
 * Passed to the TableComponents.TableBody custom component
 * @group TableVirtuoso
 */
export declare type TableBodyProps = Pick<default_2.ComponentProps<'tbody'>, 'children' | 'className' | 'style'> & default_2.RefAttributes<HTMLTableSectionElement> & {
    'data-testid': string;
};

/**
 * Customize the TableVirtuoso rendering by passing a set of custom components.
 *
 * @typeParam Data - The type of data items in the table
 * @typeParam Context - The type of additional context passed to components
 *
 * @example
 * ```tsx
 * const components: TableComponents<User, AppContext> = {
 *   Table: ({ children, style }) => <table style={style}>{children}</table>,
 *   TableRow: ({ children, item }) => <tr>{children}</tr>,
 * }
 * <TableVirtuoso components={components} />
 * ```
 *
 * @see {@link TableVirtuosoProps.components} for usage in TableVirtuoso
 * @group TableVirtuoso
 */
export declare interface TableComponents<Data = unknown, Context = unknown> {
    /**
     * Set to render a custom UI when the list is empty.
     */
    EmptyPlaceholder?: default_2.ComponentType<ContextProp<Context>>;
    /**
     * Set to render an empty item placeholder.
     */
    FillerRow?: default_2.ComponentType<FillerRowProps & ContextProp<Context>>;
    /**
     * Set to customize the outermost scrollable element. This should not be necessary in general,
     * as the component passes its HTML attribute props to it.
     */
    Scroller?: default_2.ComponentType<ScrollerProps & ContextProp<Context>>;
    /**
     * Set to render an item placeholder when the user scrolls fast.  See the `scrollSeek` property for more details.
     */
    ScrollSeekPlaceholder?: default_2.ComponentType<ScrollSeekPlaceholderProps & ContextProp<Context>>;
    /**
     * Set to customize the wrapping `table` element.
     *
     */
    Table?: default_2.ComponentType<TableProps & ContextProp<Context>>;
    /**
     * Set to customize the items wrapper. Default is `tbody`.
     */
    TableBody?: default_2.ComponentType<TableBodyProps & ContextProp<Context>>;
    /**
     * Set to customize the group item wrapping element. Use only if you would like to render list from elements different than a `tr`.
     */
    Group?: default_2.ComponentType<GroupProps & ContextProp<Context>>;
    /**
     * Set to render a fixed footer at the bottom of the table (`tfoot`). use [[fixedFooterContent]] to set the contents
     */
    TableFoot?: default_2.ComponentType<Pick<default_2.ComponentProps<'tfoot'>, 'children' | 'style'> & default_2.RefAttributes<HTMLTableSectionElement> & ContextProp<Context>>;
    /**
     * Set to render a fixed header at the top of the table (`thead`). use [[fixedHeaderContent]] to set the contents
     *
     */
    TableHead?: default_2.ComponentType<Pick<default_2.ComponentProps<'thead'>, 'children' | 'style'> & default_2.RefAttributes<HTMLTableSectionElement> & ContextProp<Context>>;
    /**
     * Set to customize the item wrapping element. Default is `tr`.
     */
    TableRow?: default_2.ComponentType<ItemProps<Data> & ContextProp<Context>>;
}

/**
 * @group TableVirtuoso
 */
export declare type TableProps = Pick<default_2.ComponentProps<'table'>, 'children' | 'style'>;

/**
 * @group TableVirtuoso
 */
export declare type TableRootProps = Omit<default_2.HTMLProps<HTMLTableElement>, 'data' | 'ref'>;

/**
 * A virtualized table component for efficiently rendering large tabular datasets.
 * Renders semantic HTML table markup with support for fixed headers and footers.
 *
 * @typeParam ItemData - The type of data items in the table
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @param props - {@link TableVirtuosoProps}
 *
 * @function
 * @group TableVirtuoso
 *
 * @example
 * ```tsx
 * <TableVirtuoso
 *   totalCount={1000}
 *   fixedHeaderContent={() => (
 *     <tr>
 *       <th>Name</th>
 *       <th>Description</th>
 *     </tr>
 *   )}
 *   itemContent={(index) => (
 *     <>
 *       <td>Item {index}</td>
 *       <td>Description {index}</td>
 *     </>
 *   )}
 * />
 * ```
 *
 * @see {@link TableVirtuosoProps} for available props
 * @see {@link TableVirtuosoHandle} for imperative methods
 * @see {@link TableComponents} for customizing table elements
 */
export declare const TableVirtuoso: <ItemData = any, Context = any>(props: TableVirtuosoProps<ItemData, Context> & {
    ref?: default_2.Ref<TableVirtuosoHandle>;
}) => default_2.ReactElement;

/**
 * Exposes the TableVirtuoso component methods for imperative control.
 * Access via ref on the TableVirtuoso component.
 *
 * @see {@link TableVirtuoso} for the component
 * @see {@link TableVirtuosoProps} for available props
 * @group TableVirtuoso
 */
export declare interface TableVirtuosoHandle extends BaseTableVirtuosoHandle {
    /**
     * Scrolls the specified item into view if it's not already visible.
     * @param location - The item index or scroll into view location options
     */
    scrollIntoView(location: FlatScrollIntoViewLocation | number): void;
    /**
     * Scrolls the component to the specified item index.
     * @param location - The item index or location with alignment options
     */
    scrollToIndex(location: FlatIndexLocationWithAlign | number): void;
}

/**
 * The props for the TableVirtuoso component.
 *
 * @typeParam Data - The type of data items in the table
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @see {@link TableVirtuoso} for the component
 * @see {@link TableVirtuosoHandle} for imperative methods
 * @see {@link TableComponents} for customizing table elements
 * @group TableVirtuoso
 */
export declare interface TableVirtuosoProps<Data, Context> extends Omit<VirtuosoProps<Data, Context>, 'components' | 'headerFooterTag'> {
    /**
     * Setting `alignToBottom` to `true` aligns the items to the bottom of the list if the list is shorter than the viewport.
     * Use `followOutput` property to keep the list aligned when new items are appended.
     */
    alignToBottom?: boolean;
    /**
     * Called with true / false when the list has reached the bottom / gets scrolled up.
     * Can be used to load newer items, like `tail -f`.
     */
    atBottomStateChange?: (atBottom: boolean) => void;
    /**
     * By default `4`. Redefine to change how much away from the bottom the scroller can be before the list is not considered not at bottom.
     */
    atBottomThreshold?: number;
    /**
     * Called with `true` / `false` when the list has reached the top / gets scrolled down.
     */
    atTopStateChange?: (atTop: boolean) => void;
    /**
     * By default `0`. Redefine to change how much away from the top the scroller can be before the list is not considered not at top.
     */
    atTopThreshold?: number;
    /**
     * Use the `components` property for advanced customization of the elements rendered by the table.
     */
    components?: TableComponents<Data, Context>;
    /**
     * If specified, the component will use the function to generate the `key` property for each list item.
     */
    computeItemKey?: ComputeItemKey<Data, Context>;
    /**
     * Pass a reference to a scrollable parent element, so that the table won't wrap in its own.
     */
    customScrollParent?: HTMLElement;
    /**
     * The data items to be rendered. If data is set, the total count will be inferred from the length of the array.
     */
    data?: readonly Data[];
    /**
     * By default, the component assumes the default item height from the first rendered item (rendering it as a "probe").
     *
     * If the first item turns out to be an outlier (very short or tall), the rest of the rendering will be slower,
     * as multiple passes of rendering should happen for the list to fill the viewport.
     *
     * Setting `defaultItemHeight` causes the component to skip the "probe" rendering and use the property
     * value as default height instead.
     */
    defaultItemHeight?: number;
    /**
     * Gets called when the user scrolls to the end of the list.
     * Receives the last item index as an argument. Can be used to implement endless scrolling.
     */
    endReached?: (index: number) => void;
    /**
     * Use when implementing inverse infinite scrolling - decrease the value this property
     * in combination with  `data` or `totalCount` to prepend items to the top of the list.
     *
     * Warning: the firstItemIndex should **be a positive number**, based on the total amount of items to be displayed.
     */
    firstItemIndex?: number;
    /**
     * Set the contents of the table footer.
     */
    fixedFooterContent?: FixedFooterContent;
    /**
     * Set the contents of the table header.
     */
    fixedHeaderContent?: FixedHeaderContent;
    /**
     * Can be used to improve performance if the rendered items are of known size.
     * Setting it causes the component to skip item measurements.
     */
    fixedItemHeight?: number;
    /**
     * If set to `true`, the list automatically scrolls to bottom if the total count is changed.
     * Set to `"smooth"` for an animated scrolling.
     *
     * By default, `followOutput` scrolls down only if the list is already at the bottom.
     * To implement an arbitrary logic behind that, pass a function:
     *
     * ```tsx
     * <Virtuoso
     *  followOutput={(isAtBottom: boolean) => {
     *    if (expression) {
     *      return 'smooth' // can be 'auto' or false to avoid scrolling
     *    } else {
     *      return false
     *    }
     *  }} />
     * ```
     */
    followOutput?: FollowOutput;
    /**
     * Set the increaseViewportBy property to artificially increase the viewport size, causing items to be rendered before outside of the viewport.
     * The property causes the component to render more items than the necessary, but can help with slow loading content.
     * Using `{ top?: number, bottom?: number }` lets you set the increase for each end separately.
     */
    increaseViewportBy?: number | {
        bottom: number;
        top: number;
    };
    /**
     * Set the minimum number of items to render before and after the visible viewport boundaries.
     * This is useful when rendering items with dynamic or very tall content, where the pixel-based
     * `increaseViewportBy` may not be sufficient to prevent empty areas during rapid resizing or scrolling.
     * Using `{ top?: number, bottom?: number }` lets you set the count for each end separately.
     */
    minOverscanItemCount?: number | {
        bottom: number;
        top: number;
    };
    /**
     * Use for server-side rendering - if set, the list will render the specified amount of items
     * regardless of the container / item size.
     */
    initialItemCount?: number;
    /**
     * Set this value to offset the initial location of the list.
     * Warning: using this property will still run a render cycle at the scrollTop: 0 list window.
     * If possible, avoid using it and stick to `initialTopMostItemIndex` instead.
     */
    initialScrollTop?: number;
    /**
     * Set to a value between 0 and totalCount - 1 to make the list start scrolled to that item.
     * Pass in an object to achieve additional effects similar to `scrollToIndex`.
     */
    initialTopMostItemIndex?: IndexLocationWithAlign | number;
    /**
     * Called when the list starts/stops scrolling.
     */
    isScrolling?: (isScrolling: boolean) => void;
    /**
     * Set the callback to specify the contents of the item.
     */
    itemContent?: ItemContent<Data, Context>;
    /**
     * Allows customizing the height/width calculation of `Item` elements.
     *
     * The default implementation reads `el.getBoundingClientRect().height` and `el.getBoundingClientRect().width`.
     */
    itemSize?: SizeFunction;
    /**
     * Called with the new set of items each time the list items are rendered due to scrolling.
     */
    itemsRendered?: (items: ListItem<Data>[]) => void;
    /**
     * Set the overscan property to make the component "chunk" the rendering of new items on scroll.
     * The property causes the component to render more items than the necessary, but reduces the re-renders on scroll.
     * Setting `{ main: number, reverse: number }` lets you extend the list in both the main and the reverse scrollable directions.
     * See the `increaseViewportBy` property for a similar behavior (equivalent to the `overscan` in `react-window`).
     */
    overscan?: number | {
        main: number;
        reverse: number;
    };
    /**
     * Called with the new set of items each time the list items are rendered due to scrolling.
     */
    rangeChanged?: (range: ListRange) => void;
    /**
     * pass a state obtained from the getState() method to restore the list state - this includes the previously measured item sizes and the scroll location.
     * Notice that you should still pass the same data and totalCount properties as before, so that the list can match the data with the stored measurements.
     * This is useful when you want to keep the list state when the component is unmounted and remounted, for example when navigating to a different page.
     */
    restoreStateFrom?: StateSnapshot;
    /**
     * Provides access to the root DOM element
     */
    scrollerRef?: (ref: HTMLElement | null | Window) => any;
    /**
     * Use to display placeholders if the user scrolls fast through the list.
     *
     * Set `components.ScrollSeekPlaceholder` to change the placeholder content.
     */
    scrollSeekConfiguration?: false | ScrollSeekConfiguration;
    /**
     * Called when the user scrolls to the start of the list.
     */
    startReached?: (index: number) => void;
    /**
     * Set the amount of items to remain fixed at the top of the table.
     */
    topItemCount?: number;
    /**
     * The total amount of items to be rendered.
     */
    totalCount?: number;
    /**
     * Called when the total list height is changed due to new items or viewport resize.
     */
    totalListHeightChanged?: (height: number) => void;
    /**
     * Uses the document scroller rather than wrapping the list in its own.
     */
    useWindowScroll?: boolean;
}

/**
 * @group Virtuoso
 */
export declare type TopItemListProps = Pick<default_2.ComponentProps<'div'>, 'children' | 'style'>;

/**
 * A virtualized list component for efficiently rendering large datasets.
 * Automatically measures and handles variable-sized items without configuration.
 *
 * @typeParam ItemData - The type of data items in the list
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @param props - {@link VirtuosoProps}
 *
 * @function
 * @group Virtuoso
 *
 * @example
 * ```tsx
 * <Virtuoso
 *   totalCount={1000}
 *   itemContent={(index) => <div>Item {index}</div>}
 * />
 * ```
 *
 * @see {@link VirtuosoProps} for available props
 * @see {@link VirtuosoHandle} for imperative methods
 */
export declare const Virtuoso: <ItemData = any, Context = any>(props: VirtuosoProps<ItemData, Context> & {
    ref?: default_2.Ref<VirtuosoHandle>;
}) => default_2.ReactElement;

/**
 * A virtualized grid component for efficiently rendering large datasets in a grid/masonry layout.
 * Automatically calculates visible items based on container and item dimensions.
 *
 * @typeParam ItemData - The type of data items in the grid
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @param props - {@link VirtuosoGridProps}
 *
 * @function
 * @group VirtuosoGrid
 *
 * @example
 * ```tsx
 * <VirtuosoGrid
 *   totalCount={1000}
 *   itemContent={(index) => <div className="grid-item">Item {index}</div>}
 *   listClassName="grid-container"
 * />
 * ```
 *
 * @see {@link VirtuosoGridProps} for available props
 * @see {@link VirtuosoGridHandle} for imperative methods
 * @see {@link GridComponents} for customizing grid elements
 */
export declare const VirtuosoGrid: <ItemData = any, Context = any>(props: VirtuosoGridProps<ItemData, Context> & {
    ref?: default_2.Ref<VirtuosoGridHandle>;
}) => default_2.ReactElement;

/**
 * Exposes the VirtuosoGrid component methods for imperative control.
 * Access via ref on the VirtuosoGrid component.
 *
 * @see {@link VirtuosoGrid} for the component
 * @see {@link VirtuosoGridProps} for available props
 * @group VirtuosoGrid
 */
export declare interface VirtuosoGridHandle {
    /**
     * Scrolls the component by the specified amount.
     * @param location - The scroll offset options
     */
    scrollBy(location: ScrollToOptions): void;
    /**
     * Scrolls the component to the specified position.
     * @param location - The scroll position options
     */
    scrollTo(location: ScrollToOptions): void;
    /**
     * Scrolls the component to the specified item index.
     * @param location - The item index or location with alignment options
     */
    scrollToIndex(location: GridIndexLocation): void;
}

/**
 * React context for mocking VirtuosoGrid component measurements in tests.
 * Wrap your VirtuosoGrid component with this provider to bypass DOM measurements.
 *
 * @example
 * ```tsx
 * import { VirtuosoGridMockContext } from 'react-virtuoso'
 *
 * <VirtuosoGridMockContext.Provider
 *   value={{ viewportHeight: 300, viewportWidth: 400, itemHeight: 100, itemWidth: 100 }}
 * >
 *   <VirtuosoGrid totalCount={100} />
 * </VirtuosoGridMockContext.Provider>
 * ```
 *
 * @group VirtuosoGrid
 */
export declare const VirtuosoGridMockContext: default_2.Context<VirtuosoGridMockContextValue | undefined>;

/**
 * Mock context value for testing VirtuosoGrid components.
 * Provides fixed dimensions to bypass DOM measurements.
 *
 * @group VirtuosoGrid
 */
export declare interface VirtuosoGridMockContextValue {
    /** Fixed height for each grid item in pixels */
    itemHeight: number;
    /** Fixed width for each grid item in pixels */
    itemWidth: number;
    /** Fixed viewport height in pixels */
    viewportHeight: number;
    /** Fixed viewport width in pixels */
    viewportWidth: number;
}

/**
 * The props for the VirtuosoGrid component.
 *
 * @typeParam Data - The type of data items in the grid
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @see {@link VirtuosoGrid} for the component
 * @see {@link VirtuosoGridHandle} for imperative methods
 * @group VirtuosoGrid
 */
export declare interface VirtuosoGridProps<Data, Context = unknown> extends GridRootProps {
    /**
     * Called with true / false when the list has reached the bottom / gets scrolled up.
     * Can be used to load newer items, like `tail -f`.
     */
    atBottomStateChange?: (atBottom: boolean) => void;
    /**
     * Called with `true` / `false` when the list has reached the top / gets scrolled down.
     */
    atTopStateChange?: (atTop: boolean) => void;
    /**
     * Use the `components` property for advanced customization of the elements rendered by the list.
     */
    components?: GridComponents<Context>;
    /**
     * If specified, the component will use the function to generate the `key` property for each list item.
     */
    computeItemKey?: GridComputeItemKey<Data, Context>;
    /**
     * Additional context available in the custom components and content callbacks
     */
    context?: Context;
    /**
     * Pass a reference to a scrollable parent element, so that the grid won't wrap in its own.
     */
    customScrollParent?: HTMLElement;
    /**
     * The data items to be rendered. If data is set, the total count will be inferred from the length of the array.
     */
    data?: readonly Data[];
    /**
     * Gets called when the user scrolls to the end of the list.
     * Receives the last item index as an argument. Can be used to implement endless scrolling.
     */
    endReached?: (index: number) => void;
    /**
     *
     * *The property accepts pixel values.*
     *
     * Set the increaseViewportBy property to artificially increase the viewport size, causing items to be rendered before outside of the viewport.
     * The property causes the component to render more items than the necessary, but can help with slow loading content.
     * Using `{ top?: number, bottom?: number }` lets you set the increase for each end separately.
     *
     */
    increaseViewportBy?: number | {
        bottom: number;
        top: number;
    };
    /**
     * Use for server-side rendering - if set, the list will render the specified amount of items
     * regardless of the container / item size.
     */
    initialItemCount?: number;
    /**
     * Set to a value between 0 and totalCount - 1 to make the grid start scrolled to that item.
     * Pass in an object to achieve additional effects similar to `scrollToIndex`.
     */
    initialTopMostItemIndex?: GridIndexLocation;
    /**
     * Called when the list starts/stops scrolling.
     */
    isScrolling?: (isScrolling: boolean) => void;
    /**
     * Sets the grid items' className
     */
    itemClassName?: string;
    /**
     * Set the callback to specify the contents of the item.
     */
    itemContent?: GridItemContent<Data, Context>;
    /**
     * Sets the className for the list DOM element
     */
    listClassName?: string;
    /**
     * set to LogLevel.DEBUG to enable various diagnostics in the console, the most useful being the item measurement reports.
     *
     * Ensure that you have "all levels" enabled in the browser console too see the messages.
     */
    logLevel?: LogLevel;
    /**
     * Set the overscan property to make the component "chunk" the rendering of new items on scroll.
     * The property causes the component to render more items than the necessary, but reduces the re-renders on scroll.
     * Setting `{ main: number, reverse: number }` lets you extend the grid in both the main and the reverse scrollable directions.
     * See the `increaseViewportBy` property for a similar behavior (equivalent to the `overscan` in react-window).
     */
    overscan?: number | {
        main: number;
        reverse: number;
    };
    /**
     * Called with the new set of items each time the list items are rendered due to scrolling.
     */
    rangeChanged?: (range: ListRange) => void;
    /**
     * invoked with true after the grid has done the initial render and the items have been measured.
     */
    readyStateChanged?: (ready: boolean) => void;
    /**
     * Pass a state obtained from the `stateChanged` callback to restore the grid state.
     * This includes scroll position and item measurements.
     */
    restoreStateFrom?: GridStateSnapshot | null | undefined;
    /**
     * Provides access to the root DOM element
     */
    scrollerRef?: (ref: HTMLElement | null) => any;
    /**
     * Use to display placeholders if the user scrolls fast through the list.
     *
     * Set `components.ScrollSeekPlaceholder` to change the placeholder content.
     */
    scrollSeekConfiguration?: false | ScrollSeekConfiguration;
    /**
     * Called when the user scrolls to the start of the list.
     */
    startReached?: (index: number) => void;
    /**
     * reports when the grid state changes. The reported value can be stored and passed back to `restoreStateFrom` to restore the grid to the same state.
     */
    stateChanged?: (state: GridStateSnapshot) => void;
    /**
     * The total amount of items to be rendered.
     */
    totalCount?: number;
    /**
     * Uses the document scroller rather than wrapping the grid in its own.
     */
    useWindowScroll?: boolean;
}

/**
 * Exposes the Virtuoso component methods for imperative control.
 * Access via ref on the Virtuoso component.
 *
 * @see {@link Virtuoso} for the component
 * @see {@link VirtuosoProps} for available props
 * @group Virtuoso
 */
export declare interface VirtuosoHandle {
    /**
     * Use this with combination with follow output if you have images loading in the list. Listen to the image loading and call the method.
     */
    autoscrollToBottom(): void;
    /**
     * Obtains the internal size state of the component, so that it can be restored later. This does not include the data items.
     * @param stateCb - Callback that receives the state snapshot
     */
    getState(stateCb: StateCallback): void;
    /**
     * Scrolls the component with the specified amount. See [ScrollToOptions (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/ScrollToOptions)
     * @param location - The scroll offset options
     */
    scrollBy(location: ScrollToOptions): void;
    /**
     * Scrolls the item into view if necessary. See [the website example](http://virtuoso.dev/keyboard-navigation/) for an implementation.
     * @param location - The scroll into view location options
     */
    scrollIntoView(location: FlatScrollIntoViewLocation): void;
    /**
     * Scrolls the component to the specified location. See [ScrollToOptions (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/ScrollToOptions)
     * @param location - The scroll position options
     */
    scrollTo(location: ScrollToOptions): void;
    /**
     * Scrolls the component to the specified item index. See {@link IndexLocationWithAlign} for more options.
     * @param location - The item index or location with alignment options
     */
    scrollToIndex(location: FlatIndexLocationWithAlign | number): void;
}

/**
 * React context for mocking Virtuoso component measurements in tests.
 * Wrap your Virtuoso component with this provider to bypass DOM measurements.
 *
 * @example
 * ```tsx
 * import { VirtuosoMockContext } from 'react-virtuoso'
 *
 * <VirtuosoMockContext.Provider value={{ viewportHeight: 300, itemHeight: 30 }}>
 *   <Virtuoso totalCount={100} />
 * </VirtuosoMockContext.Provider>
 * ```
 *
 * @group Virtuoso
 */
export declare const VirtuosoMockContext: default_2.Context<VirtuosoMockContextValue | undefined>;

/**
 * Mock context value for testing Virtuoso components.
 * Provides fixed dimensions to bypass DOM measurements.
 *
 * @group Virtuoso
 */
export declare interface VirtuosoMockContextValue {
    /** Fixed height for each item in pixels */
    itemHeight: number;
    /** Fixed viewport height in pixels */
    viewportHeight: number;
}

/**
 * The props for the Virtuoso component.
 *
 * @typeParam Data - The type of data items in the list
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @see {@link Virtuoso} for the component
 * @see {@link VirtuosoHandle} for imperative methods
 * @group Virtuoso
 */
export declare interface VirtuosoProps<Data, Context> extends ListRootProps {
    /**
     * Setting `alignToBottom` to `true` aligns the items to the bottom of the list if the list is shorter than the viewport.
     * Use `followOutput` property to keep the list aligned when new items are appended.
     */
    alignToBottom?: boolean;
    /**
     * Called with true / false when the list has reached the bottom / gets scrolled up.
     * Can be used to load newer items, like `tail -f`.
     */
    atBottomStateChange?: (atBottom: boolean) => void;
    /**
     * *The property accepts pixel values.*
     *
     * By default `4`. Redefine to change how much away from the bottom the scroller can be before the list is not considered not at bottom.
     */
    atBottomThreshold?: number;
    /**
     * Called with `true` / `false` when the list has reached the top / gets scrolled down.
     */
    atTopStateChange?: (atTop: boolean) => void;
    /**
     * *The property accepts pixel values.*
     *
     * By default `0`. Redefine to change how much away from the top the scroller can be before the list is not considered not at top.
     */
    atTopThreshold?: number;
    /**
     * Use the `components` property for advanced customization of the elements rendered by the list.
     */
    components?: Components<Data, Context>;
    /**
     * If specified, the component will use the function to generate the `key` property for each list item.
     */
    computeItemKey?: ComputeItemKey<Data, Context>;
    /**
     * Additional context available in the custom components and content callbacks
     */
    context?: Context;
    /**
     * Pass a reference to a scrollable parent element, so that the list won't wrap in its own.
     */
    customScrollParent?: HTMLElement;
    /**
     * The data items to be rendered. If data is set, the total count will be inferred from the length of the array.
     */
    data?: readonly Data[];
    /**
     * By default, the component assumes the default item height from the first rendered item (rendering it as a "probe").
     *
     * If the first item turns out to be an outlier (very short or tall), the rest of the rendering will be slower,
     * as multiple passes of rendering should happen for the list to fill the viewport.
     *
     * Setting `defaultItemHeight` causes the component to skip the "probe" rendering and use the property
     * value as default height instead.
     */
    defaultItemHeight?: number;
    /**
     * Gets called when the user scrolls to the end of the list.
     * Receives the last item index as an argument. Can be used to implement endless scrolling.
     */
    endReached?: (index: number) => void;
    /**
     * Use when you have items with widely varying heights and can estimate each item's height upfront.
     *
     * Pass an array of estimated heights for each item (by index). This helps the component calculate
     * a more accurate initial total height for the list, reducing layout shifts during initial scrolling.
     *
     * The estimates don't need to be exact - they're used to build the initial size tree before actual
     * measurements are taken. Once items are rendered and measured, their real heights replace the estimates.
     *
     * @example
     * ```tsx
     * <Virtuoso
     *   totalCount={100}
     *   heightEstimates={[40, 200, 60, 2000, 40, /* ... for all items * /]}
     *   itemContent={index => <Item index={index} />}
     * />
     * ```
     */
    heightEstimates?: number[];
    /**
     * Use when implementing inverse infinite scrolling - decrease the value this property
     * in combination with  `data` or `totalCount` to prepend items to the top of the list.
     *
     * Warning: the firstItemIndex should **be a positive number**, based on the total amount of items to be displayed.
     */
    firstItemIndex?: number;
    /**
     * Can be used to improve performance if the rendered items are of known size.
     * Setting it causes the component to skip item measurements.
     */
    fixedItemHeight?: number;
    /**
     * Can be used to improve performance if the rendered group header items are of known size.
     * Setting it causes the component to skip measuring group headers.
     * The value is in pixels. This value has no effect if {@link fixedItemHeight} is not set.
     */
    fixedGroupHeight?: number;
    /**
     * If set to `true`, the list automatically scrolls to bottom if the total count is changed.
     * Set to `"smooth"` for an animated scrolling.
     *
     * By default, `followOutput` scrolls down only if the list is already at the bottom.
     * To implement an arbitrary logic behind that, pass a function:
     *
     * ```tsx
     * <Virtuoso
     *  followOutput={(isAtBottom: boolean) => {
     *    if (expression) {
     *      return 'smooth' // can be 'auto' or false to avoid scrolling
     *    } else {
     *      return false
     *    }
     *  }} />
     * ```
     */
    followOutput?: FollowOutput;
    /**
     * Implement this callback if you want to adjust the list position when the list total count changes.
     * Return a `ScrollIntoViewLocation` object to scroll to a specific item, or falsey value to avoid scrolling.
     * Use the context contents if you need to implement custom logic based on the current state of the list.
     */
    scrollIntoViewOnChange?: (params: {
        context: Context;
        totalCount: number;
        scrollingInProgress: boolean;
    }) => ScrollIntoViewLocation | null | undefined | false;
    /**
     * Set to customize the wrapper tag for the header and footer components (default is `div`).
     */
    headerFooterTag?: string;
    /**
     * When set, turns the scroller into a horizontal list. The items are positioned with `inline-block`.
     */
    horizontalDirection?: boolean;
    /**
     *
     * *The property accepts pixel values.*
     *
     * Set the increaseViewportBy property to artificially increase the viewport size, causing items to be rendered before outside of the viewport.
     * The property causes the component to render more items than the necessary, but can help with slow loading content.
     * Using `{ top?: number, bottom?: number }` lets you set the increase for each end separately.
     *
     */
    increaseViewportBy?: number | {
        bottom: number;
        top: number;
    };
    /**
     * Set the minimum number of items to render before and after the visible viewport boundaries.
     * This is useful when rendering items with dynamic or very tall content, where the pixel-based
     * `increaseViewportBy` may not be sufficient to prevent empty areas during rapid resizing or scrolling.
     * Using `{ top?: number, bottom?: number }` lets you set the count for each end separately.
     */
    minOverscanItemCount?: number | {
        bottom: number;
        top: number;
    };
    /**
     * Use for server-side rendering - if set, the list will render the specified amount of items
     * regardless of the container / item size.
     */
    initialItemCount?: number;
    /**
     * Set this value to offset the initial location of the list.
     * Warning: using this property will still run a render cycle at the scrollTop: 0 list window.
     * If possible, avoid using it and stick to `initialTopMostItemIndex` instead.
     */
    initialScrollTop?: number;
    /**
     * Set to a value between 0 and totalCount - 1 to make the list start scrolled to that item.
     * Pass in an object to achieve additional effects similar to `scrollToIndex`.
     */
    initialTopMostItemIndex?: IndexLocationWithAlign | number;
    /**
     * Called when the list starts/stops scrolling.
     */
    isScrolling?: (isScrolling: boolean) => void;
    /**
     * Set the callback to specify the contents of the item.
     */
    itemContent?: ItemContent<Data, Context>;
    /**
     * Allows customizing the height/width calculation of `Item` elements.
     *
     * The default implementation reads `el.getBoundingClientRect().height` and `el.getBoundingClientRect().width`.
     */
    itemSize?: SizeFunction;
    /**
     * Called with the new set of items each time the list items are rendered due to scrolling.
     */
    itemsRendered?: (items: ListItem<Data>[]) => void;
    /**
     * set to LogLevel.DEBUG to enable various diagnostics in the console, the most useful being the item measurement reports.
     *
     * Ensure that you have "all levels" enabled in the browser console too see the messages.
     */
    logLevel?: LogLevel;
    /**
     * *The property accepts pixel values.*
     *
     * Set the overscan property to make the component "chunk" the rendering of new items on scroll.
     * The property causes the component to render more items than the necessary, but reduces the re-renders on scroll.
     * Setting `{ main: number, reverse: number }` lets you extend the list in both the main and the reverse scrollable directions.
     * See the `increaseViewportBy` property for a similar behavior (equivalent to the `overscan` in react-window).
     *
     */
    overscan?: number | {
        main: number;
        reverse: number;
    };
    /**
     * Called with the new set of items each time the list items are rendered due to scrolling.
     */
    rangeChanged?: (range: ListRange) => void;
    /**
     * pass a state obtained from the getState() method to restore the list state - this includes the previously measured item sizes and the scroll location.
     * Notice that you should still pass the same data and totalCount properties as before, so that the list can match the data with the stored measurements.
     * This is useful when you want to keep the list state when the component is unmounted and remounted, for example when navigating to a different page.
     */
    restoreStateFrom?: StateSnapshot;
    /**
     * Provides access to the root DOM element
     */
    scrollerRef?: (ref: HTMLElement | null | Window) => any;
    /**
     * Use to display placeholders if the user scrolls fast through the list.
     *
     * Set `components.ScrollSeekPlaceholder` to change the placeholder content.
     */
    scrollSeekConfiguration?: false | ScrollSeekConfiguration;
    /**
     * When set, the resize observer used to measure the items will not use `requestAnimationFrame` to report the size changes.
     * Setting this to true will improve performance and reduce flickering, but will cause benign errors to be reported in the console if the size of the items changes while they are being measured.
     * See https://github.com/petyosi/react-virtuoso/issues/1049 for more information.
     */
    skipAnimationFrameInResizeObserver?: boolean;
    /**
     * Called when the user scrolls to the start of the list.
     */
    startReached?: (index: number) => void;
    /**
     * Set the amount of items to remain fixed at the top of the list.
     *
     * For a header that scrolls away when scrolling, check the `components.Header` property.
     */
    topItemCount?: number;
    /**
     * The total amount of items to be rendered.
     */
    totalCount?: number;
    /**
     * Called when the total list height is changed due to new items or viewport resize.
     */
    totalListHeightChanged?: (height: number) => void;
    /**
     * Uses the document scroller rather than wrapping the list in its own.
     */
    useWindowScroll?: boolean;
}

/**
 * Information about the window viewport when using window scrolling mode.
 * @group Common
 */
export declare interface WindowViewportInfo {
    /** The offset from the top of the document to the list container in pixels */
    offsetTop: number;
    /** The visible height of the window viewport in pixels */
    visibleHeight: number;
    /** The visible width of the window viewport in pixels */
    visibleWidth: number;
}

export { }
