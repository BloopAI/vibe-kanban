"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
class EventClient {
  #enabled = true;
  #pluginId;
  #eventTarget;
  #debug;
  #queuedEvents;
  #connected;
  #connectIntervalId;
  #connectEveryMs;
  #retryCount = 0;
  #maxRetries = 5;
  #connecting = false;
  #failedToConnect = false;
  #internalEventTarget = null;
  #onConnected = () => {
    this.debugLog("Connected to event bus");
    this.#connected = true;
    this.#connecting = false;
    this.debugLog("Emitting queued events", this.#queuedEvents);
    this.#queuedEvents.forEach((event) => this.emitEventToBus(event));
    this.#queuedEvents = [];
    this.stopConnectLoop();
    this.#eventTarget().removeEventListener(
      "tanstack-connect-success",
      this.#onConnected
    );
  };
  // fired off right away and then at intervals
  #retryConnection = () => {
    if (this.#retryCount < this.#maxRetries) {
      this.#retryCount++;
      this.dispatchCustomEvent("tanstack-connect", {});
      return;
    }
    this.#eventTarget().removeEventListener(
      "tanstack-connect",
      this.#retryConnection
    );
    this.#failedToConnect = true;
    this.debugLog("Max retries reached, giving up on connection");
    this.stopConnectLoop();
  };
  // This is run to register connection handlers on first emit attempt
  #connectFunction = () => {
    if (this.#connecting) return;
    this.#connecting = true;
    this.#eventTarget().addEventListener(
      "tanstack-connect-success",
      this.#onConnected
    );
    this.#retryConnection();
  };
  constructor({
    pluginId,
    debug = false,
    enabled = true,
    reconnectEveryMs = 300
  }) {
    this.#pluginId = pluginId;
    this.#enabled = enabled;
    this.#eventTarget = this.getGlobalTarget;
    this.#debug = debug;
    this.debugLog(" Initializing event subscription for plugin", this.#pluginId);
    this.#queuedEvents = [];
    this.#connected = false;
    this.#failedToConnect = false;
    this.#connectIntervalId = null;
    this.#connectEveryMs = reconnectEveryMs;
  }
  startConnectLoop() {
    if (this.#connectIntervalId !== null || this.#connected) return;
    this.debugLog(`Starting connect loop (every ${this.#connectEveryMs}ms)`);
    this.#connectIntervalId = setInterval(
      this.#retryConnection,
      this.#connectEveryMs
    );
  }
  stopConnectLoop() {
    this.#connecting = false;
    if (this.#connectIntervalId === null) {
      return;
    }
    clearInterval(this.#connectIntervalId);
    this.#connectIntervalId = null;
    this.#queuedEvents = [];
    this.debugLog("Stopped connect loop");
  }
  debugLog(...args) {
    if (this.#debug) {
      console.log(`🌴 [tanstack-devtools:${this.#pluginId}-plugin]`, ...args);
    }
  }
  getGlobalTarget() {
    if (typeof globalThis !== "undefined" && globalThis.__TANSTACK_EVENT_TARGET__) {
      this.debugLog("Using global event target");
      return globalThis.__TANSTACK_EVENT_TARGET__;
    }
    if (typeof window !== "undefined" && typeof window.addEventListener !== "undefined") {
      this.debugLog("Using window as event target");
      return window;
    }
    const eventTarget = typeof EventTarget !== "undefined" ? new EventTarget() : void 0;
    if (typeof eventTarget === "undefined" || typeof eventTarget.addEventListener === "undefined") {
      this.debugLog(
        "No event mechanism available, running in non-web environment"
      );
      return {
        addEventListener: () => {
        },
        removeEventListener: () => {
        },
        dispatchEvent: () => false
      };
    }
    this.debugLog("Using new EventTarget as fallback");
    return eventTarget;
  }
  getPluginId() {
    return this.#pluginId;
  }
  dispatchCustomEventShim(eventName, detail) {
    try {
      const event = new Event(eventName, {
        detail
      });
      this.#eventTarget().dispatchEvent(event);
    } catch (e) {
      this.debugLog("Failed to dispatch shim event");
    }
  }
  dispatchCustomEvent(eventName, detail) {
    try {
      this.#eventTarget().dispatchEvent(new CustomEvent(eventName, { detail }));
    } catch (e) {
      this.dispatchCustomEventShim(eventName, detail);
    }
  }
  emitEventToBus(event) {
    this.debugLog("Emitting event to client bus", event);
    this.dispatchCustomEvent("tanstack-dispatch-event", event);
  }
  createEventPayload(eventSuffix, payload) {
    return {
      type: `${this.#pluginId}:${eventSuffix}`,
      payload,
      pluginId: this.#pluginId
    };
  }
  emit(eventSuffix, payload) {
    if (!this.#enabled) {
      this.debugLog(
        "Event bus client is disabled, not emitting event",
        eventSuffix,
        payload
      );
      return;
    }
    if (this.#internalEventTarget) {
      this.debugLog(
        "Emitting event to internal event target",
        eventSuffix,
        payload
      );
      this.#internalEventTarget.dispatchEvent(
        new CustomEvent(`${this.#pluginId}:${eventSuffix}`, {
          detail: this.createEventPayload(eventSuffix, payload)
        })
      );
    }
    if (this.#failedToConnect) {
      this.debugLog("Previously failed to connect, not emitting to bus");
      return;
    }
    if (!this.#connected) {
      this.debugLog("Bus not available, will be pushed as soon as connected");
      this.#queuedEvents.push(this.createEventPayload(eventSuffix, payload));
      if (typeof CustomEvent !== "undefined" && !this.#connecting) {
        this.#connectFunction();
        this.startConnectLoop();
      }
      return;
    }
    return this.emitEventToBus(this.createEventPayload(eventSuffix, payload));
  }
  on(eventSuffix, cb, options) {
    const withEventTarget = options?.withEventTarget ?? false;
    const eventName = `${this.#pluginId}:${eventSuffix}`;
    if (withEventTarget) {
      if (!this.#internalEventTarget) {
        this.#internalEventTarget = new EventTarget();
      }
      this.#internalEventTarget.addEventListener(eventName, (e) => {
        cb(e.detail);
      });
    }
    if (!this.#enabled) {
      this.debugLog(
        "Event bus client is disabled, not registering event",
        eventName
      );
      return () => {
      };
    }
    const handler = (e) => {
      this.debugLog("Received event from bus", e.detail);
      cb(e.detail);
    };
    this.#eventTarget().addEventListener(eventName, handler);
    this.debugLog("Registered event to bus", eventName);
    return () => {
      if (withEventTarget) {
        this.#internalEventTarget?.removeEventListener(eventName, handler);
      }
      this.#eventTarget().removeEventListener(eventName, handler);
    };
  }
  onAll(cb) {
    if (!this.#enabled) {
      this.debugLog("Event bus client is disabled, not registering event");
      return () => {
      };
    }
    const handler = (e) => {
      const event = e.detail;
      cb(event);
    };
    this.#eventTarget().addEventListener("tanstack-devtools-global", handler);
    return () => this.#eventTarget().removeEventListener(
      "tanstack-devtools-global",
      handler
    );
  }
  onAllPluginEvents(cb) {
    if (!this.#enabled) {
      this.debugLog("Event bus client is disabled, not registering event");
      return () => {
      };
    }
    const handler = (e) => {
      const event = e.detail;
      if (this.#pluginId && event.pluginId !== this.#pluginId) {
        return;
      }
      cb(event);
    };
    this.#eventTarget().addEventListener("tanstack-devtools-global", handler);
    return () => this.#eventTarget().removeEventListener(
      "tanstack-devtools-global",
      handler
    );
  }
}
exports.EventClient = EventClient;
//# sourceMappingURL=plugin.cjs.map
