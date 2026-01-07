
//#region src/utils/instance.ts
/**
* Check if the frontendApi ends with a staging domain
*/
function isStaging(frontendApi) {
	return frontendApi.endsWith(".lclstage.dev") || frontendApi.endsWith(".stgstage.dev") || frontendApi.endsWith(".clerkstage.dev") || frontendApi.endsWith(".accountsstage.dev");
}

//#endregion
Object.defineProperty(exports, 'isStaging', {
  enumerable: true,
  get: function () {
    return isStaging;
  }
});
//# sourceMappingURL=instance-CDcvbQik.js.map