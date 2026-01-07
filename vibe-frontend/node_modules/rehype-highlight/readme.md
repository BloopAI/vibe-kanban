# rehype-highlight

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

**[rehype][]** plugin to apply syntax highlighting to code with
[`lowlight`][lowlight].

## Contents

* [What is this?](#what-is-this)
* [When should I use this?](#when-should-i-use-this)
* [Install](#install)
* [Use](#use)
* [API](#api)
  * [`unified().use(rehypeHighlight[, options])`](#unifieduserehypehighlight-options)
  * [`Options`](#options)
* [Example](#example)
  * [Example: ignoring](#example-ignoring)
  * [Example: registering](#example-registering)
  * [Example: aliases](#example-aliases)
  * [Example: sanitation](#example-sanitation)
  * [Example: line numbering and highlighting](#example-line-numbering-and-highlighting)
* [Types](#types)
* [HTML](#html)
* [CSS](#css)
* [Compatibility](#compatibility)
* [Security](#security)
* [Related](#related)
* [Contribute](#contribute)
* [License](#license)

## What is this?

This package is a [unified][] ([rehype][]) plugin to perform syntax
highlighting.
It uses `highlight.js` through `lowlight`, which is pretty fast, relatively
small, and quite good.
This package bundles 37 [common languages][lowlight-common] by default and you
can register more (190 with [`all`][lowlight-all]).

It looks for `<code>` elements (when directly in `<pre>` elements) and changes
them.
You can specify the code language (such as Python) with a `language-*` or
`lang-*` class, where the `*` can be for example `js` (so `language-js`), `md`,
`css`, etc.
By default, code without such a language class is not highlighted.
Pass `detect: true` to detect their programming language and highlight the code
anyway.
You can prevent specific blocks from being highlighted with a `no-highlight` or
`nohighlight` class on the `<code>`.

**unified** is a project that transforms content with abstract syntax trees
(ASTs).
**rehype** adds support for HTML to unified.
**hast** is the HTML AST that rehype uses.
This is a rehype plugin that applies syntax highlighting to the AST.

## When should I use this?

This project is useful when you want to perform syntax highlighting in rehype.
One reason to do that is that it typically means the highlighting happens once
at build time instead of every time at run time.

When you want a high quality highlighter that can support tons of grammars and
approaches how GitHub renders code,
you can use [`rehype-starry-night`][rehype-starry-night].

This plugin is built on [`lowlight`][lowlight], which is a virtual version of
highlight.js.
You can make a plugin based on this one with lowlight when you want to do things
differently.

## Install

This package is [ESM only][esm].
In Node.js (version 16+), install with [npm][]:

```sh
npm install rehype-highlight
```

In Deno with [`esm.sh`][esmsh]:

```js
import rehypeHighlight from 'https://esm.sh/rehype-highlight@6'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import rehypeHighlight from 'https://esm.sh/rehype-highlight@6?bundle'
</script>
```

## Use

Say we have the following file `example.html`:

```html
<h1>Hello World!</h1>

<pre><code class="language-js">var name = "World";
console.warn("Hello, " + name + "!")</code></pre>
```

…and our module `example.js` contains:

```js
import rehypeHighlight from 'rehype-highlight'
import rehypeParse from 'rehype-parse'
import rehypeStringify from 'rehype-stringify'
import {read} from 'to-vfile'
import {unified} from 'unified'

const file = await read('example.html')

await unified()
  .use(rehypeParse, {fragment: true})
  .use(rehypeHighlight)
  .use(rehypeStringify)
  .process(file)

console.log(String(file))
```

…then running `node example.js` yields:

```html
<h1>Hello World!</h1>

<pre><code class="hljs language-js"><span class="hljs-keyword">var</span> name = <span class="hljs-string">"World"</span>;
<span class="hljs-variable language_">console</span>.<span class="hljs-title function_">warn</span>(<span class="hljs-string">"Hello, "</span> + name + <span class="hljs-string">"!"</span>)</code></pre>
```

## API

This package exports no identifiers.
The default export is [`rehypeHighlight`][api-rehype-highlight].

### `unified().use(rehypeHighlight[, options])`

Apply syntax highlighting.

###### Parameters

* `options` ([`Options`][api-options], optional)
  — configuration

###### Returns

Transform ([`Transformer`][unified-transformer]).

### `Options`

Configuration (TypeScript type).

###### Fields

* `aliases` (`Record<string, Array<string> | string>`, optional)
  — register more aliases;
  passed to [`lowlight.registerAlias`][lowlight-register-alias]
* `detect` (`boolean`, default: `false`)
  — highlight code without language classes by guessing its programming
  language
* `languages` (`Record<string, LanguageFn>`, default:
  [`common`][lowlight-common])
  — register languages; passed to [`lowlight.register`][lowlight-register]
* `plainText` (`Array<string>`, optional)
  — list of language names to not highlight;
  note you can also add `no-highlight` classes
* `prefix` (`string`, default: `'hljs-'`)
  — class prefix
* `subset` (`Array<string>`, default: default: [all][lowlight-all] registered
  languages)
  — names of languages to check when detecting

## Example

### Example: ignoring

There are three ways to not apply syntax highlighting to code blocks.
They can be ignored with an explicit class of `no-highlight` (or `nohighlight`),
an explicit language name that’s listed in `options.plainText`, or by setting
`options.detect` to `false` (default), which prevents `<code>` without a class
from being automatically detected.

For example, with `example.html`:

```html
<pre><code>this won’t be highlighted due to `detect: false` (default)</code></pre>

<pre><code class="no-highlight">this won’t be highlighted due to its class</code></pre>

<pre><code class="language-txt">this won’t be highlighted due to `plainText: ['txt']`</code></pre>
```

…and `example.js`:

```js
import {rehype} from 'rehype'
import rehypeHighlight from 'rehype-highlight'
import {read} from 'to-vfile'

const file = await rehype()
  .data('settings', {fragment: true})
  .use(rehypeHighlight, {plainText: ['txt', 'text']})
  .process(await read('example.html'))

console.log(String(file))
```

…then running that yields the same as `example.html`: none of them are
highlighted.

### Example: registering

`rehype-highlight` supports 37 commonly used languages by default.
This makes it small to load in browsers and Node.js, while supporting enough
default cases.
You can add more languages.

For example, with `example.html`:

```html
<pre><code class="language-bnf">a ::= 'a' | 'A'</code></pre>
```

…and `example.js`:

```js
import bnf from 'highlight.js/lib/languages/bnf'
import {common} from 'lowlight'
import {rehype} from 'rehype'
import rehypeHighlight from 'rehype-highlight'
import {read} from 'to-vfile'

const file = await rehype()
  .data('settings', {fragment: true})
  .use(rehypeHighlight, {languages: {...common, bnf}})
  .process(await read('example.html'))

console.log(String(file))
```

…then running that yields:

```html
<pre><code class="hljs language-bnf">a ::= <span class="hljs-string">'a'</span> | <span class="hljs-string">'A'</span></code></pre>
```

### Example: aliases

You can map your own language flags to `highlight.js` languages.

For example, with `example.html`:

```html
<pre><code class="language-custom-script">console.log(1)</code></pre>
```

…and `example.js`:

```js
import {rehype} from 'rehype'
import rehypeHighlight from 'rehype-highlight'
import {read} from 'to-vfile'

const file = await rehype()
  .data('settings', {fragment: true})
  // 👉 **Note**: the keys are language names, values are the aliases that you
  // want to also allow as `x` in `language-x` classes.
  .use(rehypeHighlight, {aliases: {'javascript': 'custom-script'}})
  .process(await read('example.html'))

console.log(String(file))
```

…then running that yields:

```html
<pre><code class="hljs language-custom-script"><span class="hljs-variable language_">console</span>.<span class="hljs-title function_">log</span>(<span class="hljs-number">1</span>)</code></pre>
```

### Example: sanitation

Applying syntax highlighting in rehype operates on `<code>` elements with
certain classes and it injects many `<span>` elements with classes.
Allowing arbitrary classes is an opening for security vulnerabilities.

To make HTML safe in rehype, use [`rehype-sanitize`][rehype-sanitize].
It specifically allows `/^language-./` class names on `<code>` elements.
Which we also use.
So you can use `rehype-highlight` after `rehype-sanitize`:

```js
import {unified} from 'unified'
import rehypeHighlight from './index.js'
import rehypeParse from 'rehype-parse'
import rehypeSanitize, {defaultSchema} from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'

const file = await unified()
  .use(rehypeParse, {fragment: true})
  .use(rehypeSanitize)
  .use(rehypeHighlight)
  .use(rehypeStringify)
  .process('<pre><code className="language-js">console.log(1)</code></pre>')

console.log(String(file))
```

…yields:

```html
<pre><code class="hljs language-js"><span class="hljs-variable language_">console</span>.<span class="hljs-title function_">log</span>(<span class="hljs-number">1</span>)</code></pre>
```

Using plugins *after* `rehype-sanitize`, like we just did, is *safe* assuming
you trust those plugins.
If you do not trust `rehype-highlight`, you can use it before.
But then you need to configure `rehype-sanitize` to keep the classes you allow:

```js
import {unified} from 'unified'
import rehypeHighlight from './index.js'
import rehypeParse from 'rehype-parse'
import rehypeSanitize, {defaultSchema} from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'

const file = await unified()
  .use(rehypeParse, {fragment: true})
  .use(rehypeHighlight)
  .use(rehypeSanitize, {
    ...defaultSchema,
    attributes: {
      ...defaultSchema.attributes,
      span: [
        ...(defaultSchema.attributes?.span || []),
        // Allow all class names starting with `hljs-`.
        ['className', /^hljs-./]
        // Alternatively, to allow only certain class names:
        // ['className', 'hljs-number', 'hljs-title', 'hljs-variable']
      ]
    },
    tagNames: [...(defaultSchema.tagNames || []), 'span']
  })
  .use(rehypeStringify)
  .process('<pre><code className="language-js">console.log(1)</code></pre>')

console.log(String(file))
```

### Example: line numbering and highlighting

You can add support for line numbers and line highlighting with a separate
plugin, [`rehype-highlight-code-lines`][rehype-highlight-code-lines].

For example, with `example.html`:

```html
<pre><code class="language-js">console.log("Hi!")</code></pre>
```

…and `example.js`:

```js
import {rehype} from 'rehype'
import rehypeHighlight from 'rehype-highlight'
import rehypeHighlightCodeLines from 'rehype-highlight-code-lines'
import {read} from 'to-vfile'

const file = await rehype()
  .data('settings', {fragment: true})
  .use(rehypeHighlight)
  .use(rehypeHighlightCodeLines, {
    showLineNumbers: true,
    lineContainerTagName: 'div'
  })
  .process(await read('example.html'))

console.log(String(file))
```

…then running that yields:

```html
<pre><code class="hljs language-js"><div class="code-line numbered-code-line" data-line-number="1"><span class="hljs-variable language_">console</span>.<span class="hljs-title function_">log</span>(<span class="hljs-string">"Hi!"</span>)</div></code></pre>
```

## Types

This package is fully typed with [TypeScript][].
It exports the additional type [`Options`][api-options].

## HTML

On the input side,
this plugin looks for code blocks with a `language-*` class.

On the output side,
this plugin generates `span` elements with classes that can be enhanced with
CSS.

## CSS

See [“CSS” in `lowlight`][github-lowlight-css] for more info.

## Compatibility

Projects maintained by the unified collective are compatible with maintained
versions of Node.js.

When we cut a new major release, we drop support for unmaintained versions of
Node.
This means we try to keep the current release line, `rehype-highlight@^7`,
compatible with Node.js 16.

This plugin works with `rehype-parse` version 1+, `rehype-stringify` version 1+,
`rehype` version 1+, and `unified` version 4+.

## Security

Use of `rehype-highlight` *should* be safe to use as `highlight.js` and
`lowlight` *should* be safe to use.
When in doubt, use [`rehype-sanitize`][rehype-sanitize].

## Related

* [`rehype-starry-night`][rehype-starry-night]
  — apply syntax highlighting with `starry-night`
* [`rehype-meta`](https://github.com/rehypejs/rehype-meta)
  — add metadata to the head of a document
* [`rehype-document`](https://github.com/rehypejs/rehype-document)
  — wrap a fragment in a document
* [`rehype-highlight-code-lines`][rehype-highlight-code-lines]
  — add line numbers and highlight lines

## Contribute

See [`contributing.md`][contributing] in [`rehypejs/.github`][health] for ways
to get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[api-options]: #options

[api-rehype-highlight]: #unifieduserehypehighlight-options

[author]: https://wooorm.com

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[build]: https://github.com/rehypejs/rehype-highlight/actions

[build-badge]: https://github.com/rehypejs/rehype-highlight/workflows/main/badge.svg

[chat]: https://github.com/rehypejs/rehype/discussions

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[coc]: https://github.com/rehypejs/.github/blob/HEAD/code-of-conduct.md

[collective]: https://opencollective.com/unified

[contributing]: https://github.com/rehypejs/.github/blob/HEAD/contributing.md

[coverage]: https://codecov.io/github/rehypejs/rehype-highlight

[coverage-badge]: https://img.shields.io/codecov/c/github/rehypejs/rehype-highlight.svg

[downloads]: https://www.npmjs.com/package/rehype-highlight

[downloads-badge]: https://img.shields.io/npm/dm/rehype-highlight.svg

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[esmsh]: https://esm.sh

[github-lowlight-css]: https://github.com/wooorm/lowlight#css

[health]: https://github.com/rehypejs/.github

[license]: license

[lowlight]: https://github.com/wooorm/lowlight

[lowlight-all]: https://github.com/wooorm/lowlight#all

[lowlight-common]: https://github.com/wooorm/lowlight#common

[lowlight-register]: https://github.com/wooorm/lowlight#lowlightregistergrammars

[lowlight-register-alias]: https://github.com/wooorm/lowlight#lowlightregisteraliasaliases

[npm]: https://docs.npmjs.com/cli/install

[rehype]: https://github.com/rehypejs/rehype

[rehype-highlight-code-lines]: https://github.com/ipikuka/rehype-highlight-code-lines

[rehype-sanitize]: https://github.com/rehypejs/rehype-sanitize

[rehype-starry-night]: https://github.com/rehypejs/rehype-starry-night

[size]: https://bundlejs.com/?q=rehype-highlight

[size-badge]: https://img.shields.io/bundlejs/size/rehype-highlight

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[support]: https://github.com/rehypejs/.github/blob/HEAD/support.md

[typescript]: https://www.typescriptlang.org

[unified]: https://github.com/unifiedjs/unified

[unified-transformer]: https://github.com/unifiedjs/unified#transformer
