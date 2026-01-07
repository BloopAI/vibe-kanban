import type { ElementRects, Placement, Side } from '../types';
export declare function getAlignmentSides(placement: Placement, rects: ElementRects, rtl?: boolean): {
    main: Side;
    cross: Side;
};
