import {
  Message,
  Offset,
  Schema,
  Row,
  MaybePromise,
  GetExtensions,
  ChangeMessage,
  SnapshotMetadata,
  SubsetParams,
} from './types'
import { MessageParser, Parser, TransformFunction } from './parser'
import {
  ColumnMapper,
  encodeWhereClause,
  quoteIdentifier,
} from './column-mapper'
import { getOffset, isUpToDateMessage, isChangeMessage } from './helpers'
import {
  FetchError,
  FetchBackoffAbortError,
  MissingShapeUrlError,
  InvalidSignalError,
  MissingShapeHandleError,
  ReservedParamError,
  MissingHeadersError,
} from './error'
import {
  BackoffDefaults,
  BackoffOptions,
  createFetchWithBackoff,
  createFetchWithChunkBuffer,
  createFetchWithConsumedMessages,
  createFetchWithResponseHeadersCheck,
} from './fetch'
import {
  CHUNK_LAST_OFFSET_HEADER,
  LIVE_CACHE_BUSTER_HEADER,
  LIVE_CACHE_BUSTER_QUERY_PARAM,
  EXPIRED_HANDLE_QUERY_PARAM,
  COLUMNS_QUERY_PARAM,
  LIVE_QUERY_PARAM,
  OFFSET_QUERY_PARAM,
  SHAPE_HANDLE_HEADER,
  SHAPE_HANDLE_QUERY_PARAM,
  SHAPE_SCHEMA_HEADER,
  WHERE_QUERY_PARAM,
  WHERE_PARAMS_PARAM,
  TABLE_QUERY_PARAM,
  REPLICA_PARAM,
  FORCE_DISCONNECT_AND_REFRESH,
  PAUSE_STREAM,
  EXPERIMENTAL_LIVE_SSE_QUERY_PARAM,
  LIVE_SSE_QUERY_PARAM,
  ELECTRIC_PROTOCOL_QUERY_PARAMS,
  LOG_MODE_QUERY_PARAM,
  SUBSET_PARAM_WHERE,
  SUBSET_PARAM_WHERE_PARAMS,
  SUBSET_PARAM_LIMIT,
  SUBSET_PARAM_OFFSET,
  SUBSET_PARAM_ORDER_BY,
  SUBSET_PARAM_WHERE_EXPR,
  SUBSET_PARAM_ORDER_BY_EXPR,
} from './constants'
import { compileExpression, compileOrderBy } from './expression-compiler'
import {
  EventSourceMessage,
  fetchEventSource,
} from '@microsoft/fetch-event-source'
import { expiredShapesCache } from './expired-shapes-cache'
import { upToDateTracker } from './up-to-date-tracker'
import { SnapshotTracker } from './snapshot-tracker'

const RESERVED_PARAMS: Set<ReservedParamKeys> = new Set([
  LIVE_CACHE_BUSTER_QUERY_PARAM,
  SHAPE_HANDLE_QUERY_PARAM,
  LIVE_QUERY_PARAM,
  OFFSET_QUERY_PARAM,
])

type Replica = `full` | `default`
export type LogMode = `changes_only` | `full`

/**
 * PostgreSQL-specific shape parameters that can be provided externally
 */
export interface PostgresParams<T extends Row<unknown> = Row> {
  /** The root table for the shape. Not required if you set the table in your proxy. */
  table?: string

  /**
   * The columns to include in the shape.
   * Must include primary keys, and can only include valid columns.
   * Defaults to all columns of the type `T`. If provided, must include primary keys, and can only include valid columns.

   */
  columns?: (keyof T)[]

  /** The where clauses for the shape */
  where?: string

  /**
   * Positional where clause paramater values. These will be passed to the server
   * and will substitute `$i` parameters in the where clause.
   *
   * It can be an array (note that positional arguments start at 1, the array will be mapped
   * accordingly), or an object with keys matching the used positional parameters in the where clause.
   *
   * If where clause is `id = $1 or id = $2`, params must have keys `"1"` and `"2"`, or be an array with length 2.
   */
  params?: Record<`${number}`, string> | string[]

  /**
   * If `replica` is `default` (the default) then Electric will only send the
   * changed columns in an update.
   *
   * If it's `full` Electric will send the entire row with both changed and
   * unchanged values. `old_value` will also be present on update messages,
   * containing the previous value for changed columns.
   *
   * Setting `replica` to `full` will result in higher bandwidth
   * usage and so is not generally recommended.
   */
  replica?: Replica
}
type SerializableParamValue = string | string[] | Record<string, string>
type ParamValue =
  | SerializableParamValue
  | (() => SerializableParamValue | Promise<SerializableParamValue>)

/**
 * External params type - what users provide.
 * Excludes reserved parameters to prevent dynamic variations that could cause stream shape changes.
 */
export type ExternalParamsRecord<T extends Row<unknown> = Row> = {
  [K in string]: ParamValue | undefined
} & Partial<PostgresParams<T>> & { [K in ReservedParamKeys]?: never }

type ReservedParamKeys =
  | typeof LIVE_CACHE_BUSTER_QUERY_PARAM
  | typeof SHAPE_HANDLE_QUERY_PARAM
  | typeof LIVE_QUERY_PARAM
  | typeof OFFSET_QUERY_PARAM
  | `subset__${string}`

/**
 * External headers type - what users provide.
 * Allows string or function values for any header.
 */
export type ExternalHeadersRecord = {
  [key: string]: string | (() => string | Promise<string>)
}

/**
 * Internal params type - used within the library.
 * All values are converted to strings.
 */
type InternalParamsRecord = {
  [K in string as K extends ReservedParamKeys ? never : K]:
    | string
    | Record<string, string>
}

/**
 * Helper function to resolve a function or value to its final value
 */
export async function resolveValue<T>(
  value: T | (() => T | Promise<T>)
): Promise<T> {
  if (typeof value === `function`) {
    return (value as () => T | Promise<T>)()
  }
  return value
}

/**
 * Helper function to convert external params to internal format
 */
async function toInternalParams(
  params: ExternalParamsRecord<Row>
): Promise<InternalParamsRecord> {
  const entries = Object.entries(params)
  const resolvedEntries = await Promise.all(
    entries.map(async ([key, value]) => {
      if (value === undefined) return [key, undefined]
      const resolvedValue = await resolveValue(value)
      return [
        key,
        Array.isArray(resolvedValue) ? resolvedValue.join(`,`) : resolvedValue,
      ]
    })
  )

  return Object.fromEntries(
    resolvedEntries.filter(([_, value]) => value !== undefined)
  )
}

/**
 * Helper function to resolve headers
 */
async function resolveHeaders(
  headers?: ExternalHeadersRecord
): Promise<Record<string, string>> {
  if (!headers) return {}

  const entries = Object.entries(headers)
  const resolvedEntries = await Promise.all(
    entries.map(async ([key, value]) => [key, await resolveValue(value)])
  )

  return Object.fromEntries(resolvedEntries)
}

