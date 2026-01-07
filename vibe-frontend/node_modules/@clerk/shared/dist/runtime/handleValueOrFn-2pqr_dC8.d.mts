//#region src/utils/handleValueOrFn.d.ts
type VOrFnReturnsV<T> = T | undefined | ((v: URL) => T);
declare function handleValueOrFn<T>(value: VOrFnReturnsV<T>, url: URL): T | undefined;
declare function handleValueOrFn<T>(value: VOrFnReturnsV<T>, url: URL, defaultValue: T): T;
//#endregion
export { handleValueOrFn };
//# sourceMappingURL=handleValueOrFn-2pqr_dC8.d.mts.map