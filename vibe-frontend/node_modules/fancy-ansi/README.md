# Fancy-ANSI

Fancy-ANSI is a small JavaScript library for converting ANSI to beautiful, browser-safe HTML

<img width="536" alt="Screen Shot 2024-03-30 at 1 19 54 PM" src="https://github.com/kubetail-org/fancy-ansi/assets/75881/ebfaa8b4-f5d3-460e-b204-98a85285d377">

Demo: [https://www.kubetail.com/demo](https://www.kubetail.com/demo)  
Preview: [https://kubetail-org.github.io/fancy-ansi/](https://kubetail-org.github.io/fancy-ansi/)

## Introduction

While adding ANSI markup support to [kubetail](https://github.com/kubetail-org/kubetail) we tested out several popular popular ANSI-to-html conversion libraries (e.g. [ansi-html-community](https://github.com/mahdyar/ansi-html-community), [ansi-to-html](https://github.com/rburns/ansi-to-html), [ansi_up](https://github.com/drudru/ansi_up)) and ran into a few problems:

* Failure to parse some of our users' ANSI markup
* Use of hard-coded styles that made customization more difficult
* Lack of support for CSS variables

To solve these problems and make something that integrated nicely into our frontend stack (Tailwind, React) we created Fancy-ANSI. The library is designed to be small (~4 kb gzipped), performant, easy-to-use and safe from XSS attacks. It has the following features:

* Supports easy customization using CSS variables
* Supports almost all SGR codes
* Includes a Tailwind plugin that enables support for easy theming
* Includes a React component for easy use in a React environment
* Includes useful utilities like `hasAnsi()` and `stripAnsi()` that come in handy when working with ANSI
* Includes popular color palettes that can be swapped in easily

Try it out and let us know what you think! If you notice any bugs or have any feature requests just create a GitHub Issue.

## Quickstart

Install the library using your favorite package manager:

```sh
# npm
npm install fancy-ansi

# yarn
yarn add fancy-ansi

# pnpm
pnpm add fancy-ansi
```

Now you can use it in your code with React:

```jsx
// ExampleComponent.jsx
import { AnsiHtml } from 'fancy-ansi/react';

export const ExampleComponent = () => {
  const text = '\x1b[34mhello \x1b[33mworld\x1b[0m';
  return <AnsiHtml className="font-mono whitespace-pre text-sm" text={text} />;
};
```

Or with Vanilla-JS:

```typescript
// example.ts
import { FancyAnsi } from 'fancy-ansi';

const fancyAnsi = new FancyAnsi();

export function addElementWithAnsi() {
  const el = document.createElement('div');
  el.innerHTML = fancyAnsi.toHtml('\x1b[34mhello \x1b[33mworld\x1b[0m');
  document.body.append(el);
}
```

The HTML rendered is browser-safe and ready with some sensible color choices that can be customized easily (see below).

## Configuration

You can configure Fancy-ANSI using CSS variables. For example, to invert blacks in dark mode you can change the value of black when the document has a "dark" class:

```css
:root {
  --ansi-black: #000;
}

.dark {
  --ansi-black: #FFF;
}
```

The full list of supported variables can be found in the [SGR Parameters](#sgr-parameters) section below.

## SGR Parameters

| n   | Name                                     | Supported          | CSS Variables                | Default   |
| --- | ---------------------------------------- | ------------------ | ---------------------------- | --------- |
| 0   | Reset                                    | :heavy_check_mark: |                              |           |
| 1   | Bold                                     | :heavy_check_mark: | --ansi-bold-font-weight      | 600       |
| 2   | Dim                                      | :heavy_check_mark: | --ansi-dim-opacity           | 0.7       |
| 3   | Italic                                   | :heavy_check_mark: |                              |           |
| 4   | Underline                                | :heavy_check_mark: |                              |           |
| 5   | Slow blink                               |                    |                              |           |
| 6   | Fast blink                               |                    |                              |           |
| 7   | Invert                                   |                    |                              |           |
| 8   | Hide                                     | :heavy_check_mark: |                              |           |
| 9   | Strikethrough                            | :heavy_check_mark: |                              |           |
| 10  | Default font                             | :heavy_check_mark: |                              |           |
| 11  | Alternative font 1                       | :heavy_check_mark: | --ansi-font-1                |           |
| 12  | Alternative font 2                       | :heavy_check_mark: | --ansi-font-2                |           |
| 13  | Alternative font 3                       | :heavy_check_mark: | --ansi-font-3                |           |
| 14  | Alternative font 4                       | :heavy_check_mark: | --ansi-font-4                |           |
| 15  | Alternative font 5                       | :heavy_check_mark: | --ansi-font-5                |           |
| 16  | Alternative font 6                       | :heavy_check_mark: | --ansi-font-6                |           |
| 17  | Alternative font 7                       | :heavy_check_mark: | --ansi-font-7                |           |
| 18  | Alternative font 8                       | :heavy_check_mark: | --ansi-font-8                |           |
| 19  | Alternative font 9                       | :heavy_check_mark: | --ansi-font-9                |           |
| 20  | Gothic                                   |                    |                              |           |
| 21  | Double underline                         | :heavy_check_mark: |                              |           |
| 22  | Bold off                                 | :heavy_check_mark: |                              |           |
| 23  | Italic off                               | :heavy_check_mark: |                              |           |
| 24  | Underline off                            | :heavy_check_mark: |                              |           |
| 25  | Blink off                                |                    |                              |           |
| 26  | Proportional spacing                     |                    |                              |           |
| 27  | Invert off                               |                    |                              |           |
| 28  | Hidden off                               | :heavy_check_mark: |                              |           |
| 29  | Strikethrough off                        | :heavy_check_mark: |                              |           |
| 30  | Foreground color - black                 | :heavy_check_mark: | --ansi-black                 | #2e3436   |
| 31  | Foreground color - red                   | :heavy_check_mark: | --ansi-red                   | #cc0000   |
| 32  | Foreground color - green                 | :heavy_check_mark: | --ansi-green                 | #4e9a06   |
| 33  | Foreground color - yellow                | :heavy_check_mark: | --ansi-yellow                | #c4a000   |
| 34  | Foreground color - blue                  | :heavy_check_mark: | --ansi-blue                  | #3465a4   |
| 35  | Foregorund color - magenta               | :heavy_check_mark: | --ansi-magenta               | #75507b   |
| 36  | Foreground color - cyan                  | :heavy_check_mark: | --ansi-cyan                  | #06989a   |
| 37  | Foreground color - white                 | :heavy_check_mark: | --ansi-white                 | #d3d7cf   |
| 38  | Foreground color - extended (see below)  | :heavy_check_mark: |                              |           |
| 39  | Default foreground color                 | :heavy_check_mark: |                              |           |
| 40  | Background color - black                 | :heavy_check_mark: | --ansi-black                 | #2e3436   |
| 41  | Background color - red                   | :heavy_check_mark: | --ansi-red                   | #cc0000   |
| 42  | Background color - green                 | :heavy_check_mark: | --ansi-green                 | #4e9a06   |
| 43  | Background color - yellow                | :heavy_check_mark: | --ansi-yellow                | #c4a000   |
| 44  | Background color - blue                  | :heavy_check_mark: | --ansi-blue                  | #3465a4   |
| 45  | Background color - magenta               | :heavy_check_mark: | --ansi-magenta               | #75507b   |
| 46  | Background color - cyan                  | :heavy_check_mark: | --ansi-cyan                  | #06989a   |
| 47  | Background color - white                 | :heavy_check_mark: | --ansi-white                 | #d3d7cf   |
| 48  | Background color - extended (see below)  | :heavy_check_mark: |                              |           |
| 49  | Default background color                 | :heavy_check_mark: |                              |           |
| 50  | Proportional spacing off                 |                    |                              |           |
| 51  | Frame                                    | :heavy_check_mark: | --ansi-frame-outline         | 1px solid |
| 52  | Encircle                                 |                    |                              |           |
| 53  | Overline                                 | :heavy_check_mark: |                              |           |
| 54  | Frame/encircle off                       | :heavy_check_mark: |                              |           |
| 55  | Overline off                             | :heavy_check_mark: |                              |           |
| 58  | Underground color - extended (see below) | :heavy_check_mark: |                              |           |
| 59  | Default underline color                  | :heavy_check_mark: |                              |           |
| 60  | Right side line                          |                    |                              |           |
| 61  | Double line on the right side            |                    |                              |           |
| 62  | Left side line                           |                    |                              |           |
| 63  | Double line on the left side             |                    |                              |           |
| 64  | Ideogram stress marking                  |                    |                              |           |
| 65  | Side lines off                           |                    |                              |           |
| 73  | Superscript                              | :heavy_check_mark: | --ansi-superscript-font-size | 80%       |
| 74  | Subscript                                | :heavy_check_mark: | --ansi-subscript-font-size   | 80%       |
| 75  | Superscript/subscript off                | :heavy_check_mark: |                              |           |
| 90  | Foreground color - bright black          | :heavy_check_mark: | --ansi-bright-black          | #555753   |
| 91  | Foreground color - bright red            | :heavy_check_mark: | --ansi-bright-red            | #ef2929   |
| 92  | Foreground color - bright green          | :heavy_check_mark: | --ansi-bright-green          | #8ae234   |
| 93  | Foreground color - bright yellow         | :heavy_check_mark: | --ansi-bright-yellow         | #fce94f   |
| 94  | Foreground color - bright blue           | :heavy_check_mark: | --ansi-bright-blue           | #729fcf   |
| 95  | Foreground color - bright magenta        | :heavy_check_mark: | --ansi-bright-magenta        | #ad7fa8   |
| 96  | Foreground color - bright cyan           | :heavy_check_mark: | --ansi-bright-cyan           | #34e2e2   |
| 97  | Foreground color - bright white          | :heavy_check_mark: | --ansi-bright-white          | #eeeeec   |
| 100 | Background color - bright black          | :heavy_check_mark: | --ansi-bright-black          | #555753   |
| 101 | Background color - bright red            | :heavy_check_mark: | --ansi-bright-red            | #ef2929   |
| 102 | Background color - bright green          | :heavy_check_mark: | --ansi-bright-green          | #8ae234   |
| 103 | Background color - bright yellow         | :heavy_check_mark: | --ansi-bright-yellow         | #fce94f   |
| 104 | Background color - bright blue           | :heavy_check_mark: | --ansi-bright-blue           | #729fcf   |
| 105 | Background color - bright magenta        | :heavy_check_mark: | --ansi-bright-magenta        | #ad7fa8   |
| 106 | Background color - bright cyan           | :heavy_check_mark: | --ansi-bright-cyan           | #34e2e2   |
| 107 | Background color - bright white          | :heavy_check_mark: | --ansi-bright-white          | #eeeeec   |

Extended colors:

| Code pattern             | Description                              | CSS Variables      |
| ------------------------ | ---------------------------------------- | ------------------ |
| 38;2;{r};{g};{b}         | Set foreground color - (r,g,b)           |                    |
| 38;5;{n} (0 ≤ n ≤ 15)    | Set foreground color - standard colors   | --ansi-{color}     |
| 38;5;{n} (16 ≤ n ≤ 231)  | Set foreground color - 6x6 rgb cube      |                    |
| 38;5;{n} (232 ≤ n ≤ 232) | Set foreground color - 24-step grayscale | --ansi-gray-{step} |
| 48;2;{r};{g};{b}         | Set background color - (r,g,b)           |                    |
| 48;5;{n} (0 ≤ n ≤ 15)    | Set background color - standard colors   | --ansi-{color}     |
| 48;5;{n} (16 ≤ n ≤ 231)  | Set background color - 6x6 rgb cube      |                    |
| 48;5;{n} (232 ≤ n ≤ 232) | Set background color - 24-step grayscale | --ansi-gray-{step} |
| 58;2;{r};{g};{b}         | Set underline color - (r,g,b)            |                    |
| 58;5;{n} (0 ≤ n ≤ 15)    | Set underline color - standard colors    | --ansi-{color}     |
| 58;5;{n} (16 ≤ n ≤ 231)  | Set underline color - 6x6 rgb cube       |                    |
| 58;5;{n} (232 ≤ n ≤ 232) | Set underline color - 24-step grayscale  | --ansi-gray-{step} |

## Integrations

### Tailwind

The Fancy-ANSI Tailwind plugin makes it easy to support theming and to access multiple built-in palettes from your css. To use the plugin, add it to your `tailwind.config.js` file:

```js
// tailwind.config.js
module.exports = {
  plugins: [
    // ...
    require('fancy-ansi/plugin')
  ]
}
```

Now you can access the built-in palettes using the Tailwind `theme()` function. For example, you can implement two different palettes for light/dark mode like this:

```css
/* index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --ansi-black: theme(ansi.colors.vscode.black);
    --ansi-red: theme(ansi.colors.vscode.red);
    --ansi-green: theme(ansi.colors.vscode.green);
    --ansi-yellow: theme(ansi.colors.vscode.yellow);
    --ansi-blue: theme(ansi.colors.vscode.blue);
    --ansi-magenta: theme(ansi.colors.vscode.magenta);
    --ansi-cyan: theme(ansi.colors.vscode.cyan);
    --ansi-white: theme(ansi.colors.vscode.white);
    --ansi-bright-black: theme(ansi.colors.vscode.bright-black);
    --ansi-bright-red: theme(ansi.colors.vscode.bright-red);
    --ansi-bright-green: theme(ansi.colors.vscode.bright-green);
    --ansi-bright-yellow: theme(ansi.colors.vscode.bright-yellow);
    --ansi-bright-blue: theme(ansi.colors.vscode.bright-blue);
    --ansi-bright-magenta: theme(ansi.colors.vscode.magenta);
    --ansi-bright-cyan: theme(ansi.colors.vscode.cyan);
    --ansi-bright-white: theme(ansi.colors.vscode.white);
  }

  .dark {
    --ansi-black: theme(ansi.colors.xtermjs.black);
    --ansi-red: theme(ansi.colors.xtermjs.red);
    --ansi-green: theme(ansi.colors.xtermjs.green);
    --ansi-yellow: theme(ansi.colors.xtermjs.yellow);
    --ansi-blue: theme(ansi.colors.xtermjs.blue);
    --ansi-magenta: theme(ansi.colors.xtermjs.magenta);
    --ansi-cyan: theme(ansi.colors.xtermjs.cyan);
    --ansi-white: theme(ansi.colors.xtermjs.white);
    --ansi-bright-black: theme(ansi.colors.xtermjs.bright-black);
    --ansi-bright-red: theme(ansi.colors.xtermjs.bright-red);
    --ansi-bright-green: theme(ansi.colors.xtermjs.bright-green);
    --ansi-bright-yellow: theme(ansi.colors.xtermjs.bright-yellow);
    --ansi-bright-blue: theme(ansi.colors.xtermjs.bright-blue);
    --ansi-bright-magenta: theme(ansi.colors.xtermjs.magenta);
    --ansi-bright-cyan: theme(ansi.colors.xtermjs.cyan);
    --ansi-bright-white: theme(ansi.colors.xtermjs.white);
  }
```

### React

Fancy-ANSI has a convenient React component that you can import from the `fancy-ansi/react` module:

```jsx
// ExampleComponent.jsx
import { AnsiHtml } from 'fancy-ansi/react';

export const ExampleComponent = () => {
  const text = '\x1b[34mhello \x1b[33mworld\x1b[0m';
  return <AnsiHtml className="font-mono whitespace-pre text-sm" text={text} />;
};
```

## Examples

You can see some example implementations in the [`examples/`](examples/) directory:

* [Vite - React](examples/vite-react)
* [Next.js](examples/nextjs)

## API

### FancyAnsi - The converter class

```
FancyAnsi

  toHtml(input)
    * @param {string} input - The input string
    * @returns {string} Browser-safe HTML string containing stylized ANSI content

Example:

  import { FancyAnsi } from 'fancy-ansi';

  const fancyAnsi = new FancyAnsi();
  fancyAnsi.toHtml('\x1b[1mThis is in bold.\x1b[0m');
```

### hasAnsi() - Check if a string has ANSI markup

```
hasAnsi(input)

  * @param {string} input - The input string
  * @returns {boolean} Boolean indicating whether or not input string contains ANSI markup

Example:

  import { hasAnsi } from 'fancy-ansi';

  if (hasAnsi('\x1b[1mThis is in bold.\x1b[0m')) {
    console.log('string has ansi');
  } else {
    console.log('string doesn\'t have ansi');
  }
```

### stripAnsi() - Remove ANSI markup

```
stripAnsi(input)

  * @param {string} input - The input string
  * @returns {string} Content of input string with ANSI markup removed

Example:

  import { stripAnsi } from 'fancy-ansi';

  const withoutAnsi = stripAnsi('\x1b[1mThis is in bold.\x1b[0m');
  console.log(`string without ansi: ${withoutAnsi}`);
```

### colors - Built-in palettes

```
`fancy-ansi/colors` module

Example:

  import { xtermjs, terminalapp } from 'fancy-ansi/colors';

  console.log(`xterm.js red: ${xtermjs.red}`);
  console.log(`Terminal.app red: ${terminalapp.red}`);

Available palettes:

  * eclipse
  * putty
  * terminalapp
  * ubuntu
  * vga
  * vscode
  * windows10
  * xterm
  * xtermjs
```

## Development

### Get the code

To develop Fancy-ANSI, first clone the repository then install the dependencies:

```sh
git clone git@github.com:kubetail-org/fancy-ansi.git
cd fancy-ansi
pnpm install
```

### Run the dev server

Fancy-ANSI uses vite for development. To run run the vite dev server, use the `dev` command:

```sh
pnpm dev
```

Now you can access the demo page and see your changes at [http://localhost:5173/](http://localhost:5173/).

### Run the unit tests

Fancy-ANSI uses jest for testing (via vitest). To run the tests, use the `test` command:

```sh
pnpm test
```

The test files are colocated with the source code in the `src/` directory, with the filename format `{name}.test.(ts|tsx)`.

### Build for production

To build Fancy-ANSI for production, run the `build` command:

```sh
pnpm build
```

The production files will be located in the `dist/` directory.

## Acknowledgements

* The ANSI parsing code is from [ansi_up](https://github.com/drudru/ansi_up)
* has/strip methods use [Chalk's](https://github.com/chalk/chalk) [ansi-regex](https://github.com/chalk/ansi-regex)
* [Fancy Nancy](https://www.fancynancyworld.com)
