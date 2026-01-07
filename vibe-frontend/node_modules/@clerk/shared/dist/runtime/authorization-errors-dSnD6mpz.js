
//#region src/authorization-errors.ts
const REVERIFICATION_REASON = "reverification-error";
const reverificationError = (missingConfig) => ({ clerk_error: {
	type: "forbidden",
	reason: REVERIFICATION_REASON,
	metadata: { reverification: missingConfig }
} });
const reverificationErrorResponse = (...args) => new Response(JSON.stringify(reverificationError(...args)), { status: 403 });
const isReverificationHint = (result) => {
	return result && typeof result === "object" && "clerk_error" in result && result.clerk_error?.type === "forbidden" && result.clerk_error?.reason === REVERIFICATION_REASON;
};

//#endregion
Object.defineProperty(exports, 'isReverificationHint', {
  enumerable: true,
  get: function () {
    return isReverificationHint;
  }
});
Object.defineProperty(exports, 'reverificationError', {
  enumerable: true,
  get: function () {
    return reverificationError;
  }
});
Object.defineProperty(exports, 'reverificationErrorResponse', {
  enumerable: true,
  get: function () {
    return reverificationErrorResponse;
  }
});
//# sourceMappingURL=authorization-errors-dSnD6mpz.js.map