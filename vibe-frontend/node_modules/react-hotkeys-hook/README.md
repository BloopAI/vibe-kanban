<hr>
<div align="center">
  <h1 align="center">
    useHotkeys(keys, callback)
  </h1>
</div>

<p align="center">
  <a href="https://bundlephobia.com/result?p=react-hotkeys-hook">
    <img alt="Bundlephobia" src="https://img.shields.io/bundlephobia/minzip/react-hotkeys-hook?style=for-the-badge&labelColor=24292e">
  </a>
  <a aria-label="Types" href="https://www.npmjs.com/package/react-hotkeys-hook">
    <img alt="Types" src="https://img.shields.io/npm/types/react-hotkeys-hook?style=for-the-badge&labelColor=24292e">
  </a>
  <a aria-label="NPM version" href="https://www.npmjs.com/package/react-hotkeys-hook">
    <img alt="NPM Version" src="https://img.shields.io/npm/v/react-hotkeys-hook?style=for-the-badge&labelColor=24292e">
  </a>
  <a aria-label="License" href="https://jaredlunde.mit-license.org/">
    <img alt="MIT License" src="https://img.shields.io/npm/l/react-hotkeys-hook?style=for-the-badge&labelColor=24292e">
  </a>
</p>

<p align="center">
  <a aria-label="Sponsored by Spaceteams" href="https://spaceteams.de">
    <img alt="Sponsored by Spaceteams" src="https://raw.githubusercontent.com/spaceteams/badges/main/sponsored-by-spaceteams.svg">
  </a>
</p>

```
npm i react-hotkeys-hook
```

<p align="center">
A React hook for using keyboard shortcuts in components in a declarative way.
</p>

<hr>

## Quick Start

The easiest way to use the hook.

```jsx harmony
import { useHotkeys } from 'react-hotkeys-hook'

export const ExampleComponent = () => {
  const [count, setCount] = useState(0)
  useHotkeys('ctrl+k', () => setCount(count + 1), [count])

  return (
    <p>
      Pressed {count} times.
    </p>
  )
}
```

### Scopes

Scopes allow you to group hotkeys together. You can use scopes to prevent hotkeys from colliding with each other.

```jsx harmony
const App = () => {
  return (
    <HotkeysProvider initiallyActiveScopes={['settings']}>
      <ExampleComponent />
    </HotkeysProvider>
  )
}

export const ExampleComponent = () => {
  const [count, setCount] = useState(0)
  useHotkeys('ctrl+k', () => setCount(prevCount => prevCount + 1), { scopes: ['settings'] })

  return (
    <p>
      Pressed {count} times.
    </p>
  )
}
```

#### Changing a scope's active state

You can change the active state of a scope using the `disableScope`, `enableScope` and `toggleScope` functions
returned by the `useHotkeysContext()` hook. Note that you have to have your app wrapped in a `<HotkeysProvider>` component.

```jsx harmony
const App = () => {
  return (
    <HotkeysProvider initiallyActiveScopes={['settings']}>
      <ExampleComponent />
    </HotkeysProvider>
  )
}

export const ExampleComponent = () => {
  const { toggleScope } = useHotkeysContext()

  return (
    <button onClick={() => toggleScope('settings')}>
      Change scope active state
    </button>
  )
}
```

### Focus trap

This will only trigger the hotkey if the component is focused.

```tsx harmony
export const ExampleComponent = () => {
  const [count, setCount] = useState(0)
  const ref = useHotkeys<HTMLParagraphElement>('ctrl+k', () => setCount(prevCount => prevCount + 1))

  return (
    <p tabIndex={-1} ref={ref}>
      Pressed {count} times.
    </p>
  )
}
```

## Documentation & Live Examples

