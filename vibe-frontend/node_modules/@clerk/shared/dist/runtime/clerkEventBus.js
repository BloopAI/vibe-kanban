const require_eventBus = require('./eventBus-DwIqUhlf.js');

//#region src/clerkEventBus.ts
const clerkEvents = { Status: "status" };
const createClerkEventBus = () => {
	return require_eventBus.createEventBus();
};

//#endregion
exports.clerkEvents = clerkEvents;
exports.createClerkEventBus = createClerkEventBus;
//# sourceMappingURL=clerkEventBus.js.map