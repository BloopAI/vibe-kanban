<img src="https://rawgit.com/gorangajic/react-icons/master/react-icons.svg" width="120" alt="React Icons">

# [React Icons](https://react-icons.github.io/react-icons)

[![npm][npm-image]][npm-url]

[npm-image]: https://img.shields.io/npm/v/react-icons.svg?style=flat-square
[npm-url]: https://www.npmjs.com/package/react-icons

Include popular icons in your React projects easily with `react-icons`, which utilizes ES6 imports that allows you to include only the icons that your project is using.

## Installation (for standard modern project)

```bash
yarn add react-icons
# or
npm install react-icons --save
```

example usage

```jsx
import { FaBeer } from 'react-icons/fa';

class Question extends React.Component {
    render() {
        return <h3> Lets go for a <FaBeer />? </h3>
    }
}
```

[View the documentation](https://react-icons.github.io/react-icons) for further usage examples and how to use icons from other packages. *NOTE*: each Icon package has it's own subfolder under `react-icons` you import from.

For example, to use an icon from **Material Design**, your import would be: `import { ICON_NAME } from 'react-icons/md';`

## Installation (for meteorjs, gatsbyjs, etc)

If your project grows in size, this option is available.
This method has the trade-off that it takes a long time to install the package.

```bash
yarn add @react-icons/all-files
# or
npm install @react-icons/all-files --save
```

example usage

```jsx
import { FaBeer } from "@react-icons/all-files/fa/FaBeer";
class Question extends React.Component {
  render() {
    return <h3> Lets go for a <FaBeer />? </h3>
  }
}
```

## Icons

Icon Library|License|Version|Count
---|---|---|---
[Font Awesome](https://fontawesome.com/)|[CC BY 4.0 License](https://creativecommons.org/licenses/by/4.0/)|5.12.1
0d1f27efb836eb2ab994ba37221849ed64a73e5c|1560
[Ionicons 4](https://ionicons.com/)|[MIT](https://github.com/ionic-team/ionicons/blob/master/LICENSE)|4.6.3|696
[Ionicons 5](https://ionicons.com/)|[MIT](https://github.com/ionic-team/ionicons/blob/master/LICENSE)|5.2.3|1300
[Material Design icons](http://google.github.io/material-design-icons/)|[Apache License Version 2.0](https://github.com/google/material-design-icons/blob/master/LICENSE)|3.0.1|960
[Typicons](http://s-ings.com/typicons/)|[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)|2.0.9|336
[Github Octicons icons](https://octicons.github.com/)|[MIT](https://github.com/primer/octicons/blob/master/LICENSE)|8.5.0|184
[Feather](https://feathericons.com/)|[MIT](https://github.com/feathericons/feather/blob/master/LICENSE)|4.28.0|286
[Game Icons](https://game-icons.net/)|[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)|e510027a83a79e44673022a25e93b306a9165a21|3786
[Weather Icons](https://erikflowers.github.io/weather-icons/)|[SIL OFL 1.1](http://scripts.sil.org/OFL)|2.0.10|219
[Devicons](https://vorillaz.github.io/devicons/)|[MIT](https://opensource.org/licenses/MIT)|1.8.0|192
[Ant Design Icons](https://github.com/ant-design/ant-design-icons)|[MIT](https://opensource.org/licenses/MIT)|4.0.0|788
[Bootstrap Icons](https://github.com/twbs/icons)|[MIT](https://opensource.org/licenses/MIT)|1.0.0-alpha3|668
[Remix Icon](https://github.com/Remix-Design/RemixIcon)|[Apache License Version 2.0](http://www.apache.org/licenses/)|2.5.0|2172
[Flat Color Icons](https://github.com/icons8/flat-color-icons)|[MIT](https://opensource.org/licenses/MIT)|1.0.2|329
[Grommet-Icons](https://github.com/grommet/grommet-icons)|[Apache License Version 2.0](http://www.apache.org/licenses/)|4.4.0|562
[Heroicons](https://github.com/refactoringui/heroicons)|[MIT](https://opensource.org/licenses/MIT)|0.3.5|352
[Simple Icons](https://simpleicons.org/)|[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)|2.13.0|1316
[IcoMoon Free](https://github.com/Keyamoon/IcoMoon-Free)|[CC BY 4.0 License](undefined)|d006795ede82361e1bac1ee76f215cf1dc51e4ca|491
[BoxIcons](https://github.com/atisawd/boxicons)|[CC BY 4.0 License](undefined)|2.0.5|738
[css.gg](https://github.com/astrit/css.gg)|[MIT](https://opensource.org/licenses/MIT)|2.0.0|704
[VS Code Icons](https://github.com/microsoft/vscode-codicons)|[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)|0.0.1|319


You can add more icons by submitting pull requests or creating issues.

## Configuration

You can configure react-icons props using [React Context API](https://reactjs.org/docs/context.html).

_Requires **React 16.3** or higher._

```jsx
import { IconContext } from "react-icons";

<IconContext.Provider value={{ color: "blue", className: "global-class-name" }}>
  <div>
    <FaFolder />
  </div>
</IconContext.Provider>
```

| Key         | Default               | Notes                           |
| ----------- | --------------------- | ------------------------------- |
| `color`     | `undefined` (inherit) |                                 |
| `size`      | `1em`                 |                                 |
| `className` | `undefined`           |                                 |
| `style`     | `undefined`           | Can overwrite size and color    |
| `attr`      | `undefined`           | Overwritten by other attributes |
| `title`     | `undefined`           | Icon description for accessibility |

## Migrating from version 2 -> 3

### Change import style

Import path has changed. You need to rewrite from the old style.

```jsx
// OLD IMPORT STYLE
import FaBeer from 'react-icons/lib/fa/beer';

class Question extends React.Component {
    render() {
        return <h3> Lets go for a <FaBeer />? </h3>
    }
}
```

```jsx
// NEW IMPORT STYLE
import { FaBeer } from 'react-icons/fa';

class Question extends React.Component {
    render() {
        return <h3> Lets go for a <FaBeer />? </h3>
    }
}
```

Ending up with a large JS bundle? Check out [this issue](https://github.com/react-icons/react-icons/issues/154).

### Adjustment CSS

From version 3, `vertical-align: middle` is not automatically given. Please use IconContext to specify className or specify an inline style.

#### Global Inline Styling

```tsx
<IconContext.Provider value={{ style: { verticalAlign: 'middle' } }}>
```

#### Global `className` Styling

Component

```tsx
<IconContext.Provider value={{ className: 'react-icons' }}>
```

CSS

```css
.react-icons {
  vertical-align: middle;
}
```

### TypeScript native support

Dependencies on `@types/react-icons` can be deleted.

#### Yarn
```bash
yarn remove @types/react-icons
```

#### NPM
```bash
npm remove @types/react-icons
```

## Contributing

### Development

```bash
yarn
yarn submodule  # fetch icon sources
cd packages/react-icons
yarn build
```

### Preview
The preview site is the [`react-icons`](https://react-icons.github.io/react-icons) website, built in [NextJS](https://nextjs.org/).

```bash
cd packages/react-icons
yarn build

cd ../preview
yarn start
```

### Demo
The demo is a [Create React App](https://create-react-app.dev/) boilerplate with `react-icons` added as a dependency for easy testing.

```bash
cd packages/react-icons
yarn build

cd ../demo
yarn start
```

## Why React SVG components instead of fonts?

SVG is [supported by all major browsers](http://caniuse.com/#search=svg). With `react-icons`, you can serve only the needed icons instead of one big font file to the users, helping you to recognize which icons are used in your project.

## Related Projects

- [react-svg-morph](https://github.com/gorangajic/react-svg-morph/)

## Licence

MIT

- Icons are taken from the other projects so please check each project licences accordingly.
