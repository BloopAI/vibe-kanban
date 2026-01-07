import { getGlobalSingleton } from '../carrier.js';
import { _getTraceInfoFromScope } from '../client.js';
import { getClient, getCurrentScope, getGlobalScope, getIsolationScope } from '../currentScopes.js';
import { DEBUG_BUILD } from '../debug-build.js';
import { mergeScopeData } from '../utils/applyScopeDataToEvent.js';
import { debug, consoleSandbox } from '../utils/debug-logger.js';
import { isParameterizedString } from '../utils/is.js';
import { _getSpanForScope } from '../utils/spanOnScope.js';
import { timestampInSeconds } from '../utils/time.js';
import { SEVERITY_TEXT_TO_SEVERITY_NUMBER } from './constants.js';
import { createLogEnvelope } from './envelope.js';

const MAX_LOG_BUFFER_SIZE = 100;

/**
 * Converts a log attribute to a serialized log attribute.
 *
 * @param key - The key of the log attribute.
 * @param value - The value of the log attribute.
 * @returns The serialized log attribute.
 */
function logAttributeToSerializedLogAttribute(value) {
  switch (typeof value) {
    case 'number':
      if (Number.isInteger(value)) {
        return {
          value,
          type: 'integer',
        };
      }
      return {
        value,
        type: 'double',
      };
    case 'boolean':
      return {
        value,
        type: 'boolean',
      };
    case 'string':
      return {
        value,
        type: 'string',
      };
    default: {
      let stringValue = '';
      try {
        stringValue = JSON.stringify(value) ?? '';
      } catch {
        // Do nothing
      }
      return {
        value: stringValue,
        type: 'string',
      };
    }
  }
}

/**
 * Sets a log attribute if the value exists and the attribute key is not already present.
 *
 * @param logAttributes - The log attributes object to modify.
 * @param key - The attribute key to set.
 * @param value - The value to set (only sets if truthy and key not present).
 * @param setEvenIfPresent - Whether to set the attribute if it is present. Defaults to true.
 */
function setLogAttribute(
  logAttributes,
  key,
  value,
  setEvenIfPresent = true,
) {
  if (value && (!logAttributes[key] || setEvenIfPresent)) {
    logAttributes[key] = value;
  }
}

