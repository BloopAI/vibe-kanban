import { getClient } from '../currentScopes.js';
import { DEBUG_BUILD } from '../debug-build.js';
import { addConsoleInstrumentationHandler } from '../instrument/console.js';
import { defineIntegration } from '../integration.js';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes.js';
import { CONSOLE_LEVELS, debug } from '../utils/debug-logger.js';
import { isPrimitive } from '../utils/is.js';
import { normalize } from '../utils/normalize.js';
import { GLOBAL_OBJ } from '../utils/worldwide.js';
import { _INTERNAL_captureLog } from './exports.js';

const INTEGRATION_NAME = 'ConsoleLogs';

const DEFAULT_ATTRIBUTES = {
  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.console.logging',
};

const _consoleLoggingIntegration = ((options = {}) => {
  const levels = options.levels || CONSOLE_LEVELS;

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const { enableLogs, _experiments, normalizeDepth = 3, normalizeMaxBreadth = 1000 } = client.getOptions();
      // eslint-disable-next-line deprecation/deprecation
      const shouldEnableLogs = enableLogs ?? _experiments?.enableLogs;
      if (!shouldEnableLogs) {
        DEBUG_BUILD && debug.warn('`enableLogs` is not enabled, ConsoleLogs integration disabled');
        return;
      }

      addConsoleInstrumentationHandler(({ args, level }) => {
        if (getClient() !== client || !levels.includes(level)) {
          return;
        }

        if (level === 'assert') {
          if (!args[0]) {
            const followingArgs = args.slice(1);
            const assertionMessage =
              followingArgs.length > 0
                ? `Assertion failed: ${formatConsoleArgs(followingArgs, normalizeDepth, normalizeMaxBreadth)}`
                : 'Assertion failed';
            _INTERNAL_captureLog({ level: 'error', message: assertionMessage, attributes: DEFAULT_ATTRIBUTES });
          }
          return;
        }

        const isLevelLog = level === 'log';
        _INTERNAL_captureLog({
          level: isLevelLog ? 'info' : level,
          message: formatConsoleArgs(args, normalizeDepth, normalizeMaxBreadth),
          severityNumber: isLevelLog ? 10 : undefined,
          attributes: DEFAULT_ATTRIBUTES,
        });
      });
    },
  };
}) ;

/**
 * Captures calls to the `console` API as logs in Sentry. Requires the `enableLogs` option to be enabled.
 *
 * @experimental This feature is experimental and may be changed or removed in future versions.
 *
 * By default the integration instruments `console.debug`, `console.info`, `console.warn`, `console.error`,
 * `console.log`, `console.trace`, and `console.assert`. You can use the `levels` option to customize which
 * levels are captured.
 *
 * @example
 *
 * ```ts
 * import * as Sentry from '@sentry/browser';
 *
 * Sentry.init({
 *   enableLogs: true,
 *   integrations: [Sentry.consoleLoggingIntegration({ levels: ['error', 'warn'] })],
 * });
 * ```
 */
const consoleLoggingIntegration = defineIntegration(_consoleLoggingIntegration);

function formatConsoleArgs(values, normalizeDepth, normalizeMaxBreadth) {
  return 'util' in GLOBAL_OBJ && typeof (GLOBAL_OBJ ).util.format === 'function'
    ? (GLOBAL_OBJ ).util.format(...values)
    : safeJoinConsoleArgs(values, normalizeDepth, normalizeMaxBreadth);
}

function safeJoinConsoleArgs(values, normalizeDepth, normalizeMaxBreadth) {
  return values
    .map(value =>
      isPrimitive(value) ? String(value) : JSON.stringify(normalize(value, normalizeDepth, normalizeMaxBreadth)),
    )
    .join(' ');
}

export { consoleLoggingIntegration };
//# sourceMappingURL=console-integration.js.map
