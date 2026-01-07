type CursorState = "horizontal" | "intersection" | "vertical";
export type CustomCursorStyleConfig = {
    exceedsHorizontalMaximum: boolean;
    exceedsHorizontalMinimum: boolean;
    exceedsVerticalMaximum: boolean;
    exceedsVerticalMinimum: boolean;
    intersectsHorizontalDragHandle: boolean;
    intersectsVerticalDragHandle: boolean;
    isPointerDown: boolean;
};
type GetCustomCursorStyleFunction = (config: CustomCursorStyleConfig) => string;
export declare function customizeGlobalCursorStyles(callback: GetCustomCursorStyleFunction | null): void;
export declare function disableGlobalCursorStyles(): void;
export declare function enableGlobalCursorStyles(): void;
export declare function getCursorStyle(state: CursorState, constraintFlags: number, isPointerDown: boolean): string;
export declare function resetGlobalCursorStyle(): void;
export declare function setGlobalCursorStyle(state: CursorState, constraintFlags: number, isPointerDown: boolean): void;
export {};