/**
 * Captures a serialized log event and adds it to the log buffer for the given client.
 *
 * @param client - A client. Uses the current client if not provided.
 * @param serializedLog - The serialized log event to capture.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
function _INTERNAL_captureSerializedLog(client, serializedLog) {
  const bufferMap = _getBufferMap();
  const logBuffer = _INTERNAL_getLogBuffer(client);

  if (logBuffer === undefined) {
    bufferMap.set(client, [serializedLog]);
  } else {
    if (logBuffer.length >= MAX_LOG_BUFFER_SIZE) {
      _INTERNAL_flushLogsBuffer(client, logBuffer);
      bufferMap.set(client, [serializedLog]);
    } else {
      bufferMap.set(client, [...logBuffer, serializedLog]);
    }
  }
}

/**
 * Captures a log event and sends it to Sentry.
 *
 * @param log - The log event to capture.
 * @param scope - A scope. Uses the current scope if not provided.
 * @param client - A client. Uses the current client if not provided.
 * @param captureSerializedLog - A function to capture the serialized log.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
function _INTERNAL_captureLog(
  beforeLog,
  client = getClient(),
  currentScope = getCurrentScope(),
  captureSerializedLog = _INTERNAL_captureSerializedLog,
) {
  if (!client) {
    DEBUG_BUILD && debug.warn('No client available to capture log.');
    return;
  }

  const { release, environment, enableLogs, beforeSendLog, _experiments } = client.getOptions();
  // eslint-disable-next-line deprecation/deprecation
  const shouldEnableLogs = enableLogs ?? _experiments?.enableLogs;
  if (!shouldEnableLogs) {
    DEBUG_BUILD && debug.warn('logging option not enabled, log will not be captured.');
    return;
  }
  // eslint-disable-next-line deprecation/deprecation
  const actualBeforeSendLog = beforeSendLog ?? _experiments?.beforeSendLog;

  const [, traceContext] = _getTraceInfoFromScope(client, currentScope);

  const processedLogAttributes = {
    ...beforeLog.attributes,
  };

  const {
    user: { id, email, username },
  } = getMergedScopeData(currentScope);
  setLogAttribute(processedLogAttributes, 'user.id', id, false);
  setLogAttribute(processedLogAttributes, 'user.email', email, false);
  setLogAttribute(processedLogAttributes, 'user.name', username, false);

  setLogAttribute(processedLogAttributes, 'sentry.release', release);
  setLogAttribute(processedLogAttributes, 'sentry.environment', environment);

  const { name, version } = client.getSdkMetadata()?.sdk ?? {};
  setLogAttribute(processedLogAttributes, 'sentry.sdk.name', name);
  setLogAttribute(processedLogAttributes, 'sentry.sdk.version', version);

  const beforeLogMessage = beforeLog.message;
  if (isParameterizedString(beforeLogMessage)) {
    const { __sentry_template_string__, __sentry_template_values__ = [] } = beforeLogMessage;
    processedLogAttributes['sentry.message.template'] = __sentry_template_string__;
    __sentry_template_values__.forEach((param, index) => {
      processedLogAttributes[`sentry.message.parameter.${index}`] = param;
    });
  }

  const span = _getSpanForScope(currentScope);
  // Add the parent span ID to the log attributes for trace context
  setLogAttribute(processedLogAttributes, 'sentry.trace.parent_span_id', span?.spanContext().spanId);

  const processedLog = { ...beforeLog, attributes: processedLogAttributes };

  client.emit('beforeCaptureLog', processedLog);

  // We need to wrap this in `consoleSandbox` to avoid recursive calls to `beforeSendLog`
  const log = actualBeforeSendLog ? consoleSandbox(() => actualBeforeSendLog(processedLog)) : processedLog;
  if (!log) {
    client.recordDroppedEvent('before_send', 'log_item', 1);
    DEBUG_BUILD && debug.warn('beforeSendLog returned null, log will not be captured.');
    return;
  }

  const { level, message, attributes = {}, severityNumber } = log;

  const serializedLog = {
    timestamp: timestampInSeconds(),
    level,
    body: message,
    trace_id: traceContext?.trace_id,
    severity_number: severityNumber ?? SEVERITY_TEXT_TO_SEVERITY_NUMBER[level],
    attributes: Object.keys(attributes).reduce(
      (acc, key) => {
        acc[key] = logAttributeToSerializedLogAttribute(attributes[key]);
        return acc;
      },
      {} ,
    ),
  };

  captureSerializedLog(client, serializedLog);

  client.emit('afterCaptureLog', log);
}

/**
 * Flushes the logs buffer to Sentry.
 *
 * @param client - A client.
 * @param maybeLogBuffer - A log buffer. Uses the log buffer for the given client if not provided.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
function _INTERNAL_flushLogsBuffer(client, maybeLogBuffer) {
  const logBuffer = maybeLogBuffer ?? _INTERNAL_getLogBuffer(client) ?? [];
  if (logBuffer.length === 0) {
    return;
  }

  const clientOptions = client.getOptions();
  const envelope = createLogEnvelope(logBuffer, clientOptions._metadata, clientOptions.tunnel, client.getDsn());

  // Clear the log buffer after envelopes have been constructed.
  _getBufferMap().set(client, []);

  client.emit('flushLogs');

  // sendEnvelope should not throw
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  client.sendEnvelope(envelope);
}

/**
 * Returns the log buffer for a given client.
 *
 * Exported for testing purposes.
 *
 * @param client - The client to get the log buffer for.
 * @returns The log buffer for the given client.
 */
function _INTERNAL_getLogBuffer(client) {
  return _getBufferMap().get(client);
}

/**
 * Get the scope data for the current scope after merging with the
 * global scope and isolation scope.
 *
 * @param currentScope - The current scope.
 * @returns The scope data.
 */
function getMergedScopeData(currentScope) {
  const scopeData = getGlobalScope().getScopeData();
  mergeScopeData(scopeData, getIsolationScope().getScopeData());
  mergeScopeData(scopeData, currentScope.getScopeData());
  return scopeData;
}

function _getBufferMap() {
  // The reference to the Client <> LogBuffer map is stored on the carrier to ensure it's always the same
  return getGlobalSingleton('clientToLogBufferMap', () => new WeakMap());
}

export { _INTERNAL_captureLog, _INTERNAL_captureSerializedLog, _INTERNAL_flushLogsBuffer, _INTERNAL_getLogBuffer, logAttributeToSerializedLogAttribute };
//# sourceMappingURL=exports.js.map
