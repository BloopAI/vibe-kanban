import { Client, getSDKSource, applySdkMetadata, _INTERNAL_flushLogsBuffer, addAutoIpAddressToUser, addAutoIpAddressToSession } from '@sentry/core';
import { eventFromException, eventFromMessage } from './eventbuilder.js';
import { WINDOW } from './helpers.js';

/**
 * A magic string that build tooling can leverage in order to inject a release value into the SDK.
 */

const DEFAULT_FLUSH_INTERVAL = 5000;

/**
 * The Sentry Browser SDK Client.
 *
 * @see BrowserOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
class BrowserClient extends Client {

  /**
   * Creates a new Browser SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
   constructor(options) {
    const opts = applyDefaultOptions(options);
    const sdkSource = WINDOW.SENTRY_SDK_SOURCE || getSDKSource();
    applySdkMetadata(opts, 'browser', ['browser'], sdkSource);

    super(opts);

    const { sendDefaultPii, sendClientReports, enableLogs, _experiments } = this._options;
    // eslint-disable-next-line deprecation/deprecation
    const shouldEnableLogs = enableLogs ?? _experiments?.enableLogs;

    if (WINDOW.document && (sendClientReports || shouldEnableLogs)) {
      WINDOW.document.addEventListener('visibilitychange', () => {
        if (WINDOW.document.visibilityState === 'hidden') {
          if (sendClientReports) {
            this._flushOutcomes();
          }
          if (shouldEnableLogs) {
            _INTERNAL_flushLogsBuffer(this);
          }
        }
      });
    }

    if (shouldEnableLogs) {
      this.on('flush', () => {
        _INTERNAL_flushLogsBuffer(this);
      });

      this.on('afterCaptureLog', () => {
        if (this._logFlushIdleTimeout) {
          clearTimeout(this._logFlushIdleTimeout);
        }

        this._logFlushIdleTimeout = setTimeout(() => {
          _INTERNAL_flushLogsBuffer(this);
        }, DEFAULT_FLUSH_INTERVAL);
      });
    }

    if (sendDefaultPii) {
      this.on('postprocessEvent', addAutoIpAddressToUser);
      this.on('beforeSendSession', addAutoIpAddressToSession);
    }
  }

  /**
   * @inheritDoc
   */
   eventFromException(exception, hint) {
    return eventFromException(this._options.stackParser, exception, hint, this._options.attachStacktrace);
  }

  /**
   * @inheritDoc
   */
   eventFromMessage(
    message,
    level = 'info',
    hint,
  ) {
    return eventFromMessage(this._options.stackParser, message, level, hint, this._options.attachStacktrace);
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
    event.platform = event.platform || 'javascript';

    return super._prepareEvent(event, hint, currentScope, isolationScope);
  }
}

/** Exported only for tests. */
function applyDefaultOptions(optionsArg) {
  return {
    release:
      typeof __SENTRY_RELEASE__ === 'string' // This allows build tooling to find-and-replace __SENTRY_RELEASE__ to inject a release value
        ? __SENTRY_RELEASE__
        : WINDOW.SENTRY_RELEASE?.id, // This supports the variable that sentry-webpack-plugin injects
    sendClientReports: true,
    // We default this to true, as it is the safer scenario
    parentSpanIsAlwaysRootSpan: true,
    ...optionsArg,
  };
}

export { BrowserClient, applyDefaultOptions };
//# sourceMappingURL=client.js.map
