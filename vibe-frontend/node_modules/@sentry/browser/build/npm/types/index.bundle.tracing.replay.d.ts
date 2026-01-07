import { feedbackIntegrationShim } from '@sentry-internal/integration-shims';
export * from './index.bundle.base';
export { getActiveSpan, getRootSpan, startSpan, startInactiveSpan, startSpanManual, startNewTrace, withActiveSpan, getSpanDescendants, setMeasurement, } from '@sentry/core';
export { browserTracingIntegration, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan, } from './tracing/browserTracingIntegration';
export { feedbackIntegrationShim as feedbackAsyncIntegration, feedbackIntegrationShim as feedbackIntegration };
export { replayIntegration, getReplay } from '@sentry-internal/replay';
//# sourceMappingURL=index.bundle.tracing.replay.d.ts.map