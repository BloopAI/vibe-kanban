const require_keys = require('./keys-wr08qE7Y.js');
const require_underscore = require('./underscore-C7r5Yoz7.js');

//#region src/telemetry/throttler.ts
const DEFAULT_CACHE_TTL_MS = 864e5;
/**
* Manages throttling for telemetry events using a configurable cache implementation
* to mitigate event flooding in frequently executed code paths.
*/
var TelemetryEventThrottler = class {
	#cache;
	#cacheTtl = DEFAULT_CACHE_TTL_MS;
	constructor(cache) {
		this.#cache = cache;
	}
	isEventThrottled(payload) {
		const now = Date.now();
		const key = this.#generateKey(payload);
		const entry = this.#cache.getItem(key);
		if (!entry) {
			this.#cache.setItem(key, now);
			return false;
		}
		if (now - entry > this.#cacheTtl) {
			this.#cache.setItem(key, now);
			return false;
		}
		return true;
	}
	/**
	* Generates a consistent unique key for telemetry events by sorting payload properties.
	* This ensures that payloads with identical content in different orders produce the same key.
	*/
	#generateKey(event) {
		const { sk: _sk, pk: _pk, payload,...rest } = event;
		const sanitizedEvent = {
			...payload,
			...rest
		};
		return JSON.stringify(Object.keys({
			...payload,
			...rest
		}).sort().map((key) => sanitizedEvent[key]));
	}
};
/**
* LocalStorage-based cache implementation for browser environments.
*/
var LocalStorageThrottlerCache = class {
	#storageKey = "clerk_telemetry_throttler";
	getItem(key) {
		return this.#getCache()[key];
	}
	setItem(key, value) {
		try {
			const cache = this.#getCache();
			cache[key] = value;
			localStorage.setItem(this.#storageKey, JSON.stringify(cache));
		} catch (err) {
			if (err instanceof DOMException && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED") && localStorage.length > 0) localStorage.removeItem(this.#storageKey);
		}
	}
	removeItem(key) {
		try {
			const cache = this.#getCache();
			delete cache[key];
			localStorage.setItem(this.#storageKey, JSON.stringify(cache));
		} catch {}
	}
	#getCache() {
		try {
			const cacheString = localStorage.getItem(this.#storageKey);
			if (!cacheString) return {};
			return JSON.parse(cacheString);
		} catch {
			return {};
		}
	}
	static isSupported() {
		return typeof window !== "undefined" && !!window.localStorage;
	}
};
/**
* In-memory cache implementation for non-browser environments (e.g., React Native).
*/
var InMemoryThrottlerCache = class {
	#cache = /* @__PURE__ */ new Map();
	#maxSize = 1e4;
	getItem(key) {
		if (this.#cache.size > this.#maxSize) {
			this.#cache.clear();
			return;
		}
		return this.#cache.get(key);
	}
	setItem(key, value) {
		this.#cache.set(key, value);
	}
	removeItem(key) {
		this.#cache.delete(key);
	}
};

//#endregion
//#region src/telemetry/collector.ts
/**
* Type guard to check if window.Clerk exists and has the expected structure.
*/
function isWindowClerkWithMetadata(clerk) {
	return typeof clerk === "object" && clerk !== null && "constructor" in clerk && typeof clerk.constructor === "function";
}
const VALID_LOG_LEVELS = new Set([
	"error",
	"warn",
	"info",
	"debug",
	"trace"
]);
const DEFAULT_CONFIG = {
	samplingRate: 1,
	maxBufferSize: 5,
	endpoint: "https://clerk-telemetry.com"
};
var TelemetryCollector = class {
	#config;
	#eventThrottler;
	#metadata = {};
	#buffer = [];
	#pendingFlush = null;
	constructor(options) {
		this.#config = {
			maxBufferSize: options.maxBufferSize ?? DEFAULT_CONFIG.maxBufferSize,
			samplingRate: options.samplingRate ?? DEFAULT_CONFIG.samplingRate,
			perEventSampling: options.perEventSampling ?? true,
			disabled: options.disabled ?? false,
			debug: options.debug ?? false,
			endpoint: DEFAULT_CONFIG.endpoint
		};
		if (!options.clerkVersion && typeof window === "undefined") this.#metadata.clerkVersion = "";
		else this.#metadata.clerkVersion = options.clerkVersion ?? "";
		this.#metadata.sdk = options.sdk;
		this.#metadata.sdkVersion = options.sdkVersion;
		this.#metadata.publishableKey = options.publishableKey ?? "";
		const parsedKey = require_keys.parsePublishableKey(options.publishableKey);
		if (parsedKey) this.#metadata.instanceType = parsedKey.instanceType;
		if (options.secretKey) this.#metadata.secretKey = options.secretKey.substring(0, 16);
		this.#eventThrottler = new TelemetryEventThrottler(LocalStorageThrottlerCache.isSupported() ? new LocalStorageThrottlerCache() : new InMemoryThrottlerCache());
	}
	get isEnabled() {
		if (this.#metadata.instanceType !== "development") return false;
		if (this.#config.disabled || typeof process !== "undefined" && process.env && require_underscore.isTruthy(process.env.CLERK_TELEMETRY_DISABLED)) return false;
		if (typeof window !== "undefined" && !!window?.navigator?.webdriver) return false;
		return true;
	}
	get isDebug() {
		return this.#config.debug || typeof process !== "undefined" && process.env && require_underscore.isTruthy(process.env.CLERK_TELEMETRY_DEBUG);
	}
	record(event) {
		try {
			const preparedPayload = this.#preparePayload(event.event, event.payload);
			this.#logEvent(preparedPayload.event, preparedPayload);
			if (!this.#shouldRecord(preparedPayload, event.eventSamplingRate)) return;
			this.#buffer.push({
				kind: "event",
				value: preparedPayload
			});
			this.#scheduleFlush();
		} catch (error) {
			console.error("[clerk/telemetry] Error recording telemetry event", error);
		}
	}
	/**
	* Records a telemetry log entry if logging is enabled and not in debug mode.
	*
	* @param entry - The telemetry log entry to record.
	*/
	recordLog(entry) {
		try {
			if (!this.#shouldRecordLog(entry)) return;
			const levelIsValid = typeof entry?.level === "string" && VALID_LOG_LEVELS.has(entry.level);
			const messageIsValid = typeof entry?.message === "string" && entry.message.trim().length > 0;
			let normalizedTimestamp = null;
			const timestampInput = entry?.timestamp;
			if (typeof timestampInput === "number" || typeof timestampInput === "string") {
				const candidate = new Date(timestampInput);
				if (!Number.isNaN(candidate.getTime())) normalizedTimestamp = candidate;
			}
			if (!levelIsValid || !messageIsValid || normalizedTimestamp === null) {
				if (this.isDebug && typeof console !== "undefined") console.warn("[clerk/telemetry] Dropping invalid telemetry log entry", {
					levelIsValid,
					messageIsValid,
					timestampIsValid: normalizedTimestamp !== null
				});
				return;
			}
			const sdkMetadata = this.#getSDKMetadata();
			const logData = {
				sdk: sdkMetadata.name,
				sdkv: sdkMetadata.version,
				cv: this.#metadata.clerkVersion ?? "",
				lvl: entry.level,
				msg: entry.message,
				ts: normalizedTimestamp.toISOString(),
				pk: this.#metadata.publishableKey || null,
				payload: this.#sanitizeContext(entry.context)
			};
			this.#buffer.push({
				kind: "log",
				value: logData
			});
			this.#scheduleFlush();
		} catch (error) {
			console.error("[clerk/telemetry] Error recording telemetry log entry", error);
		}
	}
	#shouldRecord(preparedPayload, eventSamplingRate) {
		return this.isEnabled && !this.isDebug && this.#shouldBeSampled(preparedPayload, eventSamplingRate);
	}
	#shouldRecordLog(_entry) {
		return true;
	}
	#shouldBeSampled(preparedPayload, eventSamplingRate) {
		const randomSeed = Math.random();
		if (!(randomSeed <= this.#config.samplingRate && (this.#config.perEventSampling === false || typeof eventSamplingRate === "undefined" || randomSeed <= eventSamplingRate))) return false;
		return !this.#eventThrottler.isEventThrottled(preparedPayload);
	}
	#scheduleFlush() {
		if (typeof window === "undefined") {
			this.#flush();
			return;
		}
		if (this.#buffer.length >= this.#config.maxBufferSize) {
			if (this.#pendingFlush) if (typeof cancelIdleCallback !== "undefined") cancelIdleCallback(Number(this.#pendingFlush));
			else clearTimeout(Number(this.#pendingFlush));
			this.#flush();
			return;
		}
		if (this.#pendingFlush) return;
		if ("requestIdleCallback" in window) this.#pendingFlush = requestIdleCallback(() => {
			this.#flush();
			this.#pendingFlush = null;
		});
		else this.#pendingFlush = setTimeout(() => {
			this.#flush();
			this.#pendingFlush = null;
		}, 0);
	}
	#flush() {
		const itemsToSend = [...this.#buffer];
		this.#buffer = [];
		this.#pendingFlush = null;
		if (itemsToSend.length === 0) return;
		const eventsToSend = itemsToSend.filter((item) => item.kind === "event").map((item) => item.value);
		const logsToSend = itemsToSend.filter((item) => item.kind === "log").map((item) => item.value);
		if (eventsToSend.length > 0) {
			const eventsUrl = new URL("/v1/event", this.#config.endpoint);
			fetch(eventsUrl, {
				headers: { "Content-Type": "application/json" },
				keepalive: true,
				method: "POST",
				body: JSON.stringify({ events: eventsToSend })
			}).catch(() => void 0);
		}
		if (logsToSend.length > 0) {
			const logsUrl = new URL("/v1/logs", this.#config.endpoint);
			fetch(logsUrl, {
				headers: { "Content-Type": "application/json" },
				keepalive: true,
				method: "POST",
				body: JSON.stringify({ logs: logsToSend })
			}).catch(() => void 0);
		}
	}
	/**
	* If running in debug mode, log the event and its payload to the console.
	*/
	#logEvent(event, payload) {
		if (!this.isDebug) return;
		if (typeof console.groupCollapsed !== "undefined") {
			console.groupCollapsed("[clerk/telemetry]", event);
			console.log(payload);
			console.groupEnd();
		} else console.log("[clerk/telemetry]", event, payload);
	}
	/**
	* If in browser, attempt to lazily grab the SDK metadata from the Clerk singleton, otherwise fallback to the initially passed in values.
	*
	* This is necessary because the sdkMetadata can be set by the host SDK after the TelemetryCollector is instantiated.
	*/
	#getSDKMetadata() {
		const sdkMetadata = {
			name: this.#metadata.sdk,
			version: this.#metadata.sdkVersion
		};
		if (typeof window !== "undefined") {
			const windowWithClerk = window;
			if (windowWithClerk.Clerk) {
				const windowClerk = windowWithClerk.Clerk;
				if (isWindowClerkWithMetadata(windowClerk) && windowClerk.constructor.sdkMetadata) {
					const { name, version } = windowClerk.constructor.sdkMetadata;
					if (name !== void 0) sdkMetadata.name = name;
					if (version !== void 0) sdkMetadata.version = version;
				}
			}
		}
		return sdkMetadata;
	}
	/**
	* Append relevant metadata from the Clerk singleton to the event payload.
	*/
	#preparePayload(event, payload) {
		const sdkMetadata = this.#getSDKMetadata();
		return {
			event,
			cv: this.#metadata.clerkVersion ?? "",
			it: this.#metadata.instanceType ?? "",
			sdk: sdkMetadata.name,
			sdkv: sdkMetadata.version,
			...this.#metadata.publishableKey ? { pk: this.#metadata.publishableKey } : {},
			...this.#metadata.secretKey ? { sk: this.#metadata.secretKey } : {},
			payload
		};
	}
	/**
	* Best-effort sanitization of the context payload. Returns a plain object with JSON-serializable
	* values or null when the input is missing or not serializable. Arrays are not accepted.
	*/
	#sanitizeContext(context) {
		if (context === null || typeof context === "undefined") return null;
		if (typeof context !== "object") return null;
		try {
			const cleaned = JSON.parse(JSON.stringify(context));
			if (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned)) return cleaned;
			return null;
		} catch {
			return null;
		}
	}
};

