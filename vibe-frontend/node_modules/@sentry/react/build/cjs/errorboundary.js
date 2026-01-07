Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const browser = require('@sentry/browser');
const core = require('@sentry/core');
const React = require('react');
const debugBuild = require('./debug-build.js');
const error = require('./error.js');
const hoistNonReactStatics = require('./hoist-non-react-statics.js');

const UNKNOWN_COMPONENT = 'unknown';

const INITIAL_STATE = {
  componentStack: null,
  error: null,
  eventId: null,
};

/**
 * A ErrorBoundary component that logs errors to Sentry.
 * NOTE: If you are a Sentry user, and you are seeing this stack frame, it means the
 * Sentry React SDK ErrorBoundary caught an error invoking your application code. This
 * is expected behavior and NOT indicative of a bug with the Sentry React SDK.
 */
class ErrorBoundary extends React.Component {

   constructor(props) {
    super(props);

    this.state = INITIAL_STATE;
    this._openFallbackReportDialog = true;

    const client = browser.getClient();
    if (client && props.showDialog) {
      this._openFallbackReportDialog = false;
      this._cleanupHook = client.on('afterSendEvent', event => {
        if (!event.type && this._lastEventId && event.event_id === this._lastEventId) {
          browser.showReportDialog({ ...props.dialogOptions, eventId: this._lastEventId });
        }
      });
    }
  }

   componentDidCatch(error$1, errorInfo) {
    const { componentStack } = errorInfo;
    const { beforeCapture, onError, showDialog, dialogOptions } = this.props;
    browser.withScope(scope => {
      if (beforeCapture) {
        beforeCapture(scope, error$1, componentStack);
      }

      const handled = this.props.handled != null ? this.props.handled : !!this.props.fallback;
      const eventId = error.captureReactException(error$1, errorInfo, { mechanism: { handled } });

      if (onError) {
        onError(error$1, componentStack, eventId);
      }
      if (showDialog) {
        this._lastEventId = eventId;
        if (this._openFallbackReportDialog) {
          browser.showReportDialog({ ...dialogOptions, eventId });
        }
      }

      // componentDidCatch is used over getDerivedStateFromError
      // so that componentStack is accessible through state.
      this.setState({ error: error$1, componentStack, eventId });
    });
  }

   componentDidMount() {
    const { onMount } = this.props;
    if (onMount) {
      onMount();
    }
  }

   componentWillUnmount() {
    const { error, componentStack, eventId } = this.state;
    const { onUnmount } = this.props;
    if (onUnmount) {
      if (this.state === INITIAL_STATE) {
        // If the error boundary never encountered an error, call onUnmount with null values
        onUnmount(null, null, null);
      } else {
        // `componentStack` and `eventId` are guaranteed to be non-null here because `onUnmount` is only called
        // when the error boundary has already encountered an error.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        onUnmount(error, componentStack, eventId);
      }
    }

    if (this._cleanupHook) {
      this._cleanupHook();
      this._cleanupHook = undefined;
    }
  }

   resetErrorBoundary() {
    const { onReset } = this.props;
    const { error, componentStack, eventId } = this.state;
    if (onReset) {
      // `componentStack` and `eventId` are guaranteed to be non-null here because `onReset` is only called
      // when the error boundary has already encountered an error.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      onReset(error, componentStack, eventId);
    }
    this.setState(INITIAL_STATE);
  }

   render() {
    const { fallback, children } = this.props;
    const state = this.state;

    // `componentStack` is only null in the initial state, when no error has been captured.
    // If an error has been captured, `componentStack` will be a string.
    // We cannot check `state.error` because null can be thrown as an error.
    if (state.componentStack === null) {
      return typeof children === 'function' ? children() : children;
    }

    const element =
      typeof fallback === 'function'
        ? React.createElement(fallback, {
            error: state.error,
            componentStack: state.componentStack,
            resetError: () => this.resetErrorBoundary(),
            eventId: state.eventId,
          })
        : fallback;

    if (React.isValidElement(element)) {
      return element;
    }

    if (fallback) {
      debugBuild.DEBUG_BUILD && core.debug.warn('fallback did not produce a valid ReactElement');
    }

    // Fail gracefully if no fallback provided or is not valid
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withErrorBoundary(
  WrappedComponent,
  errorBoundaryOptions,
) {
  const componentDisplayName = WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

  const Wrapped = (props) => (
    React.createElement(ErrorBoundary, { ...errorBoundaryOptions,}
      , React.createElement(WrappedComponent, { ...props,} )
    )
  );

  Wrapped.displayName = `errorBoundary(${componentDisplayName})`;

  // Copy over static methods from Wrapped component to Profiler HOC
  // See: https://reactjs.org/docs/higher-order-components.html#static-methods-must-be-copied-over
  hoistNonReactStatics.hoistNonReactStatics(Wrapped, WrappedComponent);
  return Wrapped;
}

exports.ErrorBoundary = ErrorBoundary;
exports.UNKNOWN_COMPONENT = UNKNOWN_COMPONENT;
exports.withErrorBoundary = withErrorBoundary;
//# sourceMappingURL=errorboundary.js.map
