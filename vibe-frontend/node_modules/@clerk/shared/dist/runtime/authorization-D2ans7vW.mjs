//#region src/authorization.ts
const TYPES_TO_OBJECTS = {
	strict_mfa: {
		afterMinutes: 10,
		level: "multi_factor"
	},
	strict: {
		afterMinutes: 10,
		level: "second_factor"
	},
	moderate: {
		afterMinutes: 60,
		level: "second_factor"
	},
	lax: {
		afterMinutes: 1440,
		level: "second_factor"
	}
};
const ALLOWED_LEVELS = new Set([
	"first_factor",
	"second_factor",
	"multi_factor"
]);
const ALLOWED_TYPES = new Set([
	"strict_mfa",
	"strict",
	"moderate",
	"lax"
]);
const isValidMaxAge = (maxAge) => typeof maxAge === "number" && maxAge > 0;
const isValidLevel = (level) => ALLOWED_LEVELS.has(level);
const isValidVerificationType = (type) => ALLOWED_TYPES.has(type);
const prefixWithOrg = (value) => value.replace(/^(org:)*/, "org:");
/**
* Checks if a user has the required Organization-level authorization.
* Verifies if the user has the specified Role or Permission within their Organization.
* @returns null, if unable to determine due to missing data or unspecified Role/Permission.
*/
const checkOrgAuthorization = (params, options) => {
	const { orgId, orgRole, orgPermissions } = options;
	if (!params.role && !params.permission) return null;
	if (!orgId || !orgRole || !orgPermissions) return null;
	if (params.permission) return orgPermissions.includes(prefixWithOrg(params.permission));
	if (params.role) return prefixWithOrg(orgRole) === prefixWithOrg(params.role);
	return null;
};
const checkForFeatureOrPlan = (claim, featureOrPlan) => {
	const { org: orgFeatures, user: userFeatures } = splitByScope(claim);
	const [scope, _id] = featureOrPlan.split(":");
	const id = _id || scope;
	if (scope === "org") return orgFeatures.includes(id);
	else if (scope === "user") return userFeatures.includes(id);
	else return [...orgFeatures, ...userFeatures].includes(id);
};
const checkBillingAuthorization = (params, options) => {
	const { features, plans } = options;
	if (params.feature && features) return checkForFeatureOrPlan(features, params.feature);
	if (params.plan && plans) return checkForFeatureOrPlan(plans, params.plan);
	return null;
};
const splitByScope = (fea) => {
	const features = fea ? fea.split(",").map((f) => f.trim()) : [];
	return {
		org: features.filter((f) => f.split(":")[0].includes("o")).map((f) => f.split(":")[1]),
		user: features.filter((f) => f.split(":")[0].includes("u")).map((f) => f.split(":")[1])
	};
};
const validateReverificationConfig = (config) => {
	if (!config) return false;
	const convertConfigToObject = (config$1) => {
		if (typeof config$1 === "string") return TYPES_TO_OBJECTS[config$1];
		return config$1;
	};
	const isValidStringValue = typeof config === "string" && isValidVerificationType(config);
	const isValidObjectValue = typeof config === "object" && isValidLevel(config.level) && isValidMaxAge(config.afterMinutes);
	if (isValidStringValue || isValidObjectValue) return convertConfigToObject.bind(null, config);
	return false;
};
/**
* Evaluates if the user meets re-verification authentication requirements.
* Compares the user's factor verification ages against the specified maxAge.
* Handles different verification levels (first factor, second factor, multi-factor).
* @returns null, if requirements or verification data are missing.
*/
const checkReverificationAuthorization = (params, { factorVerificationAge }) => {
	if (!params.reverification || !factorVerificationAge) return null;
	const isValidReverification = validateReverificationConfig(params.reverification);
	if (!isValidReverification) return null;
	const { level, afterMinutes } = isValidReverification();
	const [factor1Age, factor2Age] = factorVerificationAge;
	const isValidFactor1 = factor1Age !== -1 ? afterMinutes > factor1Age : null;
	const isValidFactor2 = factor2Age !== -1 ? afterMinutes > factor2Age : null;
	switch (level) {
		case "first_factor": return isValidFactor1;
		case "second_factor": return factor2Age !== -1 ? isValidFactor2 : isValidFactor1;
		case "multi_factor": return factor2Age === -1 ? isValidFactor1 : isValidFactor1 && isValidFactor2;
	}
};
/**
* Creates a function for comprehensive user authorization checks.
* Combines organization-level and reverification authentication checks.
* The returned function authorizes if both checks pass, or if at least one passes
* when the other is indeterminate. Fails if userId is missing.
*/
const createCheckAuthorization = (options) => {
	return (params) => {
		if (!options.userId) return false;
		const billingAuthorization = checkBillingAuthorization(params, options);
		const orgAuthorization = checkOrgAuthorization(params, options);
		const reverificationAuthorization = checkReverificationAuthorization(params, options);
		if ([billingAuthorization || orgAuthorization, reverificationAuthorization].some((a) => a === null)) return [billingAuthorization || orgAuthorization, reverificationAuthorization].some((a) => a === true);
		return [billingAuthorization || orgAuthorization, reverificationAuthorization].every((a) => a === true);
	};
};
/**
* Shared utility function that centralizes auth state resolution logic,
* preventing duplication across different packages.
* @internal
*/
const resolveAuthState = ({ authObject: { sessionId, sessionStatus, userId, actor, orgId, orgRole, orgSlug, signOut, getToken, has, sessionClaims }, options: { treatPendingAsSignedOut = true } }) => {
	if (sessionId === void 0 && userId === void 0) return {
		isLoaded: false,
		isSignedIn: void 0,
		sessionId,
		sessionClaims: void 0,
		userId,
		actor: void 0,
		orgId: void 0,
		orgRole: void 0,
		orgSlug: void 0,
		has: void 0,
		signOut,
		getToken
	};
	if (sessionId === null && userId === null) return {
		isLoaded: true,
		isSignedIn: false,
		sessionId,
		userId,
		sessionClaims: null,
		actor: null,
		orgId: null,
		orgRole: null,
		orgSlug: null,
		has: () => false,
		signOut,
		getToken
	};
	if (treatPendingAsSignedOut && sessionStatus === "pending") return {
		isLoaded: true,
		isSignedIn: false,
		sessionId: null,
		userId: null,
		sessionClaims: null,
		actor: null,
		orgId: null,
		orgRole: null,
		orgSlug: null,
		has: () => false,
		signOut,
		getToken
	};
	if (!!sessionId && !!sessionClaims && !!userId && !!orgId && !!orgRole) return {
		isLoaded: true,
		isSignedIn: true,
		sessionId,
		sessionClaims,
		userId,
		actor: actor || null,
		orgId,
		orgRole,
		orgSlug: orgSlug || null,
		has,
		signOut,
		getToken
	};
	if (!!sessionId && !!sessionClaims && !!userId && !orgId) return {
		isLoaded: true,
		isSignedIn: true,
		sessionId,
		sessionClaims,
		userId,
		actor: actor || null,
		orgId: null,
		orgRole: null,
		orgSlug: null,
		has,
		signOut,
		getToken
	};
};

//#endregion
export { createCheckAuthorization, resolveAuthState, splitByScope, validateReverificationConfig };
//# sourceMappingURL=authorization-D2ans7vW.mjs.map