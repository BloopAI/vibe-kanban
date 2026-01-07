import { h } from 'preact';
import { ProductTourStep, ProductTourAppearance } from '../../../posthog-product-tours-types';
export interface ProductTourTooltipInnerProps {
    step: ProductTourStep;
    appearance?: ProductTourAppearance;
    stepIndex: number;
    totalSteps: number;
    onNext?: () => void;
    onPrevious?: () => void;
    onDismiss?: () => void;
}
export declare function ProductTourTooltipInner({ step, appearance, stepIndex, totalSteps, onNext, onPrevious, onDismiss, }: ProductTourTooltipInnerProps): h.JSX.Element;
