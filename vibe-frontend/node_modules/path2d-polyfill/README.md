# path2d-polyfill

[![validate](https://github.com/nilzona/path2d-polyfill/actions/workflows/validate.yaml/badge.svg)](https://github.com/nilzona/path2d-polyfill/actions/workflows/validate.yaml)

Polyfills `Path2D` api and `roundRect` for CanvasRenderingContext2D

## Usage

Add this script tag to your page to enable the feature.

```html
<script lang="javascript" src="https://cdn.jsdelivr.net/npm/path2d-polyfill/dist/path2d-polyfill.min.js"></script>
```

or install from npm

```shell
npm install --save path2d-polyfill
```

and import with module bundler e.g. webpack _before_ using the feature

```javascript
import "path2d-polyfill";
```

This will polyfill the browser's window object with Path2D features and it will also polyfill roundRect if they are missing in both CanvasRenderingContexst and Path2D.

Example of usage

```javascript
ctx.fill(new Path2D("M 80 80 A 45 45 0 0 0 125 125 L 125 80 Z"));
ctx.stroke(new Path2D("M 80 80 A 45 45 0 0 0 125 125 L 125 80 Z"));
```

## Usage in a node environment

It is possible to use this library in a node environment as well. The package exports a few functions that can be used:

- `Path2D` - class to create Path2D objects used by the polyfill methods
- `polyfillPath2D` - function that adds Path2D to a "window like" object and polyfills CanvasRenderingContext2D to use Path2D
- `polyfillRoundRect` - polyfills roundRect function on Path2D and CanvasRenderingContext2D (missing in firefox)
- `parsePath` - function for parsing an SVG path string into canvas commands

use any of these functions like:

```js
const { polyfillRoundRect } = require "path2d-polyfill";

const windowlike = { CanvasRenderingContext2D, Path2D };

polyfillRoundRect(windowLike);
// roundRect functions has now been added if they were missing
```

### usage with node-canvas

To get Path2D features with the [node-canvas library](https://github.com/Automattic/node-canvas) use the following pattern:

```js
const { createCanvas, CanvasRenderingContext2D } = require("canvas");
const { polyfillPath2D } = require("path2d-polyfill/path2d");

global.CanvasRenderingContext2D = CanvasRenderingContext2D;
polyfillPath2D(global);
// Path2D has now been added to global object

const canvas = createCanvas(200, 200);
const ctx = canvas.getContext("2d");

const p = new Path2D("M10 10 l 20 0 l 0 20 Z");
ctx.fillStyle = "green";
ctx.fill(p);
```

A working example of a node express server that serves an image drawn with canvas can be seen [here](https://gist.github.com/nilzona/e611c99336d8ea1f645bd391a459c24f)

## Support table

| Method               | Supported |
| -------------------- | :-------: |
| constructor(SVGPath) |    Yes    |
| addPath()            |    Yes    |
| closePath()          |    Yes    |
| moveTo()             |    Yes    |
| lineTo()             |    Yes    |
| bezierCurveTo()      |    Yes    |
| quadraticCurveTo()   |    Yes    |
| arc()                |    Yes    |
| ellipse()            |    Yes    |
| rect()               |    Yes    |
| roundRect()          |    Yes    |

## See it in action

Clone this repo and run the following

```shell
yarn
yarn start
```

open <http://localhost:10001> to see the example page.

## Contributing

Recommended to use vscode with the prettier extension to keep formatting intact.
