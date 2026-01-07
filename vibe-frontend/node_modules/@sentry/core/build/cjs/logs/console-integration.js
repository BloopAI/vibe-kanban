Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const currentScopes = require('../currentScopes.js');
const debugBuild = require('../debug-build.js');
const console = require('../instrument/console.js');
const integration = require('../integration.js');
const semanticAttributes = require('../semanticAttributes.js');
const debugLogger = require('../utils/debug-logger.js');
const is = require('../utils/is.js');
const normalize = require('../utils/normalize.js');
const worldwide = require('../utils/worldwide.js');
const exports$1 = require('./exports.js');

const INTEGRATION_NAME = 'ConsoleLogs';

const DEFAULT_ATTRIBUTES = {
  [semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.console.logging',
};

const _consoleLoggingIntegration = ((options = {}) => {
  const levels = options.levels || debugLogger.CONSOLE_LEVELS;

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const { enableLogs, _experiments, normalizeDepth = 3, normalizeMaxBreadth = 1000 } = client.getOptions();
      // eslint-disable-next-line deprecation/deprecation
      const shouldEnableLogs = enableLogs ?? _experiments?.enableLogs;
      if (!shouldEnableLogs) {
        debugBuild.DEBUG_BUILD && debugLogger.debug.warn('`enableLogs` is not enabled, ConsoleLogs integration disabled');
        return;
      }

      console.addConsoleInstrumentationHandler(({ args, level }) => {
        if (currentScopes.getClient() !== client || !levels.includes(level)) {
          return;
        }

        if (level === 'assert') {
          if (!args[0]) {
            const followingArgs = args.slice(1);
            const assertionMessage =
              followingArgs.length > 0
                ? `Assertion failed: ${formatConsoleArgs(followingArgs, normalizeDepth, normalizeMaxBreadth)}`
                : 'Assertion failed';
            exports$1._INTERNAL_captureLog({ level: 'error', message: assertionMessage, attributes: DEFAULT_ATTRIBUTES });
          }
          return;
        }

        const isLevelLog = level === 'log';
        exports$1._INTERNAL_captureLog({
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
const consoleLoggingIntegration = integration.defineIntegration(_consoleLoggingIntegration);

function formatConsoleArgs(values, normalizeDepth, normalizeMaxBreadth) {
  return 'util' in worldwide.GLOBAL_OBJ && typeof (worldwide.GLOBAL_OBJ ).util.format === 'function'
    ? (worldwide.GLOBAL_OBJ ).util.format(...values)
    : safeJoinConsoleArgs(values, normalizeDepth, normalizeMaxBreadth);
}

function safeJoinConsoleArgs(values, normalizeDepth, normalizeMaxBreadth) {
  return values
    .map(value =>
      is.isPrimitive(value) ? String(value) : JSON.stringify(normalize.normalize(value, normalizeDepth, normalizeMaxBreadth)),
    )
    .join(' ');
}

exports.consoleLoggingIntegration = consoleLoggingIntegration;
//# sourceMappingURL=console-integration.js.map
