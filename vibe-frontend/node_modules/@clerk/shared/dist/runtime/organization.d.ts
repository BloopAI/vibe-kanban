import { OrganizationMembershipResource } from "./index-kcd5CugB.js";

//#region src/organization.d.ts

/**
 * Finds the Organization membership for a given Organization ID from a list of memberships
 * @param organizationMemberships - Array of Organization memberships to search through
 * @param organizationId - ID of the Organization to find the membership for
 * @returns The matching Organization membership or undefined if not found
 */
declare function getCurrentOrganizationMembership(organizationMemberships: OrganizationMembershipResource[], organizationId: string): OrganizationMembershipResource | undefined;
//#endregion
export { getCurrentOrganizationMembership };
//# sourceMappingURL=organization.d.ts.map