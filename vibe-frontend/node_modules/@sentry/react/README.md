<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for ReactJS

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/react/)

## General

This package is a wrapper around `@sentry/browser`, with added functionality related to React. All methods available in
`@sentry/browser` can be imported from `@sentry/react`.

To use this SDK, call `Sentry.init(options)` before you mount your React component.

```javascript
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: '__DSN__',
  // ...
});

// ...

const container = document.getElementById(“app”);
const root = createRoot(container);
root.render(<App />);

// also works with hydrateRoot
// const domNode = document.getElementById('root');
// const root = hydrateRoot(domNode, reactNode);
// root.render(<App />);
```

### React 19

Starting with React 19, the `createRoot` and `hydrateRoot` methods expose error hooks that can be used to capture errors
automatically. Use the `Sentry.reactErrorHandler` function to capture errors in the error hooks you are interested in.

```js
const container = document.getElementById(“app”);
const root = createRoot(container, {
  // Callback called when an error is thrown and not caught by an Error Boundary.
  onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
    console.warn('Uncaught error', error, errorInfo.componentStack);
  }),
  // Callback called when React catches an error in an Error Boundary.
  onCaughtError: Sentry.reactErrorHandler(),
  // Callback called when React automatically recovers from errors.
  onRecoverableError: Sentry.reactErrorHandler(),
});
root.render(<App />);
```

If you want more finely grained control over error handling, we recommend only adding the `onUncaughtError` and
`onRecoverableError` hooks and using an `ErrorBoundary` component instead of the `onCaughtError` hook.

### ErrorBoundary

`@sentry/react` exports an ErrorBoundary component that will automatically send Javascript errors from inside a
component tree to Sentry, and set a fallback UI.

> app.js

```javascript
import React from 'react';
import * as Sentry from '@sentry/react';

function FallbackComponent() {
  return <div>An error has occurred</div>;
}

class App extends React.Component {
  render() {
    return (
      <Sentry.ErrorBoundary fallback={FallbackComponent} showDialog>
        <OtherComponents />
      </Sentry.ErrorBoundary>
    );
  }
}

export default App;
```

### Profiler

`@sentry/react` exports a Profiler component that leverages the tracing features to add React-related spans to
transactions. If tracing is not enabled, the Profiler component will not work. The Profiler tracks component mount,
render duration and updates.

> app.js

```javascript
import React from 'react';
import * as Sentry from '@sentry/react';

class App extends React.Component {
  render() {
    return (
      <FancyComponent>
        <InsideComponent someProp={2} />
        <AnotherComponent />
      </FancyComponent>
    );
  }
}

export default Sentry.withProfiler(App);
```
