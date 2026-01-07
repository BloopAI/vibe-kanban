# Vibe Kanban Web Companion

This package adds point-and-click edit functionality to web apps, when used with [Vibe Kanban](https://vibekanban.com).

Works with frameworks like [Next.js](https://nextjs.org/),
  [Create React App](https://create-react-app.dev/),
  & [Vite](https://github.com/vitejs/vite/tree/main/packages/plugin-react)
  that use [@babel/plugin-transform-react-jsx-source](https://github.com/babel/babel/tree/master/packages/babel-plugin-transform-react-jsx-source)

## Installation

Even though `vibe-kanban-web-companion` is added to `dependencies`, [tree-shaking](https://esbuild.github.io/api/#tree-shaking) will remove `vibe-kanban-web-companion` from `production` builds.

Add this dependency to your project:
```shell
npm i vibe-kanban-web-companion
```

## Usage

<details>
<summary>Create React App</summary>

```diff
+import { VibeKanbanWebCompanion } from 'vibe-kanban-web-companion';
 import React from 'react';
 import ReactDOM from 'react-dom/client';
 import './index.css';
@@ -8,7 +7,6 @@ import reportWebVitals from './reportWebVitals';
 const root = ReactDOM.createRoot(document.getElementById('root'));
 root.render(
   <React.StrictMode>
+    <VibeKanbanWebCompanion />
     <App />
   </React.StrictMode>
 );
```

</details>

<details>
<summary>Next.js</summary>

```diff
+import { VibeKanbanWebCompanion } from 'vibe-kanban-web-companion'
 import type { AppProps } from 'next/app'
 import '../styles/globals.css'

 function MyApp({ Component, pageProps }: AppProps) {
   return (
     <>
+      <VibeKanbanWebCompanion />
       <Component {...pageProps} />
     </>
   )
```

</details>

<details>
<summary>Vite</summary>

```diff
+import { VibeKanbanWebCompanion } from "vibe-kanban-web-companion";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
+   <VibeKanbanWebCompanion />
  </React.StrictMode>
);
```

</details>

## Credits

Thanks to [Eric Clemmons](https://github.com/ericclemmons) for creating the original [Click-To-Component](https://github.com/ericclemmons/click-to-component) library, from which our helper is forked from.