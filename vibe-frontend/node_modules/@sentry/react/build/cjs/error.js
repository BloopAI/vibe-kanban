Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const browser = require('@sentry/browser');
const core = require('@sentry/core');
const React = require('react');

/**
 * See if React major version is 17+ by parsing version string.
 */
function isAtLeastReact17(reactVersion) {
  const reactMajor = reactVersion.match(/^([^.]+)/);
  return reactMajor !== null && parseInt(reactMajor[0]) >= 17;
}

/**
 * Recurse through `error.cause` chain to set cause on an error.
 */
function setCause(error, cause) {
  const seenErrors = new WeakSet();

  function recurse(error, cause) {
    // If we've already seen the error, there is a recursive loop somewhere in the error's
    // cause chain. Let's just bail out then to prevent a stack overflow.
    if (seenErrors.has(error)) {
      return;
    }
    if (error.cause) {
      seenErrors.add(error);
      return recurse(error.cause, cause);
    }
    error.cause = cause;
  }

  recurse(error, cause);
}

/**
 * Captures an error that was thrown by a React ErrorBoundary or React root.
 *
 * @param error The error to capture.
 * @param errorInfo The errorInfo provided by React.
 * @param hint Optional additional data to attach to the Sentry event.
 * @returns the id of the captured Sentry event.
 */
function captureReactException(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error,
  { componentStack },
  hint,
) {
  // If on React version >= 17, create stack trace from componentStack param and links
  // to to the original error using `error.cause` otherwise relies on error param for stacktrace.
  // Linking errors requires the `LinkedErrors` integration be enabled.
  // See: https://reactjs.org/blog/2020/08/10/react-v17-rc.html#native-component-stacks
  //
  // Although `componentDidCatch` is typed to accept an `Error` object, it can also be invoked
  // with non-error objects. This is why we need to check if the error is an error-like object.
  // See: https://github.com/getsentry/sentry-javascript/issues/6167
  if (isAtLeastReact17(React.version) && core.isError(error) && componentStack) {
    const errorBoundaryError = new Error(error.message);
    errorBoundaryError.name = `React ErrorBoundary ${error.name}`;
    errorBoundaryError.stack = componentStack;

    // Using the `LinkedErrors` integration to link the errors together.
    setCause(error, errorBoundaryError);
  }

  return browser.withScope(scope => {
    scope.setContext('react', { componentStack });
    return browser.captureException(error, hint);
  });
}

/**
 * Creates an error handler that can be used with the `onCaughtError`, `onUncaughtError`,
 * and `onRecoverableError` options in `createRoot` and `hydrateRoot` React DOM methods.
 *
 * @param callback An optional callback that will be called after the error is captured.
 * Use this to add custom handling for errors.
 *
 * @example
 *
 * ```JavaScript
 * const root = createRoot(container, {
 *  onCaughtError: Sentry.reactErrorHandler(),
 *  onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
 *    console.warn('Caught error', error, errorInfo.componentStack);
 *  });
 * });
 * ```
 */
function reactErrorHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (error, errorInfo) => {
    const eventId = captureReactException(error, errorInfo);
    if (callback) {
      callback(error, errorInfo, eventId);
    }
  };
}

exports.captureReactException = captureReactException;
exports.isAtLeastReact17 = isAtLeastReact17;
exports.reactErrorHandler = reactErrorHandler;
exports.setCause = setCause;
//# sourceMappingURL=error.js.map
