# rfc6902

[![latest version published to npm](https://badge.fury.io/js/rfc6902.svg)](https://www.npmjs.com/package/rfc6902)
[![monthly downloads from npm](https://img.shields.io/npm/dm/rfc6902.svg?style=flat)](https://www.npmjs.com/package/rfc6902)
[![Travis CI build status](https://travis-ci.org/chbrown/rfc6902.svg?branch=master)](https://travis-ci.org/chbrown/rfc6902)
[![Coverage status on Coveralls](https://coveralls.io/repos/github/chbrown/rfc6902/badge.svg?branch=master)](https://coveralls.io/github/chbrown/rfc6902?branch=master)

Complete implementation of [RFC6902](http://tools.ietf.org/html/rfc6902) "JavaScript Object Notation (JSON) Patch"
(including [RFC6901](http://tools.ietf.org/html/rfc6901) "JavaScript Object Notation (JSON) Pointer"),
for creating and consuming `application/json-patch+json` documents.
Also offers "diff" functionality without using `Object.observe`.


## Demo

Simple [web app](https://chbrown.github.io/rfc6902/) using the browser-compiled version of the code.


## Quickstart

### Install locally

```sh
npm install --save rfc6902
```

### Import in your script

```js
const rfc6902 = require('rfc6902')
```

### Calculate diff between two objects

```js
rfc6902.createPatch({first: 'Chris'}, {first: 'Chris', last: 'Brown'})
//⇒ [ { op: 'add', path: '/last', value: 'Brown' } ]
```

### Apply a patch to some object

```js
const users = [{first: 'Chris', last: 'Brown', age: 20}]
rfc6902.applyPatch(users, [
  {op: 'replace', path: '/0/age', value: 21},
  {op: 'add', path: '/-', value: {first: 'Raphael', age: 37}},
])
```
The `applyPatch` function returns `[null, null]`,
indicating there were two patches, both applied successfully.

The `users` variable is modified in place; evaluate it to examine the end result:
```js
users
//⇒ [ { first: 'Chris', last: 'Brown', age: 21 },
//    { first: 'Raphael', age: 37 } ]
```


## API

In ES6 syntax:
```js
import {applyPatch, createPatch} from 'rfc6902'
```

Using [TypeScript](https://www.typescriptlang.org/) annotations for clarity:

### `applyPatch(object: any, patch: Operation[]): Array<Error | null>`

The operations in `patch` are applied to `object` in-place.
Returns a list of results as long as the given `patch`.
If all operations were successful, each item in the returned list will be `null`.
If any of them failed, the corresponding item in the returned list will be an Error instance
with descriptive `.name` and `.message` properties.

### `createPatch(input: any, output: any, diff?: VoidableDiff): Operation[]`

Returns a list of operations (a JSON Patch) of the required operations to make `input` equal to `output`.
In most cases, there is more than one way to transform an object into another.
This method is more efficient than wholesale replacement,
but does not always provide the optimal list of patches.
It uses a simple Levenshtein-type implementation with Arrays,
but it doesn't try for anything much smarter than that,
so it's limited to `remove`, `add`, and `replace` operations.

<details>
  <summary>Optional <code>diff</code> argument</summary>

The optional `diff` argument allows the user to specify a partial function
that's called before the built-in `diffAny` function.
For example, to avoid recursing into instances of a custom class, say, `MyObject`:
```js
function myDiff(input: any, output: any, ptr: Pointer) {
  if ((input instanceof MyObject || output instanceof MyObject) && input != output) {
    return [{op: 'replace', path: ptr.toString(), value: output}]
  }
}
const my_patch = createPatch(input, output, myDiff)
```
This will short-circuit on encountering an instance of `MyObject`, but otherwise recurse as usual.

</details>

### `Operation`

```typescript
interface Operation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test'
  from?: string
  path?: string
  value?: string
}
```

Different operations use different combinations of `from` / `value`;
see [JSON Patch (RFC6902)](#json-patch-rfc6902) below.


## Changelog

I'm not going to copy & paste my relatively descriptive commit messages into groups here;
rather, these are just the changes that merited major version bumps:

### `4.x.x` → `5.0.0` (2021-12-15)

* Short-circuits JSON pointer traversal over the prototype-polluting tokens `__proto__`, `constructor`, and `prototype`. I.e., `/a/__proto__/b` and `/a/b` evaluate to the same thing.
This is in violation of the spec,
which makes no special provisions for this idiosyncrasy of the JavaScript language,
but AFAIK there's no way to strictly comply with the spec in JavaScript.
It would probably be more correct to throw an error in those cases,
but this 'solution' feels less disruptive / more in line with workarounds implemented by other libraries.

### `3.x.x` → `4.0.0` (2020-07-27)

* Potential performance regression due to consolidating separate `compare(a, b): boolean` and `diff(a, b): Operation[]` logic into basically defining `compare(a, b)` as `!diff(a, b).length` (i.e., `diff(a, b)` returns empty array).
This simplifies the codebase and ensures underlying semantics do not diverge,
but potentially does unnecessary work in computing a full diff when all we really care about is whether there is at least one difference.
It also facilitates the user completely specifying custom diff functionality with just one `diff` function,
as opposed to a `diff` and corresponding `compare`
(and avoids the headache of having to propagate both of those around internally).

### `2.x.x` → `3.0.0` (2018-09-17)

* Corrects improper behavior in a few buggy edge cases,
which might conceivably break consumers relying on incorrect behavior.
(Tbh [that applies to most bugfixes](https://xkcd.com/1172/) but I felt there were enough to add up to incrementing the major version.)
* Also moves around some of the internal API that was not intended to be used externally,
but technically _was_ exported.
If you're only importing the public API of `applyPatch`, `createPatch`, and `createTests` from `'rfc6902'`,
nothing has changed.


## Implementation details

### Determinism

If you've ever implemented Levenshtein's algorithm,
or played tricks with `git rebase` to get a reasonable sequence of commits,
you'll realize that computing diffs is rarely deterministic.
E.g., to transform the string `ab` → `bc`, you could:
1. Delete `a` (⇒ `b`)
2. and then append `c` (⇒ `bc`)

_Or..._
1. Replace `b` with `c` (⇒ `ac`)
2. and then replace `a` with `b` (⇒ `bc`)

Both consist of two operations, so either one is a valid solution.

Applying `json-patch` documents is much easier than generating them,
which might explain why, when I started this project,
there were more than five patch-applying RFC6902 implementations in NPM,
but none for generating a patch from two distinct objects.
(There was one that used `Object.observe()`, which only works when you're the one making the changes,
and only as long as `Object.observe()` hasn't been deprecated, which it has.)

So when comparing _your_ data objects, you'll want to ensure that the patches it generates meet your needs.
The algorithm used by this library is not optimal,
but it's more efficient than the strategy of wholesale replacing everything that's not an exact match.

Of course, this only applies to generating the patches.
Applying them is deterministic and unambiguously specified by [RFC6902](http://tools.ietf.org/html/rfc6902).

### JSON Pointer (RFC6901)

The [RFC](http://tools.ietf.org/html/rfc6901) is a quick and easy read, but here's the gist:

* JSON Pointer is a system for pointing to some fragment of a JSON document.
* A pointer is a string that is composed of zero or more <code>/<i>reference-token</i></code> parts.
  - When there are zero (the empty string), the pointer indicates the entire JSON document.
  - Otherwise, the parts are read from left to right, each one selecting part of the current document,
    and presenting only that fragment of the document to the next part.
* The <code><i>reference-token</i></code> bits are usually Object keys,
  but may also be (decimal) numerals, to indicate array indices.

E.g., consider the NPM registry:

```js
{
  "_updated": 1417985649051,
  "flickr-with-uploads": {
    "name": "flickr-with-uploads",
    "description": "Flickr API with OAuth 1.0A and uploads",
    "repository": {
      "type": "git",
      "url": "git://github.com/chbrown/flickr-with-uploads.git"
    },
    "homepage": "https://github.com/chbrown/flickr-with-uploads",
    "keywords": [
      "flickr",
      "api",
      "backup"
    ],
    ...
  },
  ...
}
```
1. `/_updated`: this selects the value of that key, which is just a number: `1417985649051`
2. `/flickr-with-uploads`: This selects the entire object:
   ```js
   {
     "name": "flickr-with-uploads",
     "description": "Flickr API with OAuth 1.0A and uploads",
     "repository": {
       "type": "git",
       "url": "git://github.com/chbrown/flickr-with-uploads.git"
     },
     "homepage": "https://github.com/chbrown/flickr-with-uploads",
     "keywords": [
       "flickr",
       "api",
       "backup"
     ],
     ...
   }
   ```
3. `/flickr-with-uploads/name`: this effectively applies the `/name` pointer to the result of the previous item,
   which selects the string, `"flickr-with-uploads"`.
4. `/flickr-with-uploads/keywords/1`: Array indices start at 0,
   so this selects the second item from the `keywords` array, namely, `"api"`.

#### Rules:

* A pointer, if it is not empty, must always start with a slash;
otherwise, it is an "Invalid pointer syntax" error.
* If a key within the JSON document contains a forward slash character
  (which is totally valid JSON, but not very nice),
  the `/` in the desired key should be replaced by the escape sequence, `~1`.
* If a key within the JSON document contains a tilde (again valid JSON, but not very common),
  the `~` should be replaced by the other escape sequence, `~0`.
  This allows keys containing the literal string `~1` (which is especially cruel)
  to be referenced by a JSON pointer (e.g., `/~01` should return `true` when applied to the object `{"~1":true}`).
* All double quotation marks, reverse slashes,
  and control characters _must_ escaped, since a JSON Pointer is a JSON string.
* A pointer that refers to a non-existent value counts as an error, too.
  But not necessarily as fatal as a syntax error.

#### Example

This project implements JSON Pointer functionality; e.g.:

```js
const {Pointer} = require('rfc6902')
const repository = {
  contributors: ['chbrown', 'diachedelic', 'nathanrobinson', 'kbiedrzycki', 'stefanmaric']
}
const pointer = Pointer.fromJSON('/contributors/0')
//⇒ Pointer { tokens: [ '', 'contributors', '0' ] }
pointer.get(repository)
//⇒ 'chbrown'
```

### JSON Patch (RFC6902)

The [RFC](http://tools.ietf.org/html/rfc6902) is only 18 pages long, but here are the basics:

A JSON Patch document is a JSON document such that:

* The MIME Type is `application/json-patch+json`
* The file extension is `.json-patch`
* It is an array of patch objects, potentially empty.
* Each patch object has a key, `op`, with one of the following six values,
  and an operator-specific set of other keys.
  - **`add`**: Insert the given `value` at `path`. Or replace it, if it already exists.
    If the parent of the intended target does not exist, produce an error.
    If the final reference-token of `path` is "`-`", and the parent is an array, append `value` to it.
    + `path`: JSON Pointer
    + `value`: JSON object
  - **`remove`**: Remove the value at `path`. Produces an error if it does not exist.
    If `path` refers to an element within an array,
    splice it out so that subsequent elements fill in the gap (decrementing the length of the array).
    + `path`: JSON Pointer
  - **`replace`**: Replace the current value at `path` with `value`.
    It's exactly the same as performing a `remove` operation and then an `add` operation on the same path,
    since there _must_ be a pre-existing value.
    + `path`: JSON Pointer
    + `value`: JSON object
  - **`move`**: Remove the value at `from`, and set `path` to that value.
    There _must_ be a value at `from`, but not necessarily at `path`;
    it's the same as performing a `remove` operation, and then an `add` operation, but on different paths.
    + `from`: JSON Pointer
    + `path`: JSON Pointer
  - **`copy`**: Get the value at `from` and set `path` to that value.
    Same as `move`, but doesn't remove the original value.
    + `from`: JSON Pointer
    + `path`: JSON Pointer
  - **`test`**: Check that the value at `path` is equal to `value`.
    If it is not, the entire patch is considered to be a failure.
    + `path`: JSON Pointer
    + `value`: JSON object


## License

Copyright 2014-2021 Christopher Brown.
[MIT Licensed](https://chbrown.github.io/licenses/MIT/#2014-2021).
