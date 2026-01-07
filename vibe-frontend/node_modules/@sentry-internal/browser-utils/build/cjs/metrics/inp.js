Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const instrument = require('./instrument.js');
const utils = require('./utils.js');

const LAST_INTERACTIONS = [];
const INTERACTIONS_SPAN_MAP = new Map();

/**
 * 60 seconds is the maximum for a plausible INP value
 * (source: Me)
 */
const MAX_PLAUSIBLE_INP_DURATION = 60;
/**
 * Start tracking INP webvital events.
 */
function startTrackingINP() {
  const performance = utils.getBrowserPerformanceAPI();
  if (performance && core.browserPerformanceTimeOrigin()) {
    const inpCallback = _trackINP();

    return () => {
      inpCallback();
    };
  }

  return () => undefined;
}

const INP_ENTRY_MAP = {
  click: 'click',
  pointerdown: 'click',
  pointerup: 'click',
  mousedown: 'click',
  mouseup: 'click',
  touchstart: 'click',
  touchend: 'click',
  mouseover: 'hover',
  mouseout: 'hover',
  mouseenter: 'hover',
  mouseleave: 'hover',
  pointerover: 'hover',
  pointerout: 'hover',
  pointerenter: 'hover',
  pointerleave: 'hover',
  dragstart: 'drag',
  dragend: 'drag',
  drag: 'drag',
  dragenter: 'drag',
  dragleave: 'drag',
  dragover: 'drag',
  drop: 'drag',
  keydown: 'press',
  keyup: 'press',
  keypress: 'press',
  input: 'press',
};

/** Starts tracking the Interaction to Next Paint on the current page. #
 * exported only for testing
 */
function _trackINP() {
  return instrument.addInpInstrumentationHandler(_onInp);
}

/**
 * exported only for testing
 */
const _onInp = ({ metric }) => {
  if (metric.value == undefined) {
    return;
  }

  const duration = utils.msToSec(metric.value);

  // We received occasional reports of hour-long INP values.
  // Therefore, we add a sanity check to avoid creating spans for
  // unrealistically long INP durations.
  if (duration > MAX_PLAUSIBLE_INP_DURATION) {
    return;
  }

  const entry = metric.entries.find(entry => entry.duration === metric.value && INP_ENTRY_MAP[entry.name]);

  if (!entry) {
    return;
  }

  const { interactionId } = entry;
  const interactionType = INP_ENTRY_MAP[entry.name];

  /** Build the INP span, create an envelope from the span, and then send the envelope */
  const startTime = utils.msToSec((core.browserPerformanceTimeOrigin() ) + entry.startTime);
  const activeSpan = core.getActiveSpan();
  const rootSpan = activeSpan ? core.getRootSpan(activeSpan) : undefined;

  // We first try to lookup the span from our INTERACTIONS_SPAN_MAP,
  // where we cache the route per interactionId
  const cachedSpan = interactionId != null ? INTERACTIONS_SPAN_MAP.get(interactionId) : undefined;

  const spanToUse = cachedSpan || rootSpan;

  // Else, we try to use the active span.
  // Finally, we fall back to look at the transactionName on the scope
  const routeName = spanToUse ? core.spanToJSON(spanToUse).description : core.getCurrentScope().getScopeData().transactionName;

  const name = core.htmlTreeAsString(entry.target);
  const attributes = {
    [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.browser.inp',
    [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: `ui.interaction.${interactionType}`,
    [core.SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: entry.duration,
  };

  const span = utils.startStandaloneWebVitalSpan({
    name,
    transaction: routeName,
    attributes,
    startTime,
  });

  if (span) {
    span.addEvent('inp', {
      [core.SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT]: 'millisecond',
      [core.SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE]: metric.value,
    });

    span.end(startTime + duration);
  }
};

/**
 * Register a listener to cache route information for INP interactions.
 */
function registerInpInteractionListener() {
  const handleEntries = ({ entries }) => {
    const activeSpan = core.getActiveSpan();
    const activeRootSpan = activeSpan && core.getRootSpan(activeSpan);

    entries.forEach(entry => {
      if (!instrument.isPerformanceEventTiming(entry) || !activeRootSpan) {
        return;
      }

      const interactionId = entry.interactionId;
      if (interactionId == null) {
        return;
      }

      // If the interaction was already recorded before, nothing more to do
      if (INTERACTIONS_SPAN_MAP.has(interactionId)) {
        return;
      }

      // We keep max. 10 interactions in the list, then remove the oldest one & clean up
      if (LAST_INTERACTIONS.length > 10) {
        const last = LAST_INTERACTIONS.shift() ;
        INTERACTIONS_SPAN_MAP.delete(last);
      }

      // We add the interaction to the list of recorded interactions
      // and store the span for this interaction
      LAST_INTERACTIONS.push(interactionId);
      INTERACTIONS_SPAN_MAP.set(interactionId, activeRootSpan);
    });
  };

  instrument.addPerformanceInstrumentationHandler('event', handleEntries);
  instrument.addPerformanceInstrumentationHandler('first-input', handleEntries);
}

exports._onInp = _onInp;
exports._trackINP = _trackINP;
exports.registerInpInteractionListener = registerInpInteractionListener;
exports.startTrackingINP = startTrackingINP;
//# sourceMappingURL=inp.js.map
