export type FirstInputPolyfillEntry = Pick<PerformanceEventTiming, Exclude<keyof PerformanceEventTiming, 'processingEnd'>>;
export interface FirstInputPolyfillCallback {
    (entry: FirstInputPolyfillEntry): void;
}
//# sourceMappingURL=polyfills.d.ts.map
