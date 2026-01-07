export type FirstInputPolyfillEntry = Omit<PerformanceEventTiming, 'processingEnd'>;
export interface FirstInputPolyfillCallback {
    (entry: FirstInputPolyfillEntry): void;
}
//# sourceMappingURL=polyfills.d.ts.map