type RetryOpts = {
  params?: ExternalParamsRecord
  headers?: ExternalHeadersRecord
}

type ShapeStreamErrorHandler = (
  error: Error
) => void | RetryOpts | Promise<void | RetryOpts>

/**
 * Options for constructing a ShapeStream.
 */
export interface ShapeStreamOptions<T = never> {
  /**
   * The full URL to where the Shape is served. This can either be the Electric server
   * directly or a proxy. E.g. for a local Electric instance, you might set `http://localhost:3000/v1/shape`
   */
  url: string

  /**
   * The "offset" on the shape log. This is typically not set as the ShapeStream
   * will handle this automatically. A common scenario where you might pass an offset
   * is if you're maintaining a local cache of the log. If you've gone offline
   * and are re-starting a ShapeStream to catch-up to the latest state of the Shape,
   * you'd pass in the last offset and shapeHandle you'd seen from the Electric server
   * so it knows at what point in the shape to catch you up from.
   */
  offset?: Offset

  /**
   * Similar to `offset`, this isn't typically used unless you're maintaining
   * a cache of the shape log.
   */
  handle?: string

  /**
   * HTTP headers to attach to requests made by the client.
   * Values can be strings or functions (sync or async) that return strings.
   * Function values are resolved in parallel when needed, making this useful
   * for authentication tokens or other dynamic headers.
   */
  headers?: ExternalHeadersRecord

  /**
   * Additional request parameters to attach to the URL.
   * Values can be strings, string arrays, or functions (sync or async) that return these types.
   * Function values are resolved in parallel when needed, making this useful
   * for user-specific parameters or dynamic filters.
   *
   * These will be merged with Electric's standard parameters.
   * Note: You cannot use Electric's reserved parameter names
   * (offset, handle, live, cursor).
   *
   * PostgreSQL-specific options like table, where, columns, and replica
   * should be specified here.
   */
  params?: ExternalParamsRecord

  /**
   * Automatically fetch updates to the Shape. If you just want to sync the current
   * shape and stop, pass false.
   */
  subscribe?: boolean

  /**
   * @deprecated No longer experimental, use {@link liveSse} instead.
   */
  experimentalLiveSse?: boolean

  /**
   * Use Server-Sent Events (SSE) for live updates.
   */
  liveSse?: boolean

  /**
   * Initial data loading mode
   */
  log?: LogMode

  signal?: AbortSignal
  fetchClient?: typeof fetch
  backoffOptions?: BackoffOptions
  parser?: Parser<T>

  /**
   * Function to transform rows after parsing (e.g., for encryption, type coercion).
   * Applied to data received from Electric.
   *
   * **Note**: If you're using `transformer` solely for column name transformation
   * (e.g., snake_case → camelCase), consider using `columnMapper` instead, which
   * provides bidirectional transformation and automatically encodes WHERE clauses.
   *
   * **Execution order** when both are provided:
   * 1. `columnMapper.decode` runs first (renames columns)
   * 2. `transformer` runs second (transforms values)
   *
   * @example
   * ```typescript
   * // For column renaming only - use columnMapper
   * import { snakeCamelMapper } from '@electric-sql/client'
   * const stream = new ShapeStream({ columnMapper: snakeCamelMapper() })
   * ```
   *
   * @example
   * ```typescript
   * // For value transformation (encryption, etc.) - use transformer
   * const stream = new ShapeStream({
   *   transformer: (row) => ({
   *     ...row,
   *     encrypted_field: decrypt(row.encrypted_field)
   *   })
   * })
   * ```
   *
   * @example
   * ```typescript
   * // Use both together
   * const stream = new ShapeStream({
   *   columnMapper: snakeCamelMapper(), // Runs first: renames columns
   *   transformer: (row) => ({         // Runs second: transforms values
   *     ...row,
   *     encryptedData: decrypt(row.encryptedData)
   *   })
   * })
   * ```
   */
  transformer?: TransformFunction<T>

  /**
   * Bidirectional column name mapper for transforming between database column names
   * (e.g., snake_case) and application column names (e.g., camelCase).
   *
   * The mapper handles both:
   * - **Decoding**: Database → Application (applied to query results)
   * - **Encoding**: Application → Database (applied to WHERE clauses)
   *
   * @example
   * ```typescript
   * // Most common case: snake_case ↔ camelCase
   * import { snakeCamelMapper } from '@electric-sql/client'
   *
   * const stream = new ShapeStream({
   *   url: 'http://localhost:3000/v1/shape',
   *   params: { table: 'todos' },
   *   columnMapper: snakeCamelMapper()
   * })
   * ```
   *
   * @example
   * ```typescript
   * // Custom mapping
   * import { createColumnMapper } from '@electric-sql/client'
   *
   * const stream = new ShapeStream({
   *   columnMapper: createColumnMapper({
   *     user_id: 'userId',
   *     project_id: 'projectId',
   *     created_at: 'createdAt'
   *   })
   * })
   * ```
   */
  columnMapper?: ColumnMapper

  /**
   * A function for handling shapestream errors.
   *
   * **Automatic retries**: The client automatically retries 5xx server errors, network
   * errors, and 429 rate limits with exponential backoff. The `onError` callback is
   * only invoked after these automatic retries are exhausted, or for non-retryable
   * errors like 4xx client errors.
   *
   * When not provided, non-retryable errors will be thrown and syncing will stop.
   *
   * **Return value behavior**:
   * - Return an **object** (RetryOpts or empty `{}`) to retry syncing:
   *   - `{}` - Retry with the same params and headers
   *   - `{ params }` - Retry with modified params
   *   - `{ headers }` - Retry with modified headers (e.g., refreshed auth token)
   *   - `{ params, headers }` - Retry with both modified
   * - Return **void** or **undefined** to stop the stream permanently
   *
   * **Important**: If you want syncing to continue after an error (e.g., to retry
   * on network failures), you MUST return at least an empty object `{}`. Simply
   * logging the error and returning nothing will stop syncing.
   *
   * Supports async functions that return `Promise<void | RetryOpts>`.
   *
   * @example
   * ```typescript
   * // Retry on network errors, stop on others
   * onError: (error) => {
   *   console.error('Stream error:', error)
   *   if (error instanceof FetchError && error.status >= 500) {
   *     return {} // Retry with same params
   *   }
   *   // Return void to stop on other errors
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Refresh auth token on 401
   * onError: async (error) => {
   *   if (error instanceof FetchError && error.status === 401) {
   *     const newToken = await refreshAuthToken()
   *     return { headers: { Authorization: `Bearer ${newToken}` } }
   *   }
   *   return {} // Retry other errors
   * }
   * ```
   */
  onError?: ShapeStreamErrorHandler
}

