import { h } from 'preact';
import { ProductTourStep, ProductTourAppearance } from '../../../posthog-product-tours-types';
export interface ProductTourSurveyStepInnerProps {
    step: ProductTourStep;
    appearance?: ProductTourAppearance;
    stepIndex: number;
    totalSteps: number;
    onPrevious?: () => void;
    onSubmit?: (response: string | number | null) => void;
    onDismiss?: () => void;
}
export declare function ProductTourSurveyStepInner({ step, appearance, stepIndex, totalSteps, onPrevious, onSubmit, onDismiss, }: ProductTourSurveyStepInnerProps): h.JSX.Element;
