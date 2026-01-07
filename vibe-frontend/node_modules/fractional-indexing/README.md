# Fractional Indexing

This is based on [Implementing Fractional Indexing
](https://observablehq.com/@dgreensp/implementing-fractional-indexing) by [David Greenspan
](https://github.com/dgreensp).

Fractional indexing is a technique to create an ordering that can be used for [Realtime Editing of Ordered Sequences](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/).

This implementation includes variable-length integers, and the prepend/append optimization described in David's article.

## API

### `generateKeyBetween`

Generate a single key in between two points.

```ts
generateKeyBetween(
  a: string | null | undefined, // start
  b: string | null | undefined, // end
  digits?: string | undefined = BASE_62_DIGITS, // optional character encoding
): string;
```

```ts
import { generateKeyBetween } from 'fractional-indexing';

const first = generateKeyBetween(null, null); // "a0"

// Insert after 1st
const second = generateKeyBetween(first, null); // "a1"

// Insert after 2nd
const third = generateKeyBetween(second, null); // "a2"

// Insert before 1st
const zeroth = generateKeyBetween(null, first); // "Zz"

// Insert in between 2nd and 3rd (midpoint)
const secondAndHalf = generateKeyBetween(second, third); // "a1V"
```

### `generateNKeysBetween`

Use this when generating multiple keys at some known position, as it spaces out indexes more evenly and leads to shorter keys.

```ts
generateNKeysBetween(
  a: string | null | undefined, // start
  b: string | null | undefined, // end
  n: number // number of keys to generate evenly between start and end
  digits?: string | undefined = BASE_62_DIGITS, // optional character encoding
): string[];
```

```ts
import { generateNKeysBetween } from 'fractional-indexing';

const first = generateNKeysBetween(null, null, 2); // ['a0', 'a1']

// Insert two keys after 2nd
generateNKeysBetween(first[1], null, 2); // ['a2', 'a3']

// Insert two keys before 1st
generateNKeysBetween(null, first[0], 2); // ['Zy', 'Zz']

// Insert two keys in between 1st and 2nd (midpoints)
generateNKeysBetween(second, third, 2); // ['a0G', 'a0V']
```


## Other Languages

These should be byte-for-byte compatible.

| Language | Repo                                                 |
| -------- | ---------------------------------------------------- |
| Go       | https://github.com/rocicorp/fracdex                  |
| Python   | https://github.com/httpie/fractional-indexing-python |