export interface ShapeStreamInterface<T extends Row<unknown> = Row> {
  subscribe(
    callback: (
      messages: Message<T>[]
    ) => MaybePromise<void> | { columns?: (keyof T)[] },
    onError?: (error: FetchError | Error) => void
  ): () => void
  unsubscribeAll(): void

  isLoading(): boolean
  lastSyncedAt(): number | undefined
  lastSynced(): number
  isConnected(): boolean
  hasStarted(): boolean

  isUpToDate: boolean
  lastOffset: Offset
  shapeHandle?: string
  error?: unknown
  mode: LogMode

  forceDisconnectAndRefresh(): Promise<void>

  requestSnapshot(params: SubsetParams): Promise<{
    metadata: SnapshotMetadata
    data: Array<Message<T>>
  }>

  fetchSnapshot(opts: SubsetParams): Promise<{
    metadata: SnapshotMetadata
    data: Array<ChangeMessage<T>>
  }>
}

/**
 * Creates a canonical shape key from a URL excluding only Electric protocol parameters
 */
function canonicalShapeKey(url: URL): string {
  const cleanUrl = new URL(url.origin + url.pathname)

  // Copy all params except Electric protocol ones that vary between requests
  for (const [key, value] of url.searchParams) {
    if (!ELECTRIC_PROTOCOL_QUERY_PARAMS.includes(key)) {
      cleanUrl.searchParams.set(key, value)
    }
  }

  cleanUrl.searchParams.sort()
  return cleanUrl.toString()
}

/**
 * Reads updates to a shape from Electric using HTTP requests and long polling or
 * Server-Sent Events (SSE).
 * Notifies subscribers when new messages come in. Doesn't maintain any history of the
 * log but does keep track of the offset position and is the best way
 * to consume the HTTP `GET /v1/shape` api.
 *
 * @constructor
 * @param {ShapeStreamOptions} options - configure the shape stream
 * @example
 * Register a callback function to subscribe to the messages.
 * ```
 * const stream = new ShapeStream(options)
 * stream.subscribe(messages => {
 *   // messages is 1 or more row updates
 * })
 * ```
 *
 * To use Server-Sent Events (SSE) for real-time updates:
 * ```
 * const stream = new ShapeStream({
 *   url: `http://localhost:3000/v1/shape`,
 *   liveSse: true
 * })
 * ```
 *
 * To abort the stream, abort the `signal`
 * passed in via the `ShapeStreamOptions`.
 * ```
 * const aborter = new AbortController()
 * const issueStream = new ShapeStream({
 *   url: `${BASE_URL}/${table}`
 *   subscribe: true,
 *   signal: aborter.signal,
 * })
 * // Later...
 * aborter.abort()
 * ```
 */

