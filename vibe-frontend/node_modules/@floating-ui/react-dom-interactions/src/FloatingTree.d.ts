import React from 'react';
import type { FloatingTreeType } from './types';
export declare const useFloatingParentNodeId: () => string | null;
export declare const useFloatingTree: <RT extends import("@floating-ui/dom/src/types").ReferenceElement = import("@floating-ui/dom/src/types").ReferenceElement>() => FloatingTreeType<RT>;
/**
 * Registers a node into the floating tree, returning its id.
 */
export declare const useFloatingNodeId: () => string;
/**
 * Provides parent node context for nested floating elements.
 * @see https://floating-ui.com/docs/FloatingTree
 */
export declare const FloatingNode: ({ children, id, }: {
    children?: React.ReactNode;
    id: string;
}) => JSX.Element;
/**
 * Provides context for nested floating elements when they are not children of
 * each other on the DOM (i.e. portalled to a common node, rather than their
 * respective parent).
 * @see https://floating-ui.com/docs/FloatingTree
 */
export declare const FloatingTree: ({ children, }: {
    children?: React.ReactNode;
}) => JSX.Element;
