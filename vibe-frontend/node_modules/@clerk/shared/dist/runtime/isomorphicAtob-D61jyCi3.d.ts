//#region src/isomorphicAtob.d.ts
/**
 * A function that decodes a string of data which has been encoded using base-64 encoding.
 * Uses `atob` if available, otherwise uses `Buffer` from `global`. If neither are available, returns the data as-is.
 */
declare const isomorphicAtob: (data: string) => string;
//#endregion
export { isomorphicAtob };
//# sourceMappingURL=isomorphicAtob-D61jyCi3.d.ts.map