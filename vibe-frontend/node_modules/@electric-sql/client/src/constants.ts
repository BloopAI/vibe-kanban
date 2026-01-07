export const LIVE_CACHE_BUSTER_HEADER = `electric-cursor`
export const SHAPE_HANDLE_HEADER = `electric-handle`
export const CHUNK_LAST_OFFSET_HEADER = `electric-offset`
export const SHAPE_SCHEMA_HEADER = `electric-schema`
export const CHUNK_UP_TO_DATE_HEADER = `electric-up-to-date`
export const COLUMNS_QUERY_PARAM = `columns`
export const LIVE_CACHE_BUSTER_QUERY_PARAM = `cursor`
export const EXPIRED_HANDLE_QUERY_PARAM = `expired_handle`
export const SHAPE_HANDLE_QUERY_PARAM = `handle`
export const LIVE_QUERY_PARAM = `live`
export const OFFSET_QUERY_PARAM = `offset`
export const TABLE_QUERY_PARAM = `table`
export const WHERE_QUERY_PARAM = `where`
export const REPLICA_PARAM = `replica`
export const WHERE_PARAMS_PARAM = `params`
/**
 * @deprecated Use {@link LIVE_SSE_QUERY_PARAM} instead.
 */
export const EXPERIMENTAL_LIVE_SSE_QUERY_PARAM = `experimental_live_sse`
export const LIVE_SSE_QUERY_PARAM = `live_sse`
export const FORCE_DISCONNECT_AND_REFRESH = `force-disconnect-and-refresh`
export const PAUSE_STREAM = `pause-stream`
export const LOG_MODE_QUERY_PARAM = `log`
export const SUBSET_PARAM_WHERE = `subset__where`
export const SUBSET_PARAM_LIMIT = `subset__limit`
export const SUBSET_PARAM_OFFSET = `subset__offset`
export const SUBSET_PARAM_ORDER_BY = `subset__order_by`
export const SUBSET_PARAM_WHERE_PARAMS = `subset__params`
export const SUBSET_PARAM_WHERE_EXPR = `subset__where_expr`
export const SUBSET_PARAM_ORDER_BY_EXPR = `subset__order_by_expr`

// Query parameters that should be passed through when proxying Electric requests
export const ELECTRIC_PROTOCOL_QUERY_PARAMS: Array<string> = [
  LIVE_QUERY_PARAM,
  LIVE_SSE_QUERY_PARAM,
  SHAPE_HANDLE_QUERY_PARAM,
  OFFSET_QUERY_PARAM,
  LIVE_CACHE_BUSTER_QUERY_PARAM,
  EXPIRED_HANDLE_QUERY_PARAM,
  LOG_MODE_QUERY_PARAM,
  SUBSET_PARAM_WHERE,
  SUBSET_PARAM_LIMIT,
  SUBSET_PARAM_OFFSET,
  SUBSET_PARAM_ORDER_BY,
  SUBSET_PARAM_WHERE_PARAMS,
  SUBSET_PARAM_WHERE_EXPR,
  SUBSET_PARAM_ORDER_BY_EXPR,
]
