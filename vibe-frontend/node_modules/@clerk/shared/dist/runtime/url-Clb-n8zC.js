const require_constants = require('./constants-B8tEdUlH.js');
const require_instance = require('./instance-CDcvbQik.js');

//#region src/url.ts
function parseSearchParams(queryString = "") {
	if (queryString.startsWith("?")) queryString = queryString.slice(1);
	return new URLSearchParams(queryString);
}
function stripScheme(url = "") {
	return (url || "").replace(/^.+:\/\//, "");
}
function addClerkPrefix(str) {
	if (!str) return "";
	let regex;
	if (str.match(/^(clerk\.)+\w*$/)) regex = /(clerk\.)*(?=clerk\.)/;
	else if (str.match(/\.clerk.accounts/)) return str;
	else regex = /^(clerk\.)*/gi;
	return `clerk.${str.replace(regex, "")}`;
}
/**
*
* Retrieve the clerk-js major tag using the major version from the pkgVersion
* param or use the frontendApi to determine if the canary tag should be used.
* The default tag is `latest`.
*/
const getClerkJsMajorVersionOrTag = (frontendApi, version) => {
	if (!version && require_instance.isStaging(frontendApi)) return "canary";
	if (!version) return "latest";
	return version.split(".")[0] || "latest";
};
/**
*
* Retrieve the clerk-js script url from the frontendApi and the major tag
* using the {@link getClerkJsMajorVersionOrTag} or a provided clerkJSVersion tag.
*/
const getScriptUrl = (frontendApi, { clerkJSVersion }) => {
	const noSchemeFrontendApi = frontendApi.replace(/http(s)?:\/\//, "");
	const major = getClerkJsMajorVersionOrTag(frontendApi, clerkJSVersion);
	return `https://${noSchemeFrontendApi}/npm/@clerk/clerk-js@${clerkJSVersion || major}/dist/clerk.browser.js`;
};
function isLegacyDevAccountPortalOrigin(host) {
	return require_constants.LEGACY_DEV_INSTANCE_SUFFIXES.some((legacyDevSuffix) => {
		return host.startsWith("accounts.") && host.endsWith(legacyDevSuffix);
	});
}
function isCurrentDevAccountPortalOrigin(host) {
	return require_constants.CURRENT_DEV_INSTANCE_SUFFIXES.some((currentDevSuffix) => {
		return host.endsWith(currentDevSuffix) && !host.endsWith(".clerk" + currentDevSuffix);
	});
}
const TRAILING_SLASH_RE = /\/$|\/\?|\/#/;
function hasTrailingSlash(input = "", respectQueryAndFragment) {
	if (!respectQueryAndFragment) return input.endsWith("/");
	return TRAILING_SLASH_RE.test(input);
}
function withTrailingSlash(input = "", respectQueryAndFragment) {
	if (!respectQueryAndFragment) return input.endsWith("/") ? input : input + "/";
	if (hasTrailingSlash(input, true)) return input || "/";
	let path = input;
	let fragment = "";
	const fragmentIndex = input.indexOf("#");
	if (fragmentIndex >= 0) {
		path = input.slice(0, fragmentIndex);
		fragment = input.slice(fragmentIndex);
		if (!path) return fragment;
	}
	const [s0, ...s] = path.split("?");
	return s0 + "/" + (s.length > 0 ? `?${s.join("?")}` : "") + fragment;
}
function withoutTrailingSlash(input = "", respectQueryAndFragment) {
	if (!respectQueryAndFragment) return (hasTrailingSlash(input) ? input.slice(0, -1) : input) || "/";
	if (!hasTrailingSlash(input, true)) return input || "/";
	let path = input;
	let fragment = "";
	const fragmentIndex = input.indexOf("#");
	if (fragmentIndex >= 0) {
		path = input.slice(0, fragmentIndex);
		fragment = input.slice(fragmentIndex);
	}
	const [s0, ...s] = path.split("?");
	return (s0.slice(0, -1) || "/") + (s.length > 0 ? `?${s.join("?")}` : "") + fragment;
}
function hasLeadingSlash(input = "") {
	return input.startsWith("/");
}
function withoutLeadingSlash(input = "") {
	return (hasLeadingSlash(input) ? input.slice(1) : input) || "/";
}
function withLeadingSlash(input = "") {
	return hasLeadingSlash(input) ? input : "/" + input;
}
function cleanDoubleSlashes(input = "") {
	return input.split("://").map((string_) => string_.replace(/\/{2,}/g, "/")).join("://");
}
function isNonEmptyURL(url) {
	return url && url !== "/";
}
const JOIN_LEADING_SLASH_RE = /^\.?\//;
function joinURL(base, ...input) {
	let url = base || "";
	for (const segment of input.filter((url$1) => isNonEmptyURL(url$1))) if (url) {
		const _segment = segment.replace(JOIN_LEADING_SLASH_RE, "");
		url = withTrailingSlash(url) + _segment;
	} else url = segment;
	return url;
}
const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*?:/;
const isAbsoluteUrl = (url) => ABSOLUTE_URL_REGEX.test(url);

//#endregion
Object.defineProperty(exports, 'addClerkPrefix', {
  enumerable: true,
  get: function () {
    return addClerkPrefix;
  }
});
Object.defineProperty(exports, 'cleanDoubleSlashes', {
  enumerable: true,
  get: function () {
    return cleanDoubleSlashes;
  }
});
Object.defineProperty(exports, 'getClerkJsMajorVersionOrTag', {
  enumerable: true,
  get: function () {
    return getClerkJsMajorVersionOrTag;
  }
});
Object.defineProperty(exports, 'getScriptUrl', {
  enumerable: true,
  get: function () {
    return getScriptUrl;
  }
});
Object.defineProperty(exports, 'hasLeadingSlash', {
  enumerable: true,
  get: function () {
    return hasLeadingSlash;
  }
});
Object.defineProperty(exports, 'hasTrailingSlash', {
  enumerable: true,
  get: function () {
    return hasTrailingSlash;
  }
});
Object.defineProperty(exports, 'isAbsoluteUrl', {
  enumerable: true,
  get: function () {
    return isAbsoluteUrl;
  }
});
Object.defineProperty(exports, 'isCurrentDevAccountPortalOrigin', {
  enumerable: true,
  get: function () {
    return isCurrentDevAccountPortalOrigin;
  }
});
Object.defineProperty(exports, 'isLegacyDevAccountPortalOrigin', {
  enumerable: true,
  get: function () {
    return isLegacyDevAccountPortalOrigin;
  }
});
Object.defineProperty(exports, 'isNonEmptyURL', {
  enumerable: true,
  get: function () {
    return isNonEmptyURL;
  }
});
Object.defineProperty(exports, 'joinURL', {
  enumerable: true,
  get: function () {
    return joinURL;
  }
});
Object.defineProperty(exports, 'parseSearchParams', {
  enumerable: true,
  get: function () {
    return parseSearchParams;
  }
});
Object.defineProperty(exports, 'stripScheme', {
  enumerable: true,
  get: function () {
    return stripScheme;
  }
});
Object.defineProperty(exports, 'withLeadingSlash', {
  enumerable: true,
  get: function () {
    return withLeadingSlash;
  }
});
Object.defineProperty(exports, 'withTrailingSlash', {
  enumerable: true,
  get: function () {
    return withTrailingSlash;
  }
});
Object.defineProperty(exports, 'withoutLeadingSlash', {
  enumerable: true,
  get: function () {
    return withoutLeadingSlash;
  }
});
Object.defineProperty(exports, 'withoutTrailingSlash', {
  enumerable: true,
  get: function () {
    return withoutTrailingSlash;
  }
});
//# sourceMappingURL=url-Clb-n8zC.js.map