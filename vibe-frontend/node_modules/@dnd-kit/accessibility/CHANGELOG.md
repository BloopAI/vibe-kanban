# @dnd-kit/accessibility

## 3.1.1

### Patch Changes

- [#1534](https://github.com/clauderic/dnd-kit/pull/1534) [`93602df`](https://github.com/clauderic/dnd-kit/commit/93602df08498b28749e8146e0f6143ab987bc178) Thanks [@duvallj](https://github.com/duvallj)! - Workaround `<LiveRegion>` layout bug by adding explicit `top` and `left`
  attributes. Under sufficiently complex CSS conditions, the element would
  overflow containers that it's not supposed to. See [this
  post](https://blog.duvallj.pw/posts/2024-11-19-chrome-heisenbug-uncovered.html)
  for a complete explanation.

## 3.1.0

### Minor Changes

- [#1229](https://github.com/clauderic/dnd-kit/pull/1229) [`aabb8bd`](https://github.com/clauderic/dnd-kit/commit/aabb8bd114cf1f0aed0f18e70b296d5905ff04d8) Thanks [@ayy-bc](https://github.com/ayy-bc)! - Introduce `ariaLiveType` prop on `<LiveRegion>` to allow consumers to configure the `aria-live` attribute to other values for announcements, such as `aria-live="polite"`.

## 3.0.1

### Patch Changes

- [#776](https://github.com/clauderic/dnd-kit/pull/776) [`3978c43`](https://github.com/clauderic/dnd-kit/commit/3978c43c6b045f10b75f47ad8bbea38a84437bd6) Thanks [@clauderic](https://github.com/clauderic)! - The ARIA live region element used for screen reader announcements is now positioned using `position: fixed` instead of `position: absolute`. As of `@dnd-kit/core^6.0.0`, the live region element is no longer portaled by default into the `document.body`. This change was introduced in order to fix issues with portaled live regions. However, this change can introduce visual regressions when using absolutely positioned elements, since the live region element is constrained to the stacking and position context of its closest positioned ancestor. Using fixed position ensures the element does not introduce visual regressions.

## 3.0.0

### Major Changes

- [`a9d92cf`](https://github.com/clauderic/dnd-kit/commit/a9d92cf1fa35dd957e6c5915a13dfd2af134c103) [#174](https://github.com/clauderic/dnd-kit/pull/174) Thanks [@clauderic](https://github.com/clauderic)! - Distributed assets now only target modern browsers. [Browserlist](https://github.com/browserslist/browserslist) config:

  ```
  defaults
  last 2 version
  not IE 11
  not dead
  ```

  If you need to support older browsers, include the appropriate polyfills in your project's build process.

### Patch Changes

- [`b406cb9`](https://github.com/clauderic/dnd-kit/commit/b406cb9251beef8677d05c45ec42bab7581a86dc) [#187](https://github.com/clauderic/dnd-kit/pull/187) Thanks [@clauderic](https://github.com/clauderic)! - Introduced the `useDndMonitor` hook. The `useDndMonitor` hook can be used within components wrapped in a `DndContext` provider to monitor the different drag and drop events that happen for that `DndContext`.

  Example usage:

  ```tsx
  import {DndContext, useDndMonitor} from '@dnd-kit/core';

  function App() {
    return (
      <DndContext>
        <Component />
      </DndContext>
    );
  }

  function Component() {
    useDndMonitor({
      onDragStart(event) {},
      onDragMove(event) {},
      onDragOver(event) {},
      onDragEnd(event) {},
      onDragCancel(event) {},
    });
  }
  ```

## 2.0.0

### Major Changes

- [`2833337`](https://github.com/clauderic/dnd-kit/commit/2833337043719853902c3989dfcd5b55ae9ddc73) [#186](https://github.com/clauderic/dnd-kit/pull/186) Thanks [@clauderic](https://github.com/clauderic)! - Simplify `useAnnouncement` hook to only return a single `announcement` rather than `entries`. Similarly, the `LiveRegion` component now only accepts a single `announcement` rather than `entries.

  - The current strategy used in the useAnnouncement hook is needlessly complex. It's not actually necessary to render multiple announcements at once within the LiveRegion component. It's sufficient to render a single announcement at a time. It's also un-necessary to clean up the announcements after they have been announced, especially now that the role="status" attribute has been added to LiveRegion, keeping the last announcement rendered means users can refer to the last status.

### Patch Changes

- [`c24bdb3`](https://github.com/clauderic/dnd-kit/commit/c24bdb3723f1e3e4c474439f837a19c6d48059fb) [#184](https://github.com/clauderic/dnd-kit/pull/184) Thanks [@clauderic](https://github.com/clauderic)! - Tweaked LiveRegion component:
  - Entries are now rendered without wrapper `span` elements. Having wrapper `span` elements causes VoiceOver on macOS to try to move the VoiceOver cursor to the live region, which interferes with scrolling. This issue is not exhibited when rendering announcement entries as plain text without wrapper spans.
  - Added the `role="status"` attribute to the LiveRegion wrapper element.
  - Added the `white-space: no-wrap;` property to ensure that text does not wrap.

## 1.0.2

### Patch Changes

- [`423610c`](https://github.com/clauderic/dnd-kit/commit/423610ca48c5e5ca95545fdb5c5cfcfbd3d233ba) [#56](https://github.com/clauderic/dnd-kit/pull/56) Thanks [@clauderic](https://github.com/clauderic)! - Add MIT license to package.json and distributed files

## 1.0.1

### Patch Changes

- [`310bbd6`](https://github.com/clauderic/dnd-kit/commit/310bbd6370e85f8fb16cad149e6254600a5beb3a) [#37](https://github.com/clauderic/dnd-kit/pull/37) Thanks [@nickpresta](https://github.com/nickpresta)! - Fix typo in package.json repository URL

## 1.0.0

### Major Changes

- [`2912350`](https://github.com/clauderic/dnd-kit/commit/2912350c5008c2b0edda3bae30b5075a852dea63) Thanks [@clauderic](https://github.com/clauderic)! - Initial public release.

## 0.1.0

### Minor Changes

- [`7bd4568`](https://github.com/clauderic/dnd-kit/commit/7bd4568e9f339552fd73a9a4c888460b11195a5e) [#30](https://github.com/clauderic/dnd-kit/pull/30) - Initial beta release, authored by [@clauderic](https://github.com/clauderic).