//#endregion
//#region src/telemetry/events/component-mounted.ts
const EVENT_COMPONENT_MOUNTED = "COMPONENT_MOUNTED";
const EVENT_COMPONENT_OPENED = "COMPONENT_OPENED";
const EVENT_SAMPLING_RATE$3 = .1;
/** Increase sampling for high-signal auth components on mount. */
const AUTH_COMPONENTS = new Set(["SignIn", "SignUp"]);
/**
* Returns the per-event sampling rate for component-mounted telemetry events.
* Uses a higher rate for SignIn/SignUp to improve signal quality.
*
*  @internal
*/
function getComponentMountedSamplingRate(component) {
	return AUTH_COMPONENTS.has(component) ? 1 : EVENT_SAMPLING_RATE$3;
}
/**
* Factory for prebuilt component telemetry events.
*
* @internal
*/
function createPrebuiltComponentEvent(event) {
	return function(component, props, additionalPayload) {
		return {
			event,
			eventSamplingRate: event === EVENT_COMPONENT_MOUNTED ? getComponentMountedSamplingRate(component) : EVENT_SAMPLING_RATE$3,
			payload: {
				component,
				appearanceProp: Boolean(props?.appearance),
				baseTheme: Boolean(props?.appearance?.baseTheme),
				elements: Boolean(props?.appearance?.elements),
				variables: Boolean(props?.appearance?.variables),
				...additionalPayload
			}
		};
	};
}
/**
* Helper function for `telemetry.record()`. Create a consistent event object for when a prebuilt (AIO) component is mounted.
*
* @param component - The name of the component.
* @param props - The props passed to the component. Will be filtered to a known list of props.
* @param additionalPayload - Additional data to send with the event.
* @example
* telemetry.record(eventPrebuiltComponentMounted('SignUp', props));
*/
function eventPrebuiltComponentMounted(component, props, additionalPayload) {
	return createPrebuiltComponentEvent(EVENT_COMPONENT_MOUNTED)(component, props, additionalPayload);
}
/**
* Helper function for `telemetry.record()`. Create a consistent event object for when a prebuilt (AIO) component is opened as a modal.
*
* @param component - The name of the component.
* @param props - The props passed to the component. Will be filtered to a known list of props.
* @param additionalPayload - Additional data to send with the event.
* @example
* telemetry.record(eventPrebuiltComponentOpened('GoogleOneTap', props));
*/
function eventPrebuiltComponentOpened(component, props, additionalPayload) {
	return createPrebuiltComponentEvent(EVENT_COMPONENT_OPENED)(component, props, additionalPayload);
}
/**
* Helper function for `telemetry.record()`. Create a consistent event object for when a component is mounted. Use `eventPrebuiltComponentMounted` for prebuilt components.
*
* **Caution:** Filter the `props` you pass to this function to avoid sending too much data.
*
* @param component - The name of the component.
* @param props - The props passed to the component. Ideally you only pass a handful of props here.
* @example
* telemetry.record(eventComponentMounted('SignUp', props));
*/
function eventComponentMounted(component, props = {}) {
	return {
		event: EVENT_COMPONENT_MOUNTED,
		eventSamplingRate: getComponentMountedSamplingRate(component),
		payload: {
			component,
			...props
		}
	};
}

