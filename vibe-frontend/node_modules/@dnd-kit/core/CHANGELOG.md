# @dnd-kit/core

## 6.3.1

### Patch Changes

- [#1555](https://github.com/clauderic/dnd-kit/pull/1555) [`62f632a`](https://github.com/clauderic/dnd-kit/commit/62f632a0c8f06ff020eb90d98770a374c705001d) Thanks [@clauderic](https://github.com/clauderic)! - Added `Tab` to the list of default key codes that end a drag and drop operation. Can be customized by passing in a custom list of `keyCodes` to the KeyboardSensor options.

## 6.3.0

### Minor Changes

- [#1539](https://github.com/clauderic/dnd-kit/pull/1539) [`0c6a28d`](https://github.com/clauderic/dnd-kit/commit/0c6a28d1b32c72cfbc6e103c9f430a1e8ebe7301) Thanks [@irobot](https://github.com/irobot)! - Make it possible to add visual cues when using activation constraints.

  ### Context

  Activation constraints are used when we want to prevent accidental dragging or when
  pointer press can mean more than "start dragging".

  A typical use case is a button that needs to respond to both "click" and "drag" gestures.
  Clicks can be distinguished from drags based on how long the pointer was
  held pressed.

  ### The problem

  A control that responds differently to a pointer press based on duration or distance can
  be confusing to use -- the user has to guess how long to keep holding or how far to keep
  dragging until their intent is acknowledged.

  Implementing such cues is currently possible by attaching extra event listeners so that
  we know when a drag is pending. Furthermore, the listener needs to have access to
  the same constraints that were applied to the sensor initiating the drag. This can be
  made to work in simple cases, but it becomes error-prone and difficult to maintain in
  complex scenarios.

  ### Solution

  This changeset proposes the addition of two new events: `onDragPending` and `onDragAbort`.

  #### `onDragPending`

  A drag is considered to be pending when the pointer has been pressed and there are
  activation constraints that need to be satisfied before a drag can start.

  This event is initially fired on pointer press. At this time `offset` (see below) will be
  `undefined`.

  It will subsequently be fired every time the pointer is moved. This is to enable
  visual cues for distance-based activation.

  The event's payload contains all the information necessary for providing visual feedback:

  ```typescript
  export interface DragPendingEvent {
    id: UniqueIdentifier;
    constraint: PointerActivationConstraint;
    initialCoordinates: Coordinates;
    offset?: Coordinates | undefined;
  }
  ```

  #### `onDragAbort`

  A drag is considered aborted when an activation constraint for a pending drag was violated.
  Useful as a prompt to cancel any visual cue animations currently in progress.
  Note that this event will _not_ be fired when dragging ends or is canceled.

## 6.2.0

### Minor Changes

- [#1140](https://github.com/clauderic/dnd-kit/pull/1140) [`545a41c`](https://github.com/clauderic/dnd-kit/commit/545a41c27c6919e4ca22a58a67f3fa02a7caab8a) Thanks [@anilanar](https://github.com/anilanar)! - Add `activatorEvent` to `DragStartEvent`

### Patch Changes

- [#1494](https://github.com/clauderic/dnd-kit/pull/1494) [`00ec286`](https://github.com/clauderic/dnd-kit/commit/00ec286ab2fc7969549a4b19ffd42a09b5171dbe) Thanks [@dinkinflickaa](https://github.com/dinkinflickaa)! - Improves performance by eliminating wasteful re-renders on every child item on click

- [#1400](https://github.com/clauderic/dnd-kit/pull/1400) [`995dc23`](https://github.com/clauderic/dnd-kit/commit/995dc23b7cd9019f3a920676cbe4e141e917e82c) Thanks [@12joan](https://github.com/12joan)! - Export `defaultKeyboardCoordinateGetter`

- [#1542](https://github.com/clauderic/dnd-kit/pull/1542) [`f629ec6`](https://github.com/clauderic/dnd-kit/commit/f629ec6a9c3c25b749561fac31741046d96c28dc) Thanks [@clauderic](https://github.com/clauderic)! - Fix bug with draggable and sortable elements with an `id` equal to `0`.

- [#1541](https://github.com/clauderic/dnd-kit/pull/1541) [`99643f6`](https://github.com/clauderic/dnd-kit/commit/99643f634cd55fa0bf0898365883507b28637659) Thanks [@clauderic](https://github.com/clauderic)! - Handle `touchcancel` and `pointercancel` events.

- [#1435](https://github.com/clauderic/dnd-kit/pull/1435) [`6bbe39b`](https://github.com/clauderic/dnd-kit/commit/6bbe39bba6ad9afd0bc6db1c345ad4e6b58f5e5e) Thanks [@knaveenkumar3576](https://github.com/knaveenkumar3576)! - Faster Paint with delayed flush of Effects

- [#1543](https://github.com/clauderic/dnd-kit/pull/1543) [`bcaf7c4`](https://github.com/clauderic/dnd-kit/commit/bcaf7c4e57b34dfc8ff9c4eea7a01c6e525e7874) Thanks [@clauderic](https://github.com/clauderic)! - Fix a bug with auto-scroller continuing to observe stale elements, causing them to be considered as scrollable.

- Updated dependencies [[`93602df`](https://github.com/clauderic/dnd-kit/commit/93602df08498b28749e8146e0f6143ab987bc178)]:
  - @dnd-kit/accessibility@3.1.1

## 6.1.0

### Minor Changes

- [#1271](https://github.com/clauderic/dnd-kit/pull/1271) [`bc588c7`](https://github.com/clauderic/dnd-kit/commit/bc588c7f7b1124514b2834e14f9dad29ce49c8ce) Thanks [@clauderic](https://github.com/clauderic)! - Introduce `bypassActivationConstraint()` option for `PointerSensor`, `MouseSensor` and `TouchSensor`. This optional argument can be used to conditionally bypass activation constraints. An example use-case would be to bypass activation constraints when the activator event target is the `activatorNode` of a draggable source.

  ```tsx
  useSensor(PointerSensor, {
    activationConstraint: {
      delay: 250,
      tolerance: 5,
    },
    bypassActivationConstraint({event, activeNode}) {
      return activeNode.activatorNode.current?.contains(event.target);
    },
  });
  ```

- [#1269](https://github.com/clauderic/dnd-kit/pull/1269) [`b417f0f`](https://github.com/clauderic/dnd-kit/commit/b417f0f94bfd8097bdf34eec27b7051dc0f5aa2a) Thanks [@clauderic](https://github.com/clauderic)! - Allow `delay` and `distance` activation constraints to be used concurrently for `MouseSensor`, `TouchSensor` and `PointerSensor`.

### Patch Changes

- Updated dependencies [[`aabb8bd`](https://github.com/clauderic/dnd-kit/commit/aabb8bd114cf1f0aed0f18e70b296d5905ff04d8), [`f342d5e`](https://github.com/clauderic/dnd-kit/commit/f342d5efd98507f173b6a170b35bee1545d40311)]:
  - @dnd-kit/accessibility@3.1.0
  - @dnd-kit/utilities@3.2.2

## 6.0.8

### Patch Changes

- [#1038](https://github.com/clauderic/dnd-kit/pull/1038) [`da888ee`](https://github.com/clauderic/dnd-kit/commit/da888eea8675ff07ad3b2b8f43bc52408b69bd66) Thanks [@WillDonohoe](https://github.com/WillDonohoe)! - Fix errors with calls to `getComputedStyle` in Firefox when destructuring from the window object

## 6.0.7

### Patch Changes

- [#788](https://github.com/clauderic/dnd-kit/pull/788) [`da94c02`](https://github.com/clauderic/dnd-kit/commit/da94c02a26986b8816b7b31e318f68e9e1b9a1d2) Thanks [@clauderic](https://github.com/clauderic)! - Bug fixes for React 18 Strict Mode

## 6.0.6

### Patch Changes

- [#948](https://github.com/clauderic/dnd-kit/pull/948) [`da7c60d`](https://github.com/clauderic/dnd-kit/commit/da7c60dcbb76d89cf1fcb421e69a4abcea2eeebe) Thanks [@Ayc0](https://github.com/Ayc0)! - Upgrade to TypeScript to 4.8

- Updated dependencies [[`da7c60d`](https://github.com/clauderic/dnd-kit/commit/da7c60dcbb76d89cf1fcb421e69a4abcea2eeebe)]:
  - @dnd-kit/utilities@3.2.1

## 6.0.5

### Patch Changes

- [`4a5132d`](https://github.com/clauderic/dnd-kit/commit/4a5132db4e6acbe407df3d3e2fd18b466647746d) Thanks [@clauderic](https://github.com/clauderic)! - Removed a stray `console.log` in the `KeyboardSensor`

## 6.0.4

### Patch Changes

- [#797](https://github.com/clauderic/dnd-kit/pull/797) [`eaa6e12`](https://github.com/clauderic/dnd-kit/commit/eaa6e126b8e4141b87d92d23478c47f5ba204f25) Thanks [@clauderic](https://github.com/clauderic)! - Fixed a regression in the `KeyboardSensor` scrolling logic.

## 6.0.3

### Patch Changes

- [#772](https://github.com/clauderic/dnd-kit/pull/772) [`e97cb1f`](https://github.com/clauderic/dnd-kit/commit/e97cb1f3240cb495c8bf5c63e5145cf15c411a6f) Thanks [@clauderic](https://github.com/clauderic)! - The ARIA live region element used for screen reader announcements is now positioned using `position: fixed` instead of `position: absolute`. As of `@dnd-kit/core^6.0.0`, the live region element is no longer portaled by default into the `document.body`. This change was introduced in order to fix issues with portaled live regions. However, this change can introduce visual regressions when using absolutely positioned elements, since the live region element is constrained to the stacking and position context of its closest positioned ancestor. Using fixed position ensures the element does not introduce visual regressions.

## 6.0.2

### Patch Changes

- [#769](https://github.com/clauderic/dnd-kit/pull/769) [`8e3599f`](https://github.com/clauderic/dnd-kit/commit/8e3599fafa3b4444e580c4bef2543c3b6b8241fb) Thanks [@clauderic](https://github.com/clauderic)! - Fixed an issue with the `containerNodeRect` that is exposed to modifiers having stale properties (`top`, `left`, etc.) when its scrollable ancestors were scrolled.

- [#769](https://github.com/clauderic/dnd-kit/pull/769) [`53cb962`](https://github.com/clauderic/dnd-kit/commit/53cb96243e34b552640e0679e1cc1ebd52b271f1) Thanks [@clauderic](https://github.com/clauderic)! - Fixed a regression with scrollable ancestors detection.

  The scrollable ancestors should be determined by the active node or the over node exclusively. The `draggingNode` variable shouldn't be used to detect scrollable ancestors since it can be the drag overlay node, and the drag overlay node doesn't have any scrollable ancestors because it is a fixed position element.

## 6.0.1

### Patch Changes

- [#759](https://github.com/clauderic/dnd-kit/pull/759) [`e5b9d38`](https://github.com/clauderic/dnd-kit/commit/e5b9d380887f71d50d8418f48fc3569db8367124) Thanks [@clauderic](https://github.com/clauderic)! - Fixed a regression with the default drop animation of `<DragOverlay>` for consumers using React 18.

## 6.0.0

### Major Changes

- [#746](https://github.com/clauderic/dnd-kit/pull/746) [`4173087`](https://github.com/clauderic/dnd-kit/commit/417308704454c50f88ab305ab450a99bde5034b0) Thanks [@clauderic](https://github.com/clauderic)! - Accessibility related changes.

  #### Regrouping accessibility-related props

  Accessibility-related props have been regrouped under the `accessibility` prop of `<DndContext>`:

  ```diff
  <DndContext
  - announcements={customAnnouncements}
  - screenReaderInstructions={customScreenReaderInstructions}
  + accessibility={{
  +  announcements: customAnnouncements,
  +  screenReaderInstructions: customScreenReaderInstructions,
  + }}
  ```

  This is a breaking change that will allow easier addition of new accessibility-related features without overloading the props namespace of `<DndContext>`.

  #### Arguments object for announcements

  The arguments passed to announcement callbacks have changed. They now receive an object that contains the `active` and `over` properties that match the signature of those passed to the DragEvent handlers (`onDragStart`, `onDragMove`, etc.). This change allows consumers to read the `data` property of the `active` and `over` node to customize the announcements based on the data.

  Example migration steps:

  ```diff
  export const announcements: Announcements = {
  -  onDragStart(id) {
  +  onDragStart({active}) {
  -    return `Picked up draggable item ${id}.`;
  +    return `Picked up draggable item ${active.id}.`;
    },
  -  onDragOver(id, overId) {
  +  onDragOver({active, over}) {
  -    if (overId) {
  +    if (over) {
  -      return `Draggable item ${id} was moved over droppable area ${overId}.`;
  +      return `Draggable item ${active.id} was moved over droppable area ${over.id}.`;
      }

  -    return `Draggable item ${id} is no longer over a droppable area.`;
  +    return `Draggable item ${active.id} is no longer over a droppable area.`;
    },
  };
  ```

  #### Accessibility-related DOM nodes are no longer portaled by default

  The DOM nodes for the screen reader instructions and announcements are no longer portaled into the `document.body` element by default.

  This change is motivated by the fact that screen readers do not always announce ARIA live regions that are rendered on the `document.body`. Common examples of this include when rendering a `<DndContext>` within a `<dialog>` element or an element that has `role="dialog"`, only ARIA live regions rendered within the dialog will be announced.

  Consumers can now opt to render announcements in the portal container of their choice using the `container` property of the `accessibility` prop:

  ```diff
  <DndContext
  + accessibility={{
  +  container: document.body,
  + }}
  ```

- [#733](https://github.com/clauderic/dnd-kit/pull/733) [`035021a`](https://github.com/clauderic/dnd-kit/commit/035021aac51161e2bf9715f087a6dd1b46647bfc) Thanks [@clauderic](https://github.com/clauderic)! - The `<DragOverlay>` component's drop animation has been refactored, which fixes a number of bugs with the existing implementation and introduces new functionality.

  ### What's new?

  #### Scrolling the draggable node into view if needed

  The drop animation now ensures that the the draggable node that we are animating to is in the viewport before performing the drop animation and scrolls it into view if needed.

  #### Changes to the `dropAnimation` prop

  The `dropAnimation` prop of `<DragOverlay>` now accepts either a configuration object or a custom drop animation function.

  The configuration object adheres to the following shape:

  ```ts
  interface DropAnimationOptions {
    duration?: number;
    easing?: string;
    keyframes?: DropAnimationKeyframeResolver;
    sideEffects?: DropAnimationSideEffects;
  }
  ```

  The default drop animation options are:

  ```ts
  const defaultDropAnimationConfiguration: DropAnimationOptions = {
    duration: 250,
    easing: 'ease',
    keyframes: defaultDropAnimationKeyframes,
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0',
        },
      },
    }),
  };
  ```

  The `keyframes` option allows consumers to override the keyframes of the drop animation. For example, here is how you would add a fade out transition to the drop animation using keyframes:

  ```ts
  import {CSS} from '@dnd-kit/utilities';

  const customDropAnimation = {
    keyframes({transform}) {
      return [
        {opacity: 1, transform: CSS.Transform.toString(transform.initial)},
        {opacity: 0, transform: CSS.Transform.toString(transform.final)},
      ];
    },
  };
  ```

  The `dragSourceOpacity` option has been deprecated in favour of letting consumers define arbitrary side effects that should run before the animation starts. Side effects may return a cleanup function that should run when the drop animation has completed.

  ```ts
  type CleanupFunction = () => void;

  export type DropAnimationSideEffects = (
    parameters: DropAnimationSideEffectsParameters
  ) => CleanupFunction | void;
  ```

  Drop animation side effects are a powerful abstraction that provide a lot of flexibility. The `defaultDropAnimationSideEffects` function is exported by `@dnd-kit/core` and aims to facilitate the types of side-effects we anticipate most consumers will want to use out of the box:

  ```ts
  interface DefaultDropAnimationSideEffectsOptions {
    // Apply a className on the active draggable or drag overlay node during the drop animation
    className?: {
      active?: string;
      dragOverlay?: string;
    };
    // Apply temporary styles to the active draggable node or drag overlay during the drop animation
    styles?: {
      active?: Styles;
      dragOverlay?: Styles;
    };
  }
  ```

  For advanced side-effects, consumers may define a custom `sideEffects` function that may optionally return a cleanup function that will be executed when the drop animation completes:

  ```ts
  const customDropAnimation = {
    sideEffects({active}) {
      active.node.classList.add('dropAnimationInProgress');
      active.node.animate([{opacity: 0}, {opacity: 1}], {
        easing: 'ease-in',
        duration: 250,
      });

      return () => {
        // Clean up when the drop animation is complete
        active.node.classList.remove('dropAnimationInProgress');
      };
    },
  };
  ```

  For even more advanced use-cases, consumers may also provide a function to the `dropAnimation` prop, which adheres to the following shape:

  ```ts
  interface DropAnimationFunctionArguments {
    active: {
      id: UniqueIdentifier;
      data: DataRef;
      node: HTMLElement;
      rect: ClientRect;
    };
    draggableNodes: DraggableNodes;
    dragOverlay: {
      node: HTMLElement;
      rect: ClientRect;
    };
    droppableContainers: DroppableContainers;
    measuringConfiguration: DeepRequired<MeasuringConfiguration>;
    transform: Transform;
  }

  type DropAnimationFunction = (
    args: DropAnimationFunctionArguments
  ) => Promise<void> | void;
  ```

  ### Bug fixes

  - The `<DragOverlay>` now respects the `measuringConfiguration` specified for the `dragOverlay` and `draggable` properties when measuring the rects to animate to and from.
  - The `<DragOverlay>` component now supports rendering children while performing the drop animation. Previously, the drag overlay would be in a broken state when trying to pick up an item while a drop animation was in progress.

  ### Migration steps

  For consumers that were relying on the `dragSourceOpacity` property in their `dropAnimation` configuration:

  ```diff
  + import {defaultDropAnimationSideEffects} from '@dnd-kit/core';

  const dropAnimation = {
  - dragSourceOpacity: 0.5,
  + sideEffects: defaultDropAnimationSideEffects({
  +   styles : {
  +     active: {
  +       opacity: '0.5',
  +     },
  +   },
  +  ),
  };
  ```

- [#745](https://github.com/clauderic/dnd-kit/pull/745) [`5f3c700`](https://github.com/clauderic/dnd-kit/commit/5f3c7009698d15936fd20f30f11ad3b23cd7886f) Thanks [@clauderic](https://github.com/clauderic)! - The keyboard sensor now keeps track of the initial coordinates of the collision rect to provide a translate delta when move events are dispatched.

  This is a breaking change that may affect consumers that had created custom keyboard coordinate getters.

  Previously the keyboard sensor would measure the initial rect of the active node and store its top and left properties as its initial coordinates it would then compare all subsequent move coordinates to calculate the delta.

  This approach suffered from the following issues:

  - It didn't respect the measuring configuration defined on the `<DndContext>` for the draggable node
  - Some consumers re-render the active node after dragging begins, which would lead to stale measurements
  - An error had to be thrown if there was no active node during the activation phase of the keyboard sensor. This shouldn't be a concern of the keyboard sensor.
  - The `currentCoordinates` passed to the coordinate getter were often stale and not an accurate representation of the current position of the collision rect, which can be affected by a number of different variables, such as modifiers.

- [#755](https://github.com/clauderic/dnd-kit/pull/755) [`33e6dd2`](https://github.com/clauderic/dnd-kit/commit/33e6dd2dc954f1f2da90d8f8af995021031b6b41) Thanks [@clauderic](https://github.com/clauderic)! - The `UniqueIdentifier` type has been updated to now accept either `string` or `number` identifiers. As a result, the `id` property of `useDraggable`, `useDroppable` and `useSortable` and the `items` prop of `<SortableContext>` now all accept either `string` or `number` identifiers.

  #### Migration steps

  For consumers that are using TypeScript, import the `UniqueIdentifier` type to have strongly typed local state:

  ```diff
  + import type {UniqueIdentifier} from '@dnd-kit/core';

  function MyComponent() {
  -  const [items, setItems] = useState(['A', 'B', 'C']);
  +  const [items, setItems] = useState<UniqueIdentifier>(['A', 'B', 'C']);
  }
  ```

  Alternatively, consumers can cast or convert the `id` property to a `string` when reading the `id` property of interfaces such as `Active`, `Over`, `DroppableContainer` and `DraggableNode`.

  The `draggableNodes` object has also been converted to a map. Consumers that were reading from the `draggableNodes` property that is available on the public context of `<DndContext>` should follow these migration steps:

  ```diff
  - draggableNodes[someId];
  + draggableNodes.get(someId);
  ```

### Minor Changes

- [#748](https://github.com/clauderic/dnd-kit/pull/748) [`59ca82b`](https://github.com/clauderic/dnd-kit/commit/59ca82b9f228f34c7731ece87aef5d9633608b57) Thanks [@clauderic](https://github.com/clauderic)! - Automatic focus management and activator node refs.

  #### Introducing activator node refs

  Introducing the concept of activator node refs for `useDraggable` and `useSortable`. This allows @dnd-kit to handle common use-cases such as restoring focus on the activator node after dragging via the keyboard or only allowing the activator node to instantiate the keyboard sensor.

  Consumers of `useDraggable` and `useSortable` may now optionally set the activator node ref on the element that receives listeners:

  ```diff
  import {useDraggable} from '@dnd-kit/core';

  function Draggable(props) {
    const {
      listeners,
      setNodeRef,
  +   setActivatorNodeRef,
    } = useDraggable({id: props.id});

    return (
      <div ref={setNodeRef}>
        Draggable element
        <button
          {...listeners}
  +       ref={setActivatorNodeRef}
        >
          :: Drag Handle
        </button>
      </div>
    )
  }
  ```

  It's common for the activator element (the element that receives the sensor listeners) to differ from the draggable node. When this happens, @dnd-kit has no reliable way to get a reference to the activator node after dragging ends, as the original `event.target` that instantiated the sensor may no longer be mounted in the DOM or associated with the draggable node that was previously active.

  #### Automatically restoring focus

  Focus management is now automatically handled by @dnd-kit. When the activator event is a Keyboard event, @dnd-kit will now attempt to automatically restore focus back to the first focusable node of the activator node or draggable node.

  If no activator node is specified via the `setActivatorNodeRef` setter function of `useDraggble` and `useSortable`, @dnd-kit will automatically restore focus on the first focusable node of the draggable node set via the `setNodeRef` setter function of `useDraggable` and `useSortable`.

  If you were previously managing focus manually and would like to opt-out of automatic focus management, use the newly introduced `restoreFocus` property of the `accessibility` prop of `<DndContext>`:

  ```diff
  <DndContext
    accessibility={{
  +   restoreFocus: false
    }}
  ```

- [#751](https://github.com/clauderic/dnd-kit/pull/751) [`a52fba1`](https://github.com/clauderic/dnd-kit/commit/a52fba1ccff8a8f40e2cb8dcc15236cfd9e8fbec) Thanks [@clauderic](https://github.com/clauderic)! - Added the `aria-disabled` attribute to the `attribtues` object returned by `useDraggable` and `useSortable`. The value of the `aria-disabled` attribute is populated based on whether or not the `disabled` argument is passed to `useDraggble` or `useSortable`.

- [#741](https://github.com/clauderic/dnd-kit/pull/741) [`40707ce`](https://github.com/clauderic/dnd-kit/commit/40707ce6f388957203d6df4ccbeef460450ffd7d) Thanks [@clauderic](https://github.com/clauderic)! - The auto scroller now keeps track of the drag direction to infer scroll intent. By default, auto-scrolling will now be disabled for a given direction if dragging in that direction hasn't occurred yet. This prevents accidental auto-scrolling when picking up a draggable item that is near the scroll boundary threshold.

- [#660](https://github.com/clauderic/dnd-kit/pull/660) [`a41e5b8`](https://github.com/clauderic/dnd-kit/commit/a41e5b8eff84f0528ffc8b3455b94b95ab60a4a9) Thanks [@clauderic](https://github.com/clauderic)! - Fixed a bug with the `delta` property returned in `onDragMove`, `onDragOver`, `onDragEnd` and `onDragCancel`. The `delta` property represents the `transform` delta since dragging was initiated, along with the scroll delta. However, due to an oversight, the `delta` property was actually returning the `transform` delta and the _current_ scroll offsets rather than the scroll _delta_.

  This same change has been made to the `scrollAdjustedTranslate` property that is exposed to sensors.

- [#750](https://github.com/clauderic/dnd-kit/pull/750) [`bf30718`](https://github.com/clauderic/dnd-kit/commit/bf30718bc22584a47053c14f5920e317ac45cd50) Thanks [@clauderic](https://github.com/clauderic)! - The `useDndMonitor()` hook has been refactored to be synchronously invoked at the same time as the events dispatched by `<DndContext>` (such as `onDragStart`, `onDragOver`, `onDragEnd`).

  The new refactor uses the subscribe/notify pattern and no longer causes re-renders in consuming components of `useDndMonitor()` when events are dispatched.

- [#660](https://github.com/clauderic/dnd-kit/pull/660) [`a41e5b8`](https://github.com/clauderic/dnd-kit/commit/a41e5b8eff84f0528ffc8b3455b94b95ab60a4a9) Thanks [@clauderic](https://github.com/clauderic)! - The `activeNodeRect` and `containerNodeRect` are now observed by a `ResizeObserver` in case they resize while dragging.

- [#660](https://github.com/clauderic/dnd-kit/pull/660) [`a41e5b8`](https://github.com/clauderic/dnd-kit/commit/a41e5b8eff84f0528ffc8b3455b94b95ab60a4a9) Thanks [@clauderic](https://github.com/clauderic)! - Improved `useDraggable` usage without `<DragOverlay>`:

  - The active draggable now scrolls with the page even if there is no `<DragOverlay>` used.
  - Fixed issues when re-ordering the active draggable node in the DOM while dragging.

- [#660](https://github.com/clauderic/dnd-kit/pull/660) [`77e3d44`](https://github.com/clauderic/dnd-kit/commit/77e3d44502383d2f9a9f9af014b053619b3e37b3) Thanks [@clauderic](https://github.com/clauderic)! - Fixed an issue with `useDroppable` hook needlessly dispatching `SetDroppableDisabled` actions even if the `disabled` property had not changed since registering the droppable.

- [#749](https://github.com/clauderic/dnd-kit/pull/749) [`188a450`](https://github.com/clauderic/dnd-kit/commit/188a4507b99d8e8fdaa50bd26deb826c86608e18) Thanks [@clauderic](https://github.com/clauderic)! - The `onDragStart`, `onDragMove`, `onDragOver`, `onDragEnd` and `onDragCancel` events of `<DndContext>` and `useDndMonitor` now expose the `activatorEvent` event that instantiated the activated sensor.

- [#733](https://github.com/clauderic/dnd-kit/pull/733) [`035021a`](https://github.com/clauderic/dnd-kit/commit/035021aac51161e2bf9715f087a6dd1b46647bfc) Thanks [@clauderic](https://github.com/clauderic)! - The `KeyboardSensor` now scrolls the focused activator draggable node into view if it is not within the viewport.

- [#733](https://github.com/clauderic/dnd-kit/pull/733) [`035021a`](https://github.com/clauderic/dnd-kit/commit/035021aac51161e2bf9715f087a6dd1b46647bfc) Thanks [@clauderic](https://github.com/clauderic)! - By default, @dnd-kit now attempts to compensate for layout shifts that happen right after the `onDragStart` event is dispatched by scrolling the first scrollable ancestor of the active draggable node.

  The `autoScroll` prop of `<DndContext>` now optionally accepts a `layoutShiftCompensation` property to control this new behavior:

  ```diff
  interface AutoScrollOptions {
    acceleration?: number;
    activator?: AutoScrollActivator;
    canScroll?: CanScroll;
    enabled?: boolean;
    interval?: number;
  + layoutShiftCompensation?: boolean | {x: boolean, y: boolean};
    order?: TraversalOrder;
    threshold?: {
      x: number;
      y: number;
    };
  }
  ```

  To enable/disable layout shift scroll compensation for a single scroll axis, pass in the following autoscroll configuration to `<DndContext>`:

  ```ts
  <DndContext
    autoScroll={{layoutShiftCompensation: {x: false, y: true}}}
  >
  ```

  To completely disable layout shift scroll compensation, pass in the following autoscroll configuration to `<DndContext>`:

  ```ts
  <DndContext
    autoScroll={{layoutShiftCompensation: false}}
  >
  ```

- [#672](https://github.com/clauderic/dnd-kit/pull/672) [`10f6836`](https://github.com/clauderic/dnd-kit/commit/10f683631103b1d919f2fbca1177141b9369d2cf) Thanks [@clauderic](https://github.com/clauderic)! - The `measureDroppableContainers` method now properly respects the MeasuringStrategy defined on `<DndContext />` and will not measure containers while measuring is disabled.

- [#656](https://github.com/clauderic/dnd-kit/pull/656) [`c1b3b5a`](https://github.com/clauderic/dnd-kit/commit/c1b3b5a0be5759b707e22c4e1b1236aaa82773a2) Thanks [@clauderic](https://github.com/clauderic)! - Fixed an issue with collision detection using stale rects. The `droppableRects` property has been added to the `CollisionDetection` interface.

  All built-in collision detection algorithms have been updated to get the rect for a given droppable container from `droppableRects` rather than from the `rect.current` ref:

  ```diff
  - const rect = droppableContainers.get(id).rect.current;
  + const rect = droppableRects.get(id);
  ```

  The `rect.current` ref stored on DroppableContainers can be stale if measuring is scheduled but has not completed yet. Collision detection algorithms should use the `droppableRects` map instead to get the latest, most up-to-date measurement of a droppable container in order to avoid computing collisions against stale rects.

  This is not a breaking change. However, if you've forked any of the built-in collision detection algorithms or you've authored custom ones, we highly recommend you update your use-cases to avoid possibly computing collisions against stale rects.

### Patch Changes

- [#742](https://github.com/clauderic/dnd-kit/pull/742) [`7161f70`](https://github.com/clauderic/dnd-kit/commit/7161f702c9fe06f8dafa6449d48b918070ca46fb) Thanks [@clauderic](https://github.com/clauderic)! - Fallback to initial rect measured for the active draggable node if it unmounts during initialization (after `onDragStart` is dispatched).

- [#749](https://github.com/clauderic/dnd-kit/pull/749) [`5811986`](https://github.com/clauderic/dnd-kit/commit/5811986e7544a5e80039870a015e38df805eaad1) Thanks [@clauderic](https://github.com/clauderic)! - The `Data` and `DataRef` types are now exported by `@dnd-kit/core`.

- [#699](https://github.com/clauderic/dnd-kit/pull/699) [`e302bd4`](https://github.com/clauderic/dnd-kit/commit/e302bd4488bdfb6735c97ac42c1f4a0b1e8bfdf9) Thanks [@JuAn-Kang](https://github.com/JuAn-Kang)! - Export `DragOverlayProps` for consumers.

- [`750d726`](https://github.com/clauderic/dnd-kit/commit/750d72655922363b2218d7b41e028f9dceaef013) Thanks [@clauderic](https://github.com/clauderic)! - Fixed a bug in the `KeyboardSensor` where it would not move the draggable on the horizontal axis if it could fully scroll to the new vertical coordinates, and would not move the draggable on the vertical axis if it could fully scroll to the new horizontal coordinates.

- [#660](https://github.com/clauderic/dnd-kit/pull/660) [`e6e242c`](https://github.com/clauderic/dnd-kit/commit/e6e242cbc718ed687a26f5c622eeed4dbd6c2425) Thanks [@clauderic](https://github.com/clauderic)! - The `KeyboardSensor` was updated to use `scrollTo` instead of `scrollBy` when it is able to fully scroll to the new coordinates returned by the coordinate getter function. This resolves issues that can happen with `scrollBy` when called in rapid succession.

- Updated dependencies [[`59ca82b`](https://github.com/clauderic/dnd-kit/commit/59ca82b9f228f34c7731ece87aef5d9633608b57), [`035021a`](https://github.com/clauderic/dnd-kit/commit/035021aac51161e2bf9715f087a6dd1b46647bfc)]:
  - @dnd-kit/utilities@3.2.0

## 5.0.3

### Patch Changes

- [#650](https://github.com/clauderic/dnd-kit/pull/650) [`2439aae`](https://github.com/clauderic/dnd-kit/commit/2439aaea86fad793f0da75e2319e174a27142658) Thanks [@clauderic](https://github.com/clauderic)! - - Fixed React warning in development when unmounting a component that uses the `useDraggable` hook by ensuring that the `ResizeObserver` is disconnected in a cleanup effect.

## 5.0.2

### Patch Changes

- [#646](https://github.com/clauderic/dnd-kit/pull/646) [`b3b185d`](https://github.com/clauderic/dnd-kit/commit/b3b185dc675b61fe2e3d1a8462728c81c3150b99) Thanks [@lukesmurray](https://github.com/lukesmurray)! - Export `DraggableAttributes` interface for consumers to use when interfacing with `useDraggable` hook.

## 5.0.1

### Patch Changes

- [#573](https://github.com/clauderic/dnd-kit/pull/573) [`cee1d88`](https://github.com/clauderic/dnd-kit/commit/cee1d88a35fd8a412bbc30d9e375d674a10ee485) Thanks [@clauderic](https://github.com/clauderic)! - Only use `ResizeObserver` in `useDroppable` and `<DragOverlay>` if it is available in the execution environment.

## 5.0.0

### Major Changes

- [#558](https://github.com/clauderic/dnd-kit/pull/558) [`f3ad20d`](https://github.com/clauderic/dnd-kit/commit/f3ad20d5b2c2f2ca7b82c193c9af5eef38c5ce11) Thanks [@clauderic](https://github.com/clauderic)! - Refactor of the `CollisionDetection` interface to return an array of `Collision`s:

  ```diff
  +export interface Collision {
  +  id: UniqueIdentifier;
  +  data?: Record<string, any>;
  +}

  export type CollisionDetection = (args: {
    active: Active;
    collisionRect: ClientRect;
    droppableContainers: DroppableContainer[];
    pointerCoordinates: Coordinates | null;
  -}) => UniqueIdentifier;
  +}) => Collision[];
  ```

  This is a breaking change that requires all collision detection strategies to be updated to return an array of `Collision` rather than a single `UniqueIdentifier`

  The `over` property remains a single `UniqueIdentifier`, and is set to the first item in returned in the collisions array.

  Consumers can also access the `collisions` property which can be used to implement use-cases such as combining droppables in user-land.

  The `onDragMove`, `onDragOver` and `onDragEnd` callbacks are also updated to receive the collisions array property.

  Built-in collision detections such as rectIntersection, closestCenter, closestCorners and pointerWithin adhere to the CollisionDescriptor interface, which extends the Collision interface:

  ```ts
  export interface CollisionDescriptor extends Collision {
    data: {
      droppableContainer: DroppableContainer;
      value: number;
      [key: string]: any;
    };
  }
  ```

  Consumers can also access the array of collisions in components wrapped by `<DndContext>` via the `useDndContext()` hook:

  ```ts
  import {useDndContext} from '@dnd-kit/core';

  function MyComponent() {
    const {collisions} = useDndContext();
  }
  ```

- [#561](https://github.com/clauderic/dnd-kit/pull/561) [`02edd26`](https://github.com/clauderic/dnd-kit/commit/02edd2691b24bb49f2e7c9f9a3f282031bf658b7) Thanks [@clauderic](https://github.com/clauderic)! - Droppable containers now observe the node they are attached to via `setNodeRef` using `ResizeObserver` while dragging.

  This behaviour can be configured using the newly introduced `resizeObserverConfig` property.

  ```ts
  interface ResizeObserverConfig {
    /** Whether the ResizeObserver should be disabled entirely */
    disabled?: boolean;
    /** Resize events may affect the layout and position of other droppable containers.
     * Specify an array of `UniqueIdentifier` of droppable containers that should also be re-measured
     * when this droppable container resizes. Specifying an empty array re-measures all droppable containers.
     */
    updateMeasurementsFor?: UniqueIdentifier[];
    /** Represents the debounce timeout between when resize events are observed and when elements are re-measured */
    timeout?: number;
  }
  ```

  By default, only the current droppable is scheduled to be re-measured when a resize event is observed. However, this may not be suitable for all use-cases. When an element resizes, it can affect the layout and position of other elements, such that it may be necessary to re-measure other droppable nodes in response to that single resize event. The `recomputeIds` property can be used to specify which droppable `id`s should be re-measured in response to resize events being observed.

  For example, the `useSortable` preset re-computes the measurements of all sortable elements after the element that resizes, so long as they are within the same `SortableContext` as the element that resizes, since it's highly likely that their layout will also shift.

  Specifying an empty array for `recomputeIds` forces all droppable containers to be re-measured.

  For consumers that were relyings on the internals of `DndContext` using `useDndContext()`, the `willRecomputeLayouts` property has been renamed to `measuringScheduled`, and the `recomputeLayouts` method has been renamed to `measureDroppableContainers`, and now optionally accepts an array of droppable `UniqueIdentifier` that should be scheduled to be re-measured.

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

- [#569](https://github.com/clauderic/dnd-kit/pull/569) [`e7ac3d4`](https://github.com/clauderic/dnd-kit/commit/e7ac3d45699dcc7b47191a67044a516929ac439c) Thanks [@clauderic](https://github.com/clauderic)! - Separated context into public and internal context providers. Certain properties that used to be available on the public `DndContextDescriptor` interface have been moved to the internal context provider and are no longer exposed to consumers:

  ```ts
  interface DndContextDescriptor {
  -  dispatch: React.Dispatch<Actions>;
  -  activators: SyntheticListeners;
  -  ariaDescribedById: {
  -    draggable: UniqueIdentifier;
  -  };
  }
  ```

  Having two distinct context providers will allow to keep certain internals such as `dispatch` hidden from consumers.

  It also serves as an optimization until context selectors are implemented in React, properties that change often, such as the droppable containers and droppable rects, the transform value and array of collisions should be stored on a different context provider to limit un-necessary re-renders in `useDraggable`, `useDroppable` and `useSortable`.

  The `<InternalContext.Provider>` is also reset to its default values within `<DragOverlay>`. This paves the way towards being able to seamlessly use components that use hooks such as `useDraggable` and `useDroppable` as children of `<DragOverlay>` without causing interference or namespace collisions.

  Consumers can still make calls to `useDndContext()` to get the `active` or `over` properties if they wish to re-render the component rendered within `DragOverlay` in response to user interaction, since those use the `PublicContext`

### Minor Changes

- [#556](https://github.com/clauderic/dnd-kit/pull/556) [`c6c67cb`](https://github.com/clauderic/dnd-kit/commit/c6c67cb9cbc6e61027f7bb084fd2232160037d5e) Thanks [@avgrad](https://github.com/avgrad)! - - Added pointer coordinates to collision detection
  - Added `pointerWithin` collision algorithm

### Patch Changes

- Updated dependencies [[`6310227`](https://github.com/clauderic/dnd-kit/commit/63102272d0d63dae349e2e9f638277e16a7d5970), [`528c67e`](https://github.com/clauderic/dnd-kit/commit/528c67e4c617dfc0ce5221496aa8b222ffc82ddb), [`02edd26`](https://github.com/clauderic/dnd-kit/commit/02edd2691b24bb49f2e7c9f9a3f282031bf658b7)]:
  - @dnd-kit/utilities@3.1.0

## 4.0.3

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

- Updated dependencies [[`1c6369e`](https://github.com/clauderic/dnd-kit/commit/1c6369e24ff338760adfb806c3017c72f3194726)]:
  - @dnd-kit/utilities@3.0.1

## 4.0.2

### Patch Changes

- [#504](https://github.com/clauderic/dnd-kit/pull/504) [`d973cc6`](https://github.com/clauderic/dnd-kit/commit/d973cc6f5aaca8a01e6da4a958164eb623c4ce9d) Thanks [@clauderic](https://github.com/clauderic)! - Sensors that extend the `AbstractPointerSensor` now prevent [HTML Drag and Drop API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API) events from being triggered while the sensor is activated.

## 4.0.1

### Patch Changes

- [#479](https://github.com/clauderic/dnd-kit/pull/479) [`5ec3310`](https://github.com/clauderic/dnd-kit/commit/5ec331048e5913b4e4b6c096215ed4920cbd0607) Thanks [@mdrobny](https://github.com/mdrobny)! - fix: bind `handleCancel` handler in AbstractPointerSensor to current execution context (`this`).

## 4.0.0

### Major Changes

- [#337](https://github.com/clauderic/dnd-kit/pull/337) [`05d6a78`](https://github.com/clauderic/dnd-kit/commit/05d6a78a17cbaacd8dffed685dfea5a6ea3d38a8) Thanks [@clauderic](https://github.com/clauderic)! - React updates in non-synthetic event handlers are now batched to reduce re-renders and prepare for React 18.

  Also fixed issues with collision detection:

  - Defer measurement of droppable node rects until second render after dragging.
  - Use DragOverlay's width and height in collision rect (if it is used)

- [#427](https://github.com/clauderic/dnd-kit/pull/427) [`f96cb5d`](https://github.com/clauderic/dnd-kit/commit/f96cb5d5e45a1000104892244201a70cbe8e6553) Thanks [@clauderic](https://github.com/clauderic)! - - Using transform-agnostic measurements for the DragOverlay node.

  - Renamed the `overlayNode` property to `dragOverlay` on the `DndContextDescriptor` interface.

- [#372](https://github.com/clauderic/dnd-kit/pull/372) [`dbc9601`](https://github.com/clauderic/dnd-kit/commit/dbc9601c922e1d6944a63f66ee647f203abee595) Thanks [@clauderic](https://github.com/clauderic)! - Refactored `DroppableContainers` type from `Record<UniqueIdentifier, DroppableContainer` to a custom instance that extends the [`Map` constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) and adds a few other methods such as `toArray()`, `getEnabled()` and `getNodeFor(id)`.

  A unique `key` property was also added to the `DraggableNode` and `DroppableContainer` interfaces. This prevents potential race conditions in the mount and cleanup effects of `useDraggable` and `useDroppable`. It's possible for the clean-up effect to run after another React component using `useDraggable` or `useDroppable` mounts, which causes the newly mounted element to accidentally be un-registered.

- [#379](https://github.com/clauderic/dnd-kit/pull/379) [`8d70540`](https://github.com/clauderic/dnd-kit/commit/8d70540771d1455c326310b438a198d2516e1d04) Thanks [@clauderic](https://github.com/clauderic)! - The `layoutMeasuring` prop of `DndContext` has been renamed to `measuring`.

  The options that could previously be passed to the `layoutMeasuring` prop now need to be passed as:

  ```diff
  <DndContext
  - layoutMeasuring={options}
  + measuring={{
  +   droppable: options
  + }}
  ```

  The `LayoutMeasuring` type has been renamed to `MeasuringConfiguration`. The `LayoutMeasuringStrategy` and `LayoutMeasuringFrequency` enums have also been renamed to `MeasuringStrategy` and `MeasuringFrequency`.

  This refactor allows consumers to configure how to measure both droppable and draggable nodes. By default, `@dnd-kit` ignores transforms when measuring draggable nodes. This beahviour can now be configured:

  ```tsx
  import {
    DndContext,
    getBoundingClientRect,
    MeasuringConfiguration,
  } from '@dnd-kit/core';

  const measuringConfig: MeasuringConfiguration = {
    draggable: {
      measure: getBoundingClientRect,
    },
  };

  function App() {
    return <DndContext measuring={measuringConfig} />;
  }
  ```

- [#350](https://github.com/clauderic/dnd-kit/pull/350) [`a13dbb6`](https://github.com/clauderic/dnd-kit/commit/a13dbb66586edbf2998c7b251e236604255fd227) Thanks [@wmain](https://github.com/wmain)! - Breaking change: The `CollisionDetection` interface has been refactored. It now receives an object that contains the `active` draggable node, along with the `collisionRect` and an array of `droppableContainers`.

  If you've built custom collision detection algorithms, you'll need to update them. Refer to [this PR](https://github.com/clauderic/dnd-kit/pull/350) for examples of how to refactor collision detection functions to the new `CollisionDetection` interface.

  The `sortableKeyboardCoordinates` method has also been updated since it relies on the `closestCorners` collision detection algorithm. If you were using collision detection strategies in a custom `sortableKeyboardCoordinates` method, you'll need to update those as well.

### Minor Changes

- [#334](https://github.com/clauderic/dnd-kit/pull/334) [`13be602`](https://github.com/clauderic/dnd-kit/commit/13be602229c6d5723b3ae98bca7b8f45f0773366) Thanks [@trentmwillis](https://github.com/trentmwillis)! - Now passing `activatorEvent` as an argument to `modifiers`

- [#376](https://github.com/clauderic/dnd-kit/pull/376) [`aede2cc`](https://github.com/clauderic/dnd-kit/commit/aede2cc42d488435cf65f19b63ba6bb7702b3fde) Thanks [@clauderic](https://github.com/clauderic)! - Mouse, Pointer, Touch sensors now cancel dragging on [visibility change](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event) and [window resize](https://developer.mozilla.org/en-US/docs/Web/API/Window/resize_event). The Keyboard sensor already cancelled dragging on window resize. It now also cancels dragging on visibility change.

- [#399](https://github.com/clauderic/dnd-kit/pull/399) [`a32a4c5`](https://github.com/clauderic/dnd-kit/commit/a32a4c5f6228b9f03bf460b8403a38b8c3de493f) Thanks [@supersebh](https://github.com/supersebh)! - Added support for `tolerance` in DistanceConstrain. As soon as the `tolerance` is exceeded, the drag operation will be aborted, unless it has already started (because distance criteria was met).

  Example usage:

  ```
  // Require the pointer be moved by 10 pixels vertically to initiate drag operation
  // Abort if the pointer is moved by more than 5 pixels horizontally.
  {
    distance: {y: 10},
    tolerance: {x: 5},
  }
  ```

  Be careful not to pick conflicting settings for distance and tolerance if used together. For example, picking a tolerance that is lower than the distance in the same axis would result in the activation constraint never being met.

- [#408](https://github.com/clauderic/dnd-kit/pull/408) [`dea715c`](https://github.com/clauderic/dnd-kit/commit/dea715c342b2d998a9f1562cacb5e70c77562c92) Thanks [@wmain](https://github.com/wmain)! - The collision rect is now completely based on the position of the `DragOverlay` when it is used. Previously, only the `width` and `height` properties of the `DragOverlay` were used for the collision rect, while the `top`, `left`, `bottom` and `right` properties were derived from the active node rect. This new approach is more aligned with developers would expect, but could cause issues for consumers that were relying on the previous (incorrect) behavior.

- [#433](https://github.com/clauderic/dnd-kit/pull/433) [`c447880`](https://github.com/clauderic/dnd-kit/commit/c447880656b6bee2915d5a5f01d3ddfbd5705fa2) Thanks [@clauderic](https://github.com/clauderic)! - Fix unwanted animations when items in sortable context change

- [#415](https://github.com/clauderic/dnd-kit/pull/415) [`2ba6dfe`](https://github.com/clauderic/dnd-kit/commit/2ba6dfe6b080b90b13aa8d9eb07331515a0d2faa) Thanks [@cantrellnm](https://github.com/cantrellnm)! - Prevent `getScrollableAncestors` from continuing to search if a fixed position node is found.

- [#377](https://github.com/clauderic/dnd-kit/pull/377) [`422d083`](https://github.com/clauderic/dnd-kit/commit/422d0831173a893099ba924bf7bbc465640fc15d) Thanks [@clauderic](https://github.com/clauderic)! - Pointer, Mouse and Touch sensors now stop propagation of click events once activation constraints are met.

- [#375](https://github.com/clauderic/dnd-kit/pull/375) [`c4b21b4`](https://github.com/clauderic/dnd-kit/commit/c4b21b4ee17cba31c10928eb227848026f54222a) Thanks [@clauderic](https://github.com/clauderic)! - Prevent context menu from opening when pointer sensor is active

- [`5a41340`](https://github.com/clauderic/dnd-kit/commit/5a41340e6561c3784da2a9266e1b852ba370918c) Thanks [@clauderic](https://github.com/clauderic)! - Pointer, Mouse and Touch sensors now prevent selection changes and clear any existing selection ranges once activation constraints are met.

- [`e2ee0dc`](https://github.com/clauderic/dnd-kit/commit/e2ee0dccb12794c419587019defddfd82ba5d297) Thanks [@clauderic](https://github.com/clauderic)! - Reset the `over` internal state of `<DndContext />` on drop.

- [`1fe9b5c`](https://github.com/clauderic/dnd-kit/commit/1fe9b5c9d34237aae6ab22d54478c419d44a079a) Thanks [@clauderic](https://github.com/clauderic)! - Sensors may now specify a static `setup` method that will be invoked when `<DndContext>` mounts. The setup method may optionally also return a teardown function that will be invoked when the `<DndContext>` associated with that sensor unmounts.

### Patch Changes

- [#430](https://github.com/clauderic/dnd-kit/pull/430) [`46ec5e4`](https://github.com/clauderic/dnd-kit/commit/46ec5e4c6e3ca9fa849666f90fef426b3c465cf0) Thanks [@clauderic](https://github.com/clauderic)! - Fix duplicate scroll ancestor detection. In some scenarios, an element could be added twice to the list of detected scrollable ancestors, resulting in invalid offsets.

- [#371](https://github.com/clauderic/dnd-kit/pull/371) [`7006464`](https://github.com/clauderic/dnd-kit/commit/700646468683e4820269534c6352cca93bb5a987) Thanks [@clauderic](https://github.com/clauderic)! - fix: do not wrap consumer-defined handlers in batchedUpdates

- [`1fe9b5c`](https://github.com/clauderic/dnd-kit/commit/1fe9b5c9d34237aae6ab22d54478c419d44a079a) Thanks [@clauderic](https://github.com/clauderic)! - The TouchSensor attempts to prevent the default browser behavior of scrolling the page by calling `event.preventDefault()` in the `touchmove` event listener. This wasn't working in iOS Safari due to a bug with dynamically attached `touchmove` event listeners. Adding a non-passive, non-capture `touchmove` event listener before dynamically attaching other `touchmove` event listeners solves the issue.

- Updated dependencies [[`0e628bc`](https://github.com/clauderic/dnd-kit/commit/0e628bce53fb1a7223cdedd203cb07b6e62e5ec1), [`13be602`](https://github.com/clauderic/dnd-kit/commit/13be602229c6d5723b3ae98bca7b8f45f0773366), [`1f5ca27`](https://github.com/clauderic/dnd-kit/commit/1f5ca27b17879861c2c545160c2046a747544846)]:
  - @dnd-kit/utilities@3.0.0

## 3.1.1

### Patch Changes

- [`dbe0087`](https://github.com/clauderic/dnd-kit/commit/dbe008787492acd7e4dae85a79fd134a7951292e) [#335](https://github.com/clauderic/dnd-kit/pull/335) Thanks [@clauderic](https://github.com/clauderic)! - Fix `getEventListenerTarget` when target element is not an instance of `HTMLElement`

- [`5d4d292`](https://github.com/clauderic/dnd-kit/commit/5d4d2922e0a6c2433049268d5db40fadd13823a3) [#331](https://github.com/clauderic/dnd-kit/pull/331) Thanks [@phungleson](https://github.com/phungleson)! - Fix typo in `SensorContext` type (`scrollAdjustedTransalte` --> `scrollAdjustedTranslate`)

## 3.1.0

### Minor Changes

- [`d39ab11`](https://github.com/clauderic/dnd-kit/commit/d39ab1112f9be78d467b2dfe488a7ea931d93767) [#316](https://github.com/clauderic/dnd-kit/pull/316) Thanks [@lsit](https://github.com/lsit)! - Added ability to optionally return screen reader announcements `onDragMove`.

## 3.0.4

### Patch Changes

- [`ae398de`](https://github.com/clauderic/dnd-kit/commit/ae398de012aee28f5e3bec10b438153d00f65630) Thanks [@clauderic](https://github.com/clauderic)! - Allow setting an optional `id` prop on `DndContext` to fix a warning during server-side rendering (especially in Next.js). By default, this `id` is autogenerated and can lead to a mismatch between the server- and client-side rendered HTML. We also avoid this mismatch by rendering the `Accessibility` component only after everything else was initially mounted on the client.

- [`8b938ce`](https://github.com/clauderic/dnd-kit/commit/8b938ceb158c67e9fdc4616351d1a3291ac614c3) Thanks [@clauderic](https://github.com/clauderic)! - Hide the node in the overlay after the drop animation is finished. This prevents some flickering with React concurrent mode.

## 3.0.3

### Patch Changes

- [`0ff788e`](https://github.com/clauderic/dnd-kit/commit/0ff788e78f5853bf33673881e5759fa844f69ec3) [#246](https://github.com/clauderic/dnd-kit/pull/246) Thanks [@inokawa](https://github.com/inokawa)! - `DragOverlay` component now passes down `style` prop to the wrapper element it renders.

## 3.0.2

### Patch Changes

- [`54c8778`](https://github.com/clauderic/dnd-kit/commit/54c877875cf7ec6d4367ca11ce216cc3eb6475d2) [#225](https://github.com/clauderic/dnd-kit/pull/225) Thanks [@clauderic](https://github.com/clauderic)! - Updated the `active` rects type to `ViewRect` (was previously incorrectly typed as `LayoutRect`)

- [`2ee96a5`](https://github.com/clauderic/dnd-kit/commit/2ee96a5c400aae52ed3c78192097e60da8c42a8d) [#243](https://github.com/clauderic/dnd-kit/pull/243) Thanks [@py-wai](https://github.com/py-wai)! - Update regex used in isScrollable, to consider element with overflow: overlay as a scrollable element.

## 3.0.1

### Patch Changes

- [`f9ec28f`](https://github.com/clauderic/dnd-kit/commit/f9ec28fed77778669f93cfecee159dba54db38b4) [#217](https://github.com/clauderic/dnd-kit/pull/217) Thanks [@clauderic](https://github.com/clauderic)! - Fixes a regression introduced with `@dnd-kit/core@3.0.0` that was causeing sensors to stop working after a drag operation where activation constraints were not met.

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

### Minor Changes

- [`b7355d1`](https://github.com/clauderic/dnd-kit/commit/b7355d19d9e15bb1972627bb622c2487ddec82ad) [#207](https://github.com/clauderic/dnd-kit/pull/207) Thanks [@clauderic](https://github.com/clauderic)! - The `data` argument for `useDraggable` and `useDroppable` is now exposed in event handlers and on the `active` and `over` objects.

  **Example usage:**

  ```tsx
  import {DndContext, useDraggable, useDroppable} from '@dnd-kit/core';

  function Draggable() {
    const {attributes, listeners, setNodeRef, transform} = useDraggable({
      id: 'draggable',
      data: {
        type: 'type1',
      },
    });

    /* ... */
  }

  function Droppable() {
    const {setNodeRef} = useDroppable({
      id: 'droppable',
      data: {
        accepts: ['type1', 'type2'],
      },
    });

    /* ... */
  }

  function App() {
    return (
      <DndContext
        onDragEnd={({active, over}) => {
          if (over?.data.current.accepts.includes(active.data.current.type)) {
            // do stuff
          }
        }}
      />
    );
  }
  ```

### Patch Changes

- Updated dependencies [[`a9d92cf`](https://github.com/clauderic/dnd-kit/commit/a9d92cf1fa35dd957e6c5915a13dfd2af134c103), [`b406cb9`](https://github.com/clauderic/dnd-kit/commit/b406cb9251beef8677d05c45ec42bab7581a86dc)]:
  - @dnd-kit/accessibility@3.0.0
  - @dnd-kit/utilities@2.0.0

## 2.1.2

### Patch Changes

- [`2833337`](https://github.com/clauderic/dnd-kit/commit/2833337043719853902c3989dfcd5b55ae9ddc73) [#186](https://github.com/clauderic/dnd-kit/pull/186) Thanks [@clauderic](https://github.com/clauderic)! - Simplify `useAnnouncement` hook to only return a single `announcement` rather than `entries`. Similarly, the `LiveRegion` component now only accepts a single `announcement` rather than `entries.

  - The current strategy used in the useAnnouncement hook is needlessly complex. It's not actually necessary to render multiple announcements at once within the LiveRegion component. It's sufficient to render a single announcement at a time. It's also un-necessary to clean up the announcements after they have been announced, especially now that the role="status" attribute has been added to LiveRegion, keeping the last announcement rendered means users can refer to the last status.

- Updated dependencies [[`c24bdb3`](https://github.com/clauderic/dnd-kit/commit/c24bdb3723f1e3e4c474439f837a19c6d48059fb), [`2833337`](https://github.com/clauderic/dnd-kit/commit/2833337043719853902c3989dfcd5b55ae9ddc73)]:
  - @dnd-kit/accessibility@2.0.0

## 2.1.1

### Patch Changes

- [`cc0a6ff`](https://github.com/clauderic/dnd-kit/commit/cc0a6ff310582ee4c02dd8320d86bf1c2d281d30) [#177](https://github.com/clauderic/dnd-kit/pull/177) Thanks [@FinestV](https://github.com/FinestV)! - fix calculations for top and left auto scroll speed

## 2.1.0

### Minor Changes

- [`bdb1aa2`](https://github.com/clauderic/dnd-kit/commit/bdb1aa2b62f855a4ccd048d452d4dd93529af563) [#171](https://github.com/clauderic/dnd-kit/pull/171) Thanks [@mitchheddles](https://github.com/mitchheddles)! - Added more flexibility for the `distance` and `tolerance` activation constraints. Consumers can still provide a `number` to calculate the distance or tolerance constraints, but can now also pass in an object that adheres to the `DistanceMeasurement` interface instead. This change allows consumers to specify which axis the activation distance or tolerance should be measured against, either `x`, `y` or both.

  ```
  type DistanceMeasurement =
    | number
    | {x: number}
    | {y: number}
    | {x: number, y: number}

  interface DistanceConstraint {
    distance: DistanceMeasurement;
  }

  interface DelayConstraint {
    delay: number;
    tolerance: DistanceMeasurement;
  }
  ```

  **Example usage:**

  For example, when building a list that can only be sorted vertically when using the `restrictToVerticalAxis` modifier, a consumer can now configure sensors to only measure distance against the `y` axis when using the `MouseSensor`, and afford more tolerance on the `y` axis than the `x` axis for the `TouchSensor`:

  ```
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: { y: 10 },
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: { y: 15, x: 5 },
      },
    }),
  );
  ```

  This also fixes a bug with the way the distance is calculated when passing a number to the `distance` or `tolerance` options. Previously, the sum of the distance on both the `x` and `y` axis was being calculated rather than the hypothenuse.

## 2.0.2

### Patch Changes

- [`f038174`](https://github.com/clauderic/dnd-kit/commit/f038174c2096ae287ffa6a5fab9dda09a0f76016) [#166](https://github.com/clauderic/dnd-kit/pull/166) Thanks [@shayc](https://github.com/shayc)! - AutoScrollActivator enum was being exported as a type rather than a value.

- [`7422e25`](https://github.com/clauderic/dnd-kit/commit/7422e25c069fa2a28d56a57d1e7bc1f761efb971) [#165](https://github.com/clauderic/dnd-kit/pull/165) Thanks [@clauderic](https://github.com/clauderic)! - Fix regression with autoscroll disabling by sensors

## 2.0.1

### Patch Changes

- [`a847a80`](https://github.com/clauderic/dnd-kit/commit/a847a800400a392ad4653199b6705dd687703d01) [#160](https://github.com/clauderic/dnd-kit/pull/160) Thanks [@clauderic](https://github.com/clauderic)! - Allow consumers to define drag source opacity in drop animation by setting the `dragSourceOpacity` option to a number on the `dropAnimation` prop of `DragOverlay`.

- [`ea9d878`](https://github.com/clauderic/dnd-kit/commit/ea9d878e7c1bd8b46482ee4b82a39f744db027b9) [#164](https://github.com/clauderic/dnd-kit/pull/164) Thanks [@clauderic](https://github.com/clauderic)! - Export AutoScrollActivator enum for consumers.

## 2.0.0

### Major Changes

- [`8583825`](https://github.com/clauderic/dnd-kit/commit/8583825380bc4d7c36e076be30bb5ca3fd20a26b) [#140](https://github.com/clauderic/dnd-kit/pull/140) Thanks [@clauderic](https://github.com/clauderic)! - Auto-scrolling defaults have been updated, which should generally lead to improved user experience for most consumers.

  The auto-scroller now bases its calculations based on the position of the pointer rather than the edges of the draggable element's rect by default. This change is aligned with how the native HTML 5 Drag & Drop auto-scrolling behaves.

  This behaviour can be customized using the `activator` option of the `autoScroll` prop:

  ```tsx
  import {AutoScrollActivator, DndContext} from '@dnd-kit/core';

  <DndContext autoScroll={{activator: AutoScrollActivator.DraggableRect}} />;
  ```

  The auto-scroller now also looks at scrollable ancestors in order of appearance in the DOM tree, meaning it will first attempt to scroll the window, and narrow its focus down rather than the old behaviour of looking at scrollable ancestors in order of closeness to the draggable element in the DOM tree (reversed tree order).

  This generally leads to an improved user experience, but can be customized by passing a configuration object to the `autoScroll` prop that sets the `order` option to `TraversalOrder.ReversedTreeOrder` instead of the new default value of `TraversalOrder.TreeOrder`:

  ```tsx
  import {DndContext, TraversalOrder} from '@dnd-kit/core';

  <DndContext autoScroll={{order: TraversalOrder.ReversedTreeOrder}} />;
  ```

  The autoscrolling `thresholds`, `acceleration` and `interval` can now also be customized using the `autoScroll` prop:

  ```tsx
  import {DndContext} from '@dnd-kit/core';

  <DndContext
    autoScroll={{
      thresholds: {
        // Left and right 10% of the scroll container activate scrolling
        x: 0.1,
        // Top and bottom 25% of the scroll container activate scrolling
        y: 0.25,
      },
      // Accelerate slower than the default value (10)
      acceleration: 5,
      // Auto-scroll every 10ms instead of the default value of 5ms
      interval: 10,
    }}
  />;
  ```

  Finally, consumers can now conditionally opt out of scrolling certain scrollable ancestors using the `canScroll` option of the `autoScroll` prop:

  ```tsx
  import {DndContext} from '@dnd-kit/core';

  <DndContext
    autoScroll={{
      canScroll(element) {
        if (element === document.scrollingElement) {
          return false;
        }

        return true;
      },
    }}
  />;
  ```

## 1.2.0

### Minor Changes

- [`79f6088`](https://github.com/clauderic/dnd-kit/commit/79f6088dab2d4e7443743f85b329a25a023ecd87) [#144](https://github.com/clauderic/dnd-kit/pull/144) Thanks [@clauderic](https://github.com/clauderic)! - Allow consumers to determine whether to animate layout changes and when to measure nodes. Consumers can now use the `animateLayoutChanges` prop of `useSortable` to determine whether layout animations should occur. Consumers can now also decide when to measure layouts, and at what frequency using the `layoutMeasuring` prop of `DndContext`. By default, `DndContext` will measure layouts just-in-time after sorting has begun. Consumers can override this behaviour to either only measure before dragging begins (on mount and after dragging), or always (on mount, before dragging, after dragging). Pairing the `layoutMeasuring` prop on `DndContext` and the `animateLayoutChanges` prop of `useSortable` opens up a number of new possibilities for consumers, such as animating insertion and removal of items in a sortable list.

- [`a76cd5a`](https://github.com/clauderic/dnd-kit/commit/a76cd5abcc0b17eae20d4a6256d95b47f2e9d050) [#136](https://github.com/clauderic/dnd-kit/pull/136) Thanks [@clauderic](https://github.com/clauderic)! - Added `onActivation` option to sensors. Delegated the responsibility of calling `event.preventDefault()` on activation to consumers, as consumers have the most context to decide whether it is appropriate or not to prevent the default browser behaviour on activation. Consumers of the sensors can prevent the default behaviour on activation using the `onActivation` option. Here is an example using the Pointer sensor: `useSensor(PointerSensor, {onActivation: (event) => event.preventDefault()})`

### Patch Changes

- [`adb7bd5`](https://github.com/clauderic/dnd-kit/commit/adb7bd58d7d95db5e450a1518541d3d71704529d) [#151](https://github.com/clauderic/dnd-kit/pull/151) Thanks [@clauderic](https://github.com/clauderic)! - `DragOverlay` now attempts to perform drop animation even if `transform.x` and `transform.y` are both zero.

## 1.1.0

### Minor Changes

- [`ac674e8`](https://github.com/clauderic/dnd-kit/commit/ac674e8e9f9e041af96034675a075cb9aa357927) [#135](https://github.com/clauderic/dnd-kit/pull/135) Thanks [@ranbena](https://github.com/ranbena)! - Added `dragCancel` prop to DndContext. The `dragCancel` prop can be used to cancel a drag operation on drop. The prop accepts a function that returns a boolean, or a promise returning a boolean once resolved. Return `false` to cancel the drop.

- [`208f68e`](https://github.com/clauderic/dnd-kit/commit/208f68e251c1b81a624f810f40e7c8d4f36f102d) [#111](https://github.com/clauderic/dnd-kit/pull/111) Thanks [@ranbena](https://github.com/ranbena)! - Keyboard sensor now cancels dragging on window resize

## 1.0.2

### Patch Changes

- [`423610c`](https://github.com/clauderic/dnd-kit/commit/423610ca48c5e5ca95545fdb5c5cfcfbd3d233ba) [#56](https://github.com/clauderic/dnd-kit/pull/56) Thanks [@clauderic](https://github.com/clauderic)! - Add MIT license to package.json and distributed files

- [`594a24e`](https://github.com/clauderic/dnd-kit/commit/594a24e61e2fb559bceab8b50a07ceeeadf86417) [#106](https://github.com/clauderic/dnd-kit/pull/106) Thanks [@ranbena](https://github.com/ranbena)! - Replace `animation.finished` with `animation.onfinish` for DragOverlay drop animation as the latter has much better support across browsers.

- [`fd25eaf`](https://github.com/clauderic/dnd-kit/commit/fd25eaf7c114f73918bf83801890d970c9b56d18) [#68](https://github.com/clauderic/dnd-kit/pull/68) Thanks [@Pustelto](https://github.com/Pustelto)! - Wrap attributes returned from useDraggable hook in useMemo to allow pure component optimization

- Updated dependencies [[`423610c`](https://github.com/clauderic/dnd-kit/commit/423610ca48c5e5ca95545fdb5c5cfcfbd3d233ba)]:
  - @dnd-kit/accessibility@1.0.2
  - @dnd-kit/utilities@1.0.2

## 1.0.1

### Patch Changes

- [`5194696`](https://github.com/clauderic/dnd-kit/commit/5194696b4b91f26379cd3e6c11b2d66c92d32c5b) [#51](https://github.com/clauderic/dnd-kit/pull/51) Thanks [@clauderic](https://github.com/clauderic)! - Fix issue with reducer initial state variable causing collisions due to variable references all pointing to the original initial state variable.

- [`310bbd6`](https://github.com/clauderic/dnd-kit/commit/310bbd6370e85f8fb16cad149e6254600a5beb3a) [#37](https://github.com/clauderic/dnd-kit/pull/37) Thanks [@nickpresta](https://github.com/nickpresta)! - Fix typo in package.json repository URL

- Updated dependencies [[`0b343c7`](https://github.com/clauderic/dnd-kit/commit/0b343c7e88a68351f8a39f643e9f26b8e046ef48), [`310bbd6`](https://github.com/clauderic/dnd-kit/commit/310bbd6370e85f8fb16cad149e6254600a5beb3a)]:
  - @dnd-kit/utilities@1.0.1
  - @dnd-kit/accessibility@1.0.1

## 1.0.0

### Major Changes

- [`2912350`](https://github.com/clauderic/dnd-kit/commit/2912350c5008c2b0edda3bae30b5075a852dea63) Thanks [@clauderic](https://github.com/clauderic)! - Initial public release.

### Patch Changes

- Updated dependencies [[`2912350`](https://github.com/clauderic/dnd-kit/commit/2912350c5008c2b0edda3bae30b5075a852dea63)]:
  - @dnd-kit/accessibility@1.0.0
  - @dnd-kit/utilities@1.0.0

## 0.1.1

### Patch Changes

- [`2bb3065`](https://github.com/clauderic/dnd-kit/commit/2bb3065abeb83ca346c080715ee8bbe093459125) Thanks [@clauderic](https://github.com/clauderic)! - No longer setting `pointer-events` to `none` for DragOverlay component as it interferes with custom cursors.

- [`bf04b2b`](https://github.com/clauderic/dnd-kit/commit/bf04b2b7736dad0be66a2c9136bf18ec0417df62) Thanks [@clauderic](https://github.com/clauderic)! - Allow nullish values to be passed to `useSensors` for conditional sensors.

## 0.1.0

### Minor Changes

- [`7bd4568`](https://github.com/clauderic/dnd-kit/commit/7bd4568e9f339552fd73a9a4c888460b11195a5e) [#30](https://github.com/clauderic/dnd-kit/pull/30) - Initial beta release, authored by [@clauderic](https://github.com/clauderic).

### Patch Changes

- Updated dependencies [[`7bd4568`](https://github.com/clauderic/dnd-kit/commit/7bd4568e9f339552fd73a9a4c888460b11195a5e)]:
  - @dnd-kit/accessibility@0.1.0
  - @dnd-kit/utilities@0.1.0
