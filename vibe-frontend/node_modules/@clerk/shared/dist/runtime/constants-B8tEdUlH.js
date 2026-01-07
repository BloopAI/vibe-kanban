
//#region src/constants.ts
const LEGACY_DEV_INSTANCE_SUFFIXES = [
	".lcl.dev",
	".lclstage.dev",
	".lclclerk.com"
];
const CURRENT_DEV_INSTANCE_SUFFIXES = [
	".accounts.dev",
	".accountsstage.dev",
	".accounts.lclclerk.com"
];
const DEV_OR_STAGING_SUFFIXES = [
	".lcl.dev",
	".stg.dev",
	".lclstage.dev",
	".stgstage.dev",
	".dev.lclclerk.com",
	".stg.lclclerk.com",
	".accounts.lclclerk.com",
	"accountsstage.dev",
	"accounts.dev"
];
const LOCAL_ENV_SUFFIXES = [
	".lcl.dev",
	"lclstage.dev",
	".lclclerk.com",
	".accounts.lclclerk.com"
];
const STAGING_ENV_SUFFIXES = [".accountsstage.dev"];
const LOCAL_API_URL = "https://api.lclclerk.com";
const STAGING_API_URL = "https://api.clerkstage.dev";
const PROD_API_URL = "https://api.clerk.com";
/**
* Returns the URL for a static image
* using the new img.clerk.com service
*/
function iconImageUrl(id, format = "svg") {
	return `https://img.clerk.com/static/${id}.${format}`;
}

//#endregion
Object.defineProperty(exports, 'CURRENT_DEV_INSTANCE_SUFFIXES', {
  enumerable: true,
  get: function () {
    return CURRENT_DEV_INSTANCE_SUFFIXES;
  }
});
Object.defineProperty(exports, 'DEV_OR_STAGING_SUFFIXES', {
  enumerable: true,
  get: function () {
    return DEV_OR_STAGING_SUFFIXES;
  }
});
Object.defineProperty(exports, 'LEGACY_DEV_INSTANCE_SUFFIXES', {
  enumerable: true,
  get: function () {
    return LEGACY_DEV_INSTANCE_SUFFIXES;
  }
});
Object.defineProperty(exports, 'LOCAL_API_URL', {
  enumerable: true,
  get: function () {
    return LOCAL_API_URL;
  }
});
Object.defineProperty(exports, 'LOCAL_ENV_SUFFIXES', {
  enumerable: true,
  get: function () {
    return LOCAL_ENV_SUFFIXES;
  }
});
Object.defineProperty(exports, 'PROD_API_URL', {
  enumerable: true,
  get: function () {
    return PROD_API_URL;
  }
});
Object.defineProperty(exports, 'STAGING_API_URL', {
  enumerable: true,
  get: function () {
    return STAGING_API_URL;
  }
});
Object.defineProperty(exports, 'STAGING_ENV_SUFFIXES', {
  enumerable: true,
  get: function () {
    return STAGING_ENV_SUFFIXES;
  }
});
Object.defineProperty(exports, 'iconImageUrl', {
  enumerable: true,
  get: function () {
    return iconImageUrl;
  }
});
//# sourceMappingURL=constants-B8tEdUlH.js.map