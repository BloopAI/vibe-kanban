# @preact/signals-core

## 1.12.1

### Patch Changes

- [#747](https://github.com/preactjs/signals/pull/747) [`57bc903`](https://github.com/preactjs/signals/commit/57bc9033422b308d0e9c4204c037fd339011dd6f) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Remove internal annotation as it confused TS

## 1.12.0

### Minor Changes

- [#681](https://github.com/preactjs/signals/pull/681) [`6cc7005`](https://github.com/preactjs/signals/commit/6cc700595278d241f276c40dd0ecf162c9e432d8) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Allow for naming your singals/computeds/effects

## 1.11.0

### Minor Changes

- [#706](https://github.com/preactjs/signals/pull/706) [`4045d2d`](https://github.com/preactjs/signals/commit/4045d2d86b720546848d5163d5b683792c0a5af3) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - feat: support disposing `effect()` with resource management

  This allows `effect()`'s to be disposed with the new `using` keyword from [the explicit resource management proposal](https://github.com/tc39/proposal-explicit-resource-management).

  Whenever an effect goes out of scope the `Symbol.dispose` function is called automatically.

  ```js
  const count = signal(0);

  function doSomething() {
  	// The `using` keyword calls dispose at the end of
  	// this function scope
  	using _ = effect(() => {
  		console.log(count.value);
  		return () => console.log("disposed");
  	});

  	console.log("hey");
  }

  doSomething();
  // Logs:
  //  0
  //  hey
  //  disposed
  ```

## 1.10.0

### Minor Changes

- [#697](https://github.com/preactjs/signals/pull/697) [`5e7a167`](https://github.com/preactjs/signals/commit/5e7a167acd7bf605929a2577c9217fa834f3c115) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Publicly expose `dispose()` on an effect callback

## 1.9.0

### Minor Changes

- [#634](https://github.com/preactjs/signals/pull/634) [`62bed44`](https://github.com/preactjs/signals/commit/62bed44b0f298ac0097060289bfecd73f030b146) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Add an option to specify a watched/unwatched callback to a signal

### Patch Changes

- [#688](https://github.com/preactjs/signals/pull/688) [`587e702`](https://github.com/preactjs/signals/commit/587e702f8db9a8e67fe2cdf8dda0a4bffe5fc195) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Loosen up types for `watched` and `unwatched`

## 1.8.0

### Minor Changes

- [#587](https://github.com/preactjs/signals/pull/587) [`cd9efbb`](https://github.com/preactjs/signals/commit/cd9efbb411527e031001177f66ba90a445a04a23) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Adjust the `ReadOnlySignal` type to not inherit from `Signal`
  this way the type can't be widened without noticing, i.e. when
  we'd have

  ```js
  const sig: Signal = useComputed(() => x);
  ```

  We would have widened the type to be mutable again, which for
  a computed is not allowed. We want to provide the tools to our
  users to avoid these footguns hence we are correcting this type
  in a minor version.

## 1.7.0

### Minor Changes

- [#578](https://github.com/preactjs/signals/pull/578) [`931404e`](https://github.com/preactjs/signals/commit/931404e96338e120464b73e522148389e38eeb2b) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Allow for passing no argument to the signal and the type to be automatically inferred as `T | undefined`

## 1.6.1

### Patch Changes

- [#558](https://github.com/preactjs/signals/pull/558) [`c8c95ac`](https://github.com/preactjs/signals/commit/c8c95ac7dcbbfe8e97b251a4c3efdec82e72944b) Thanks [@jviide](https://github.com/jviide)! - Restore stricter effect callback & cleanup function types

## 1.6.0

### Minor Changes

- [#525](https://github.com/preactjs/signals/pull/525) [`cb6bdab`](https://github.com/preactjs/signals/commit/cb6bdabbd31b27f8435c7976089fa276da6bfb7a) Thanks [@jviide](https://github.com/jviide)! - Allow setting a signal value inside a computed

### Patch Changes

- [#535](https://github.com/preactjs/signals/pull/535) [`58befba`](https://github.com/preactjs/signals/commit/58befba577d02c5cac5292fda0a599f9708e908b) Thanks [@jviide](https://github.com/jviide)! - Publish packages with provenance statements

- [#529](https://github.com/preactjs/signals/pull/529) [`ec5fe42`](https://github.com/preactjs/signals/commit/ec5fe42850c5dca39da7cf6072558da51cc7fc02) Thanks [@jviide](https://github.com/jviide)! - Document effect cleanups

- [#512](https://github.com/preactjs/signals/pull/512) [`d7f2afa`](https://github.com/preactjs/signals/commit/d7f2afafd7ce0f914cf13d02f87f21ab0c26a74b) Thanks [@jviide](https://github.com/jviide)! - Always reset the evaluation context upon entering an untracked block

- [#531](https://github.com/preactjs/signals/pull/531) [`d17ed0d`](https://github.com/preactjs/signals/commit/d17ed0d2cbc6e57304fa0ed009ecf0a0537fe597) Thanks [@jviide](https://github.com/jviide)! - Add JSDocs for exported core module members

## 1.5.1

### Patch Changes

- [#451](https://github.com/preactjs/signals/pull/451) [`990f1eb`](https://github.com/preactjs/signals/commit/990f1eb36fa4ab5e30029f79ceeccf709137d14d) Thanks [@dcporter](https://github.com/dcporter)! - Removes backward-incompatible type export from signals core.

## 1.5.0

### Minor Changes

- [#405](https://github.com/preactjs/signals/pull/405) [`9355d96`](https://github.com/preactjs/signals/commit/9355d962b0d21b409b1661abcead799886e3cdb3) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Add unique identifier to every `Signal`, this will be present on the `brand` property of a Signal coming from either `signal()` or `computed()`

## 1.4.0

### Minor Changes

- [#380](https://github.com/preactjs/signals/pull/380) [`256a331`](https://github.com/preactjs/signals/commit/256a331b5335e54f7e918b3f1068fb9d92d1c613) Thanks [@XantreGodlike](https://github.com/XantreGodlike)! - Add `untracked` function, this allows more granular control within `effect`/`computed` around what should affect re-runs.

## 1.3.1

### Patch Changes

- [#373](https://github.com/preactjs/signals/pull/373) [`8c12a0d`](https://github.com/preactjs/signals/commit/8c12a0df74f00e9cab04e999fc443889b3528c04) Thanks [@rschristian](https://github.com/rschristian)! - Removes package.json#exports.umd, which had invalid paths if they were ever to be consumed

* [#359](https://github.com/preactjs/signals/pull/359) [`26f6526`](https://github.com/preactjs/signals/commit/26f6526875ef0968621c4113594ac95b93de5163) Thanks [@andrewiggins](https://github.com/andrewiggins)! - Change effect callback return type from `void` to `unknown`. Same for effect cleanup function.

## 1.3.0

### Minor Changes

- [#231](https://github.com/preactjs/signals/pull/231) [`862d9d6`](https://github.com/preactjs/signals/commit/862d9d6538b94e0a110213e98f2a0cabb14b8ad8) Thanks [@eddyw](https://github.com/eddyw)! - Disallow side-effects in computed

* [#320](https://github.com/preactjs/signals/pull/320) [`8b70764`](https://github.com/preactjs/signals/commit/8b7076436ce6d912f17d57da8ecd1bdfca852183) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Support `toJSON` on a `Signal`

### Patch Changes

- [#249](https://github.com/preactjs/signals/pull/249) [`8e726ed`](https://github.com/preactjs/signals/commit/8e726ed1df6c90b85a93484f275baa7f013c799a) Thanks [@billybimbob](https://github.com/billybimbob)! - Add typing for effect cleanup

## 1.2.3

### Patch Changes

- [#245](https://github.com/preactjs/signals/pull/245) [`7e15d3c`](https://github.com/preactjs/signals/commit/7e15d3cf5f5e66258105e6f27cd7838b52fbbf9f) Thanks [@jviide](https://github.com/jviide)! - Fix effect behavior when first run throws

## 1.2.2

### Patch Changes

- [#232](https://github.com/preactjs/signals/pull/232) [`aa4cb7b`](https://github.com/preactjs/signals/commit/aa4cb7bfad744e78952cacc37af5bd4a713f0d3f) Thanks [@jviide](https://github.com/jviide)! - Simplify effect change checking (and make effect cycle detection more accurate as a side-effect)

* [#233](https://github.com/preactjs/signals/pull/233) [`3f652a7`](https://github.com/preactjs/signals/commit/3f652a77d2a125a02a0cfc29fe661c81beeda16d) Thanks [@jviide](https://github.com/jviide)! - Simplify Node book keeping code

## 1.2.1

### Patch Changes

- [#205](https://github.com/preactjs/signals/pull/205) [`4b73164`](https://github.com/preactjs/signals/commit/4b7316497aee03413f91e9f714cdcf9f553e39d9) Thanks [@jviide](https://github.com/jviide)! - Use the same tracking logic for both effects and computeds. This ensures that effects are only called whenever any of their dependencies changes. If they all stay the same, then the effect will not be invoked.

* [#207](https://github.com/preactjs/signals/pull/207) [`57fd2e7`](https://github.com/preactjs/signals/commit/57fd2e723528a36cc5d4ebf09ba34178aa84c879) Thanks [@jviide](https://github.com/jviide)! - Fix effect disposal when cleanup throws

- [#209](https://github.com/preactjs/signals/pull/209) [`49756ae`](https://github.com/preactjs/signals/commit/49756aef28fe12c6ae6b801224bf5ae608ddf562) Thanks [@jviide](https://github.com/jviide)! - Optimize dependency value change checks by allowing earlier exists from the loop

## 1.2.0

### Minor Changes

- [#183](https://github.com/preactjs/signals/pull/183) [`79ff1e7`](https://github.com/preactjs/signals/commit/79ff1e794dde9952db2d6d43b22cebfb2accc770) Thanks [@jviide](https://github.com/jviide)! - Add ability to run custom cleanup logic when an effect is disposed.

  ```js
  effect(() => {
    console.log("This runs whenever a dependency changes");
    return () => {
      console.log("This runs when the effect is disposed");
    });
  });
  ```

* [#170](https://github.com/preactjs/signals/pull/170) [`3e31aab`](https://github.com/preactjs/signals/commit/3e31aabb812ddb0f7451deba38267f8384eff9d1) Thanks [@jviide](https://github.com/jviide)! - Allow disposing a currently running effect

### Patch Changes

- [#188](https://github.com/preactjs/signals/pull/188) [`b4611cc`](https://github.com/preactjs/signals/commit/b4611cc9dee0ae09f4b378ba293c3203edc32be4) Thanks [@jviide](https://github.com/jviide)! - Fix `.subscribe()` unexpectedly tracking signal access

* [#162](https://github.com/preactjs/signals/pull/162) [`9802da5`](https://github.com/preactjs/signals/commit/9802da5274bb45c3cc28dda961b9b2d18535729a) Thanks [@developit](https://github.com/developit)! - Add support for `Signal.prototype.valueOf`

- [#161](https://github.com/preactjs/signals/pull/161) [`6ac6923`](https://github.com/preactjs/signals/commit/6ac6923e5294f8a31ee1a009550b9891c3996cb4) Thanks [@jviide](https://github.com/jviide)! - Remove all usages of `Set`, `Map` and other allocation heavy objects in signals-core. This substaintially increases performance across all measurements.

## 1.1.1

### Patch Changes

- [#143](https://github.com/preactjs/signals/pull/143) [`f2ba3d6`](https://github.com/preactjs/signals/commit/f2ba3d657bf8169c6ba1d47c0827aa18cfe1c947) Thanks [@Pauan](https://github.com/Pauan)! - Simplify `batch()` to use a single flag instead of a counter

* [#150](https://github.com/preactjs/signals/pull/150) [`160ea77`](https://github.com/preactjs/signals/commit/160ea7791f3adb55c562f5990e0b4848d8491a38) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - Fix computed signal being re-calculated despite dependencies not having changed

- [#137](https://github.com/preactjs/signals/pull/137) [`4385ea8`](https://github.com/preactjs/signals/commit/4385ea8c8358a154d8b789685bb061658ce1153f) Thanks [@jviide](https://github.com/jviide)! - Fix `.subscribe`'s TypeScript type

* [#148](https://github.com/preactjs/signals/pull/148) [`b948745`](https://github.com/preactjs/signals/commit/b948745de7b5b60a20ce3bdc5ee72d47d47f38ec) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - Move `types` field in `package.json` to the top of the entry list to ensure that TypeScript always finds it.

- [#149](https://github.com/preactjs/signals/pull/149) [`00a59c6`](https://github.com/preactjs/signals/commit/00a59c6475bd4542fb934474d82d1e242b2ac870) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - Fix invalidated signals inside `batch()` not being refreshed when read inside a batching operation. This fixes a regression.

## 1.1.0

### Minor Changes

- bc0080c: Add `.subscribe()`-method to signals to add support for natively using signals with Svelte

### Patch Changes

- 336bb34: Don't mangle `Signal` class name
- 7228418: Fix incorrectly named variables and address typos in code comments.
- 32abe07: Fix internal API functions being able to unmark non-invalidated signals
- 4782b41: Fix conditionally signals (lazy branches) not being re-computed upon activation
- bf6af3b: - Fix a memory leak when computed signals and effects are removed

## 1.0.1

### Patch Changes

- 5644c1f: Fix stale value returned by `.peek()` when called on a deactivated signal.

## 1.0.0

### Major Changes

- 2ee8489: The v1 release for the signals package, we'd to see the uses you all
  come up with and are eager to see performance improvements in your
  applications.

### Minor Changes

- ab22ec7: Add `.peek()` method to read from signals without subscribing to them.

### Patch Changes

- b56abf3: Throw an error when a cycle was detected during state updates

## 0.0.5

### Patch Changes

- 702a9c5: Update TypeScript types to mark computed signals as readonly

## 0.0.4

### Patch Changes

- 4123d60: Fix TypeScript definitions not found in core

## 0.0.3

### Patch Changes

- 1e4dac5: Add `prepublishOnly` scripts to ensure we're publishing fresh packages

## 0.0.2

### Patch Changes

- 2181b74: Add basic signals lib based of prototypes
