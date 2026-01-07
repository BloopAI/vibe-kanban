//#region src/utils/instance.ts
/**
* Check if the frontendApi ends with a staging domain
*/
function isStaging(frontendApi) {
	return frontendApi.endsWith(".lclstage.dev") || frontendApi.endsWith(".stgstage.dev") || frontendApi.endsWith(".clerkstage.dev") || frontendApi.endsWith(".accountsstage.dev");
}

//#endregion
export { isStaging };
//# sourceMappingURL=instance-Cze6Nv61.mjs.map