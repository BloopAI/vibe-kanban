import { Client } from '../client';
import { Scope } from '../scope';
import { Log, SerializedLog, SerializedLogAttributeValue } from '../types-hoist/log';
/**
 * Converts a log attribute to a serialized log attribute.
 *
 * @param key - The key of the log attribute.
 * @param value - The value of the log attribute.
 * @returns The serialized log attribute.
 */
export declare function logAttributeToSerializedLogAttribute(value: unknown): SerializedLogAttributeValue;
/**
 * Captures a serialized log event and adds it to the log buffer for the given client.
 *
 * @param client - A client. Uses the current client if not provided.
 * @param serializedLog - The serialized log event to capture.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
export declare function _INTERNAL_captureSerializedLog(client: Client, serializedLog: SerializedLog): void;
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
export declare function _INTERNAL_captureLog(beforeLog: Log, client?: Client | undefined, currentScope?: Scope, captureSerializedLog?: (client: Client, log: SerializedLog) => void): void;
/**
 * Flushes the logs buffer to Sentry.
 *
 * @param client - A client.
 * @param maybeLogBuffer - A log buffer. Uses the log buffer for the given client if not provided.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
export declare function _INTERNAL_flushLogsBuffer(client: Client, maybeLogBuffer?: Array<SerializedLog>): void;
/**
 * Returns the log buffer for a given client.
 *
 * Exported for testing purposes.
 *
 * @param client - The client to get the log buffer for.
 * @returns The log buffer for the given client.
 */
export declare function _INTERNAL_getLogBuffer(client: Client): Array<SerializedLog> | undefined;
//# sourceMappingURL=exports.d.ts.map
