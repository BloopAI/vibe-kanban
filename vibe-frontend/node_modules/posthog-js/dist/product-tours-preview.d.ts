import { JSX } from 'preact';

interface JSONContent {
    type?: string;
    attrs?: Record<string, any>;
    content?: JSONContent[];
    marks?: {
        type: string;
        attrs?: Record<string, any>;
    }[];
    text?: string;
}
type ProductTourStepType = 'element' | 'modal' | 'survey';
type ProductTourSurveyQuestionType = 'open' | 'rating';
interface ProductTourSurveyQuestion {
    type: ProductTourSurveyQuestionType;
    questionText: string;
    /** Rating display type - emoji or number */
    display?: 'emoji' | 'number';
    /** Rating scale - 3 or 5 for emoji, 5 or 10 for number */
    scale?: 3 | 5 | 10;
    /** Label for low end of rating scale (e.g., "Not likely") */
    lowerBoundLabel?: string;
    /** Label for high end of rating scale (e.g., "Very likely") */
    upperBoundLabel?: string;
}
interface ProductTourStep {
    id: string;
    type: ProductTourStepType;
    selector?: string;
    progressionTrigger: 'button' | 'click';
    content: JSONContent | null;
    /** Inline survey question config - if present, this is a survey step */
    survey?: ProductTourSurveyQuestion;
    /** ID of the auto-created survey for this step (set by backend) */
    linkedSurveyId?: string;
    /** ID of the survey question (set by backend, used for event tracking) */
    linkedSurveyQuestionId?: string;
}
interface ProductTourAppearance {
    backgroundColor?: string;
    textColor?: string;
    buttonColor?: string;
    borderRadius?: number;
    buttonBorderRadius?: number;
    borderColor?: string;
    fontFamily?: string;
    boxShadow?: string;
    showOverlay?: boolean;
    whiteLabel?: boolean;
}

interface RenderProductTourPreviewOptions {
    step: ProductTourStep;
    appearance?: ProductTourAppearance;
    parentElement: HTMLElement;
    stepIndex?: number;
    totalSteps?: number;
    style?: JSX.CSSProperties;
}
declare function renderProductTourPreview({ step, appearance, parentElement, stepIndex, totalSteps, style, }: RenderProductTourPreviewOptions): void;

export { renderProductTourPreview };
