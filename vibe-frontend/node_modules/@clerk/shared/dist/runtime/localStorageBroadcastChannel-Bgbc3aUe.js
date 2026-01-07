const require_deprecated = require('./deprecated-B-fX5ZX6.js');

//#region src/localStorageBroadcastChannel.ts
const KEY_PREFIX = "__lsbc__";
/**
* @deprecated This class will be completely removed in the next major version.
* Use the native BroadcastChannel API directly instead.
*/
var LocalStorageBroadcastChannel = class {
	eventTarget = window;
	channelKey;
	constructor(name) {
		require_deprecated.deprecated("LocalStorageBroadcastChannel", "Use the native BroadcastChannel API directly instead.");
		this.channelKey = KEY_PREFIX + name;
		this.setupLocalStorageListener();
	}
	postMessage = (data) => {
		if (typeof window === "undefined") return;
		try {
			window.localStorage.setItem(this.channelKey, JSON.stringify(data));
			window.localStorage.removeItem(this.channelKey);
		} catch {}
	};
	addEventListener = (eventName, listener) => {
		this.eventTarget.addEventListener(this.prefixEventName(eventName), (e) => {
			listener(e);
		});
	};
	setupLocalStorageListener = () => {
		const notifyListeners = (e) => {
			if (e.key !== this.channelKey || !e.newValue) return;
			try {
				const data = JSON.parse(e.newValue || "");
				const event = new MessageEvent(this.prefixEventName("message"), { data });
				this.eventTarget.dispatchEvent(event);
			} catch {}
		};
		window.addEventListener("storage", notifyListeners);
	};
	prefixEventName(eventName) {
		return this.channelKey + eventName;
	}
};

//#endregion
Object.defineProperty(exports, 'LocalStorageBroadcastChannel', {
  enumerable: true,
  get: function () {
    return LocalStorageBroadcastChannel;
  }
});
//# sourceMappingURL=localStorageBroadcastChannel-Bgbc3aUe.js.map