//#endregion
//#region src/telemetry/events/method-called.ts
const EVENT_METHOD_CALLED = "METHOD_CALLED";
const EVENT_SAMPLING_RATE$2 = .1;
/**
* Fired when a helper method is called from a Clerk SDK.
*/
function eventMethodCalled(method, payload) {
	return {
		event: EVENT_METHOD_CALLED,
		eventSamplingRate: EVENT_SAMPLING_RATE$2,
		payload: {
			method,
			...payload
		}
	};
}

//#endregion
//#region src/telemetry/events/framework-metadata.ts
const EVENT_FRAMEWORK_METADATA = "FRAMEWORK_METADATA";
const EVENT_SAMPLING_RATE$1 = .1;
/**
* Fired when a helper method is called from a Clerk SDK.
*/
function eventFrameworkMetadata(payload) {
	return {
		event: EVENT_FRAMEWORK_METADATA,
		eventSamplingRate: EVENT_SAMPLING_RATE$1,
		payload
	};
}

//#endregion
//#region src/telemetry/events/theme-usage.ts
const EVENT_THEME_USAGE = "THEME_USAGE";
const EVENT_SAMPLING_RATE = 1;
/**
* Helper function for `telemetry.record()`. Create a consistent event object for tracking theme usage in ClerkProvider.
*
* @param appearance - The appearance prop from ClerkProvider.
* @example
* telemetry.record(eventThemeUsage(appearance));
*/
function eventThemeUsage(appearance) {
	return {
		event: EVENT_THEME_USAGE,
		eventSamplingRate: EVENT_SAMPLING_RATE,
		payload: analyzeThemeUsage(appearance)
	};
}
/**
* Analyzes the appearance prop to extract theme usage information for telemetry.
*
* @internal
*/
function analyzeThemeUsage(appearance) {
	if (!appearance || typeof appearance !== "object") return {};
	const themeProperty = appearance.theme || appearance.baseTheme;
	if (!themeProperty) return {};
	let themeName;
	if (Array.isArray(themeProperty)) for (const theme of themeProperty) {
		const name = extractThemeName(theme);
		if (name) {
			themeName = name;
			break;
		}
	}
	else themeName = extractThemeName(themeProperty);
	return { themeName };
}
/**
* Extracts the theme name from a theme object.
*
* @internal
*/
function extractThemeName(theme) {
	if (typeof theme === "string") return theme;
	if (typeof theme === "object" && theme !== null) {
		if ("name" in theme && typeof theme.name === "string") return theme.name;
	}
}

