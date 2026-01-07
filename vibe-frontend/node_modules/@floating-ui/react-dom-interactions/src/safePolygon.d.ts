import type { FloatingContext, FloatingTreeType } from './types';
export declare function safePolygon({ restMs, buffer, debug, }?: Partial<{
    restMs: number;
    buffer: number;
    debug: null | ((points?: string | null) => void);
}>): ({ x, y, placement, refs, onClose, nodeId, tree, }: FloatingContext<import("@floating-ui/dom/src/types").ReferenceElement> & {
    onClose: () => void;
    tree?: FloatingTreeType | null;
}) => (event: PointerEvent) => void;
