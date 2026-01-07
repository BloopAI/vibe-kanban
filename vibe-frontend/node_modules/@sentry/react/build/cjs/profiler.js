Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const browser = require('@sentry/browser');
const core = require('@sentry/core');
const React = require('react');
const constants = require('./constants.js');
const hoistNonReactStatics = require('./hoist-non-react-statics.js');

const UNKNOWN_COMPONENT = 'unknown';

/**
 * The Profiler component leverages Sentry's Tracing integration to generate
 * spans based on component lifecycles.
 */
class Profiler extends React.Component {
  /**
   * The span of the mount activity
   * Made protected for the React Native SDK to access
   */

  /**
   * The span that represents the duration of time between shouldComponentUpdate and componentDidUpdate
   */

   constructor(props) {
    super(props);
    const { name, disabled = false } = this.props;

    if (disabled) {
      return;
    }

    this._mountSpan = browser.startInactiveSpan({
      name: `<${name}>`,
      onlyIfParent: true,
      op: constants.REACT_MOUNT_OP,
      attributes: {
        [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.react.profiler',
        'ui.component_name': name,
      },
    });
  }

  // If a component mounted, we can finish the mount activity.
   componentDidMount() {
    if (this._mountSpan) {
      this._mountSpan.end();
    }
  }

   shouldComponentUpdate({ updateProps, includeUpdates = true }) {
    // Only generate an update span if includeUpdates is true, if there is a valid mountSpan,
    // and if the updateProps have changed. It is ok to not do a deep equality check here as it is expensive.
    // We are just trying to give baseline clues for further investigation.
    if (includeUpdates && this._mountSpan && updateProps !== this.props.updateProps) {
      // See what props have changed between the previous props, and the current props. This is
      // set as data on the span. We just store the prop keys as the values could be potentially very large.
      const changedProps = Object.keys(updateProps).filter(k => updateProps[k] !== this.props.updateProps[k]);
      if (changedProps.length > 0) {
        const now = core.timestampInSeconds();
        this._updateSpan = core.withActiveSpan(this._mountSpan, () => {
          return browser.startInactiveSpan({
            name: `<${this.props.name}>`,
            onlyIfParent: true,
            op: constants.REACT_UPDATE_OP,
            startTime: now,
            attributes: {
              [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.react.profiler',
              'ui.component_name': this.props.name,
              'ui.react.changed_props': changedProps,
            },
          });
        });
      }
    }

    return true;
  }

   componentDidUpdate() {
    if (this._updateSpan) {
      this._updateSpan.end();
      this._updateSpan = undefined;
    }
  }

  // If a component is unmounted, we can say it is no longer on the screen.
  // This means we can finish the span representing the component render.
   componentWillUnmount() {
    const endTimestamp = core.timestampInSeconds();
    const { name, includeRender = true } = this.props;

    if (this._mountSpan && includeRender) {
      const startTime = core.spanToJSON(this._mountSpan).timestamp;
      core.withActiveSpan(this._mountSpan, () => {
        const renderSpan = browser.startInactiveSpan({
          onlyIfParent: true,
          name: `<${name}>`,
          op: constants.REACT_RENDER_OP,
          startTime,
          attributes: {
            [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.react.profiler',
            'ui.component_name': name,
          },
        });
        if (renderSpan) {
          // Have to cast to Span because the type of _mountSpan is Span | undefined
          // and not getting narrowed properly
          renderSpan.end(endTimestamp);
        }
      });
    }
  }

   render() {
    return this.props.children;
  }
}

// React.Component default props are defined as static property on the class
Object.assign(Profiler, {
  defaultProps: {
    disabled: false,
    includeRender: true,
    includeUpdates: true,
  },
});

/**
 * withProfiler is a higher order component that wraps a
 * component in a {@link Profiler} component. It is recommended that
 * the higher order component be used over the regular {@link Profiler} component.
 *
 * @param WrappedComponent component that is wrapped by Profiler
 * @param options the {@link ProfilerProps} you can pass into the Profiler
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withProfiler(
  WrappedComponent,
  // We do not want to have `updateProps` given in options, it is instead filled through the HOC.
  options,
) {
  const componentDisplayName =
    options?.name || WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

  const Wrapped = (props) => (
    React.createElement(Profiler, { ...options, name: componentDisplayName, updateProps: props,}
      , React.createElement(WrappedComponent, { ...props,} )
    )
  );

  Wrapped.displayName = `profiler(${componentDisplayName})`;

  // Copy over static methods from Wrapped component to Profiler HOC
  // See: https://reactjs.org/docs/higher-order-components.html#static-methods-must-be-copied-over
  hoistNonReactStatics.hoistNonReactStatics(Wrapped, WrappedComponent);
  return Wrapped;
}

/**
 *
 * `useProfiler` is a React hook that profiles a React component.
 *
 * Requires React 16.8 or above.
 * @param name displayName of component being profiled
 */
function useProfiler(
  name,
  options = {
    disabled: false,
    hasRenderSpan: true,
  },
) {
  const [mountSpan] = React.useState(() => {
    if (options?.disabled) {
      return undefined;
    }

    return browser.startInactiveSpan({
      name: `<${name}>`,
      onlyIfParent: true,
      op: constants.REACT_MOUNT_OP,
      attributes: {
        [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.react.profiler',
        'ui.component_name': name,
      },
    });
  });

  React.useEffect(() => {
    if (mountSpan) {
      mountSpan.end();
    }

    return () => {
      if (mountSpan && options.hasRenderSpan) {
        const startTime = core.spanToJSON(mountSpan).timestamp;
        const endTimestamp = core.timestampInSeconds();

        const renderSpan = browser.startInactiveSpan({
          name: `<${name}>`,
          onlyIfParent: true,
          op: constants.REACT_RENDER_OP,
          startTime,
          attributes: {
            [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.react.profiler',
            'ui.component_name': name,
          },
        });
        if (renderSpan) {
          // Have to cast to Span because the type of _mountSpan is Span | undefined
          // and not getting narrowed properly
          renderSpan.end(endTimestamp);
        }
      }
    };
    // We only want this to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

exports.Profiler = Profiler;
exports.UNKNOWN_COMPONENT = UNKNOWN_COMPONENT;
exports.useProfiler = useProfiler;
exports.withProfiler = withProfiler;
//# sourceMappingURL=profiler.js.map
