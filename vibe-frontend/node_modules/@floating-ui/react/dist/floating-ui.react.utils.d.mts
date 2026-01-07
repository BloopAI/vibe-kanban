/// <reference types="react" />

import { Dimensions } from '@floating-ui/react-dom';
import { FocusableElement } from 'tabbable';
import * as React from 'react';
import type { UseFloatingReturn } from '@floating-ui/react-dom';
import useModernLayoutEffect from 'use-isomorphic-layout-effect';
import type { VirtualElement } from '@floating-ui/react-dom';

export declare function activeElement(doc: Document): Element | null;

declare type AnyFunction = (...args: any[]) => any;

export declare function contains(parent?: Element | null, child?: Element | null): boolean;

declare interface ContextData {
    openEvent?: Event;
    floatingContext?: FloatingContext;
    /** @deprecated use `onTypingChange` prop in `useTypeahead` */
    typing?: boolean;
    [key: string]: any;
}

/** For each cell index, gets the item index that occupies that cell */
export declare function createGridCellMap(sizes: Dimensions[], cols: number, dense: boolean): (number | undefined)[];

declare type DisabledIndices = Array<number> | ((index: number) => boolean);

export declare function disableFocusInside(container: HTMLElement): void;

export declare function enableFocusInside(container: HTMLElement): void;

declare interface ExtendedElements<RT> {
    reference: ReferenceType | null;
    floating: HTMLElement | null;
    domReference: NarrowedElement<RT> | null;
}

declare interface ExtendedRefs<RT> {
    reference: React.MutableRefObject<ReferenceType | null>;
    floating: React.MutableRefObject<HTMLElement | null>;
    domReference: React.MutableRefObject<NarrowedElement<RT> | null>;
    setReference(node: RT | null): void;
    setFloating(node: HTMLElement | null): void;
    setPositionReference(node: ReferenceType | null): void;
}

export declare function findNonDisabledListIndex(listRef: React.MutableRefObject<Array<HTMLElement | null>>, { startingIndex, decrement, disabledIndices, amount, }?: {
    startingIndex?: number;
    decrement?: boolean;
    disabledIndices?: DisabledIndices;
    amount?: number;
}): number;

declare type FloatingContext<RT extends ReferenceType = ReferenceType> = Omit<UseFloatingReturn<RT>, 'refs' | 'elements'> & {
    open: boolean;
    onOpenChange(open: boolean, event?: Event, reason?: OpenChangeReason): void;
    events: FloatingEvents;
    dataRef: React.MutableRefObject<ContextData>;
    nodeId: string | undefined;
    floatingId: string | undefined;
    refs: ExtendedRefs<RT>;
    elements: ExtendedElements<RT>;
};

declare interface FloatingEvents {
    emit<T extends string>(event: T, data?: any): void;
    on(event: string, handler: (data: any) => void): void;
    off(event: string, handler: (data: any) => void): void;
}

declare interface FloatingNodeType<RT extends ReferenceType = ReferenceType> {
    id: string | undefined;
    parentId: string | null;
    context?: FloatingContext<RT>;
}

export declare function getDeepestNode<RT extends ReferenceType = ReferenceType>(nodes: Array<FloatingNodeType<RT>>, id: string | undefined): FloatingNodeType<RT> | undefined;

export declare function getDocument(node: Element | null): Document;

export declare function getFloatingFocusElement(floatingElement: HTMLElement | null | undefined): HTMLElement | null;

/** Gets cell index of an item's corner or -1 when index is -1. */
export declare function getGridCellIndexOfCorner(index: number, sizes: Dimensions[], cellMap: (number | undefined)[], cols: number, corner: 'tl' | 'tr' | 'bl' | 'br'): number;

/** Gets all cell indices that correspond to the specified indices */
export declare function getGridCellIndices(indices: (number | undefined)[], cellMap: (number | undefined)[]): number[];

export declare function getGridNavigatedIndex(listRef: React.MutableRefObject<Array<HTMLElement | null>>, { event, orientation, loop, rtl, cols, disabledIndices, minIndex, maxIndex, prevIndex, stopEvent: stop, }: {
    event: React.KeyboardEvent;
    orientation: 'horizontal' | 'vertical' | 'both';
    loop: boolean;
    rtl: boolean;
    cols: number;
    disabledIndices: DisabledIndices | undefined;
    minIndex: number;
    maxIndex: number;
    prevIndex: number;
    stopEvent?: boolean;
}): number;

export declare function getMaxListIndex(listRef: React.MutableRefObject<Array<HTMLElement | null>>, disabledIndices: DisabledIndices | undefined): number;

export declare function getMinListIndex(listRef: React.MutableRefObject<Array<HTMLElement | null>>, disabledIndices: DisabledIndices | undefined): number;

export declare function getNextTabbable(referenceElement: Element | null): FocusableElement | null;

export declare function getNodeAncestors<RT extends ReferenceType = ReferenceType>(nodes: Array<FloatingNodeType<RT>>, id: string | undefined): FloatingNodeType<RT>[];

export declare function getNodeChildren<RT extends ReferenceType = ReferenceType>(nodes: Array<FloatingNodeType<RT>>, id: string | undefined, onlyOpenChildren?: boolean): Array<FloatingNodeType<RT>>;

export declare function getPlatform(): string;

export declare function getPreviousTabbable(referenceElement: Element | null): FocusableElement | null;

export declare const getTabbableOptions: () => {
    readonly getShadowRoot: true;
    readonly displayCheck: "none" | "full";
};

export declare function getTarget(event: Event): EventTarget | null;

export declare function getUserAgent(): string;

export declare function isAndroid(): boolean;

export declare function isDifferentGridRow(index: number, cols: number, prevRow: number): boolean;

export declare function isEventTargetWithin(event: Event, node: Node | null | undefined): boolean;

export declare function isIndexOutOfListBounds(listRef: React.MutableRefObject<Array<HTMLElement | null>>, index: number): boolean;

export declare function isJSDOM(): boolean;

export declare function isListIndexDisabled(listRef: React.MutableRefObject<Array<HTMLElement | null>>, index: number, disabledIndices?: DisabledIndices): boolean;

export declare function isMac(): boolean;

export declare function isMouseLikePointerType(pointerType: string | undefined, strict?: boolean): boolean;

export declare function isOutsideEvent(event: FocusEvent | React.FocusEvent, container?: Element): boolean;

export declare function isReactEvent(event: any): event is React.SyntheticEvent;

export declare function isRootElement(element: Element): boolean;

export declare function isSafari(): boolean;

export declare function isTypeableCombobox(element: Element | null): boolean;

export declare function isTypeableElement(element: unknown): boolean;

export declare function isVirtualClick(event: MouseEvent | PointerEvent): boolean;

export declare function isVirtualPointerEvent(event: PointerEvent): boolean;

export declare function matchesFocusVisible(element: Element | null): boolean;

declare type NarrowedElement<T> = T extends Element ? T : Element;

declare type OpenChangeReason = 'outside-press' | 'escape-key' | 'ancestor-scroll' | 'reference-press' | 'click' | 'hover' | 'focus' | 'focus-out' | 'list-navigation' | 'safe-polygon';

declare type ReferenceType = Element | VirtualElement;

export declare function stopEvent(event: Event | React.SyntheticEvent): void;

export declare function useEffectEvent<T extends AnyFunction>(callback?: T): T;

export declare function useLatestRef<T>(value: T): React.MutableRefObject<T>;

export { useModernLayoutEffect }

export { }
