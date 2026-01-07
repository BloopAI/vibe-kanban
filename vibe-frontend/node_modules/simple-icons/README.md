<p align="center">
<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/simpleicons.svg" alt="Simple Icons" width=70>
<h3 align="center">Simple Icons</h3>
<p align="center">
Over 3300 SVG icons for popular brands. See them all on one page at <a href="https://simpleicons.org">SimpleIcons.org</a>. Contributions, corrections & requests can be made on GitHub.</p>
</p>

<p align="center">
<a href="https://simpleicons.org"><img src="https://img.shields.io/badge/dynamic/json?color=informational&label=icons&prefix=%20&logo=simpleicons&query=%24.length&url=https%3A%2F%2Fraw.githubusercontent.com%2Fsimple-icons%2Fsimple-icons%2Fdevelop%2Fdata%2Fsimple-icons.json" alt="Number of icons currently in the library"/></a>
<a href="https://www.npmjs.com/package/simple-icons"><img src="https://img.shields.io/npm/v/simple-icons.svg?logo=npm" alt="NPM version"/></a>
<a href="https://packagist.org/packages/simple-icons/simple-icons"><img src="https://img.shields.io/packagist/v/simple-icons/simple-icons?logo=packagist&logoColor=white" alt="Build status"/></a>
<br/>
<a href="https://github.com/simple-icons/simple-icons/actions?query=workflow%3AVerify+branch%3Adevelop"><img src="https://img.shields.io/github/actions/workflow/status/simple-icons/simple-icons/verify.yml?branch=develop&logo=github&label=tests" alt="Build status"/></a>
<a href="https://discord.gg/vUXFa7t5xJ"><img src="https://img.shields.io/discord/1142044630909726760?logo=discord&logoColor=white&label=discord" alt="Number of users active in our Discord server"/></a>
<a href="https://opencollective.com/simple-icons"><img src="https://img.shields.io/opencollective/all/simple-icons?logo=opencollective" alt="Backers and sponsors on Open Collective"/></a>
</p>

## Usage

> **Important**\
> We ask that all users read our [legal disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md) before using icons from Simple Icons.

### General Usage

