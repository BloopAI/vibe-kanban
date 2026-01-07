//#region src/utils/createDeferredPromise.d.ts
type Callback = (val?: any) => void;
/**
 * Create a promise that can be resolved or rejected from
 * outside the Promise constructor callback
 * A ES6 compatible utility that implements `Promise.withResolvers`
 * @internal
 */
declare const createDeferredPromise: () => {
  promise: Promise<unknown>;
  resolve: Callback;
  reject: Callback;
};
//#endregion
//#region src/utils/allSettled.d.ts
/**
 * A ES6 compatible utility that implements `Promise.allSettled`
 * @internal
 */
declare function allSettled<T>(iterable: Iterable<Promise<T>>): Promise<({
  status: 'fulfilled';
  value: T;
} | {
  status: 'rejected';
  reason: any;
})[]>;
//#endregion
//#region src/utils/instance.d.ts
/**
 * Check if the frontendApi ends with a staging domain
 */
declare function isStaging(frontendApi: string): boolean;
//#endregion
//#region src/utils/logErrorInDevMode.d.ts
declare const logErrorInDevMode: (message: string) => void;
//#endregion
//#region src/utils/noop.d.ts
declare const noop: (..._args: any[]) => void;
//#endregion
//#region src/utils/runtimeEnvironment.d.ts
declare const isDevelopmentEnvironment: () => boolean;
declare const isTestEnvironment: () => boolean;
declare const isProductionEnvironment: () => boolean;
//#endregion
//#region src/utils/fastDeepMerge.d.ts
/**
 * Merges 2 objects without creating new object references
 * The merged props will appear on the `target` object
 * If `target` already has a value for a given key it will not be overwritten
 */
declare const fastDeepMergeAndReplace: (source: Record<any, any> | undefined | null, target: Record<any, any> | undefined | null) => void;
declare const fastDeepMergeAndKeep: (source: Record<any, any> | undefined | null, target: Record<any, any> | undefined | null) => void;
//#endregion
export { allSettled, createDeferredPromise, fastDeepMergeAndKeep, fastDeepMergeAndReplace, isDevelopmentEnvironment, isProductionEnvironment, isStaging, isTestEnvironment, logErrorInDevMode, noop };
//# sourceMappingURL=index-Dd9r-3AL.d.mts.map