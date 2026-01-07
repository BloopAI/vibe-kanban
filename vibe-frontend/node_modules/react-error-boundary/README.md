<img src="https://react-error-boundary-lib.vercel.app/og.svg" alt="react-error-boundary logo" width="400" height="210" />

`react-error-boundary`: Reusable React [error boundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) component. Supports all React renderers (including React DOM and React Native).

### If you like this project, 🎉 [become a sponsor](https://github.com/sponsors/bvaughn/) or ☕ [buy me a coffee](http://givebrian.coffee/)

## Getting started

```sh
# npm
npm install react-error-boundary

# pnpm
pnpm add react-error-boundary

# yarn
yarn add react-error-boundary
```

## FAQs

Frequently asked questions can be found [here](https://react-error-boundary-lib.vercel.app/common-questions).

## API

### ErrorBoundary

<!-- ErrorBoundary:description:begin -->
A reusable React [error boundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) component.
Wrap this component around other React components to "catch" errors and render a fallback UI.

This package is built on top of React [error boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary),
so it has all of the advantages and constraints of that API.
This means that it can't catch errors during:
- Server side rendering</li>
- Event handlers
- Asynchronous code (including effects)

ℹ️ The component provides several ways to render a fallback: `fallback`, `fallbackRender`, and `FallbackComponent`.
Refer to the documentation to determine which is best for your application.

ℹ️ This is a **client component**. You can only pass props to it that are serializeable or use it in files that have a `"use client";` directive.
<!-- ErrorBoundary:description:end -->

#### Required props

<!-- ErrorBoundary:required-props:begin -->
None
<!-- ErrorBoundary:required-props:end -->

#### Optional props

<!-- ErrorBoundary:optional-props:begin -->

<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>onError</td>
      <td><p>Optional callback to enable e.g. logging error information to a server.
@param error Error that was thrown
@param info React &quot;component stack&quot; identifying where the error was thrown</p>
</td>
    </tr>
    <tr>
      <td>onReset</td>
      <td><p>Optional callback to to be notified when an error boundary is &quot;reset&quot; so React can retry the failed render.</p>
</td>
    </tr>
    <tr>
      <td>resetKeys</td>
      <td><p>When changed, these keys will reset a triggered error boundary.
This can be useful when an error condition may be tied to some specific state (that can be uniquely identified by key).
See the the documentation for examples of how to use this prop.</p>
</td>
    </tr>
    <tr>
      <td>fallback</td>
      <td><p>Static content to render in place of an error if one is thrown.</p>
<pre><code class="language-tsx">&lt;ErrorBoundary fallback={&lt;div class=&quot;text-red&quot;&gt;Something went wrong&lt;/div&gt;} /&gt;
</code></pre>
</td>
    </tr>
    <tr>
      <td>FallbackComponent</td>
      <td><p>React component responsible for returning a fallback UI based on a thrown value.</p>
<pre><code class="language-tsx">&lt;ErrorBoundary FallbackComponent={Fallback} /&gt;
</code></pre>
</td>
    </tr>
    <tr>
      <td>fallbackRender</td>
      <td><p><a href="https://react.dev/reference/react/Children#calling-a-render-prop-to-customize-rendering">Render prop</a> function responsible for returning a fallback UI based on a thrown value.</p>
<pre><code class="language-tsx">&lt;ErrorBoundary fallbackRender={({ error, resetErrorBoundary }) =&gt; &lt;div&gt;...&lt;/div&gt;} /&gt;
</code></pre>
</td>
    </tr>
  </tbody>
</table>

<!-- ErrorBoundary:optional-props:end -->

# FAQ
## `ErrorBoundary` cannot be used as a JSX component
This error can be caused by a version mismatch between [react](https://npmjs.com/package/react) and [@types/react](https://npmjs.com/package/@types/react). To fix this, ensure that both match exactly, e.g.:

If using NPM:
```json
{
  ...
  "overrides": {
    "@types/react": "17.0.60"
  },
  ...
}
```

If using Yarn:
```json
{
  ...
  "resolutions": {
    "@types/react": "17.0.60"
  },
  ...
}
```

---

[This blog post](https://kentcdodds.com/blog/use-react-error-boundary-to-handle-errors-in-react) shows more examples of how this package can be used, although it was written for the [version 3 API](https://github.com/bvaughn/react-error-boundary/releases/tag/v3.1.4).