export class ShapeStream<T extends Row<unknown> = Row>
  implements ShapeStreamInterface<T>
{
  static readonly Replica = {
    FULL: `full` as Replica,
    DEFAULT: `default` as Replica,
  }

  readonly options: ShapeStreamOptions<GetExtensions<T>>
  #error: unknown = null

  readonly #fetchClient: typeof fetch
  readonly #sseFetchClient: typeof fetch
  readonly #messageParser: MessageParser<T>

  readonly #subscribers = new Map<
    number,
    [
      (messages: Message<T>[]) => MaybePromise<void>,
      ((error: Error) => void) | undefined,
    ]
  >()

  #started = false
  #state = `active` as `active` | `pause-requested` | `paused`
  #lastOffset: Offset
  #liveCacheBuster: string // Seconds since our Electric Epoch 😎
  #lastSyncedAt?: number // unix time
  #isUpToDate: boolean = false
  #isMidStream: boolean = true
  #connected: boolean = false
  #shapeHandle?: string
  #mode: LogMode
  #schema?: Schema
  #onError?: ShapeStreamErrorHandler
  #requestAbortController?: AbortController
  #isRefreshing = false
  #tickPromise?: Promise<void>
  #tickPromiseResolver?: () => void
  #tickPromiseRejecter?: (reason?: unknown) => void
  #messageChain = Promise.resolve<void[]>([]) // promise chain for incoming messages
  #snapshotTracker = new SnapshotTracker()
  #activeSnapshotRequests = 0 // counter for concurrent snapshot requests
  #midStreamPromise?: Promise<void>
  #midStreamPromiseResolver?: () => void
  #lastSeenCursor?: string // Last seen cursor from previous session (used to detect cached responses)
  #currentFetchUrl?: URL // Current fetch URL for computing shape key
  #lastSseConnectionStartTime?: number
  #minSseConnectionDuration = 1000 // Minimum expected SSE connection duration (1 second)
  #consecutiveShortSseConnections = 0
  #maxShortSseConnections = 3 // Fall back to long polling after this many short connections
  #sseFallbackToLongPolling = false
  #sseBackoffBaseDelay = 100 // Base delay for exponential backoff (ms)
  #sseBackoffMaxDelay = 5000 // Maximum delay cap (ms)
  #unsubscribeFromVisibilityChanges?: () => void

  // Derived state: we're in replay mode if we have a last seen cursor
  get #replayMode(): boolean {
    return this.#lastSeenCursor !== undefined
  }

  constructor(options: ShapeStreamOptions<GetExtensions<T>>) {
    this.options = { subscribe: true, ...options }
    validateOptions(this.options)
    this.#lastOffset = this.options.offset ?? `-1`
    this.#liveCacheBuster = ``
    this.#shapeHandle = this.options.handle

    // Build transformer chain: columnMapper.decode -> transformer
    // columnMapper transforms column names, transformer transforms values
    let transformer: TransformFunction<GetExtensions<T>> | undefined

    if (options.columnMapper) {
      const applyColumnMapper = (
        row: Row<GetExtensions<T>>
      ): Row<GetExtensions<T>> => {
        const result: Record<string, unknown> = {}
        for (const [dbKey, value] of Object.entries(row)) {
          const appKey = options.columnMapper!.decode(dbKey)
          result[appKey] = value
        }
        return result as Row<GetExtensions<T>>
      }

      transformer = options.transformer
        ? (row: Row<GetExtensions<T>>) =>
            options.transformer!(applyColumnMapper(row))
        : applyColumnMapper
    } else {
      transformer = options.transformer
    }

    this.#messageParser = new MessageParser<T>(options.parser, transformer)

    this.#onError = this.options.onError
    this.#mode = this.options.log ?? `full`

    const baseFetchClient =
      options.fetchClient ??
      ((...args: Parameters<typeof fetch>) => fetch(...args))

    const backOffOpts = {
      ...(options.backoffOptions ?? BackoffDefaults),
      onFailedAttempt: () => {
        this.#connected = false
        options.backoffOptions?.onFailedAttempt?.()
      },
    }
    const fetchWithBackoffClient = createFetchWithBackoff(
      baseFetchClient,
      backOffOpts
    )

    this.#sseFetchClient = createFetchWithResponseHeadersCheck(
      createFetchWithChunkBuffer(fetchWithBackoffClient)
    )

    this.#fetchClient = createFetchWithConsumedMessages(this.#sseFetchClient)

    this.#subscribeToVisibilityChanges()
  }

  get shapeHandle() {
    return this.#shapeHandle
  }

  get error() {
    return this.#error
  }

  get isUpToDate() {
    return this.#isUpToDate
  }

  get lastOffset() {
    return this.#lastOffset
  }

  get mode() {
    return this.#mode
  }

  async #start(): Promise<void> {
    this.#started = true

    try {
      await this.#requestShape()
    } catch (err) {
      this.#error = err

      // Check if onError handler wants to retry
      if (this.#onError) {
        const retryOpts = await this.#onError(err as Error)
        // Guard against null (typeof null === "object" in JavaScript)
        if (retryOpts && typeof retryOpts === `object`) {
          // Update params/headers but don't reset offset
          // We want to continue from where we left off, not refetch everything
          if (retryOpts.params) {
            // Merge new params with existing params to preserve other parameters
            this.options.params = {
              ...(this.options.params ?? {}),
              ...retryOpts.params,
            }
          }

          if (retryOpts.headers) {
            // Merge new headers with existing headers to preserve other headers
            this.options.headers = {
              ...(this.options.headers ?? {}),
              ...retryOpts.headers,
            }
          }

          // Clear the error since we're retrying
          this.#error = null

          // Restart from current offset
          this.#started = false
          await this.#start()
          return
        }
        // onError returned void, meaning it doesn't want to retry
        // This is an unrecoverable error, notify subscribers
        if (err instanceof Error) {
          this.#sendErrorToSubscribers(err)
        }
        this.#connected = false
        this.#tickPromiseRejecter?.()
        return
      }

      // No onError handler provided, this is an unrecoverable error
      // Notify subscribers and throw
      if (err instanceof Error) {
        this.#sendErrorToSubscribers(err)
      }
      this.#connected = false
      this.#tickPromiseRejecter?.()
      throw err
    }

    // Normal completion, clean up
    this.#connected = false
    this.#tickPromiseRejecter?.()
  }

  async #requestShape(): Promise<void> {
    if (this.#state === `pause-requested`) {
      this.#state = `paused`
      return
    }

    if (
      !this.options.subscribe &&
      (this.options.signal?.aborted || this.#isUpToDate)
    ) {
      return
    }

    const resumingFromPause = this.#state === `paused`
    this.#state = `active`

    const { url, signal } = this.options
    const { fetchUrl, requestHeaders } = await this.#constructUrl(
      url,
      resumingFromPause
    )
    const abortListener = await this.#createAbortListener(signal)
    const requestAbortController = this.#requestAbortController! // we know that it is not undefined because it is set by `this.#createAbortListener`

    try {
      await this.#fetchShape({
        fetchUrl,
        requestAbortController,
        headers: requestHeaders,
        resumingFromPause,
      })
    } catch (e) {
      // Handle abort error triggered by refresh
      if (
        (e instanceof FetchError || e instanceof FetchBackoffAbortError) &&
        requestAbortController.signal.aborted &&
        requestAbortController.signal.reason === FORCE_DISCONNECT_AND_REFRESH
      ) {
        // Start a new request
        return this.#requestShape()
      }

      if (e instanceof FetchBackoffAbortError) {
        // Check current state - it may have changed due to concurrent pause/resume calls
        // from the visibility change handler during the async fetch operation.
        // TypeScript's flow analysis doesn't account for concurrent state changes.
        const currentState = this.#state as
          | `active`
          | `pause-requested`
          | `paused`
        if (
          requestAbortController.signal.aborted &&
          requestAbortController.signal.reason === PAUSE_STREAM &&
          currentState === `pause-requested`
        ) {
          this.#state = `paused`
        }
        return // interrupted
      }
      if (!(e instanceof FetchError)) throw e // should never happen

      if (e.status == 409) {
        // Upon receiving a 409, we should start from scratch
        // with the newly provided shape handle, or a fallback
        // pseudo-handle based on the current one to act as a
        // consistent cache buster

        // Store the current shape URL as expired to avoid future 409s
        if (this.#shapeHandle) {
          const shapeKey = canonicalShapeKey(fetchUrl)
          expiredShapesCache.markExpired(shapeKey, this.#shapeHandle)
        }

        const newShapeHandle =
          e.headers[SHAPE_HANDLE_HEADER] || `${this.#shapeHandle!}-next`
        this.#reset(newShapeHandle)

        // must refetch control message might be in a list or not depending
        // on whether it came from an SSE request or long poll - handle both
        // cases for safety here but worth revisiting 409 handling
        await this.#publish(
          (Array.isArray(e.json) ? e.json : [e.json]) as Message<T>[]
        )
        return this.#requestShape()
      } else {
        // errors that have reached this point are not actionable without
        // additional user input, such as 400s or failures to read the
        // body of a response, so we exit the loop and let #start handle it
        // Note: We don't notify subscribers here because onError might recover
        throw e
      }
    } finally {
      if (abortListener && signal) {
        signal.removeEventListener(`abort`, abortListener)
      }
      this.#requestAbortController = undefined
    }

    this.#tickPromiseResolver?.()
    return this.#requestShape()
  }

  async #constructUrl(
    url: string,
    resumingFromPause: boolean,
    subsetParams?: SubsetParams
  ) {
    // Resolve headers and params in parallel
    const [requestHeaders, params] = await Promise.all([
      resolveHeaders(this.options.headers),
      this.options.params
        ? toInternalParams(convertWhereParamsToObj(this.options.params))
        : undefined,
    ])

    // Validate params after resolution
    if (params) validateParams(params)

    const fetchUrl = new URL(url)

    // Add PostgreSQL-specific parameters
    if (params) {
      if (params.table) setQueryParam(fetchUrl, TABLE_QUERY_PARAM, params.table)
      if (params.where && typeof params.where === `string`) {
        const encodedWhere = encodeWhereClause(
          params.where,
          this.options.columnMapper?.encode
        )
        setQueryParam(fetchUrl, WHERE_QUERY_PARAM, encodedWhere)
      }
      if (params.columns) {
        // Get original columns array from options (before toInternalParams converted to string)
        const originalColumns = await resolveValue(this.options.params?.columns)
        if (Array.isArray(originalColumns)) {
          // Apply columnMapper encoding if present
          let encodedColumns = originalColumns.map(String)
          if (this.options.columnMapper) {
            encodedColumns = encodedColumns.map(
              this.options.columnMapper.encode
            )
          }
          // Quote each column name to handle special characters (commas, etc.)
          const serializedColumns = encodedColumns
            .map(quoteIdentifier)
            .join(`,`)
          setQueryParam(fetchUrl, COLUMNS_QUERY_PARAM, serializedColumns)
        } else {
          // Fallback: columns was already a string
          setQueryParam(fetchUrl, COLUMNS_QUERY_PARAM, params.columns)
        }
      }
      if (params.replica) setQueryParam(fetchUrl, REPLICA_PARAM, params.replica)
      if (params.params)
        setQueryParam(fetchUrl, WHERE_PARAMS_PARAM, params.params)

      // Add any remaining custom parameters
      const customParams = { ...params }
      delete customParams.table
      delete customParams.where
      delete customParams.columns
      delete customParams.replica
      delete customParams.params

      for (const [key, value] of Object.entries(customParams)) {
        setQueryParam(fetchUrl, key, value)
      }
    }

    if (subsetParams) {
      // Prefer structured expressions when available (allows proper columnMapper application)
      // Fall back to legacy string format for backwards compatibility
      if (subsetParams.whereExpr) {
        // Compile structured expression with columnMapper applied
        const compiledWhere = compileExpression(
          subsetParams.whereExpr,
          this.options.columnMapper?.encode
        )
        setQueryParam(fetchUrl, SUBSET_PARAM_WHERE, compiledWhere)
        // Also send the structured expression for servers that support it
        fetchUrl.searchParams.set(
          SUBSET_PARAM_WHERE_EXPR,
          JSON.stringify(subsetParams.whereExpr)
        )
      } else if (subsetParams.where && typeof subsetParams.where === `string`) {
        // Legacy string format (no columnMapper applied to already-compiled SQL)
        const encodedWhere = encodeWhereClause(
          subsetParams.where,
          this.options.columnMapper?.encode
        )
        setQueryParam(fetchUrl, SUBSET_PARAM_WHERE, encodedWhere)
      }

      if (subsetParams.params)
        // Serialize params as JSON to keep the parameter name constant for proxy configs
        fetchUrl.searchParams.set(
          SUBSET_PARAM_WHERE_PARAMS,
          JSON.stringify(subsetParams.params)
        )
      if (subsetParams.limit)
        setQueryParam(fetchUrl, SUBSET_PARAM_LIMIT, subsetParams.limit)
      if (subsetParams.offset)
        setQueryParam(fetchUrl, SUBSET_PARAM_OFFSET, subsetParams.offset)

      // Prefer structured ORDER BY expressions when available
      if (subsetParams.orderByExpr) {
        // Compile structured ORDER BY with columnMapper applied
        const compiledOrderBy = compileOrderBy(
          subsetParams.orderByExpr,
          this.options.columnMapper?.encode
        )
        setQueryParam(fetchUrl, SUBSET_PARAM_ORDER_BY, compiledOrderBy)
        // Also send the structured expression for servers that support it
        fetchUrl.searchParams.set(
          SUBSET_PARAM_ORDER_BY_EXPR,
          JSON.stringify(subsetParams.orderByExpr)
        )
      } else if (
        subsetParams.orderBy &&
        typeof subsetParams.orderBy === `string`
      ) {
        // Legacy string format
        const encodedOrderBy = encodeWhereClause(
          subsetParams.orderBy,
          this.options.columnMapper?.encode
        )
        setQueryParam(fetchUrl, SUBSET_PARAM_ORDER_BY, encodedOrderBy)
      }
    }

    // Add Electric's internal parameters
    fetchUrl.searchParams.set(OFFSET_QUERY_PARAM, this.#lastOffset)
    fetchUrl.searchParams.set(LOG_MODE_QUERY_PARAM, this.#mode)

    // Snapshot requests (with subsetParams) should never use live polling
    const isSnapshotRequest = subsetParams !== undefined

    if (this.#isUpToDate && !isSnapshotRequest) {
      // If we are resuming from a paused state, we don't want to perform a live request
      // because it could be a long poll that holds for 20sec
      // and during all that time `isConnected` will be false
      if (!this.#isRefreshing && !resumingFromPause) {
        fetchUrl.searchParams.set(LIVE_QUERY_PARAM, `true`)
      }
      fetchUrl.searchParams.set(
        LIVE_CACHE_BUSTER_QUERY_PARAM,
        this.#liveCacheBuster
      )
    }

    if (this.#shapeHandle) {
      // This should probably be a header for better cache breaking?
      fetchUrl.searchParams.set(SHAPE_HANDLE_QUERY_PARAM, this.#shapeHandle!)
    }

    // Add cache buster for shapes known to be expired to prevent 409s
    const shapeKey = canonicalShapeKey(fetchUrl)
    const expiredHandle = expiredShapesCache.getExpiredHandle(shapeKey)
    if (expiredHandle) {
      fetchUrl.searchParams.set(EXPIRED_HANDLE_QUERY_PARAM, expiredHandle)
    }

    // sort query params in-place for stable URLs and improved cache hits
    fetchUrl.searchParams.sort()

    return {
      fetchUrl,
      requestHeaders,
    }
  }

  async #createAbortListener(signal?: AbortSignal) {
    // Create a new AbortController for this request
    this.#requestAbortController = new AbortController()

    // If user provided a signal, listen to it and pass on the reason for the abort
    if (signal) {
      const abortListener = () => {
        this.#requestAbortController?.abort(signal.reason)
      }

      signal.addEventListener(`abort`, abortListener, { once: true })

      if (signal.aborted) {
        // If the signal is already aborted, abort the request immediately
        this.#requestAbortController?.abort(signal.reason)
      }

      return abortListener
    }
  }

  async #onInitialResponse(response: Response) {
    const { headers, status } = response
    const shapeHandle = headers.get(SHAPE_HANDLE_HEADER)
    if (shapeHandle) {
      // Don't accept a handle we know is expired - this can happen if a
      // proxy serves a stale cached response despite the expired_handle
      // cache buster parameter
      const shapeKey = this.#currentFetchUrl
        ? canonicalShapeKey(this.#currentFetchUrl)
        : null
      const expiredHandle = shapeKey
        ? expiredShapesCache.getExpiredHandle(shapeKey)
        : null
      if (shapeHandle !== expiredHandle) {
        this.#shapeHandle = shapeHandle
      } else {
        console.warn(
          `[Electric] Received stale cached response with expired shape handle. ` +
            `This should not happen and indicates a proxy/CDN caching misconfiguration. ` +
            `The response contained handle "${shapeHandle}" which was previously marked as expired. ` +
            `Check that your proxy includes all query parameters (especially 'handle' and 'offset') in its cache key. ` +
            `Ignoring the stale handle and continuing with handle "${this.#shapeHandle}".`
        )
      }
    }

    const lastOffset = headers.get(CHUNK_LAST_OFFSET_HEADER)
    if (lastOffset) {
      this.#lastOffset = lastOffset as Offset
    }

    const liveCacheBuster = headers.get(LIVE_CACHE_BUSTER_HEADER)
    if (liveCacheBuster) {
      this.#liveCacheBuster = liveCacheBuster
    }

    this.#schema = this.#schema ?? getSchemaFromHeaders(headers)

    // NOTE: 204s are deprecated, the Electric server should not
    // send these in latest versions but this is here for backwards
    // compatibility
    if (status === 204) {
      // There's no content so we are live and up to date
      this.#lastSyncedAt = Date.now()
    }
  }

  async #onMessages(batch: Array<Message<T>>, isSseMessage = false) {
    // Update isUpToDate
    if (batch.length > 0) {
      // Set isMidStream to true when we receive any data
      this.#isMidStream = true

      const lastMessage = batch[batch.length - 1]
      if (isUpToDateMessage(lastMessage)) {
        if (isSseMessage) {
          // Only use the offset from the up-to-date message if this was an SSE message.
          // If we would use this offset from a regular fetch, then it will be wrong
          // and we will get an "offset is out of bounds for this shape" error
          const offset = getOffset(lastMessage)
          if (offset) {
            this.#lastOffset = offset
          }
        }
        this.#lastSyncedAt = Date.now()
        this.#isUpToDate = true
        // Set isMidStream to false when we see an up-to-date message
        this.#isMidStream = false
        // Resolve the promise waiting for mid-stream to end
        this.#midStreamPromiseResolver?.()

        // Check if we should suppress this up-to-date notification
        // to prevent multiple renders from cached responses
        if (this.#replayMode && !isSseMessage) {
          // We're in replay mode (replaying cached responses during initial sync).
          // Check if the cursor has changed - cursors are time-based and always
          // increment, so a new cursor means fresh data from the server.
          const currentCursor = this.#liveCacheBuster

          if (currentCursor === this.#lastSeenCursor) {
            // Same cursor = still replaying cached responses
            // Suppress this up-to-date notification
            return
          }
        }

        // We're either:
        // 1. Not in replay mode (normal operation), or
        // 2. This is a live/SSE message (always fresh), or
        // 3. Cursor has changed (exited replay mode with fresh data)
        // In all cases, notify subscribers and record the up-to-date.
        this.#lastSeenCursor = undefined // Exit replay mode

        if (this.#currentFetchUrl) {
          const shapeKey = canonicalShapeKey(this.#currentFetchUrl)
          upToDateTracker.recordUpToDate(shapeKey, this.#liveCacheBuster)
        }
      }

      // Filter messages using snapshot tracker
      const messagesToProcess = batch.filter((message) => {
        if (isChangeMessage(message)) {
          return !this.#snapshotTracker.shouldRejectMessage(message)
        }
        return true // Always process control messages
      })

      await this.#publish(messagesToProcess)
    }
  }

  /**
   * Fetches the shape from the server using either long polling or SSE.
   * Upon receiving a successfull response, the #onInitialResponse method is called.
   * Afterwards, the #onMessages method is called for all the incoming updates.
   * @param opts - The options for the request.
   * @returns A promise that resolves when the request is complete (i.e. the long poll receives a response or the SSE connection is closed).
   */
  async #fetchShape(opts: {
    fetchUrl: URL
    requestAbortController: AbortController
    headers: Record<string, string>
    resumingFromPause?: boolean
  }): Promise<void> {
    // Store current fetch URL for shape key computation
    this.#currentFetchUrl = opts.fetchUrl

    // Check if we should enter replay mode (replaying cached responses)
    // This happens when we're starting fresh (offset=-1 or before first up-to-date)
    // and there's a recent up-to-date in localStorage (< 60s)
    if (!this.#isUpToDate && !this.#replayMode) {
      const shapeKey = canonicalShapeKey(opts.fetchUrl)
      const lastSeenCursor = upToDateTracker.shouldEnterReplayMode(shapeKey)
      if (lastSeenCursor) {
        // Enter replay mode and store the last seen cursor
        this.#lastSeenCursor = lastSeenCursor
      }
    }

    const useSse = this.options.liveSse ?? this.options.experimentalLiveSse
    if (
      this.#isUpToDate &&
      useSse &&
      !this.#isRefreshing &&
      !opts.resumingFromPause &&
      !this.#sseFallbackToLongPolling
    ) {
      opts.fetchUrl.searchParams.set(EXPERIMENTAL_LIVE_SSE_QUERY_PARAM, `true`)
      opts.fetchUrl.searchParams.set(LIVE_SSE_QUERY_PARAM, `true`)
      return this.#requestShapeSSE(opts)
    }

    return this.#requestShapeLongPoll(opts)
  }

  async #requestShapeLongPoll(opts: {
    fetchUrl: URL
    requestAbortController: AbortController
    headers: Record<string, string>
  }): Promise<void> {
    const { fetchUrl, requestAbortController, headers } = opts
    const response = await this.#fetchClient(fetchUrl.toString(), {
      signal: requestAbortController.signal,
      headers,
    })

    this.#connected = true
    await this.#onInitialResponse(response)

    const schema = this.#schema! // we know that it is not undefined because it is set by `this.#onInitialResponse`
    const res = await response.text()
    const messages = res || `[]`
    const batch = this.#messageParser.parse<Array<Message<T>>>(messages, schema)

    await this.#onMessages(batch)
  }

  async #requestShapeSSE(opts: {
    fetchUrl: URL
    requestAbortController: AbortController
    headers: Record<string, string>
  }): Promise<void> {
    const { fetchUrl, requestAbortController, headers } = opts
    const fetch = this.#sseFetchClient

    // Track when the SSE connection starts
    this.#lastSseConnectionStartTime = Date.now()

    // Add Accept header for SSE requests
    const sseHeaders = {
      ...headers,
      Accept: `text/event-stream`,
    }

    try {
      let buffer: Array<Message<T>> = []
      await fetchEventSource(fetchUrl.toString(), {
        headers: sseHeaders,
        fetch,
        onopen: async (response: Response) => {
          this.#connected = true
          await this.#onInitialResponse(response)
        },
        onmessage: (event: EventSourceMessage) => {
          if (event.data) {
            // event.data is a single JSON object
            const schema = this.#schema! // we know that it is not undefined because it is set in onopen when we call this.#onInitialResponse
            const message = this.#messageParser.parse<Message<T>>(
              event.data,
              schema
            )
            buffer.push(message)

            if (isUpToDateMessage(message)) {
              // Flush the buffer on up-to-date message.
              // Ensures that we only process complete batches of operations.
              this.#onMessages(buffer, true)
              buffer = []
            }
          }
        },
        onerror: (error: Error) => {
          // rethrow to close the SSE connection
          throw error
        },
        signal: requestAbortController.signal,
      })
    } catch (error) {
      if (requestAbortController.signal.aborted) {
        // During an SSE request, the fetch might have succeeded
        // and we are parsing the incoming stream.
        // If the abort happens while we're parsing the stream,
        // then it won't be caught by our `createFetchWithBackoff` wrapper
        // and instead we will get a raw AbortError here
        // which we need to turn into a `FetchBackoffAbortError`
        // such that #start handles it correctly.`
        throw new FetchBackoffAbortError()
      }
      throw error
    } finally {
      // Check if the SSE connection closed too quickly
      // This can happen when responses are cached or when the proxy/server
      // is misconfigured for SSE and closes the connection immediately
      const connectionDuration = Date.now() - this.#lastSseConnectionStartTime!
      const wasAborted = requestAbortController.signal.aborted

      if (connectionDuration < this.#minSseConnectionDuration && !wasAborted) {
        // Connection was too short - likely a cached response or misconfiguration
        this.#consecutiveShortSseConnections++

        if (
          this.#consecutiveShortSseConnections >= this.#maxShortSseConnections
        ) {
          // Too many short connections - fall back to long polling
          this.#sseFallbackToLongPolling = true
          console.warn(
            `[Electric] SSE connections are closing immediately (possibly due to proxy buffering or misconfiguration). ` +
              `Falling back to long polling. ` +
              `Your proxy must support streaming SSE responses (not buffer the complete response). ` +
              `Configuration: Nginx add 'X-Accel-Buffering: no', Caddy add 'flush_interval -1' to reverse_proxy. ` +
              `Note: Do NOT disable caching entirely - Electric uses cache headers to enable request collapsing for efficiency.`
          )
        } else {
          // Add exponential backoff with full jitter to prevent tight infinite loop
          // Formula: random(0, min(cap, base * 2^attempt))
          const maxDelay = Math.min(
            this.#sseBackoffMaxDelay,
            this.#sseBackoffBaseDelay *
              Math.pow(2, this.#consecutiveShortSseConnections)
          )
          const delayMs = Math.floor(Math.random() * maxDelay)
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      } else if (connectionDuration >= this.#minSseConnectionDuration) {
        // Connection was healthy - reset counter
        this.#consecutiveShortSseConnections = 0
      }
    }
  }

  #pause() {
    if (this.#started && this.#state === `active`) {
      this.#state = `pause-requested`
      this.#requestAbortController?.abort(PAUSE_STREAM)
    }
  }

  #resume() {
    if (
      this.#started &&
      (this.#state === `paused` || this.#state === `pause-requested`)
    ) {
      // Don't resume if the user's signal is already aborted
      // This can happen if the signal was aborted while we were paused
      // (e.g., TanStack DB collection was GC'd)
      if (this.options.signal?.aborted) {
        return
      }

      // If we're resuming from pause-requested state, we need to set state back to active
      // to prevent the pause from completing
      if (this.#state === `pause-requested`) {
        this.#state = `active`
      }
      this.#start()
    }
  }

  subscribe(
    callback: (messages: Message<T>[]) => MaybePromise<void>,
    onError: (error: Error) => void = () => {}
  ) {
    const subscriptionId = Math.random()

    this.#subscribers.set(subscriptionId, [callback, onError])
    if (!this.#started) this.#start()

    return () => {
      this.#subscribers.delete(subscriptionId)
    }
  }

  unsubscribeAll(): void {
    this.#subscribers.clear()
    this.#unsubscribeFromVisibilityChanges?.()
  }

  /** Unix time at which we last synced. Undefined when `isLoading` is true. */
  lastSyncedAt(): number | undefined {
    return this.#lastSyncedAt
  }

  /** Time elapsed since last sync (in ms). Infinity if we did not yet sync. */
  lastSynced(): number {
    if (this.#lastSyncedAt === undefined) return Infinity
    return Date.now() - this.#lastSyncedAt
  }

  /** Indicates if we are connected to the Electric sync service. */
  isConnected(): boolean {
    return this.#connected
  }

  /** True during initial fetch. False afterwise.  */
  isLoading(): boolean {
    return !this.#isUpToDate
  }

  hasStarted(): boolean {
    return this.#started
  }

  isPaused(): boolean {
    return this.#state === `paused`
  }

  /** Await the next tick of the request loop */
  async #nextTick() {
    if (this.#tickPromise) {
      return this.#tickPromise
    }
    this.#tickPromise = new Promise((resolve, reject) => {
      this.#tickPromiseResolver = resolve
      this.#tickPromiseRejecter = reject
    })
    this.#tickPromise.finally(() => {
      this.#tickPromise = undefined
      this.#tickPromiseResolver = undefined
      this.#tickPromiseRejecter = undefined
    })
    return this.#tickPromise
  }

  /** Await until we're not in the middle of a stream (i.e., until we see an up-to-date message) */
  async #waitForStreamEnd() {
    if (!this.#isMidStream) {
      return
    }
    if (this.#midStreamPromise) {
      return this.#midStreamPromise
    }
    this.#midStreamPromise = new Promise((resolve) => {
      this.#midStreamPromiseResolver = resolve
    })
    this.#midStreamPromise.finally(() => {
      this.#midStreamPromise = undefined
      this.#midStreamPromiseResolver = undefined
    })
    return this.#midStreamPromise
  }

  /**
   * Refreshes the shape stream.
   * This preemptively aborts any ongoing long poll and reconnects without
   * long polling, ensuring that the stream receives an up to date message with the
   * latest LSN from Postgres at that point in time.
   */
  async forceDisconnectAndRefresh(): Promise<void> {
    this.#isRefreshing = true
    if (this.#isUpToDate && !this.#requestAbortController?.signal.aborted) {
      // If we are "up to date", any current request will be a "live" request
      // and needs to be aborted
      this.#requestAbortController?.abort(FORCE_DISCONNECT_AND_REFRESH)
    }
    await this.#nextTick()
    this.#isRefreshing = false
  }

  async #publish(messages: Message<T>[]): Promise<void[]> {
    // We process messages asynchronously
    // but SSE's `onmessage` handler is synchronous.
    // We use a promise chain to ensure that the handlers
    // execute sequentially in the order the messages were received.
    this.#messageChain = this.#messageChain.then(() =>
      Promise.all(
        Array.from(this.#subscribers.values()).map(async ([callback, __]) => {
          try {
            await callback(messages)
          } catch (err) {
            queueMicrotask(() => {
              throw err
            })
          }
        })
      )
    )

    return this.#messageChain
  }

  #sendErrorToSubscribers(error: Error) {
    this.#subscribers.forEach(([_, errorFn]) => {
      errorFn?.(error)
    })
  }

  #subscribeToVisibilityChanges() {
    if (
      typeof document === `object` &&
      typeof document.hidden === `boolean` &&
      typeof document.addEventListener === `function`
    ) {
      const visibilityHandler = () => {
        if (document.hidden) {
          this.#pause()
        } else {
          this.#resume()
        }
      }

      document.addEventListener(`visibilitychange`, visibilityHandler)

      // Store cleanup function to remove the event listener
      this.#unsubscribeFromVisibilityChanges = () => {
        document.removeEventListener(`visibilitychange`, visibilityHandler)
      }
    }
  }

  /**
   * Resets the state of the stream, optionally with a provided
   * shape handle
   */
  #reset(handle?: string) {
    this.#lastOffset = `-1`
    this.#liveCacheBuster = ``
    this.#shapeHandle = handle
    this.#isUpToDate = false
    this.#isMidStream = true
    this.#connected = false
    this.#schema = undefined
    this.#activeSnapshotRequests = 0
    // Reset SSE fallback state to try SSE again after reset
    this.#consecutiveShortSseConnections = 0
    this.#sseFallbackToLongPolling = false
  }

  /**
   * Request a snapshot for subset of data and inject it into the subscribed data stream.
   *
   * Only available when mode is `changes_only`.
   * Returns the insertion point & the data, but more importantly injects the data
   * into the subscribed data stream. Returned value is unlikely to be useful for the caller,
   * unless the caller has complicated additional logic.
   *
   * Data will be injected in a way that's also tracking further incoming changes, and it'll
   * skip the ones that are already in the snapshot.
   *
   * @param opts - The options for the snapshot request.
   * @returns The metadata and the data for the snapshot.
   */
  async requestSnapshot(opts: SubsetParams): Promise<{
    metadata: SnapshotMetadata
    data: Array<ChangeMessage<T>>
  }> {
    if (this.#mode === `full`) {
      throw new Error(
        `Snapshot requests are not supported in ${this.#mode} mode, as the consumer is guaranteed to observe all data`
      )
    }
    // We shouldn't be getting a snapshot on a shape that's not started
    if (!this.#started) await this.#start()

    // Wait until we're not mid-stream before pausing
    // This ensures we don't pause in the middle of a transaction
    await this.#waitForStreamEnd()

    // Pause the stream if this is the first snapshot request
    this.#activeSnapshotRequests++

    try {
      if (this.#activeSnapshotRequests === 1) {
        // Currently this cannot throw, but in case it can later it's in this try block to not have a stuck counter
        this.#pause()
      }

      const { metadata, data } = await this.fetchSnapshot(opts)

      const dataWithEndBoundary = (data as Array<Message<T>>).concat([
        { headers: { control: `snapshot-end`, ...metadata } },
        { headers: { control: `subset-end`, ...opts } },
      ])

      this.#snapshotTracker.addSnapshot(
        metadata,
        new Set(data.map((message) => message.key))
      )
      this.#onMessages(dataWithEndBoundary, false)

      return {
        metadata,
        data,
      }
    } finally {
      // Resume the stream if this was the last snapshot request
      this.#activeSnapshotRequests--
      if (this.#activeSnapshotRequests === 0) {
        this.#resume()
      }
    }
  }

  /**
   * Fetch a snapshot for subset of data.
   * Returns the metadata and the data, but does not inject it into the subscribed data stream.
   *
   * @param opts - The options for the snapshot request.
   * @returns The metadata and the data for the snapshot.
   */
  async fetchSnapshot(opts: SubsetParams): Promise<{
    metadata: SnapshotMetadata
    data: Array<ChangeMessage<T>>
  }> {
    const { fetchUrl, requestHeaders } = await this.#constructUrl(
      this.options.url,
      true,
      opts
    )

    const response = await this.#fetchClient(fetchUrl.toString(), {
      headers: requestHeaders,
    })

    if (!response.ok) {
      throw new FetchError(
        response.status,
        undefined,
        undefined,
        Object.fromEntries([...response.headers.entries()]),
        fetchUrl.toString()
      )
    }

    // Use schema from stream if available, otherwise extract from response header
    const schema: Schema =
      this.#schema ??
      getSchemaFromHeaders(response.headers, {
        required: true,
        url: fetchUrl.toString(),
      })

    const { metadata, data: rawData } = await response.json()
    const data = this.#messageParser.parseSnapshotData<ChangeMessage<T>>(
      rawData,
      schema
    )

    return {
      metadata,
      data,
    }
  }
}

