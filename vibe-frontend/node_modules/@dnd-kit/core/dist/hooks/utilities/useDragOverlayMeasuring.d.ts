import type { PublicContextDescriptor } from '../../store';
import type { ClientRect } from '../../types';
interface Arguments {
    measure(element: HTMLElement): ClientRect;
}
export declare function useDragOverlayMeasuring({ measure, }: Arguments): PublicContextDescriptor['dragOverlay'];
export {};
