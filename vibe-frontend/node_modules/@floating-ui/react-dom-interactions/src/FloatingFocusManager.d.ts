import React from 'react';
import type { FloatingContext, ReferenceType } from './types';
interface Props<RT extends ReferenceType = ReferenceType> {
    context: FloatingContext<RT>;
    children: JSX.Element;
    order?: Array<'reference' | 'floating' | 'content'>;
    initialFocus?: number | React.MutableRefObject<HTMLElement | null>;
    preventTabbing?: boolean;
    endGuard?: boolean;
    returnFocus?: boolean;
    modal?: boolean;
}
/**
 * Provides focus management for the floating element.
 * @see https://floating-ui.com/docs/FloatingFocusManager
 */
export declare function FloatingFocusManager<RT extends ReferenceType = ReferenceType>({ context: { refs, nodeId, onOpenChange }, children, order, endGuard, preventTabbing, initialFocus, returnFocus, modal, }: Props<RT>): JSX.Element;
export {};