/**
 * Extracts the schema from response headers.
 * @param headers - The response headers
 * @param options - Options for schema extraction
 * @param options.required - If true, throws MissingHeadersError when header is missing. Defaults to false.
 * @param options.url - The URL to include in the error message if required is true
 * @returns The parsed schema, or an empty object if not required and header is missing
 * @throws {MissingHeadersError} if required is true and the header is missing
 */
function getSchemaFromHeaders(
  headers: Headers,
  options?: { required?: boolean; url?: string }
): Schema {
  const schemaHeader = headers.get(SHAPE_SCHEMA_HEADER)
  if (!schemaHeader) {
    if (options?.required && options?.url) {
      throw new MissingHeadersError(options.url, [SHAPE_SCHEMA_HEADER])
    }
    return {}
  }
  return JSON.parse(schemaHeader)
}

/**
 * Validates that no reserved parameter names are used in the provided params object
 * @throws {ReservedParamError} if any reserved parameter names are found
 */
function validateParams(params: Record<string, unknown> | undefined): void {
  if (!params) return

  const reservedParams = Object.keys(params).filter((key) =>
    RESERVED_PARAMS.has(key as ReservedParamKeys)
  )
  if (reservedParams.length > 0) {
    throw new ReservedParamError(reservedParams)
  }
}

