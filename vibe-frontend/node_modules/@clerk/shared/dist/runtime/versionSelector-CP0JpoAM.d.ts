//#region src/versionSelector.d.ts
/**
 * This version selector is a bit complicated, so here is the flow:
 * 1. Use the clerkJSVersion prop on the provider
 * 2. Use the exact `@clerk/clerk-js` version if it is a `@snapshot` prerelease
 * 3. Use the prerelease tag of `@clerk/clerk-js` or the packageVersion provided
 * 4. Fallback to the major version of `@clerk/clerk-js` or the packageVersion provided
 * @param clerkJSVersion - The optional clerkJSVersion prop on the provider
 * @param packageVersion - The version of `@clerk/clerk-js` that will be used if an explicit version is not provided
 * @returns The npm tag, version or major version to use
 */
declare const versionSelector: (clerkJSVersion: string | undefined, packageVersion?: any) => any;
declare const getMajorVersion: (packageVersion: string) => string;
//#endregion
export { getMajorVersion, versionSelector };
//# sourceMappingURL=versionSelector-CP0JpoAM.d.ts.map