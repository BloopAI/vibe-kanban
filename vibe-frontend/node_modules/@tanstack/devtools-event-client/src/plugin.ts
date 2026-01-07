interface TanStackDevtoolsEvent<TEventName extends string, TPayload = any> {
  type: TEventName
  payload: TPayload
  pluginId?: string // Optional pluginId to filter events by plugin
}
declare global {
  var __TANSTACK_EVENT_TARGET__: EventTarget | null
}

type AllDevtoolsEvents<TEventMap extends Record<string, any>> = {
  [Key in keyof TEventMap]: TanStackDevtoolsEvent<Key & string, TEventMap[Key]>
}[keyof TEventMap]

export class EventClient<
  TEventMap extends Record<string, any>,
  TPluginId extends string = TEventMap extends Record<infer P, any>
    ? P extends `${infer Id}:${string}`
      ? Id
      : never
    : never,
> {
  #enabled = true
  #pluginId: TPluginId
  #eventTarget: () => EventTarget
  #debug: boolean
  #queuedEvents: Array<TanStackDevtoolsEvent<string, any>>
  #connected: boolean
  #connectIntervalId: number | null
  #connectEveryMs: number
  #retryCount = 0
  #maxRetries = 5
  #connecting = false
  #failedToConnect = false
  #internalEventTarget: EventTarget | null = null

  #onConnected = () => {
    this.debugLog('Connected to event bus')
    this.#connected = true
    this.#connecting = false
    this.debugLog('Emitting queued events', this.#queuedEvents)
    this.#queuedEvents.forEach((event) => this.emitEventToBus(event))
    this.#queuedEvents = []
    this.stopConnectLoop()
    this.#eventTarget().removeEventListener(
      'tanstack-connect-success',
      this.#onConnected,
    )
  }
  // fired off right away and then at intervals
  #retryConnection = () => {
    if (this.#retryCount < this.#maxRetries) {
      this.#retryCount++
      this.dispatchCustomEvent('tanstack-connect', {})

      return
    }
    this.#eventTarget().removeEventListener(
      'tanstack-connect',
      this.#retryConnection,
    )
    this.#failedToConnect = true
    this.debugLog('Max retries reached, giving up on connection')
    this.stopConnectLoop()
  }

  // This is run to register connection handlers on first emit attempt
  #connectFunction = () => {
    if (this.#connecting) return
    this.#connecting = true
    this.#eventTarget().addEventListener(
      'tanstack-connect-success',
      this.#onConnected,
    )
    this.#retryConnection()
  }

  constructor({
    pluginId,
    debug = false,
    enabled = true,
    reconnectEveryMs = 300,
  }: {
    pluginId: TPluginId
    debug?: boolean
    reconnectEveryMs?: number
    enabled?: boolean
  }) {
    this.#pluginId = pluginId
    this.#enabled = enabled
    this.#eventTarget = this.getGlobalTarget
    this.#debug = debug
    this.debugLog(' Initializing event subscription for plugin', this.#pluginId)
    this.#queuedEvents = []
    this.#connected = false
    this.#failedToConnect = false
    this.#connectIntervalId = null
    this.#connectEveryMs = reconnectEveryMs
  }

  private startConnectLoop() {
    // if connected, trying to connect, or the internalId is already set, do nothing
    if (this.#connectIntervalId !== null || this.#connected) return
    this.debugLog(`Starting connect loop (every ${this.#connectEveryMs}ms)`)

    this.#connectIntervalId = setInterval(
      this.#retryConnection,
      this.#connectEveryMs,
    ) as unknown as number
  }

  private stopConnectLoop() {
    this.#connecting = false

    if (this.#connectIntervalId === null) {
      return
    }
    clearInterval(this.#connectIntervalId)
    this.#connectIntervalId = null
    this.#queuedEvents = []
    this.debugLog('Stopped connect loop')
  }

  private debugLog(...args: Array<any>) {
    if (this.#debug) {
      console.log(`🌴 [tanstack-devtools:${this.#pluginId}-plugin]`, ...args)
    }
  }
  private getGlobalTarget() {
    // server one is the global event target
    if (
      typeof globalThis !== 'undefined' &&
      globalThis.__TANSTACK_EVENT_TARGET__
    ) {
      this.debugLog('Using global event target')
      return globalThis.__TANSTACK_EVENT_TARGET__
    }
    // CLient event target is the browser window object
    if (
      typeof window !== 'undefined' &&
      typeof window.addEventListener !== 'undefined'
    ) {
      this.debugLog('Using window as event target')

      return window
    }
    // Protect against non-web environments like react-native
    const eventTarget =
      typeof EventTarget !== 'undefined' ? new EventTarget() : undefined

    // For non-web environments like react-native
    if (
      typeof eventTarget === 'undefined' ||
      typeof eventTarget.addEventListener === 'undefined'
    ) {
      this.debugLog(
        'No event mechanism available, running in non-web environment',
      )
      return {
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }
    }

    this.debugLog('Using new EventTarget as fallback')
    return eventTarget
  }

  getPluginId() {
    return this.#pluginId
  }

  private dispatchCustomEventShim(eventName: string, detail: any) {
    try {
      const event = new Event(eventName, {
        detail: detail,
      } as any)
      this.#eventTarget().dispatchEvent(event)
    } catch (e) {
      this.debugLog('Failed to dispatch shim event')
    }
  }

  private dispatchCustomEvent(eventName: string, detail?: any) {
    try {
      this.#eventTarget().dispatchEvent(new CustomEvent(eventName, { detail }))
    } catch (e) {
      this.dispatchCustomEventShim(eventName, detail)
    }
  }

  private emitEventToBus(event: TanStackDevtoolsEvent<string, any>) {
    this.debugLog('Emitting event to client bus', event)
    this.dispatchCustomEvent('tanstack-dispatch-event', event)
  }

  createEventPayload<
    TSuffix extends Extract<
      keyof TEventMap,
      `${TPluginId & string}:${string}`
    > extends `${TPluginId & string}:${infer S}`
      ? S
      : never,
  >(
    eventSuffix: TSuffix,
    payload: TEventMap[`${TPluginId & string}:${TSuffix}`],
  ) {
    return {
      type: `${this.#pluginId}:${eventSuffix}`,
      payload,
      pluginId: this.#pluginId,
    }
  }
  emit<
    TSuffix extends Extract<
      keyof TEventMap,
      `${TPluginId & string}:${string}`
    > extends `${TPluginId & string}:${infer S}`
      ? S
      : never,
  >(
    eventSuffix: TSuffix,
    payload: TEventMap[`${TPluginId & string}:${TSuffix}`],
  ) {
    if (!this.#enabled) {
      this.debugLog(
        'Event bus client is disabled, not emitting event',
        eventSuffix,
        payload,
      )
      return
    }
    if (this.#internalEventTarget) {
      this.debugLog(
        'Emitting event to internal event target',
        eventSuffix,
        payload,
      )
      this.#internalEventTarget.dispatchEvent(
        new CustomEvent(`${this.#pluginId}:${eventSuffix}`, {
          detail: this.createEventPayload(eventSuffix, payload),
        }),
      )
    }

    if (this.#failedToConnect) {
      this.debugLog('Previously failed to connect, not emitting to bus')
      return
    }
    // wait to connect to the bus
    if (!this.#connected) {
      this.debugLog('Bus not available, will be pushed as soon as connected')
      this.#queuedEvents.push(this.createEventPayload(eventSuffix, payload))
      // start connection to event bus
      if (typeof CustomEvent !== 'undefined' && !this.#connecting) {
        this.#connectFunction()
        this.startConnectLoop()
      }
      return
    }
    // emit right now
    return this.emitEventToBus(this.createEventPayload(eventSuffix, payload))
  }

  on<
    TSuffix extends Extract<
      keyof TEventMap,
      `${TPluginId & string}:${string}`
    > extends `${TPluginId & string}:${infer S}`
      ? S
      : never,
  >(
    eventSuffix: TSuffix,
    cb: (
      event: TanStackDevtoolsEvent<
        `${TPluginId & string}:${TSuffix}`,
        TEventMap[`${TPluginId & string}:${TSuffix}`]
      >,
    ) => void,
    options?: {
      withEventTarget?: boolean
    },
  ) {
    const withEventTarget = options?.withEventTarget ?? false
    const eventName = `${this.#pluginId}:${eventSuffix}` as const
    if (withEventTarget) {
      if (!this.#internalEventTarget) {
        this.#internalEventTarget = new EventTarget()
      }
      this.#internalEventTarget.addEventListener(eventName, (e) => {
        cb((e as CustomEvent).detail)
      })
    }
    if (!this.#enabled) {
      this.debugLog(
        'Event bus client is disabled, not registering event',
        eventName,
      )
      return () => {}
    }
    const handler = (e: Event) => {
      this.debugLog('Received event from bus', (e as CustomEvent).detail)
      cb((e as CustomEvent).detail)
    }
    this.#eventTarget().addEventListener(eventName, handler)
    this.debugLog('Registered event to bus', eventName)
    return () => {
      if (withEventTarget) {
        this.#internalEventTarget?.removeEventListener(eventName, handler)
      }
      this.#eventTarget().removeEventListener(eventName, handler)
    }
  }

  onAll(cb: (event: TanStackDevtoolsEvent<string, any>) => void) {
    if (!this.#enabled) {
      this.debugLog('Event bus client is disabled, not registering event')
      return () => {}
    }

    const handler = (e: Event) => {
      const event = (e as CustomEvent).detail

      cb(event)
    }
    this.#eventTarget().addEventListener('tanstack-devtools-global', handler)
    return () =>
      this.#eventTarget().removeEventListener(
        'tanstack-devtools-global',
        handler,
      )
  }
  onAllPluginEvents(cb: (event: AllDevtoolsEvents<TEventMap>) => void) {
    if (!this.#enabled) {
      this.debugLog('Event bus client is disabled, not registering event')
      return () => {}
    }
    const handler = (e: Event) => {
      const event = (e as CustomEvent).detail
      if (this.#pluginId && event.pluginId !== this.#pluginId) {
        return
      }
      cb(event)
    }
    this.#eventTarget().addEventListener('tanstack-devtools-global', handler)
    return () =>
      this.#eventTarget().removeEventListener(
        'tanstack-devtools-global',
        handler,
      )
  }
}
