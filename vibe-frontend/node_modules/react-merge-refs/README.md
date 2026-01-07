# react-merge-refs

[![License](https://img.shields.io/npm/l/react-merge-refs.svg)](https://github.com/gregberge/react-merge-refs/blob/master/LICENSE)
[![npm package](https://img.shields.io/npm/v/react-merge-refs/latest.svg)](https://www.npmjs.com/package/react-merge-refs)
[![Build Status](https://img.shields.io/travis/gregberge/react-merge-refs.svg)](https://travis-ci.org/gregberge/react-merge-refs)
[![DevDependencies](https://img.shields.io/david/dev/gregberge/react-merge-refs.svg)](https://david-dm.org/gregberge/react-merge-refs?type=dev)

React utility to merge refs 🖇

```sh
npm install react-merge-refs
```

## Example

```js
import React from "react";
import mergeRefs from "react-merge-refs";

const Example = React.forwardRef(function Example(props, ref) {
  const localRef = React.useRef();
  return <div ref={mergeRefs([localRef, ref])} />;
});
```

## Why?

When developing low level UI components, it is common to have to use a local ref but also support an external one using `React.forwardRef`. Natively, React does not offer a way to set two refs inside the `ref` property. This is the goal of this small utility.

Today a `ref` can be a `function` or an `object`, tomorrow it could be another thing, who knows. This utility handles compatibility for you.

# License

MIT
