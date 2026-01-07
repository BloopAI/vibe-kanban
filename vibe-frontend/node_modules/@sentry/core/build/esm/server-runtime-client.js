import { createCheckInEnvelope } from './checkin.js';
import { Client, _getTraceInfoFromScope } from './client.js';
import { getIsolationScope } from './currentScopes.js';
import { DEBUG_BUILD } from './debug-build.js';
import { _INTERNAL_flushLogsBuffer } from './logs/exports.js';
import { registerSpanErrorInstrumentation } from './tracing/errors.js';
import { isPrimitive } from './utils/is.js';
import { debug } from './utils/debug-logger.js';
import { uuid4 } from './utils/misc.js';
import { eventFromUnknownInput, eventFromMessage } from './utils/eventbuilder.js';
import { resolvedSyncPromise } from './utils/syncpromise.js';

// TODO: Make this configurable
const DEFAULT_LOG_FLUSH_INTERVAL = 5000;

/**
 * The Sentry Server Runtime Client SDK.
 */
class ServerRuntimeClient

 extends Client {

  /**
   * Creates a new Edge SDK instance.
   * @param options Configuration options for this SDK.
   */
   constructor(options) {
    // Server clients always support tracing
    registerSpanErrorInstrumentation();

    super(options);

    this._logWeight = 0;
    this._isLogTimerActive = false;

    // eslint-disable-next-line deprecation/deprecation
    const shouldEnableLogs = this._options.enableLogs ?? this._options._experiments?.enableLogs;
    if (shouldEnableLogs) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const client = this;

      client.on('flushLogs', () => {
        client._logWeight = 0;
        clearTimeout(client._logFlushIdleTimeout);
        client._isLogTimerActive = false;
      });

      client.on('afterCaptureLog', log => {
        client._logWeight += estimateLogSizeInBytes(log);

        // We flush the logs buffer if it exceeds 0.8 MB
        // The log weight is a rough estimate, so we flush way before
        // the payload gets too big.
        if (client._logWeight >= 800000) {
          _INTERNAL_flushLogsBuffer(client);
        } else if (!client._isLogTimerActive) {
          // Only start timer if one isn't already running.
          // This prevents flushing being delayed by logs that arrive close to the timeout limit
          // and thus resetting the flushing timeout and delaying logs being flushed.
          client._isLogTimerActive = true;
          client._logFlushIdleTimeout = setTimeout(() => {
            _INTERNAL_flushLogsBuffer(client);
            // Note: _isLogTimerActive is reset by the flushLogs handler above, not here,
            // to avoid race conditions when new logs arrive during the flush.
          }, DEFAULT_LOG_FLUSH_INTERVAL);
        }
      });

      client.on('flush', () => {
        _INTERNAL_flushLogsBuffer(client);
      });
    }
  }

  /**
   * @inheritDoc
   */
   eventFromException(exception, hint) {
    const event = eventFromUnknownInput(this, this._options.stackParser, exception, hint);
    event.level = 'error';

    return resolvedSyncPromise(event);
  }

  /**
   * @inheritDoc
   */
   eventFromMessage(
    message,
    level = 'info',
    hint,
  ) {
    return resolvedSyncPromise(
      eventFromMessage(this._options.stackParser, message, level, hint, this._options.attachStacktrace),
    );
  }

  /**
   * @inheritDoc
   */
   captureException(exception, hint, scope) {
    setCurrentRequestSessionErroredOrCrashed(hint);
    return super.captureException(exception, hint, scope);
  }

  /**
   * @inheritDoc
   */
   captureEvent(event, hint, scope) {
    // If the event is of type Exception, then a request session should be captured
    const isException = !event.type && event.exception?.values && event.exception.values.length > 0;
    if (isException) {
      setCurrentRequestSessionErroredOrCrashed(hint);
    }

    return super.captureEvent(event, hint, scope);
  }

  /**
   * Create a cron monitor check in and send it to Sentry.
   *
   * @param checkIn An object that describes a check in.
   * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
   * to create a monitor automatically when sending a check in.
   */
   captureCheckIn(checkIn, monitorConfig, scope) {
    const id = 'checkInId' in checkIn && checkIn.checkInId ? checkIn.checkInId : uuid4();
    if (!this._isEnabled()) {
      DEBUG_BUILD && debug.warn('SDK not enabled, will not capture check-in.');
      return id;
    }

    const options = this.getOptions();
    const { release, environment, tunnel } = options;

    const serializedCheckIn = {
      check_in_id: id,
      monitor_slug: checkIn.monitorSlug,
      status: checkIn.status,
      release,
      environment,
    };

    if ('duration' in checkIn) {
      serializedCheckIn.duration = checkIn.duration;
    }

    if (monitorConfig) {
      serializedCheckIn.monitor_config = {
        schedule: monitorConfig.schedule,
        checkin_margin: monitorConfig.checkinMargin,
        max_runtime: monitorConfig.maxRuntime,
        timezone: monitorConfig.timezone,
        failure_issue_threshold: monitorConfig.failureIssueThreshold,
        recovery_threshold: monitorConfig.recoveryThreshold,
      };
    }

    const [dynamicSamplingContext, traceContext] = _getTraceInfoFromScope(this, scope);
    if (traceContext) {
      serializedCheckIn.contexts = {
        trace: traceContext,
      };
    }

    const envelope = createCheckInEnvelope(
      serializedCheckIn,
      dynamicSamplingContext,
      this.getSdkMetadata(),
      tunnel,
      this.getDsn(),
    );

    DEBUG_BUILD && debug.log('Sending checkin:', checkIn.monitorSlug, checkIn.status);

    // sendEnvelope should not throw
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.sendEnvelope(envelope);

    return id;
  }

  /**
   * @inheritDoc
   */
   _prepareEvent(
    event,
    hint,
    currentScope,
    isolationScope,
  ) {
    if (this._options.platform) {
      event.platform = event.platform || this._options.platform;
    }

    if (this._options.runtime) {
      event.contexts = {
        ...event.contexts,
        runtime: event.contexts?.runtime || this._options.runtime,
      };
    }

    if (this._options.serverName) {
      event.server_name = event.server_name || this._options.serverName;
    }

    return super._prepareEvent(event, hint, currentScope, isolationScope);
  }
}

