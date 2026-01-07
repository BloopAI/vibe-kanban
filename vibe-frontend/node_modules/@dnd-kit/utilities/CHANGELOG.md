# @dnd-kit/utilities

## 3.2.2

### Patch Changes

- [#1239](https://github.com/clauderic/dnd-kit/pull/1239) [`f342d5e`](https://github.com/clauderic/dnd-kit/commit/f342d5efd98507f173b6a170b35bee1545d40311) Thanks [@petdud](https://github.com/petdud)! - Fix: getOwnerDocument should get correct document for SVG Elements

## 3.2.1

### Patch Changes

- [#948](https://github.com/clauderic/dnd-kit/pull/948) [`da7c60d`](https://github.com/clauderic/dnd-kit/commit/da7c60dcbb76d89cf1fcb421e69a4abcea2eeebe) Thanks [@Ayc0](https://github.com/Ayc0)! - Upgrade to TypeScript to 4.8

## 3.2.0

### Minor Changes

- [#748](https://github.com/clauderic/dnd-kit/pull/748) [`59ca82b`](https://github.com/clauderic/dnd-kit/commit/59ca82b9f228f34c7731ece87aef5d9633608b57) Thanks [@clauderic](https://github.com/clauderic)! - Introduced the `findFirstFocusableNode` utility function that returns the first focusable node within a given HTMLElement, or the element itself if it is focusable.

- [#733](https://github.com/clauderic/dnd-kit/pull/733) [`035021a`](https://github.com/clauderic/dnd-kit/commit/035021aac51161e2bf9715f087a6dd1b46647bfc) Thanks [@clauderic](https://github.com/clauderic)! - Introduced the `useEvent` hook based on [implementation breakdown in the RFC](https://github.com/reactjs/rfcs/blob/useevent/text/0000-useevent.md#internal-implementation). In the future, this hook will be used as a polyfill if the native React hook is unavailble.

## 3.1.0

### Minor Changes

- [#518](https://github.com/clauderic/dnd-kit/pull/518) [`6310227`](https://github.com/clauderic/dnd-kit/commit/63102272d0d63dae349e2e9f638277e16a7d5970) Thanks [@clauderic](https://github.com/clauderic)! - Major internal refactor of measuring and collision detection.

  ### Summary of changes

  Previously, all collision detection algorithms were relative to the top and left points of the document. While this approach worked in most situations, it broke down in a number of different use-cases, such as fixed position droppable containers and trying to drag between containers that had different scroll positions.

  This new approach changes the frame of comparison to be relative to the viewport. This is a major breaking change, and will need to be released under a new major version bump.

  ### Breaking changes:

  - By default, `@dnd-kit` now ignores only the transforms applied to the draggable / droppable node itself, but considers all the transforms applied to its ancestors. This should provide the right balance of flexibility for most consumers.
    - Transforms applied to the droppable and draggable nodes are ignored by default, because the recommended approach for moving items on the screen is to use the transform property, which can interfere with the calculation of collisions.
    - Consumers can choose an alternate approach that does consider transforms for specific use-cases if needed by configuring the measuring prop of <DndContext>. Refer to the <Switch> example.
  - Reduced the number of concepts related to measuring from `ViewRect`, `LayoutRect` to just a single concept of `ClientRect`.
    - The `ClientRect` interface no longer holds the `offsetTop` and `offsetLeft` properties. For most use-cases, you can replace `offsetTop` with `top` and `offsetLeft` with `left`.
    - Replaced the following exports from the `@dnd-kit/core` package with `getClientRect`:
      - `getBoundingClientRect`
      - `getViewRect`
      - `getLayoutRect`
      - `getViewportLayoutRect`
  - Removed `translatedRect` from the `SensorContext` interface. Replace usage with `collisionRect`.
  - Removed `activeNodeClientRect` on the `DndContext` interface. Replace with `activeNodeRect`.

- [`528c67e`](https://github.com/clauderic/dnd-kit/commit/528c67e4c617dfc0ce5221496aa8b222ffc82ddb) Thanks [@clauderic](https://github.com/clauderic)! - Introduced the `useLatestValue` hook, which returns a ref that holds the latest value of a given argument. Optionally, the second argument can be used to customize the dependencies passed to the effect.

### Patch Changes

- [#561](https://github.com/clauderic/dnd-kit/pull/561) [`02edd26`](https://github.com/clauderic/dnd-kit/commit/02edd2691b24bb49f2e7c9f9a3f282031bf658b7) Thanks [@clauderic](https://github.com/clauderic)! - - The `useNodeRef` hook's `onChange` argument now receives both the current node and the previous node that were attached to the ref.
  - The `onChange` argument is only called if the previous node differs from the current node

## 3.0.2

### Patch Changes

- [#532](https://github.com/clauderic/dnd-kit/pull/532) [`dfa8d69`](https://github.com/clauderic/dnd-kit/commit/dfa8d69d98e8f271b29fa516cc13b8cd0c01d371) Thanks [@Nauss](https://github.com/Nauss)! - fix: `isWindow` has been updated to support checking wether an element is a window object in Electron applications.

## 3.0.1

### Patch Changes

- [#509](https://github.com/clauderic/dnd-kit/pull/509) [`1c6369e`](https://github.com/clauderic/dnd-kit/commit/1c6369e24ff338760adfb806c3017c72f3194726) Thanks [@clauderic](https://github.com/clauderic)! - Helpers have been updated to support rendering in foreign `window` contexts (via `ReactDOM.render` or `ReactDOM.createPortal`).

  For example, checking if an element is an instance of an `HTMLElement` is normally done like so:

  ```ts
  if (element instanceof HTMLElement)
  ```

  However, when rendering in a different window, this can return false even if the element is indeed an HTMLElement, because this code is equivalent to:

  ```ts
  if (element instanceof window.HTMLElement)
  ```

  And in this case, the `window` of the `element` is different from the main execution context `window`, because we are rendering via a portal into another window.

  This can be solved by finding the local window of the element:

  ```ts
  const elementWindow = element.ownerDocument.defaultView;

  if (element instanceof elementWindow.HTMLElement)
  ```

## 3.0.0

### Major Changes

- [#373](https://github.com/clauderic/dnd-kit/pull/373) [`1f5ca27`](https://github.com/clauderic/dnd-kit/commit/1f5ca27b17879861c2c545160c2046a747544846) Thanks [@clauderic](https://github.com/clauderic)! - Added react to peerDependencies of @dnd-kit/utilities

### Minor Changes

- [#334](https://github.com/clauderic/dnd-kit/pull/334) [`13be602`](https://github.com/clauderic/dnd-kit/commit/13be602229c6d5723b3ae98bca7b8f45f0773366) Thanks [@trentmwillis](https://github.com/trentmwillis)! - Move `Coordinates` interface along with `getEventCoordinates`, `isMouseEvent` and `isTouchEvent` helpers to @dnd-kit/utilities

### Patch Changes

- [#437](https://github.com/clauderic/dnd-kit/pull/437) [`0e628bc`](https://github.com/clauderic/dnd-kit/commit/0e628bce53fb1a7223cdedd203cb07b6e62e5ec1) Thanks [@chestozo](https://github.com/chestozo)! - Added PointerEvent support to the `getEventCoordinates` method. This fixes testing the PointerSensor with Cypress (#436)

## 2.0.0

### Major Changes

- [`a9d92cf`](https://github.com/clauderic/dnd-kit/commit/a9d92cf1fa35dd957e6c5915a13dfd2af134c103) [#174](https://github.com/clauderic/dnd-kit/pull/174) Thanks [@clauderic](https://github.com/clauderic)! - Distributed assets now only target modern browsers. [Browserlist](https://github.com/browserslist/browserslist) config:

  ```
  defaults
  last 2 version
  not IE 11
  not dead
  ```

  If you need to support older browsers, include the appropriate polyfills in your project's build process.

## 1.0.3

### Patch Changes

- [`6a5c8a1`](https://github.com/clauderic/dnd-kit/commit/6a5c8a13bf19742efa65b20f16666f00ffaae1b1) [#154](https://github.com/clauderic/dnd-kit/pull/154) Thanks [@clauderic](https://github.com/clauderic)! - Update implementation of FirstArgument

## 1.0.2

### Patch Changes

- [`423610c`](https://github.com/clauderic/dnd-kit/commit/423610ca48c5e5ca95545fdb5c5cfcfbd3d233ba) [#56](https://github.com/clauderic/dnd-kit/pull/56) Thanks [@clauderic](https://github.com/clauderic)! - Add MIT license to package.json and distributed files

## 1.0.1

### Patch Changes

- [`0b343c7`](https://github.com/clauderic/dnd-kit/commit/0b343c7e88a68351f8a39f643e9f26b8e046ef48) [#52](https://github.com/clauderic/dnd-kit/pull/52) Thanks [@clauderic](https://github.com/clauderic)! - Add repository entry to package.json files

## 1.0.0

### Major Changes

- [`2912350`](https://github.com/clauderic/dnd-kit/commit/2912350c5008c2b0edda3bae30b5075a852dea63) Thanks [@clauderic](https://github.com/clauderic)! - Initial public release.

## 0.1.0

### Minor Changes

- [`7bd4568`](https://github.com/clauderic/dnd-kit/commit/7bd4568e9f339552fd73a9a4c888460b11195a5e) [#30](https://github.com/clauderic/dnd-kit/pull/30) - Initial beta release, authored by [@clauderic](https://github.com/clauderic).
