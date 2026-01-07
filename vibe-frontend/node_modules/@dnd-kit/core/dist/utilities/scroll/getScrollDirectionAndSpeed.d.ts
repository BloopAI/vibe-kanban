import { ClientRect } from '../../types';
interface PositionalCoordinates extends Pick<ClientRect, 'top' | 'left' | 'right' | 'bottom'> {
}
export declare function getScrollDirectionAndSpeed(scrollContainer: Element, scrollContainerRect: ClientRect, { top, left, right, bottom }: PositionalCoordinates, acceleration?: number, thresholdPercentage?: {
    x: number;
    y: number;
}): {
    direction: {
        x: number;
        y: number;
    };
    speed: {
        x: number;
        y: number;
    };
};
export {};
