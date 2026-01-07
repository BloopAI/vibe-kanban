Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const debugBuild = require('./debug-build.js');
const debugLogger = require('./utils/debug-logger.js');
const is = require('./utils/is.js');
const syncpromise = require('./utils/syncpromise.js');

/**
 * Process an array of event processors, returning the processed event (or `null` if the event was dropped).
 */
function notifyEventProcessors(
  processors,
  event,
  hint,
  index = 0,
) {
  return new syncpromise.SyncPromise((resolve, reject) => {
    const processor = processors[index];
    if (event === null || typeof processor !== 'function') {
      resolve(event);
    } else {
      const result = processor({ ...event }, hint) ;

      debugBuild.DEBUG_BUILD && processor.id && result === null && debugLogger.debug.log(`Event processor "${processor.id}" dropped event`);

      if (is.isThenable(result)) {
        void result
          .then(final => notifyEventProcessors(processors, final, hint, index + 1).then(resolve))
          .then(null, reject);
      } else {
        void notifyEventProcessors(processors, result, hint, index + 1)
          .then(resolve)
          .then(null, reject);
      }
    }
  });
}

exports.notifyEventProcessors = notifyEventProcessors;
//# sourceMappingURL=eventProcessors.js.map
