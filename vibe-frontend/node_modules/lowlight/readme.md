<!--lint disable no-html-->

# lowlight

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]

Virtual syntax highlighting for virtual DOMs and non-HTML things based on
[`highlight.js`][highlight-js].

## Contents

* [What is this?](#what-is-this)
* [When should I use this?](#when-should-i-use-this)
* [Install](#install)
* [Use](#use)
* [API](#api)
  * [`all`](#all)
  * [`common`](#common)
  * [`createLowlight([grammars])`](#createlowlightgrammars)
  * [`lowlight.highlight(language, value[, options])`](#lowlighthighlightlanguage-value-options)
  * [`lowlight.highlightAuto(value[, options])`](#lowlighthighlightautovalue-options)
  * [`lowlight.listLanguages()`](#lowlightlistlanguages)
  * [`lowlight.register(grammars)`](#lowlightregistergrammars)
  * [`lowlight.registerAlias(aliases)`](#lowlightregisteraliasaliases)
  * [`lowlight.registered(aliasOrlanguage)`](#lowlightregisteredaliasorlanguage)
  * [`AutoOptions`](#autooptions)
  * [`LanguageFn`](#languagefn)
  * [`Options`](#options)
* [Examples](#examples)
  * [Example: serializing hast as html](#example-serializing-hast-as-html)
  * [Example: turning hast into preact, react, etc](#example-turning-hast-into-preact-react-etc)
* [Types](#types)
* [Data](#data)
* [CSS](#css)
* [Compatibility](#compatibility)
* [Security](#security)
* [Related](#related)
* [Projects](#projects)
* [Contribute](#contribute)
* [License](#license)

## What is this?

This package uses [`highlight.js`][highlight-js] for syntax highlighting and
outputs objects (ASTs) instead of a string of HTML.
It can support 190+ programming languages.

## When should I use this?

This package is useful when you want to perform syntax highlighting in a place
where serialized HTML wouldn’t work or wouldn’t work well.
For example, you can use lowlight when you want to show code in a CLI by
rendering to ANSI sequences, when you’re using virtual DOM frameworks (such as
React or Preact) so that diffing can be performant, or when you’re working with
ASTs (rehype).

You can use the similar [`refractor`][refractor] if you want to use [Prism][]
grammars instead.
If you’re looking for a *really good* (but rather heavy) alternative, use
[`starry-night`][starry-night].

## Install

This package is [ESM only][esm].
In Node.js (version 16+), install with [npm][]:

```sh
npm install lowlight
```

In Deno with [`esm.sh`][esmsh]:

```js
import {all, common, createLowlight} from 'https://esm.sh/lowlight@3'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {all, common, createLowlight} from 'https://esm.sh/lowlight@3?bundle'
</script>
```

## Use

```js
import {common, createLowlight} from 'lowlight'

const lowlight = createLowlight(common)

const tree = lowlight.highlight('js', '"use strict";')

console.dir(tree, {depth: undefined})
```

Yields:

```js
{
  type: 'root',
  children: [
    {
      type: 'element',
      tagName: 'span',
      properties: {className: ['hljs-meta']},
      children: [{type: 'text', value: '"use strict"'}]
    },
    {type: 'text', value: ';'}
  ],
  data: {language: 'js', relevance: 10}
}
```

## API

This package exports the identifiers [`all`][api-all],
[`common`][api-common], and
[`createLowlight`][api-create-lowlight].
There is no default export.

### `all`

Map of all (±190) grammars ([`Record<string, LanguageFn>`][api-language-fn]).

### `common`

Map of common (37) grammars ([`Record<string, LanguageFn>`][api-language-fn]).

### `createLowlight([grammars])`

Create a `lowlight` instance.

###### Parameters

* `grammars` ([`Record<string, LanguageFn>`][api-language-fn], optional)
  — grammars to add

###### Returns

Lowlight (`Lowlight`).

### `lowlight.highlight(language, value[, options])`

Highlight `value` (code) as `language` (name).

###### Parameters

* `language` (`string`)
  — programming language [name][names]
* `value` (`string`)
  — code to highlight
* `options` ([`Options`][api-options], optional)
  — configuration

###### Returns

Tree ([`Root`][hast-root]); with the following `data` fields: `language`
(`string`), detected programming language name; `relevance` (`number`), how
sure lowlight is that the given code is in the language.

###### Example

```js
import {common, createLowlight} from 'lowlight'

const lowlight = createLowlight(common)

console.log(lowlight.highlight('css', 'em { color: red }'))
```

Yields:

```js
{type: 'root', children: [Array], data: {language: 'css', relevance: 3}}
```

### `lowlight.highlightAuto(value[, options])`

Highlight `value` (code) and guess its programming language.

###### Parameters

* `value` (`string`)
  — code to highlight
* `options` ([`AutoOptions`][api-auto-options], optional)
  — configuration

###### Returns

Tree ([`Root`][hast-root]); with the following `data` fields: `language`
(`string`), detected programming language name; `relevance` (`number`), how
sure lowlight is that the given code is in the language.

###### Example

```js
import {common, createLowlight} from 'lowlight'

const lowlight = createLowlight(common)

console.log(lowlight.highlightAuto('"hello, " + name + "!"'))
```

Yields:

```js
{type: 'root', children: [Array], data: {language: 'arduino', relevance: 2}}
```

### `lowlight.listLanguages()`

List registered languages.

###### Returns

[Names][] of registered language (`Array<string>`).

###### Example

```js
import {createLowlight} from 'lowlight'
import markdown from 'highlight.js/lib/languages/markdown'

const lowlight = createLowlight()

console.log(lowlight.listLanguages()) // => []

lowlight.register({markdown})

console.log(lowlight.listLanguages()) // => ['markdown']
```

### `lowlight.register(grammars)`

Register languages.

###### Signatures

* `register(name, grammar)`
* `register(grammars)`

###### Parameters

* `name` (`string`)
  — programming language [name][names]
* `grammar` ([`LanguageFn`][api-language-fn])
  — grammar
* `grammars` ([`Record<string, LanguageFn>`][api-language-fn], optional)
  — grammars

###### Returns

Nothing (`undefined`).

###### Example

```js
import {createLowlight} from 'lowlight'
import xml from 'highlight.js/lib/languages/xml'

const lowlight = createLowlight()

lowlight.register({xml})

// Note: `html` is an alias for `xml`.
console.log(lowlight.highlight('html', '<em>Emphasis</em>'))
```

Yields:

```js
{type: 'root', children: [Array], data: {language: 'html', relevance: 2}}
```

### `lowlight.registerAlias(aliases)`

Register aliases.

###### Signatures

* `registerAlias(aliases)`
* `registerAlias(name, alias)`

###### Parameters

* `aliases` (`Record<string, Array<string> | string>`)
  — map of programming language [names][] to one or more aliases
* `name` (`string`)
  — programming language [name][names]
* `alias` (`Array<string> | string`)
  — one or more aliases for the programming language

###### Returns

Nothing (`undefined`).

###### Example

```js
import {createLowlight} from 'lowlight'
import markdown from 'highlight.js/lib/languages/markdown'

const lowlight = createLowlight()

lowlight.register({markdown})

// lowlight.highlight('mdown', '<em>Emphasis</em>')
// ^ would throw: Error: Unknown language: `mdown` is not registered

lowlight.registerAlias({markdown: ['mdown', 'mkdn', 'mdwn', 'ron']})
lowlight.highlight('mdown', '<em>Emphasis</em>')
// ^ Works!
```

### `lowlight.registered(aliasOrlanguage)`

Check whether an alias or name is registered.

###### Parameters

* `aliasOrlanguage` (`string`)
  — [name][names] of a language or alias for one

###### Returns

Whether `aliasOrName` is registered (`boolean`).

###### Example

```js
import {createLowlight} from 'lowlight'
import javascript from 'highlight.js/lib/languages/javascript'

const lowlight = createLowlight({javascript})

console.log(lowlight.registered('funkyscript')) // => `false`

lowlight.registerAlias({javascript: 'funkyscript'})
console.log(lowlight.registered('funkyscript')) // => `true`
```

### `AutoOptions`

Configuration for `highlightAuto` (TypeScript type).

###### Fields

* `prefix` (`string`, default: `'hljs-'`)
  — class prefix
* `subset` (`Array<string>`, default: all registered languages)
  — list of allowed languages

### `LanguageFn`

Highlight.js grammar (TypeScript type).

###### Type

```ts
type {LanguageFn} from 'highlight.js'
```

### `Options`

Configuration for `highlight` (TypeScript type).

###### Fields

* `prefix` (`string`, default: `'hljs-'`)
  — class prefix

## Examples

### Example: serializing hast as html

hast trees as returned by lowlight can be serialized with
[`hast-util-to-html`][hast-util-to-html]:

```js
import {common, createLowlight} from 'lowlight'
import {toHtml} from 'hast-util-to-html'

const lowlight = createLowlight(common)

const tree = lowlight.highlight('js', '"use strict";')

console.log(toHtml(tree))
```

Yields:

```html
<span class="hljs-meta">"use strict"</span>;
```

### Example: turning hast into preact, react, etc

hast trees as returned by lowlight can be turned into nodes of any framework
that supports JSX, such as preact, react, solid, svelte, vue, and more, with
[`hast-util-to-jsx-runtime`][hast-util-to-jsx-runtime]:

```js
import {toJsxRuntime} from 'hast-util-to-jsx-runtime'
// @ts-expect-error: react types don’t type these.
import {Fragment, jsx, jsxs} from 'react/jsx-runtime'
import {common, createLowlight} from 'lowlight'

const lowlight = createLowlight(common)

const tree = lowlight.highlight('js', '"use strict";')

console.log(toJsxRuntime(tree, {Fragment, jsx, jsxs}))
```

Yields:

```js
{
  $$typeof: Symbol(react.element),
  type: Symbol(react.fragment),
  key: null,
  ref: null,
  props: {children: [[Object], ';']},
  _owner: null,
  _store: {}
}
```

## Types

This package is fully typed with [TypeScript][].
It exports the additional types
[`AutoOptions`][api-auto-options],
[`LanguageFn`][api-language-fn], and
[`Options`][api-options].

It also registers `root.data` with `@types/hast`.
If you’re working with the data fields, make sure to import this package
somewhere in your types, as that registers the new fields on the file.

```js
/**
 * @import {Root} from 'hast'
 * @import {} from 'lowlight'
 */

import {VFile} from 'vfile'

/** @type {Root} */
const root = {type: 'root', children: []}

console.log(root.data?.language) //=> TS now knows that this is a `string?`.
```

<!--Old name of the following section:-->

<a name="syntaxes"></a>

## Data

If you’re using `createLowlight()`, no syntaxes are included yet.
You can import `all` or `common` and pass them, such as with
`createLowlight(all)`.
Checked syntaxes are included in `common`.
All syntaxes are included in `all`.

You can also manually import syntaxes from `highlight.js/lib/languages/xxx`,
where `xxx` is the name, such as `'highlight.js/lib/languages/wasm'`.

<!--support start-->

* [ ] `1c` — 1C:Enterprise
* [ ] `abnf` — Augmented Backus-Naur Form
* [ ] `accesslog` — Apache Access Log
* [ ] `actionscript` (`as`) — ActionScript
* [ ] `ada` — Ada
* [ ] `angelscript` (`asc`) — AngelScript
* [ ] `apache` (`apacheconf`) — Apache config
* [ ] `applescript` (`osascript`) — AppleScript
* [ ] `arcade` — ArcGIS Arcade
* [x] `arduino` (`ino`) — Arduino
* [ ] `armasm` (`arm`) — ARM Assembly
* [ ] `asciidoc` (`adoc`) — AsciiDoc
* [ ] `aspectj` — AspectJ
* [ ] `autohotkey` (`ahk`) — AutoHotkey
* [ ] `autoit` — AutoIt
* [ ] `avrasm` — AVR Assembly
* [ ] `awk` — Awk
* [ ] `axapta` (`x++`) — X++
* [x] `bash` (`sh`, `zsh`) — Bash
* [ ] `basic` — BASIC
* [ ] `bnf` — Backus–Naur Form
* [ ] `brainfuck` (`bf`) — Brainfuck
* [x] `c` (`h`) — C
* [ ] `cal` — C/AL
* [ ] `capnproto` (`capnp`) — Cap’n Proto
* [ ] `ceylon` — Ceylon
* [ ] `clean` (`icl`, `dcl`) — Clean
* [ ] `clojure` (`clj`, `edn`) — Clojure
* [ ] `clojure-repl` — Clojure REPL
* [ ] `cmake` (`cmake.in`) — CMake
* [ ] `coffeescript` (`coffee`, `cson`, `iced`) — CoffeeScript
* [ ] `coq` — Coq
* [ ] `cos` (`cls`) — Caché Object Script
* [x] `cpp` (`cc`, `c++`, `h++`, `hpp`, `hh`, `hxx`, `cxx`) — C++
* [ ] `crmsh` (`crm`, `pcmk`) — crmsh
* [ ] `crystal` (`cr`) — Crystal
* [x] `csharp` (`cs`, `c#`) — C#
* [ ] `csp` — CSP
* [x] `css` — CSS
* [ ] `d` — D
* [ ] `dart` — Dart
* [ ] `delphi` (`dpr`, `dfm`, `pas`, `pascal`) — Delphi
* [x] `diff` (`patch`) — Diff
* [ ] `django` (`jinja`) — Django
* [ ] `dns` (`bind`, `zone`) — DNS Zone
* [ ] `dockerfile` (`docker`) — Dockerfile
* [ ] `dos` (`bat`, `cmd`) — Batch file (DOS)
* [ ] `dsconfig` — undefined
* [ ] `dts` — Device Tree
* [ ] `dust` (`dst`) — Dust
* [ ] `ebnf` — Extended Backus-Naur Form
* [ ] `elixir` (`ex`, `exs`) — Elixir
* [ ] `elm` — Elm
* [ ] `erb` — ERB
* [ ] `erlang` (`erl`) — Erlang
* [ ] `erlang-repl` — Erlang REPL
* [ ] `excel` (`xlsx`, `xls`) — Excel formulae
* [ ] `fix` — FIX
* [ ] `flix` — Flix
* [ ] `fortran` (`f90`, `f95`) — Fortran
* [ ] `fsharp` (`fs`, `f#`) — F#
* [ ] `gams` (`gms`) — GAMS
* [ ] `gauss` (`gss`) — GAUSS
* [ ] `gcode` (`nc`) — G-code (ISO 6983)
* [ ] `gherkin` (`feature`) — Gherkin
* [ ] `glsl` — GLSL
* [ ] `gml` — GML
* [x] `go` (`golang`) — Go
* [ ] `golo` — Golo
* [ ] `gradle` — Gradle
* [x] `graphql` (`gql`) — GraphQL
* [ ] `groovy` — Groovy
* [ ] `haml` — HAML
* [ ] `handlebars` (`hbs`, `html.hbs`, `html.handlebars`, `htmlbars`) — Handlebars
* [ ] `haskell` (`hs`) — Haskell
* [ ] `haxe` (`hx`) — Haxe
* [ ] `hsp` — HSP
* [ ] `http` (`https`) — HTTP
* [ ] `hy` (`hylang`) — Hy
* [ ] `inform7` (`i7`) — Inform 7
* [x] `ini` (`toml`) — TOML, also INI
* [ ] `irpf90` — IRPF90
* [ ] `isbl` — ISBL
* [x] `java` (`jsp`) — Java
* [x] `javascript` (`js`, `jsx`, `mjs`, `cjs`) — JavaScript
* [ ] `jboss-cli` (`wildfly-cli`) — JBoss CLI
* [x] `json` (`jsonc`) — JSON
* [ ] `julia` — Julia
* [ ] `julia-repl` (`jldoctest`) — Julia REPL
* [x] `kotlin` (`kt`, `kts`) — Kotlin
* [ ] `lasso` (`ls`, `lassoscript`) — Lasso
* [ ] `latex` (`tex`) — LaTeX
* [ ] `ldif` — LDIF
* [ ] `leaf` — Leaf
* [x] `less` — Less
* [ ] `lisp` — Lisp
* [ ] `livecodeserver` — LiveCode
* [ ] `livescript` (`ls`) — LiveScript
* [ ] `llvm` — LLVM IR
* [ ] `lsl` — LSL (Linden Scripting Language)
* [x] `lua` (`pluto`) — Lua
* [x] `makefile` (`mk`, `mak`, `make`) — Makefile
* [x] `markdown` (`md`, `mkdown`, `mkd`) — Markdown
* [ ] `mathematica` (`mma`, `wl`) — Mathematica
* [ ] `matlab` — Matlab
* [ ] `maxima` — Maxima
* [ ] `mel` — MEL
* [ ] `mercury` (`m`, `moo`) — Mercury
* [ ] `mipsasm` (`mips`) — MIPS Assembly
* [ ] `mizar` — Mizar
* [ ] `mojolicious` — Mojolicious
* [ ] `monkey` — Monkey
* [ ] `moonscript` (`moon`) — MoonScript
* [ ] `n1ql` — N1QL
* [ ] `nestedtext` (`nt`) — Nested Text
* [ ] `nginx` (`nginxconf`) — Nginx config
* [ ] `nim` — Nim
* [ ] `nix` (`nixos`) — Nix
* [ ] `node-repl` — Node REPL
* [ ] `nsis` — NSIS
* [x] `objectivec` (`mm`, `objc`, `obj-c`, `obj-c++`, `objective-c++`) — Objective-C
* [ ] `ocaml` (`ml`) — OCaml
* [ ] `openscad` (`scad`) — OpenSCAD
* [ ] `oxygene` — Oxygene
* [ ] `parser3` — Parser3
* [x] `perl` (`pl`, `pm`) — Perl
* [ ] `pf` (`pf.conf`) — Packet Filter config
* [ ] `pgsql` (`postgres`, `postgresql`) — PostgreSQL
* [x] `php` — undefined
* [x] `php-template` — PHP template
* [x] `plaintext` (`text`, `txt`) — Plain text
* [ ] `pony` — Pony
* [ ] `powershell` (`pwsh`, `ps`, `ps1`) — PowerShell
* [ ] `processing` (`pde`) — Processing
* [ ] `profile` — Python profiler
* [ ] `prolog` — Prolog
* [ ] `properties` — .properties
* [ ] `protobuf` (`proto`) — Protocol Buffers
* [ ] `puppet` (`pp`) — Puppet
* [ ] `purebasic` (`pb`, `pbi`) — PureBASIC
* [x] `python` (`py`, `gyp`, `ipython`) — Python
* [x] `python-repl` (`pycon`) — undefined
* [ ] `q` (`k`, `kdb`) — Q
* [ ] `qml` (`qt`) — QML
* [x] `r` — R
* [ ] `reasonml` (`re`) — ReasonML
* [ ] `rib` — RenderMan RIB
* [ ] `roboconf` (`graph`, `instances`) — Roboconf
* [ ] `routeros` (`mikrotik`) — MikroTik RouterOS script
* [ ] `rsl` — RenderMan RSL
* [x] `ruby` (`rb`, `gemspec`, `podspec`, `thor`, `irb`) — Ruby
* [ ] `ruleslanguage` — Oracle Rules Language
* [x] `rust` (`rs`) — Rust
* [ ] `sas` — SAS
* [ ] `scala` — Scala
* [ ] `scheme` (`scm`) — Scheme
* [ ] `scilab` (`sci`) — Scilab
* [x] `scss` — SCSS
* [x] `shell` (`console`, `shellsession`) — Shell Session
* [ ] `smali` — Smali
* [ ] `smalltalk` (`st`) — Smalltalk
* [ ] `sml` (`ml`) — SML (Standard ML)
* [ ] `sqf` — SQF
* [x] `sql` — SQL
* [ ] `stan` (`stanfuncs`) — Stan
* [ ] `stata` (`do`, `ado`) — Stata
* [ ] `step21` (`p21`, `step`, `stp`) — STEP Part 21
* [ ] `stylus` (`styl`) — Stylus
* [ ] `subunit` — SubUnit
* [x] `swift` — Swift
* [ ] `taggerscript` — Tagger Script
* [ ] `tap` — Test Anything Protocol
* [ ] `tcl` (`tk`) — Tcl
* [ ] `thrift` — Thrift
* [ ] `tp` — TP
* [ ] `twig` (`craftcms`) — Twig
* [x] `typescript` (`ts`, `tsx`, `mts`, `cts`) — TypeScript
* [ ] `vala` — Vala
* [x] `vbnet` (`vb`) — Visual Basic .NET
* [ ] `vbscript` (`vbs`) — VBScript
* [ ] `vbscript-html` — VBScript in HTML
* [ ] `verilog` (`v`, `sv`, `svh`) — Verilog
* [ ] `vhdl` — VHDL
* [ ] `vim` — Vim Script
* [x] `wasm` — WebAssembly
* [ ] `wren` — Wren
* [ ] `x86asm` — Intel x86 Assembly
* [ ] `xl` (`tao`) — XL
* [x] `xml` (`html`, `xhtml`, `rss`, `atom`, `xjb`, `xsd`, `xsl`, `plist`, `wsf`, `svg`) — HTML, XML
* [ ] `xquery` (`xpath`, `xq`, `xqm`) — XQuery
* [x] `yaml` (`yml`) — YAML
* [ ] `zephir` (`zep`) — Zephir

<!--support end-->

## CSS

`lowlight` does not inject CSS for the syntax highlighted code (because well,
lowlight doesn’t have to be turned into HTML and might not run in a browser!).
If you are in a browser, you can use any `highlight.js` theme.
For example, to get GitHub Dark from cdnjs:

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/styles/github-dark.min.css">
```

## Compatibility

This package is compatible with maintained versions of Node.js.

When we cut a new major release, we drop support for unmaintained versions of
Node.
This means we try to keep the current release line,
`lowlight@^3`, compatible with Node.js 16.

## Security

This package is safe.

## Related

* [`refractor`][refractor]
  — the same as lowlight but with [Prism][]
* [`starry-night`][starry-night]
  — similar but like GitHub and really good

## Projects

* [`emphasize`](https://github.com/wooorm/emphasize)
  — syntax highlighting in ANSI (for the terminal)
* [`react-lowlight`](https://github.com/rexxars/react-lowlight)
  — syntax highlighter for [React][]
* [`react-syntax-highlighter`](https://github.com/conorhastings/react-syntax-highlighter)
  — [React][] component for syntax highlighting
* [`rehype-highlight`](https://github.com/rehypejs/rehype-highlight)
  — [**rehype**](https://github.com/rehypejs/rehype) plugin to highlight code
  blocks
* [`jstransformer-lowlight`](https://github.com/ai/jstransformer-lowlight)
  — syntax highlighting for [JSTransformers](https://github.com/jstransformers)
  and [Pug](https://pugjs.org/language/filters.html)

## Contribute

Yes please!
See [How to Contribute to Open Source][contribute].

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/wooorm/lowlight/workflows/main/badge.svg

[build]: https://github.com/wooorm/lowlight/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/wooorm/lowlight.svg

[coverage]: https://codecov.io/github/wooorm/lowlight

[downloads-badge]: https://img.shields.io/npm/dm/lowlight.svg

[downloads]: https://www.npmjs.com/package/lowlight

[size-badge]: https://img.shields.io/bundlephobia/minzip/lowlight.svg

[size]: https://bundlephobia.com/result?p=lowlight

[npm]: https://docs.npmjs.com/cli/install

[esmsh]: https://esm.sh

[license]: license

[author]: https://wooorm.com

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[typescript]: https://www.typescriptlang.org

[contribute]: https://opensource.guide/how-to-contribute/

[hast-root]: https://github.com/syntax-tree/hast#root

[highlight-js]: https://github.com/highlightjs/highlight.js

[names]: https://github.com/highlightjs/highlight.js/blob/main/SUPPORTED_LANGUAGES.md

[react]: https://facebook.github.io/react/

[prism]: https://github.com/PrismJS/prism

[refractor]: https://github.com/wooorm/refractor

[starry-night]: https://github.com/wooorm/starry-night

[hast-util-to-html]: https://github.com/syntax-tree/hast-util-to-html

[hast-util-to-jsx-runtime]: https://github.com/syntax-tree/hast-util-to-jsx-runtime

[api-all]: #all

[api-auto-options]: #autooptions

[api-common]: #common

[api-create-lowlight]: #createlowlightgrammars

[api-language-fn]: #languagefn

[api-options]: #options
