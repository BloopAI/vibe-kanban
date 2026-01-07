import { setContext, init as init$1 } from '@sentry/browser';
import { applySdkMetadata } from '@sentry/core';
import { version } from 'react';

/**
 * Inits the React SDK
 */
function init(options) {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'react');
  setContext('react', { version });
  return init$1(opts);
}

export { init };
//# sourceMappingURL=sdk.js.map