function setCurrentRequestSessionErroredOrCrashed(eventHint) {
  const requestSession = getIsolationScope().getScopeData().sdkProcessingMetadata.requestSession;
  if (requestSession) {
    // We mutate instead of doing `setSdkProcessingMetadata` because the http integration stores away a particular
    // isolationScope. If that isolation scope is forked, setting the processing metadata here will not mutate the
    // original isolation scope that the http integration stored away.
    const isHandledException = eventHint?.mechanism?.handled ?? true;
    // A request session can go from "errored" -> "crashed" but not "crashed" -> "errored".
    // Crashed (unhandled exception) is worse than errored (handled exception).
    if (isHandledException && requestSession.status !== 'crashed') {
      requestSession.status = 'errored';
    } else if (!isHandledException) {
      requestSession.status = 'crashed';
    }
  }
}

/**
 * Estimate the size of a log in bytes.
 *
 * @param log - The log to estimate the size of.
 * @returns The estimated size of the log in bytes.
 */
function estimateLogSizeInBytes(log) {
  let weight = 0;

  // Estimate byte size of 2 bytes per character. This is a rough estimate JS strings are stored as UTF-16.
  if (log.message) {
    weight += log.message.length * 2;
  }

  if (log.attributes) {
    Object.values(log.attributes).forEach(value => {
      if (Array.isArray(value)) {
        weight += value.length * estimatePrimitiveSizeInBytes(value[0]);
      } else if (isPrimitive(value)) {
        weight += estimatePrimitiveSizeInBytes(value);
      } else {
        // For objects values, we estimate the size of the object as 100 bytes
        weight += 100;
      }
    });
  }

  return weight;
}

function estimatePrimitiveSizeInBytes(value) {
  if (typeof value === 'string') {
    return value.length * 2;
  } else if (typeof value === 'number') {
    return 8;
  } else if (typeof value === 'boolean') {
    return 4;
  }

  return 0;
}

export { ServerRuntimeClient };
//# sourceMappingURL=server-runtime-client.js.map
