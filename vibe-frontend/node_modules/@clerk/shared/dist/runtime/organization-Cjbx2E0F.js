
//#region src/organization.ts
/**
* Finds the Organization membership for a given Organization ID from a list of memberships
* @param organizationMemberships - Array of Organization memberships to search through
* @param organizationId - ID of the Organization to find the membership for
* @returns The matching Organization membership or undefined if not found
*/
function getCurrentOrganizationMembership(organizationMemberships, organizationId) {
	return organizationMemberships.find((organizationMembership) => organizationMembership.organization.id === organizationId);
}

//#endregion
Object.defineProperty(exports, 'getCurrentOrganizationMembership', {
  enumerable: true,
  get: function () {
    return getCurrentOrganizationMembership;
  }
});
//# sourceMappingURL=organization-Cjbx2E0F.js.map