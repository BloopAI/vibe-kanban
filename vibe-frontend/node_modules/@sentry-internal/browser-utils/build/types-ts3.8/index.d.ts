export { addPerformanceInstrumentationHandler, addClsInstrumentationHandler, addFidInstrumentationHandler, addTtfbInstrumentationHandler, addLcpInstrumentationHandler, addInpInstrumentationHandler, } from './metrics/instrument';
export { addPerformanceEntries, startTrackingInteractions, startTrackingLongTasks, startTrackingLongAnimationFrames, startTrackingWebVitals, startTrackingINP, registerInpInteractionListener, } from './metrics/browserMetrics';
export { startTrackingElementTiming } from './metrics/elementTiming';
export { extractNetworkProtocol } from './metrics/utils';
export { addClickKeypressInstrumentationHandler } from './instrument/dom';
export { addHistoryInstrumentationHandler } from './instrument/history';
export { fetch, setTimeout, clearCachedImplementation, getNativeImplementation } from './getNativeImplementation';
export { addXhrInstrumentationHandler, SENTRY_XHR_DATA_KEY } from './instrument/xhr';
export { getBodyString, getFetchRequestArgBody, serializeFormData } from './networkUtils';
export { FetchHint, NetworkMetaWarning, XhrHint } from './types';
//# sourceMappingURL=index.d.ts.map