Icons can be downloaded as SVGs directly from [simpleicons.org](https://simpleicons.org) - simply click the download button of the icon you want, and the download will start automatically.

### CDN Usage

Icons can be served from a CDN such as [jsDelivr](https://www.jsdelivr.com/package/npm/simple-icons) or [unpkg](https://unpkg.com/browse/simple-icons/). Simply use the `simple-icons` npm package and specify a version in the URL like the following:

```html
<img height="32" width="32" src="https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/[ICON SLUG].svg" />
<img height="32" width="32" src="https://unpkg.com/simple-icons@v15/icons/[ICON SLUG].svg" />
```

Where `[ICON SLUG]` is replaced by the [slug] of the icon you want to use, for example:

```html
<img height="32" width="32" src="https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/simpleicons.svg" />
<img height="32" width="32" src="https://unpkg.com/simple-icons@v15/icons/simpleicons.svg" />
```

These examples use the latest major version. This means you won't receive any updates following the next major release. You can use `@latest` instead to receive updates indefinitely. However, this will result in a `404` error if the icon is removed.

#### CDN with colors

We also provide a CDN service which allows you to use colors.

```html
<img height="32" width="32" src="https://cdn.simpleicons.org/[ICON SLUG]" />
<img height="32" width="32" src="https://cdn.simpleicons.org/[ICON SLUG]/[COLOR]" />
<img height="32" width="32" src="https://cdn.simpleicons.org/[ICON SLUG]/[COLOR]/[DARK_MODE_COLOR]" />
```

Where `[COLOR]` is optional, and can be replaced by the [hex colors](https://developer.mozilla.org/en-US/docs/Web/CSS/hex-color) or [CSS keywords](https://www.w3.org/wiki/CSS/Properties/color/keywords) of the icon you want to use. The color is defaulted to the HEX color of the icon shown in [simpleicons.org website](https://simpleicons.org). `[DARK_MODE_COLOR]` is used for dark mode. The [CSS prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme) will be used when a value is specified. For example:

```html
<img height="32" width="32" src="https://cdn.simpleicons.org/simpleicons" />
<img height="32" width="32" src="https://cdn.simpleicons.org/simpleicons/gray" />
<img height="32" width="32" src="https://cdn.simpleicons.org/simpleicons/hotpink" />
<img height="32" width="32" src="https://cdn.simpleicons.org/simpleicons/0cf" />
<img height="32" width="32" src="https://cdn.simpleicons.org/simpleicons/0cf9" />
<img height="32" width="32" src="https://cdn.simpleicons.org/simpleicons/00ccff" />
<img height="32" width="32" src="https://cdn.simpleicons.org/simpleicons/00ccff99" />
<img height="32" width="32" src="https://cdn.simpleicons.org/simpleicons/orange/pink" />
<img height="32" width="32" src="https://cdn.simpleicons.org/simpleicons/_/eee" />
<img height="32" width="32" src="https://cdn.simpleicons.org/simpleicons/eee/_" />
```

You can use a `viewbox=auto` parameter to get a auto-sized viewbox. This is useful if you want all icons rendered with consistent size:

```html
<img height="20" src="https://cdn.simpleicons.org/github?viewbox=auto" />
<img height="20" src="https://cdn.simpleicons.org/simpleicons?viewbox=auto" />
<img height="20" src="https://cdn.simpleicons.org/awesomelists?viewbox=auto" />
```

### Node Usage <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/nodedotjs.svg" alt="Node" align=left width=24>

The icons are also available through our npm package. To install, simply run:

```shell
npm install simple-icons
```

All icons are imported from a single file, where `[ICON SLUG]` is replaced by a capitalized [slug]. We highly recommend using a bundler that can tree shake such as [webpack](https://webpack.js.org/) to remove the unused icon code:

```javascript
// Import a specific icon by its slug as:
// import { si[ICON SLUG] } from 'simple-icons'

// For example:
// use import/esm to allow tree shaking
import {siSimpleicons} from 'simple-icons';
// or with require/cjs
const {siSimpleicons} = require('simple-icons');
```

It will return an icon object:

```javascript
console.log(siSimpleicons);

/*
{
    title: 'Simple Icons',
    slug: 'simpleicons',
    hex: '111111',
    source: 'https://simpleicons.org/',
    svg: '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">...</svg>',
    path: 'M12 12v-1.5c-2.484 ...',
    guidelines: 'https://simpleicons.org/styleguide',
    license: {
        type: '...',
        url: 'https://example.com/'
    }
}

NOTE: the `guidelines` entry will be `undefined` if we do not yet have guidelines for the icon.
NOTE: the `license` entry will be `undefined` if we do not yet have license data for the icon.
*/
```

If you need to iterate over all icons, use:

```javascript
import * as icons from 'simple-icons';
```

#### TypeScript Usage <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/typescript.svg" alt="Typescript" align=left width=19 height=19>

Type definitions are bundled with the package.

```typescript
import type {SimpleIcon} from 'simple-icons';
```

### PHP Usage <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/php.svg" alt="Php" align=left width=24 height=24>

The icons are also available through our Packagist package. To install, simply run:

```shell
composer require simple-icons/simple-icons
```

The package can then be used as follows, where `[ICON SLUG]` is replaced by a [slug]:

```php
<?php
// Import a specific icon by its slug as:
echo file_get_contents('path/to/package/icons/[ICON SLUG].svg');

// For example:
echo file_get_contents('path/to/package/icons/simpleicons.svg');

// <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">...</svg>
?>
```

### Font Usage

See [simple-icons-font](https://github.com/simple-icons/simple-icons-font) to learn how to use our font distribution.

## Third-Party Extensions

The below are known extensions to third-party tools.

| Extension | Author |
| :-- | :-- |
| [Blender add-on](https://github.com/mondeja/simple-icons-blender) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/blender.svg" alt="Blender" align=left width=24 height=24> | [@mondeja](https://github.com/mondeja) |
| [Boxy SVG library](https://boxy-svg.com/ideas/298/simple-icons-library-provider) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/boxysvg.svg" alt="Boxy SVG" align=left width=24 height=24> | [@Jarek](https://boxy-svg.com/profiles/0000000000/jarek) |
| [Drawio library](https://github.com/mondeja/simple-icons-drawio) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/diagramsdotnet.svg" alt="Drawio" align=left width=24 height=24> | [@mondeja](https://github.com/mondeja) |
| [Figma plugin](https://www.figma.com/community/plugin/1149614463603005908) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/figma.svg" alt="Figma" align=left width=24 height=24> | [@LitoMore](https://github.com/LitoMore) |
| [Jekyll plugin](https://github.com/pirafrank/jekyll-simple-icons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/jekyll.svg" alt="Jekyll" align=left width=24 height=24> | [@pirafrank](https://github.com/pirafrank) |
| [Kando icon theme](https://kando.menu/icon-themes#built-in-icon-themes) <img src="https://brands.deno.dev/kando/000/fff" alt="Kando" align=left width=24 height=24> | [@Schneegans](https://github.com/Schneegans) |
| [Miro app](https://miro.com/marketplace/brand-icons/) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/miro.svg" alt="Miro" align=left width=24 height=24> | [@LitoMore](https://github.com/LitoMore) |
| [Raycast extension](https://www.raycast.com/litomore/simple-icons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/raycast.svg" alt="Raycast" align=left width=24 height=24> | [@LitoMore](https://github.com/LitoMore) |
| [Stream Deck icon pack](https://github.com/mackenly/simple-icons-stream-deck) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/elgato.svg" alt="Stream Deck" align=left width=24 height=24> | [@mackenly](https://github.com/mackenly) |
| [Typst package](https://typst.app/universe/package/sicons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/typst.svg" alt="Typst" align=left width=24 height=24> | [@cscnk52](https://github.com/cscnk52) |
| [Webflow app](https://webflow.com/apps/detail/simple-icons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/webflow.svg" alt="Webflow" align=left width=24 height=24> | [@diegoliv](https://github.com/diegoliv) |

Maintain an extension? [Submit a PR][open-pr] to include it in the list above.

## Third-Party Libraries

The below are known third-party libraries for use in your own projects. We only keep items in the list that are at least up to date with our previous major version.

| Library | Author | License | Simple Icons |
| :-- | :-- | :-: | :-: |
| [Angular package](https://github.com/gridatek/semantic-icons/tree/main/libs/simple-icons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/angular.svg" alt="Angular" align=left width=24 height=24> | [@gridatek](https://github.com/gridatek) | ![License](https://img.shields.io/github/license/gridatek/semantic-icons?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fgridatek%2Fsemantic-icons%2Fmain%2Fpackage.json&query=%24..devDependencies%5B'simple-icons'%5D&label=) |
| [Astro package](https://github.com/dzeiocom/simple-icons-astro) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/astro.svg" alt="Astro" align=left width=24 height=24> | [@Aviortheking](https://github.com/aviortheking) | ![License](https://img.shields.io/github/license/dzeiocom/simple-icons-astro?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fdzeiocom%2Fsimple-icons-astro%2Fmaster%2Fpackage.json&query=%24.version&label=) |
| [Blazor Nuget package](https://github.com/TimeWarpEngineering/timewarp-simple-icons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/blazor.svg" alt="Blazor" align=left width=24 height=24> | [@TimeWarpEngineering](https://github.com/TimeWarpEngineering) | ![License](https://img.shields.io/github/license/TimeWarpEngineering/timewarp-simple-icons?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/xml?url=https%3A%2F%2Fraw.githubusercontent.com%2FTimeWarpEngineering%2Ftimewarp-simple-icons%2Fmain%2Fsource%2Ftimewarp-simple-icons%2Ftimewarp-simple-icons.csproj&query=%2FProject%2FPropertyGroup%2FVersion&label=) |
| [Flutter package](https://github.com/jlnrrg/simple_icons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/flutter.svg" alt="Flutter" align=left width=24 height=24> | [@jlnrrg](https://github.com/jlnrrg) | ![License](https://img.shields.io/github/license/jlnrrg/simple_icons?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/yaml?url=https%3A%2F%2Fraw.githubusercontent.com%2Fjlnrrg%2Fsimple_icons%2Fmaster%2Fpubspec.yaml&query=%24.version&logoColor=white&label=) |
| [Framer component](https://github.com/LitoMore/simple-icons-framer) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/framer.svg" alt="Framer" align=left width=24 height=24> | [@LitoMore](https://github.com/LitoMore) | ![License](https://img.shields.io/github/license/LitoMore/simple-icons-framer?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsimple-icons%2Fsimple-icons%2Fmaster%2Fpackage.json&query=%24.version&label=) |
| [Hugo module](https://github.com/foo-dogsquared/hugo-mod-simple-icons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/hugo.svg" alt="Hugo" align=left width=24 height=24> | [@foo-dogsquared](https://github.com/foo-dogsquared) | ![License](https://img.shields.io/github/license/foo-dogsquared/hugo-mod-simple-icons?label=) | ![Simple Icons version](https://img.shields.io/github/v/tag/foo-dogsquared/hugo-mod-simple-icons?label=) |
| [Java library](https://github.com/silentsoft/simpleicons4j) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/openjdk.svg" alt="Java" align=left width=24 height=24> | [@silentsoft](https://github.com/silentsoft) | ![License](https://img.shields.io/github/license/silentsoft/simpleicons4j?label=) | ![Simple Icons version](https://img.shields.io/maven-central/v/org.silentsoft/simpleicons4j?label=) |
| [Kirby plugin](https://github.com/runxel/kirby3-simpleicons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/kirby.svg" alt="Kirby" align=left width=24 height=24> | [@runxel](https://github.com/runxel) | ![License](https://img.shields.io/github/license/runxel/kirby3-simpleicons?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Frunxel%2Fkirby3-simpleicons%2Fmaster%2Fcomposer.json&query=%24..%5B'simple-icons%2Fsimple-icons'%5D&label=) |
| [LaTeX package](https://github.com/ineshbose/simple-icons-latex) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/latex.svg" alt="LaTeX" align=left width=24 height=24> | [@ineshbose](https://github.com/ineshbose) | ![License](https://img.shields.io/github/license/ineshbose/simple-icons-latex?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fineshbose%2Fsimple-icons-latex%2Fdevelop%2Fpackage.json&query=%24..%5B'simple-icons-font'%5D&label=) |
| [Laravel package](https://github.com/ublabs/blade-simple-icons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/laravel.svg" alt="Laravel" align=left width=24 height=24> | [@adrian-ub](https://github.com/adrian-ub) | ![License](https://img.shields.io/github/license/ublabs/blade-simple-icons?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsimple-icons%2Fsimple-icons%2Fmaster%2Fpackage.json&query=%24.version&label=) |
| [Python wheel](https://github.com/carstencodes/simplepycons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/python.svg" alt="Python" align=left width=24 height=24> | [@carstencodes](https://github.com/carstencodes) | ![License](https://img.shields.io/github/license/carstencodes/simplepycons?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Fraw.githubusercontent.com%2Fcarstencodes%2Fsimplepycons%2Frefs%2Fheads%2Fmain%2F.gitmodules&search=%5C%5Bsubmodule%20%22vendor%5C%2Fsimple-icons%22%5C%5D%5B%5E%5C%5B%5D%2Bbranch%5Cs*%3D%5Cs*%28%3F%3Cversion%3E%5Cd%2B%5C.%5Cd%2B%5C.%5Cd%2B%3F%29&replace=%24%3Cversion%3E&flags=ims&label=) |
| [React package](https://github.com/icons-pack/react-simple-icons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/react.svg" alt="React" align=left width=24 height=24> | [@wootsbot](https://github.com/wootsbot) | ![License](https://img.shields.io/github/license/icons-pack/react-simple-icons?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ficons-pack%2Freact-simple-icons%2Fmain%2Fpackage.json&query=%24..%5B'simple-icons'%5D&label=) |
| [Ruby gem](https://rubygems.org/gems/simple-icons-rails) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/rubygems.svg" alt="Ruby" align=left width=24 height=24> | [@thepew](https://github.com/the-pew-inc) | ![License](https://img.shields.io/github/license/the-pew-inc/simple-icons-rails?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsimple-icons%2Fsimple-icons%2Fmaster%2Fpackage.json&query=%24.version&label=) |
| [Rust crate](https://crates.io/crates/simpleicons-rs) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/rust.svg" alt="Rust" align=left width=24 height=24> | [@cscnk52](https://github.com/cscnk52) | ![License](https://img.shields.io/github/license/cscnk52/simpleicons-rs?label=) | ![Simple Icons version](https://img.shields.io/crates/v/simpleicons-rs?color=blue&label=) |
| [Svelte package](https://github.com/icons-pack/svelte-simple-icons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/svelte.svg" alt="Svelte" align=left width=24 height=24> | [@wootsbot](https://github.com/wootsbot) | ![License](https://img.shields.io/github/license/icons-pack/svelte-simple-icons?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ficons-pack%2Fsvelte-simple-icons%2Fmain%2Fpackage.json&query=%24..%5B'simple-icons'%5D&label=) |
| [Vue 3 package](https://github.com/wyatt-herkamp/vue3-simple-icons) <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/15.22.0/icons/vuedotjs.svg" alt="Vue" align=left width=24 height=24> | [@wyatt-herkamp](https://github.com/wyatt-herkamp) | ![License](https://img.shields.io/github/license/wyatt-herkamp/vue3-simple-icons?label=) | ![Simple Icons version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fwyatt-herkamp%2Fvue3-simple-icons%2Fmain%2Fsimple-icons.json&query=simpleIconsVersion&label=) |

Maintain a library? [Submit a PR][open-pr] to include it in the list above.

## Contribute

[![Good first issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.github.com%2Fsearch%2Fissues%3Fq%3Drepo%3Asimple-icons%2Fsimple-icons%2520label%3A%2522good%2520first%2520issue%2522%2520is%3Aopen%2520-linked%3Apr&query=%24.total_count&suffix=%20open&logo=github&label=good%20first%20issues&color=228f6c&labelColor=228f6c&logoColor=white&style=flat-square)](https://github.com/simple-icons/simple-icons/issues?q=is%3Aopen+label%3A%22good+first+issue%22+-linked%3Apr) [![Icon issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.github.com%2Fsearch%2Fissues%3Fq%3Drepo%3Asimple-icons%2Fsimple-icons%2520label%3A%2522update%2520icon%2Fdata%2522%2C%2522new%2520icon%2522%2520is%3Aopen%2520-linked%3Apr&query=%24.total_count&suffix=%20open&logo=svg&logoColor=333&label=icon%20issues&labelColor=FFB13B&color=FFB13B&style=flat-square)](https://github.com/simple-icons/simple-icons/issues?q=is%3Aissue+is%3Aopen+label%3A%22new+icon%22%2C%22update+icon%2Fdata%22) [![Code issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.github.com%2Fsearch%2Fissues%3Fq%3Drepo%3Asimple-icons%2Fsimple-icons%2520is%3Aissue%2520is%3Aopen%2520label%3Ameta%2Cpackage%2520-linked%3Apr&query=%24.total_count&suffix=%20open&logo=typescript&logoColor=white&label=code%20issues&labelColor=3178C6&color=3178C6&style=flat-square)](https://github.com/simple-icons/simple-icons/issues?q=is%3Aissue+is%3Aopen+label%3Adocs%2Cmeta%2Cpackage+-linked%3Apr) [![Documentation issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.github.com%2Fsearch%2Fissues%3Fq%3Drepo%3Asimple-icons%2Fsimple-icons%2520label%3Adocs%2520is%3Aopen%2520-linked%3Apr&query=%24.total_count&suffix=%20open&logo=markdown&label=docs%20issues&labelColor=343a40&color=343a40&logoColor=FFF&style=flat-square)](https://github.com/simple-icons/simple-icons/issues?q=is%3Aopen+is%3Aissue+label%3Adocs+-linked%3Apr)

Information describing how to contribute can be found in the file [CONTRIBUTING.md](https://github.com/simple-icons/simple-icons/blob/develop/CONTRIBUTING.md)

[slug]: https://github.com/simple-icons/simple-icons/blob/master/slugs.md
[open-pr]: https://github.com/simple-icons/simple-icons/compare

## Contributors

<a href="https://github.com/simple-icons/simple-icons/graphs/contributors">
  <img
    src="https://opencollective.com/simple-icons/contributors.svg?width=890&button=false"
    alt="Contributors"
  />
</a>
