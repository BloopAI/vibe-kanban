# @posthog/types

Type definitions for the PostHog JavaScript SDK.

## When to Use This Package

### ✅ You Need This Package If:

You're loading PostHog via a **`<script>` tag** and want TypeScript types for `window.posthog`.

```html
<!-- You load PostHog like this -->
<script>
    !function(t,e){...}(document,window.posthog||[]);
    posthog.init('your-api-key', { api_host: 'https://us.i.posthog.com' })
</script>
```

### ❌ You Don't Need This Package If:

You're installing any PostHog library via npm/yarn/pnpm. The types are **already included**:

- `posthog-js` - Browser SDK (includes all types)
- `posthog-node` - Node.js SDK
- `posthog-react-native` - React Native SDK
- `@posthog/react` - React hooks and components

```typescript
// Types are already available when you install posthog-js
import posthog from 'posthog-js'

posthog.init('your-api-key')
posthog.capture('my_event') // ✅ Fully typed
```

## Installation

```bash
npm install @posthog/types
# or
yarn add @posthog/types
# or
pnpm add @posthog/types
```

## Usage

### Typing `window.posthog` (Script Tag Usage)

Create a type declaration file to type `window.posthog`:

```typescript
// posthog.d.ts
import type { PostHog } from '@posthog/types'

declare global {
    interface Window {
        posthog?: PostHog
    }
}

export {}
```

Now you can use `window.posthog` with full type safety:

```typescript
// Your code
window.posthog?.capture('button_clicked', { button_id: 'signup' })
window.posthog?.identify('user-123', { email: 'user@example.com' })

const flagValue = window.posthog?.getFeatureFlag('my-flag')
if (flagValue === 'variant-a') {
    // ...
}
```

### Typing Configuration Objects

```typescript
import type { PostHogConfig, Properties } from '@posthog/types'

// Type your configuration
const config: Partial<PostHogConfig> = {
    api_host: 'https://us.i.posthog.com',
    autocapture: true,
    capture_pageview: 'history_change',
}

// Type event properties
const eventProps: Properties = {
    button_id: 'signup',
    page: '/pricing',
}
```

## Version Synchronization

This package's version is synchronized with `posthog-js`. They are always released together with matching version numbers.

## License

MIT
