import { ActClaim, Autocomplete, InitialState, JwtPayload, OrganizationResource, OrganizationSystemPermissionKey, Resources, SignedInSessionResource, UserResource } from "./index-kcd5CugB.js";

//#region src/deriveState.d.ts

/**
 * Derives authentication state based on the current rendering context (SSR or client-side).
 */
declare const deriveState: (clerkOperational: boolean, state: Resources, initialState: InitialState | undefined) => {
  userId: string | null | undefined;
  user: UserResource | null | undefined;
  sessionId: string | null | undefined;
  session: SignedInSessionResource | null | undefined;
  sessionStatus: "active" | "pending" | undefined;
  sessionClaims: JwtPayload | null | undefined;
  organization: OrganizationResource | null | undefined;
  orgId: string | null | undefined;
  orgRole: string | null | undefined;
  orgSlug: string | null | undefined;
  orgPermissions: Autocomplete<OrganizationSystemPermissionKey>[] | null | undefined;
  actor: ActClaim | null | undefined;
  factorVerificationAge: [number, number] | null;
};
//#endregion
export { deriveState };
//# sourceMappingURL=deriveState-CRY7AL8U.d.ts.map