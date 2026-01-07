export type IdleCallbackDeadline = {
    didTimeout: boolean;
    timeRemaining: () => number;
};
export type IdleCallbackFunction = (deadline: IdleCallbackDeadline) => void;
export declare const safeRequestIdleCallback: (callback: IdleCallbackFunction, options?: {
    timeout?: number;
}) => number;
export declare const safeCancelIdleCallback: (id: number) => void;