* [Quick Start](https://react-hotkeys-hook.vercel.app/docs/intro)
* [Documentation](https://react-hotkeys-hook.vercel.app/docs/documentation/installation)
* [API](https://react-hotkeys-hook.vercel.app/docs/api/use-hotkeys)

## API

### useHotkeys(keys, callback)

```typescript
useHotkeys(keys: string | string[], callback: (event: KeyboardEvent, handler: HotkeysEvent) => void, options: Options = {}, deps: DependencyList = [])
```

| Parameter     | Type                                                    | Required? | Default value | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|---------------|---------------------------------------------------------|-----------|---------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `keys`        | `string` or `string[]`                                  | required  | -             | set the hotkeys you want the hook to listen to. You can use single or multiple keys, modifier combinations, etc. This will either be a string or an array of strings. To separate multiple keys, use a comma. This split key value can be overridden with the `splitKey` option.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `callback`    | `(event: KeyboardEvent, handler: HotkeysEvent) => void` | required  | -             | This is the callback function that will be called when the hotkey is pressed. The callback will receive the browsers native `KeyboardEvent` and the libraries `HotkeysEvent`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `options`     | `Options`                                               | optional  | `{}`          | Object to modify the behavior of the hook. Default options are given below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `dependencies` | `DependencyList`                                         | optional  | `[]`           | The given callback will always be memoised inside the hook. So if you reference any outside variables, you need to set them here for the callback to get updated (Much like `useCallback` works in React). |

### Options

All options are optional and have a default value which you can override to change the behavior of the hook.

| Option                   | Type                                                                                 | Default value | Description                                                                                                                                                                                                                                                                                                                                                                             |
|--------------------------|--------------------------------------------------------------------------------------|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `enabled`                | `boolean` or `(keyboardEvent: KeyboardEvent, hotkeysEvent: HotkeysEvent) => boolean` | `true`        | This option determines whether the hotkey is active or not. It can take a boolean (for example a flag from a state outside) or a function which gets executed once the hotkey is pressed. If the function returns `false` the hotkey won't get executed and all browser events are prevented.                                                                                           |
| `enableOnFormTags`       | `boolean` or `FormTags[]`                                                            | `false`       | By default hotkeys are not registered if a focus focuses on an input field. This will prevent accidental triggering of hotkeys when the user is typing. If you want to enable hotkeys, use this option. Setting it to true will enable on all form tags, otherwise you can give an array of form tags to enable the hotkey on (possible options are: `['input', 'textarea', 'select']`) |
| `enableOnContentEditable` | `boolean`                                                                            | `false`       | Set this option to enable hotkeys on tags that have set the `contentEditable` prop to `true`                                                                                                                                                                                                                                                                                            |
| `combinationKey`         | `string`                                                                             | `+`           | Character to indicate keystrokes like `shift+c`. You might want to change this if you want to listen to the `+` character like `ctrl-+`.                                                                                                                                                                                                                                                |
| `splitKey`               | `string`                                                                             | `,`           | Character to separate different keystrokes like `ctrl+a, ctrl+b`.                                                                                                                                                                                                                                                                                                                       |
| `scopes`                 | `string` or `string[]`                                                               | `*`           | With scopes you can group hotkeys together. The default scope is the wildcard `*` which matches all hotkeys. Use the `<HotkeysProvider>` component to change active scopes.                                                                                                                                                                                                             |
| `keyup`                  | `boolean`                                                                            | `false`       | Determines whether to listen to the browsers `keyup` event for triggering the callback.                                                                                                                                                                                                                                                                                                 |
| `keydown`                | `boolean`                                                                            | `true`        | Determines whether to listen to the browsers `keydown` event for triggering the callback. If you set both `keyup`and `keydown` to true, the callback will trigger on both events.                                                                                                                                                                                                       |
| `preventDefault`         | `boolean` or `(keyboardEvent: KeyboardEvent, hotkeysEvent: HotkeysEvent) => boolean` | `false`       | Set this to a `true` if you want the hook to prevent the browsers default behavior on certain keystrokes like `meta+s` to save a page. NOTE: Certain keystrokes are not preventable, like `meta+w` to close a tab in chrome.                                                                                                                                                            |
| `description`             | `string`                                                                              | `undefined`    | Use this option to describe what the hotkey does. this is helpful if you want to display a list of active hotkeys to the user.                                                                                                                                                                                                                                                          |


#### Overloads

The hooks call signature is very flexible. For example if you don't need to set any special options you can use the dependency
array as your third parameter:

`useHotkeys('ctrl+k', () => console.log(counter + 1), [counter])`

### `isHotkeyPressed(keys: string | string[], splitKey?: string = ',')`

This function allows us to check if the user is currently pressing down a key.

```ts
import { isHotkeyPressed } from 'react-hotkeys-hook'

isHotkeyPressed('esc') // Returns true if Escape key is pressed down.
```

You can also check for multiple keys at the same time:

```ts
isHotkeyPressed(['esc', 'ctrl+s']) // Returns true if Escape or Ctrl+S are pressed down.
```

## Support

* Ask your question in the [Github Discussions]([Support](https://github.com/JohannesKlauss/react-hotkeys-hook/discussions))
* Ask your question on [StackOverflow](https://stackoverflow.com/search?page=1&tab=Relevance&q=react-hotkeys-hook)

## Found an issue or have a feature request?

Open up an [issue](https://github.com/JohannesKlauss/react-hotkeys-hook/issues/new)
or [pull request](https://github.com/JohannesKlauss/react-hotkeys-hook/compare) and participate.

## Local Development

Checkout this repo, run `yarn` or `npm i` and then run the `test` script to test the behavior of the hook.

## Contributing
Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License
Distributed under the MIT License. See `LICENSE` for more information.

## Contact

Johannes Klauss - [@JohannesKlauss](https://github.com/JohannesKlauss) - klauss.johannes@gmail.com

Project Link: [https://github.com/JohannesKlauss/react-hotkeys-hook](https://github.com/JohannesKlauss/react-hotkeys-hook)

## Contributors

<a href="https://github.com/johannesklauss/react-hotkeys-hook/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=johannesklauss/react-hotkeys-hook" />
</a>
