import type { ClientRect } from '../../types';
export declare function useRect(element: HTMLElement | null, measure?: (element: HTMLElement) => ClientRect, fallbackRect?: ClientRect | null): ClientRect | null;
