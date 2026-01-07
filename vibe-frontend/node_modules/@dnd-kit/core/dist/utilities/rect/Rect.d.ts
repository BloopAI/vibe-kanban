import type { ClientRect } from '../../types/rect';
export declare class Rect {
    constructor(rect: ClientRect, element: Element);
    private rect;
    width: number;
    height: number;
    top: number;
    bottom: number;
    right: number;
    left: number;
}
