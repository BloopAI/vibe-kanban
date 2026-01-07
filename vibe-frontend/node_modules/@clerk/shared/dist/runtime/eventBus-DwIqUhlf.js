
//#region src/eventBus.ts
/**
* @internal
*/
const _on = (eventToHandlersMap, latestPayloadMap, event, handler, opts) => {
	const { notify } = opts || {};
	let handlers = eventToHandlersMap.get(event);
	if (!handlers) {
		handlers = [];
		eventToHandlersMap.set(event, handlers);
	}
	handlers.push(handler);
	if (notify && latestPayloadMap.has(event)) handler(latestPayloadMap.get(event));
};
/**
* @internal
*/
const _dispatch = (eventToHandlersMap, event, payload) => (eventToHandlersMap.get(event) || []).map((h) => h(payload));
/**
* @internal
*/
const _off = (eventToHandlersMap, event, handler) => {
	const handlers = eventToHandlersMap.get(event);
	if (handlers) if (handler) handlers.splice(handlers.indexOf(handler) >>> 0, 1);
	else eventToHandlersMap.set(event, []);
};
/**
* A ES6/2015 compatible 300 byte event bus
*
* Creates a strongly-typed event bus that enables publish/subscribe communication between components.
*
* @template Events - A record type that maps event names to their payload types
* @returns An EventBus instance with the following methods:
* - `on`: Subscribe to an event
* - `onPreDispatch`: Subscribe to an event, triggered before regular subscribers
* - `emit`: Publish an event with payload
* - `off`: Unsubscribe from an event
* - `offPreDispatch`: Unsubscribe from a pre-dispatch event
*
* @example
* // Define event types
* const eventBus = createEventBus<{
*   'user-login': { userId: string; timestamp: number };
*   'data-updated': { records: any[] };
*   'error': Error;
* }>();
*
* // Subscribe to events
* eventBus.on('user-login', ({ userId, timestamp }) => {
*   console.log(`User ${userId} logged in at ${timestamp}`);
* });
*
* // Subscribe with immediate notification if event was already dispatched
* eventBus.on('user-login', (payload) => {
*   // This will be called immediately if 'user-login' was previously dispatched
* }, { notify: true });
*
* // Publish an event
* eventBus.emit('user-login', { userId: 'abc123', timestamp: Date.now() });
*
* // Unsubscribe from event
* const handler = (payload) => console.log(payload);
* eventBus.on('error', handler);
* // Later...
* eventBus.off('error', handler);
*
* // Unsubscribe all handlers for an event
* eventBus.off('data-updated');
*/
const createEventBus = () => {
	const eventToHandlersMap = /* @__PURE__ */ new Map();
	const latestPayloadMap = /* @__PURE__ */ new Map();
	const eventToPredispatchHandlersMap = /* @__PURE__ */ new Map();
	const emit = (event, payload) => {
		latestPayloadMap.set(event, payload);
		_dispatch(eventToPredispatchHandlersMap, event, payload);
		_dispatch(eventToHandlersMap, event, payload);
	};
	return {
		on: (...args) => _on(eventToHandlersMap, latestPayloadMap, ...args),
		prioritizedOn: (...args) => _on(eventToPredispatchHandlersMap, latestPayloadMap, ...args),
		emit,
		off: (...args) => _off(eventToHandlersMap, ...args),
		prioritizedOff: (...args) => _off(eventToPredispatchHandlersMap, ...args),
		internal: { retrieveListeners: (event) => eventToHandlersMap.get(event) || [] }
	};
};

//#endregion
Object.defineProperty(exports, 'createEventBus', {
  enumerable: true,
  get: function () {
    return createEventBus;
  }
});
//# sourceMappingURL=eventBus-DwIqUhlf.js.map