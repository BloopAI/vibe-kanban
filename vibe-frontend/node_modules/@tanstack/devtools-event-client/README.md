# @tanstack/devtools-event-client

This package is still under active development and might have breaking changes in the future. Please use it with caution.

## General Usage

```tsx
import { EventClient } from '@tanstack/devtools-event-client'

interface EventMap {
  'query-devtools:a': { foo: string }
  'query-devtools:b': { foo: number }
}

class QueryDevtoolsPlugin extends EventClient<EventMap> {
  constructor() {
    super({
      pluginId: 'query-devtools',
    })
  }
}

export const queryPlugin = new QueryDevtoolsPlugin()

// I'm fully typed here
plugin.emit('a', {
  foo: 'bar',
})
plugin.on('b', (e) => {
  // I'm fully typed here
  e.payload.foo
})
```

## Understanding the implementation

The `EventClient` class is a base class for creating plugins that can subscribe to events in the TanStack Devtools event bus. It allows you to define a set of events and their corresponding data schemas using a standard-schema based schemas.

It will work on both the client/server side and all you have to worry about is emitting/listening to events.
