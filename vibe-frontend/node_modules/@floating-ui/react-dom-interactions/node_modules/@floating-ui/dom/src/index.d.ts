import type { ComputePositionConfig, ReferenceElement, FloatingElement } from './types';
/**
 * Computes the `x` and `y` coordinates that will place the floating element
 * next to a reference element when it is given a certain CSS positioning
 * strategy.
 */
export declare const computePosition: (reference: ReferenceElement, floating: FloatingElement, options?: Partial<ComputePositionConfig>) => Promise<import("@floating-ui/core").ComputePositionReturn>;
export { arrow, autoPlacement, flip, hide, offset, shift, limitShift, size, inline, detectOverflow, } from '@floating-ui/core';
export { autoUpdate } from './autoUpdate';
export { getOverflowAncestors } from './utils/getOverflowAncestors';
