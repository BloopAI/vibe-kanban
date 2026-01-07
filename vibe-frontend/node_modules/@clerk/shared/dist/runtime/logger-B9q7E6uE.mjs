//#region src/logger.ts
const loggedMessages = /* @__PURE__ */ new Set();
const logger = {
	warnOnce: (msg) => {
		if (loggedMessages.has(msg)) return;
		loggedMessages.add(msg);
		console.warn(msg);
	},
	logOnce: (msg) => {
		if (loggedMessages.has(msg)) return;
		console.log(msg);
		loggedMessages.add(msg);
	}
};

//#endregion
export { logger };
//# sourceMappingURL=logger-B9q7E6uE.mjs.map