import { feedbackAsyncIntegration } from './feedbackAsync';
export * from './index.bundle.base';
export { getActiveSpan, getRootSpan, startSpan, startInactiveSpan, startSpanManual, startNewTrace, withActiveSpan, getSpanDescendants, setMeasurement, } from '@sentry/core';
export { browserTracingIntegration, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan, } from './tracing/browserTracingIntegration';
export { getFeedback } from '@sentry-internal/feedback';
export { feedbackAsyncIntegration as feedbackAsyncIntegration, feedbackAsyncIntegration as feedbackIntegration };
export { replayIntegration, getReplay } from '@sentry-internal/replay';
//# sourceMappingURL=index.bundle.tracing.replay.feedback.d.ts.map