function validateOptions<T>(options: Partial<ShapeStreamOptions<T>>): void {
  if (!options.url) {
    throw new MissingShapeUrlError()
  }
  if (options.signal && !(options.signal instanceof AbortSignal)) {
    throw new InvalidSignalError()
  }

  if (
    options.offset !== undefined &&
    options.offset !== `-1` &&
    options.offset !== `now` &&
    !options.handle
  ) {
    throw new MissingShapeHandleError()
  }

  validateParams(options.params)

  return
}

// `unknown` being in the value is a bit of defensive programming if user doesn't use TS
function setQueryParam(
  url: URL,
  key: string,
  value: Record<string, string> | string | unknown
): void {
  if (value === undefined || value == null) {
    return
  } else if (typeof value === `string`) {
    url.searchParams.set(key, value)
  } else if (typeof value === `object`) {
    for (const [k, v] of Object.entries(value)) {
      url.searchParams.set(`${key}[${k}]`, v)
    }
  } else {
    url.searchParams.set(key, value.toString())
  }
}

function convertWhereParamsToObj(
  allPgParams: ExternalParamsRecord<Row>
): ExternalParamsRecord<Row> {
  if (Array.isArray(allPgParams.params)) {
    return {
      ...allPgParams,
      params: Object.fromEntries(allPgParams.params.map((v, i) => [i + 1, v])),
    }
  }
  return allPgParams
}
