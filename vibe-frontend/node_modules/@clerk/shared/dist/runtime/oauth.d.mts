import { OAuthProvider, OAuthProviderData, OAuthStrategy } from "./index-BnRZtxqr.mjs";

//#region src/oauth.d.ts
declare const OAUTH_PROVIDERS: OAuthProviderData[];
interface getOAuthProviderDataProps {
  provider?: OAuthProvider;
  strategy?: OAuthStrategy;
}
declare function getOAuthProviderData({
  provider,
  strategy
}: getOAuthProviderDataProps): OAuthProviderData | undefined | null;
//#endregion
export { OAUTH_PROVIDERS, getOAuthProviderData };
//# sourceMappingURL=oauth.d.mts.map