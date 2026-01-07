import { Appearance, TelemetryCollector as TelemetryCollector$1, TelemetryEventRaw, TelemetryLogEntry } from "./index-BnRZtxqr.mjs";

//#region src/telemetry/types.d.ts
type TelemetryCollectorOptions = {
  /**
   * If true, telemetry will not be collected.
   */
  disabled?: boolean;
  /**
   * If true, telemetry will not be sent, but collected events will be logged to the console.
   */
  debug?: boolean;
  /**
   * Sampling rate, 0-1.
   */
  samplingRate?: number;
  /**
   * If false, the sampling rates provided per event will be ignored and the global sampling rate will be used.
   *
   * @default true
   */
  perEventSampling?: boolean;
  /**
   * Set a custom buffer size to control how often events are sent.
   */
  maxBufferSize?: number;
  /**
   * The publishableKey to associate with the collected events.
   */
  publishableKey?: string;
  /**
   * The secretKey to associate with the collected events.
   */
  secretKey?: string;
  /**
   * The current clerk-js version.
   */
  clerkVersion?: string;
  /**
   * The SDK being used, e.g. `@clerk/nextjs` or `@clerk/remix`.
   */
  sdk?: string;
  /**
   * The version of the SDK being used.
   */
  sdkVersion?: string;
};
//#endregion
//#region src/telemetry/collector.d.ts
declare class TelemetryCollector implements TelemetryCollector$1 {
  #private;
  constructor(options: TelemetryCollectorOptions);
  get isEnabled(): boolean;
  get isDebug(): boolean;
  record(event: TelemetryEventRaw): void;
  /**
   * Records a telemetry log entry if logging is enabled and not in debug mode.
   *
   * @param entry - The telemetry log entry to record.
   */
  recordLog(entry: TelemetryLogEntry): void;
}
//#endregion
//#region src/telemetry/events/component-mounted.d.ts
type ComponentMountedBase = {
  component: string;
};
type EventPrebuiltComponent = ComponentMountedBase & {
  appearanceProp: boolean;
  elements: boolean;
  variables: boolean;
  baseTheme: boolean;
};
type EventComponentMounted = ComponentMountedBase & TelemetryEventRaw['payload'];
/**
 * Helper function for `telemetry.record()`. Create a consistent event object for when a prebuilt (AIO) component is mounted.
 *
 * @param component - The name of the component.
 * @param props - The props passed to the component. Will be filtered to a known list of props.
 * @param additionalPayload - Additional data to send with the event.
 * @example
 * telemetry.record(eventPrebuiltComponentMounted('SignUp', props));
 */
declare function eventPrebuiltComponentMounted(component: string, props?: Record<string, any>, additionalPayload?: TelemetryEventRaw['payload']): TelemetryEventRaw<EventPrebuiltComponent>;
/**
 * Helper function for `telemetry.record()`. Create a consistent event object for when a prebuilt (AIO) component is opened as a modal.
 *
 * @param component - The name of the component.
 * @param props - The props passed to the component. Will be filtered to a known list of props.
 * @param additionalPayload - Additional data to send with the event.
 * @example
 * telemetry.record(eventPrebuiltComponentOpened('GoogleOneTap', props));
 */
declare function eventPrebuiltComponentOpened(component: string, props?: Record<string, any>, additionalPayload?: TelemetryEventRaw['payload']): TelemetryEventRaw<EventPrebuiltComponent>;
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
declare function eventComponentMounted(component: string, props?: TelemetryEventRaw['payload']): TelemetryEventRaw<EventComponentMounted>;
//#endregion
//#region src/telemetry/events/method-called.d.ts
type EventMethodCalled = {
  method: string;
} & Record<string, string | number | boolean>;
/**
 * Fired when a helper method is called from a Clerk SDK.
 */
declare function eventMethodCalled(method: string, payload?: Record<string, unknown>): TelemetryEventRaw<EventMethodCalled>;
//#endregion
//#region src/telemetry/events/framework-metadata.d.ts
type EventFrameworkMetadata = Record<string, string | number | boolean>;
/**
 * Fired when a helper method is called from a Clerk SDK.
 */
declare function eventFrameworkMetadata(payload: EventFrameworkMetadata): TelemetryEventRaw<EventFrameworkMetadata>;
//#endregion
//#region src/telemetry/events/theme-usage.d.ts
declare const EVENT_THEME_USAGE = "THEME_USAGE";
declare const EVENT_SAMPLING_RATE = 1;
type EventThemeUsage = {
  /**
   * The name of the theme being used (e.g., "shadcn", "neobrutalism", etc.).
   */
  themeName?: string;
};
/**
 * Helper function for `telemetry.record()`. Create a consistent event object for tracking theme usage in ClerkProvider.
 *
 * @param appearance - The appearance prop from ClerkProvider.
 * @example
 * telemetry.record(eventThemeUsage(appearance));
 */
declare function eventThemeUsage(appearance?: Appearance): TelemetryEventRaw<EventThemeUsage>;
//#endregion
export { EVENT_SAMPLING_RATE, EVENT_THEME_USAGE, TelemetryCollector, type TelemetryCollectorOptions, eventComponentMounted, eventFrameworkMetadata, eventMethodCalled, eventPrebuiltComponentMounted, eventPrebuiltComponentOpened, eventThemeUsage };
//# sourceMappingURL=telemetry.d.mts.map