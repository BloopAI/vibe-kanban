import { JSX } from 'preact';
import { ProductTourStep, ProductTourAppearance } from '../../posthog-product-tours-types';
export interface RenderProductTourPreviewOptions {
    step: ProductTourStep;
    appearance?: ProductTourAppearance;
    parentElement: HTMLElement;
    stepIndex?: number;
    totalSteps?: number;
    style?: JSX.CSSProperties;
}
export declare function renderProductTourPreview({ step, appearance, parentElement, stepIndex, totalSteps, style, }: RenderProductTourPreviewOptions): void;
