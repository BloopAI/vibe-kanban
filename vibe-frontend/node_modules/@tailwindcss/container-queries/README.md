# @tailwindcss/container-queries

A plugin for Tailwind CSS v3.2+ that provides utilities for container queries.

## Installation

Install the plugin from npm:

```sh
npm install @tailwindcss/container-queries
```

Then add the plugin to your `tailwind.config.js` file:

```js
// tailwind.config.js
module.exports = {
  theme: {
    // ...
  },
  plugins: [
    require('@tailwindcss/container-queries'),
    // ...
  ],
}
```

## Usage

Start by marking an element as a container using the `@container` class, and then applying styles based on the size of that container using the container variants like `@md:`, `@lg:`, and `@xl:`:

```html
<div class="@container">
  <div class="@lg:underline">
    <!-- This text will be underlined when the container is larger than `32rem` -->
  </div>
</div>
```

By default we provide [container sizes](#configuration) from `@xs` (`20rem`) to `@7xl` (`80rem`).

### Named containers

You can optionally name containers using a `@container/{name}` class, and then include that name in the container variants using classes like `@lg/{name}:underline`:

```html
<div class="@container/main">
  <!-- ... -->
  <div class="@lg/main:underline">
    <!-- This text will be underlined when the "main" container is larger than `32rem` -->
  </div>
</div>
```

### Arbitrary container sizes

In addition to using one of the [container sizes](#configuration) provided by default, you can also create one-off sizes using any arbitrary value:

```html
<div class="@container">
  <div class="@[17.5rem]:underline"></div>
    <!-- This text will be underlined when the container is larger than `17.5rem` -->
  </div>
</div>
```

### Removing a container

To stop an element from acting as a container, use the `@container-normal` class.

<div class="@container xl:@container-normal">
  <!-- ... -->
</div>

## Configuration

By default we ship with the following configured values:

| Name   | CSS                             |
| ------ | ------------------------------- |
| `@xs`  | `@container (min-width: 20rem)` |
| `@sm`  | `@container (min-width: 24rem)` |
| `@md`  | `@container (min-width: 28rem)` |
| `@lg`  | `@container (min-width: 32rem)` |
| `@xl`  | `@container (min-width: 36rem)` |
| `@2xl` | `@container (min-width: 42rem)` |
| `@3xl` | `@container (min-width: 48rem)` |
| `@4xl` | `@container (min-width: 56rem)` |
| `@5xl` | `@container (min-width: 64rem)` |
| `@6xl` | `@container (min-width: 72rem)` |
| `@7xl` | `@container (min-width: 80rem)` |

You can configure which values are available for this plugin under the `containers` key in your `tailwind.config.js` file:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      containers: {
        '2xs': '16rem',
      },
    },
  },
}
```