//#endregion
Object.defineProperty(exports, 'EVENT_SAMPLING_RATE', {
  enumerable: true,
  get: function () {
    return EVENT_SAMPLING_RATE;
  }
});
Object.defineProperty(exports, 'EVENT_THEME_USAGE', {
  enumerable: true,
  get: function () {
    return EVENT_THEME_USAGE;
  }
});
Object.defineProperty(exports, 'TelemetryCollector', {
  enumerable: true,
  get: function () {
    return TelemetryCollector;
  }
});
Object.defineProperty(exports, 'eventComponentMounted', {
  enumerable: true,
  get: function () {
    return eventComponentMounted;
  }
});
Object.defineProperty(exports, 'eventFrameworkMetadata', {
  enumerable: true,
  get: function () {
    return eventFrameworkMetadata;
  }
});
Object.defineProperty(exports, 'eventMethodCalled', {
  enumerable: true,
  get: function () {
    return eventMethodCalled;
  }
});
Object.defineProperty(exports, 'eventPrebuiltComponentMounted', {
  enumerable: true,
  get: function () {
    return eventPrebuiltComponentMounted;
  }
});
Object.defineProperty(exports, 'eventPrebuiltComponentOpened', {
  enumerable: true,
  get: function () {
    return eventPrebuiltComponentOpened;
  }
});
Object.defineProperty(exports, 'eventThemeUsage', {
  enumerable: true,
  get: function () {
    return eventThemeUsage;
  }
});
//# sourceMappingURL=telemetry-DKa_Z2f1.js.map