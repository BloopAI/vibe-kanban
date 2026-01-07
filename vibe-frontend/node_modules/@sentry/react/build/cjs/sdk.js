Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const browser = require('@sentry/browser');
const core = require('@sentry/core');
const React = require('react');

/**
 * Inits the React SDK
 */
function init(options) {
  const opts = {
    ...options,
  };

  core.applySdkMetadata(opts, 'react');
  browser.setContext('react', { version: React.version });
  return browser.init(opts);
}

exports.init = init;
//# sourceMappingURL=sdk.js.map
