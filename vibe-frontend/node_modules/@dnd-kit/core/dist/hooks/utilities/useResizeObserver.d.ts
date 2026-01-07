interface Arguments {
    callback: ResizeObserverCallback;
    disabled?: boolean;
}
/**
 * Returns a new ResizeObserver instance bound to the `onResize` callback.
 * If `ResizeObserver` is undefined in the execution environment, returns `undefined`.
 */
export declare function useResizeObserver({ callback, disabled }: Arguments): ResizeObserver | undefined;
export {};
