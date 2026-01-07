import { h } from 'preact';
import { ProductTour, ProductTourStep, ProductTourDismissReason } from '../../../posthog-product-tours-types';
export interface ProductTourTooltipProps {
    tour: ProductTour;
    step: ProductTourStep;
    stepIndex: number;
    totalSteps: number;
    targetElement: HTMLElement | null;
    onNext: () => void;
    onPrevious: () => void;
    onDismiss: (reason: ProductTourDismissReason) => void;
    onSurveySubmit?: (response: string | number | null) => void;
}
export declare function ProductTourTooltip({ tour, step, stepIndex, totalSteps, targetElement, onNext, onPrevious, onDismiss, onSurveySubmit, }: ProductTourTooltipProps): h.JSX.Element;
