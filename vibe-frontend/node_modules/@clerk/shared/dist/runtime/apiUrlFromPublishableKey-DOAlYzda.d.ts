//#region src/apiUrlFromPublishableKey.d.ts
/**
 * Get the correct API url based on the publishable key.
 *
 * @param publishableKey - The publishable key to parse.
 * @returns One of Clerk's API URLs.
 */
declare const apiUrlFromPublishableKey: (publishableKey: string) => "https://api.clerk.com" | "https://api.lclclerk.com" | "https://api.clerkstage.dev";
//#endregion
export { apiUrlFromPublishableKey };
//# sourceMappingURL=apiUrlFromPublishableKey-DOAlYzda.d.ts.map