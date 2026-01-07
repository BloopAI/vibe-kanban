# <ClickToComponent />

[![npm](https://img.shields.io/npm/v/click-to-react-component)](https://www.npmjs.com/package/click-to-react-component)
[![Release](https://github.com/ericclemmons/click-to-component/actions/workflows/release.yml/badge.svg)](https://github.com/ericclemmons/click-to-component/actions/workflows/release.yml)

<kbd>Option+Click</kbd> a Component in the browser to **instantly** goto the source in your editor.

![Next.js Demo](next.gif)

## Features

- <kbd>Option+Click</kbd> opens the immediate Component's source
- <kbd>Option+Right-click</kbd> opens a context menu with the parent Components' `props`, `fileName`, `columnNumber`, and `lineNumber`

  > ![props](props.png)

- Works with frameworks like [Next.js](https://nextjs.org/),
  [Create React App](https://create-react-app.dev/),
  & [Vite](https://github.com/vitejs/vite/tree/main/packages/plugin-react)
  that use [@babel/plugin-transform-react-jsx-source](https://github.com/babel/babel/tree/master/packages/babel-plugin-transform-react-jsx-source)
- Supports `vscode` & `vscode-insiders` & `cursor` [URL handling](https://code.visualstudio.com/docs/editor/command-line#_opening-vs-code-with-urls)
- Automatically **tree-shaken** from `production` builds
- Keyboard navigation in context menu (e.g. <kbd>←</kbd>, <kbd>→</kbd>, <kbd>⏎</kbd>)
- More context & faster than using React DevTools:

  > ![React DevTools](devtools.png)

## Installation

<details>
<summary>npm</summary>

```shell
npm install click-to-react-component
```

</details>

<details>
<summary>pnpm</summary>

```shell
pnpm add click-to-react-component
```

</details>

<details>
<summary>yarn</summary>

```shell
yarn add click-to-react-component
```

</details>

Even though `click-to-react-component` is added to `dependencies`, [tree-shaking](https://esbuild.github.io/api/#tree-shaking) will remove `click-to-react-component` from `production` builds.

## Usage

<details>
<summary>Create React App</summary>

[/src/index.js](https://github.com/ericclemmons/click-to-component/blob/main/apps/cra/src/index.js#L11)

```diff
+import { ClickToComponent } from 'click-to-react-component';
 import React from 'react';
 import ReactDOM from 'react-dom/client';
 import './index.css';
@@ -8,7 +7,6 @@ import reportWebVitals from './reportWebVitals';
 const root = ReactDOM.createRoot(document.getElementById('root'));
 root.render(
   <React.StrictMode>
+    <ClickToComponent />
     <App />
   </React.StrictMode>
 );
```

> ![Create React App Demo](cra.gif)

</details>

<details>
<summary>Next.js</summary>

[pages/\_app.tsx](https://github.com/ericclemmons/click-to-component/blob/main/apps/next/pages/_app.tsx#L8)

```diff
+import { ClickToComponent } from 'click-to-react-component'
 import type { AppProps } from 'next/app'
 import '../styles/globals.css'

 function MyApp({ Component, pageProps }: AppProps) {
   return (
     <>
+      <ClickToComponent />
       <Component {...pageProps} />
     </>
   )
```

> ![Next.js Demo](next.gif)

</details>

<details>
<summary>Vite</summary>

```diff
+import { ClickToComponent } from "click-to-react-component";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
+   <ClickToComponent />
  </React.StrictMode>
);
```

> ![Vite Demo](vite.gif)

</details>

<details>
<summary>Docusaurus</summary>

    npm install @babel/plugin-transform-react-jsx-source

babel.config.js:

```js
module.exports = {
  presets: [require.resolve('@docusaurus/core/lib/babel/preset')],
  plugins: [
    ...(process.env.BABEL_ENV === 'development'
      ? ['@babel/plugin-transform-react-jsx-source']
      : []),
  ],
};
```

src/theme/Root.js:

```js
import { ClickToComponent } from 'click-to-react-component';
import React from 'react';

// Default implementation, that you can customize
export default function Root({ children }) {
  return (
    <>
      <ClickToComponent />
      {children}
    </>
  );
}
```

</details>

If [developing in container](https://github.com/ericclemmons/click-to-component/issues/58)?

### `editor`

By default, clicking will default `editor` to [`vscode`](https://code.visualstudio.com/).

If, like me, you use [`vscode-insiders`](https://code.visualstudio.com/insiders/), you can set `editor` explicitly:

```diff
-<ClickToComponent />
+<ClickToComponent editor="vscode-insiders" />
```

## Run Locally

Clone the project

```shell
gh repo clone ericclemmons/click-to-component
```

Go to the project directory

```shell
cd click-to-component
```

Install dependencies

```shell
pnpm install
```

Run one of the examples:

<details>
<summary>Create React App</summary>

```shell
cd apps/cra
pnpm start
```

</details>

<details>
<summary>Next.js</summary>

```shell
cd apps/next
pnpm dev
```

</details>
