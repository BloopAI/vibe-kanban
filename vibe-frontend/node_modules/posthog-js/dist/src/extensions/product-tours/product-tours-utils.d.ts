import { ProductTourAppearance, ProductTourSelectorError } from '../../posthog-product-tours-types';
export declare function getProductTourStylesheet(): HTMLStyleElement | null;
export interface ElementFindResult {
    element: HTMLElement | null;
    error: ProductTourSelectorError | null;
    matchCount: number;
}
export declare function findElementBySelector(selector: string): ElementFindResult;
export declare function isElementVisible(element: HTMLElement): boolean;
export declare function getElementMetadata(element: HTMLElement): {
    tag: string;
    id: string | undefined;
    classes: string | undefined;
    text: string | undefined;
};
export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';
export interface PositionResult {
    top: number;
    left: number;
    position: TooltipPosition;
}
export declare function calculateTooltipPosition(targetRect: DOMRect): PositionResult;
export declare function getSpotlightStyle(targetRect: DOMRect, padding?: number): Record<string, string>;
export declare function addProductTourCSSVariablesToElement(element: HTMLElement, appearance?: ProductTourAppearance): void;
export declare function renderTipTapContent(content: any): string;
export declare function normalizeUrl(url: string): string;
