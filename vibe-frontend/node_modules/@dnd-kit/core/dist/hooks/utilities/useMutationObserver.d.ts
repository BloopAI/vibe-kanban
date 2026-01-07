interface Arguments {
    callback: MutationCallback;
    disabled?: boolean;
}
/**
 * Returns a new MutationObserver instance.
 * If `MutationObserver` is undefined in the execution environment, returns `undefined`.
 */
export declare function useMutationObserver({ callback, disabled }: Arguments): MutationObserver | undefined;
export {};
