<p align="center">
  <a href="https://electric-sql.com" target="_blank">
    <picture>
      <source media="(prefers-color-scheme: dark)"
          srcset="https://raw.githubusercontent.com/electric-sql/meta/main/identity/ElectricSQL-logo-next.svg"
      />
      <source media="(prefers-color-scheme: light)"
          srcset="https://raw.githubusercontent.com/electric-sql/meta/main/identity/ElectricSQL-logo-black.svg"
      />
      <img alt="ElectricSQL logo"
          src="https://raw.githubusercontent.com/electric-sql/meta/main/identity/ElectricSQL-logo-black.svg"
      />
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://github.com/electric-sql/electric/actions"><img src="https://github.com/electric-sql/electric/actions/workflows/ts_test.yml/badge.svg"></a>
  <a href="https://github.com/electric-sql/electric/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-green" alt="License - Apache 2.0"></a>
  <a href="https://github.com/electric-sql/electric-n
  ext/milestones"><img src="https://img.shields.io/badge/status-beta-orange" alt="Status - Beta"></a>
  <a href="https://discord.electric-sql.com"><img src="https://img.shields.io/discord/933657521581858818?color=5969EA&label=discord" alt="Chat - Discord"></a>
  <a href="https://x.com/ElectricSQL" target="_blank"><img src="https://img.shields.io/twitter/follow/ElectricSQL.svg?style=social&label=Follow @ElectricSQL"></a>
</p>

# TypeScript client for ElectricSQL

Real-time Postgres sync for modern apps.

Electric provides an [HTTP interface](https://electric-sql.com/docs/api/http) to Postgres to enable a massive number of clients to query and get real-time updates to subsets of the database, called [Shapes](https://electric-sql.com//docs/guides/shapes). In this way, Electric turns Postgres into a real-time database.

The TypeScript client helps ease reading Shapes from the HTTP API in the browser and other JavaScript environments, such as edge functions and server-side Node/Bun/Deno applications. It supports both fine-grained and coarse-grained reactivity patterns &mdash; you can subscribe to see every row that changes, or you can just subscribe to get the whole shape whenever it changes. The client also supports dynamic options through function-based params and headers, making it easy to handle auth tokens, user context, and other runtime values.

## Install

The client is published on NPM as [`@electric-sql/client`](https://www.npmjs.com/package/@electric-sql/client):

```sh
npm i @electric-sql/client
```

## How to use

The client exports a `ShapeStream` class for getting updates to shapes on a row-by-row basis as well as a `Shape` class for getting updates to the entire shape.

### `ShapeStream`

```tsx
import { ShapeStream } from '@electric-sql/client'

// Passes subscribers rows as they're inserted, updated, or deleted
const stream = new ShapeStream({
  url: `${BASE_URL}/v1/shape`,
  params: {
    table: `foo`,
  },
})

// You can also add custom headers and URL parameters
const streamWithParams = new ShapeStream({
  url: `${BASE_URL}/v1/shape`,
  headers: {
    Authorization: 'Bearer token',
  },
  params: {
    table: `foo`,
    'custom-param': 'value',
  },
})

stream.subscribe((messages) => {
  // messages is an array with one or more row updates
  // and the stream will wait for all subscribers to process them
  // before proceeding
})
```

### `Shape`

```tsx
import { ShapeStream, Shape } from '@electric-sql/client'

const stream = new ShapeStream({
  url: `${BASE_URL}/v1/shape`,
  params: {
    table: `foo`
  }
})
const shape = new Shape(stream)

// Returns promise that resolves with the latest shape data once it's fully loaded
await shape.rows

// passes subscribers shape data when the shape updates
shape.subscribe(({ rows }) => {
  // rows is an array of the latest value of each row in a shape.
}
```

### Error Handling

The ShapeStream provides robust error handling with automatic retry support:

#### 1. Stream-level error handler with retry control

The `onError` handler gives you full control over error recovery:

```typescript
const stream = new ShapeStream({
  url: `${BASE_URL}/v1/shape`,
  params: { table: `foo` },
  onError: (error) => {
    console.error('Stream error:', error)

    // IMPORTANT: Return an object to keep syncing!
    // Return void/undefined to stop syncing permanently.

    // Note: 5xx errors and network errors are automatically retried,
    // so onError is mainly for handling client errors (4xx)

    if (error instanceof FetchError) {
      if (error.status === 401) {
        // Unauthorized - refresh token and retry
        const newToken = getRefreshedToken()
        return {
          headers: {
            Authorization: `Bearer ${newToken}`,
          },
        }
      }

      if (error.status === 403) {
        // Forbidden - maybe change user context
        return {
          params: {
            table: `foo`,
            where: `user_id = $1`,
            params: [fallbackUserId],
          },
        }
      }
    }

    // Stop syncing for other errors (return void)
  },
})
```

**Critical**: The `onError` callback's return value controls whether syncing continues:

- **Return an object** (even empty `{}`) to retry syncing:
  - `{}` - Retry with same params and headers
  - `{ params }` - Retry with modified params
  - `{ headers }` - Retry with modified headers
  - `{ params, headers }` - Retry with both modified
- **Return void/undefined** to stop the stream permanently

The handler supports async operations:

```typescript
onError: async (error) => {
  if (error instanceof FetchError && error.status === 401) {
    // Perform async token refresh
    const newToken = await refreshAuthToken()
    return {
      headers: { Authorization: `Bearer ${newToken}` },
    }
  }
  return {} // Retry other errors
}
```

**Automatic retries**: The client automatically retries 5xx server errors, network errors, and 429 rate limits with exponential backoff. The `onError` callback is only invoked after these retries are exhausted, or for non-retryable errors like 4xx client errors.

**Without `onError`**: If no `onError` handler is provided, non-retryable errors (like 4xx client errors) will be thrown and the stream will stop.

#### 2. Subscription-level error callbacks

Individual subscribers can handle errors specific to their subscription:

```typescript
stream.subscribe(
  (messages) => {
    // Handle messages
  },
  (error) => {
    // Handle errors for this specific subscription
    console.error('Subscription error:', error)
  }
)
```

Note: Subscription error callbacks cannot control retry behavior - use the stream-level `onError` for that.

#### Common Error Types

Setup errors:

- `MissingShapeUrlError`: Missing required URL parameter
- `InvalidSignalError`: Invalid AbortSignal instance
- `ReservedParamError`: Using reserved parameter names

Runtime errors:

- `FetchError`: HTTP errors during shape fetching (includes `status`, `url`, `headers`)
- `FetchBackoffAbortError`: Fetch aborted using AbortSignal
- `MissingShapeHandleError`: Missing required shape handle
- `ParserNullValueError`: NULL value in a non-nullable column

See the [TypeScript client docs](https://electric-sql.com/docs/api/clients/typescript#error-handling) for more details.

And in general, see the [docs website](https://electric-sql.com) and [examples](https://electric-sql.com/demos) for more information.

## Develop

Install the pnpm workspace at the repo root:

```shell
pnpm install
```

Build the package:

```shell
cd packages/typescript-client
pnpm build
```

## Test

In one terminal, start the backend running:

```shell
cd ../sync-service
mix deps.get
mix stop_dev && mix compile && mix start_dev && iex -S mix
```

Then in this folder:

```shell
pnpm test
```
