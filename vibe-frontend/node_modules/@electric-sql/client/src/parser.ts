import { ColumnInfo, GetExtensions, Row, Schema, Value } from './types'
import { ParserNullValueError } from './error'

type Token = string
type NullableToken = Token | null
export type ParseFunction<Extensions = never> = (
  value: Token,
  additionalInfo?: Omit<ColumnInfo, `type` | `dims`>
) => Value<Extensions>
type NullableParseFunction<Extensions = never> = (
  value: NullableToken,
  additionalInfo?: Omit<ColumnInfo, `type` | `dims`>
) => Value<Extensions>
/**
 * @typeParam Extensions - Additional types that can be parsed by this parser beyond the standard SQL types.
 *                         Defaults to no additional types.
 */
export type Parser<Extensions = never> = {
  [key: string]: ParseFunction<Extensions>
}

export type TransformFunction<Extensions = never> = (
  message: Row<Extensions>
) => Row<Extensions>

const parseNumber = (value: string) => Number(value)
const parseBool = (value: string) => value === `true` || value === `t`
const parseBigInt = (value: string) => BigInt(value)
const parseJson = (value: string) => JSON.parse(value)
const identityParser: ParseFunction = (v: string) => v

export const defaultParser: Parser = {
  int2: parseNumber,
  int4: parseNumber,
  int8: parseBigInt,
  bool: parseBool,
  float4: parseNumber,
  float8: parseNumber,
  json: parseJson,
  jsonb: parseJson,
}

// Taken from: https://github.com/electric-sql/pglite/blob/main/packages/pglite/src/types.ts#L233-L279
export function pgArrayParser<Extensions>(
  value: Token,
  parser?: NullableParseFunction<Extensions>
): Value<Extensions> {
  let i = 0
  let char = null
  let str = ``
  let quoted = false
  let last = 0
  let p: string | undefined = undefined

  function extractValue(x: Token, start: number, end: number) {
    let val: Token | null = x.slice(start, end)
    val = val === `NULL` ? null : val
    return parser ? parser(val) : val
  }

  function loop(x: string): Array<Value<Extensions>> {
    const xs = []
    for (; i < x.length; i++) {
      char = x[i]
      if (quoted) {
        if (char === `\\`) {
          str += x[++i]
        } else if (char === `"`) {
          xs.push(parser ? parser(str) : str)
          str = ``
          quoted = x[i + 1] === `"`
          last = i + 2
        } else {
          str += char
        }
      } else if (char === `"`) {
        quoted = true
      } else if (char === `{`) {
        last = ++i
        xs.push(loop(x))
      } else if (char === `}`) {
        quoted = false
        last < i && xs.push(extractValue(x, last, i))
        last = i + 1
        break
      } else if (char === `,` && p !== `}` && p !== `"`) {
        xs.push(extractValue(x, last, i))
        last = i + 1
      }
      p = char
    }
    last < i && xs.push(xs.push(extractValue(x, last, i + 1)))
    return xs
  }

  return loop(value)[0]
}

export class MessageParser<T extends Row<unknown>> {
  private parser: Parser<GetExtensions<T>>
  private transformer?: TransformFunction<GetExtensions<T>>
  constructor(
    parser?: Parser<GetExtensions<T>>,
    transformer?: TransformFunction<GetExtensions<T>>
  ) {
    // Merge the provided parser with the default parser
    // to use the provided parser whenever defined
    // and otherwise fall back to the default parser
    this.parser = { ...defaultParser, ...parser }
    this.transformer = transformer
  }

  parse<Result>(messages: string, schema: Schema): Result {
    return JSON.parse(messages, (key, value) => {
      // typeof value === `object` && value !== null
      // is needed because there could be a column named `value`
      // and the value associated to that column will be a string or null.
      // But `typeof null === 'object'` so we need to make an explicit check.
      // We also parse the `old_value`, which appears on updates when `replica=full`.
      if (
        (key === `value` || key === `old_value`) &&
        typeof value === `object` &&
        value !== null
      ) {
        return this.transformMessageValue(value, schema)
      }
      return value
    }) as Result
  }

  /**
   * Parse an array of ChangeMessages from a snapshot response.
   * Applies type parsing and transformations to the value and old_value properties.
   */
  parseSnapshotData<Result>(
    messages: Array<unknown>,
    schema: Schema
  ): Array<Result> {
    return messages.map((message) => {
      const msg = message as Record<string, unknown>

      // Transform the value property if it exists
      if (msg.value && typeof msg.value === `object` && msg.value !== null) {
        msg.value = this.transformMessageValue(msg.value, schema)
      }

      // Transform the old_value property if it exists
      if (
        msg.old_value &&
        typeof msg.old_value === `object` &&
        msg.old_value !== null
      ) {
        msg.old_value = this.transformMessageValue(msg.old_value, schema)
      }

      return msg as Result
    })
  }

  /**
   * Transform a message value or old_value object by parsing its columns.
   */
  private transformMessageValue(
    value: unknown,
    schema: Schema
  ): Row<GetExtensions<T>> {
    const row = value as Record<string, Value<GetExtensions<T>>>
    Object.keys(row).forEach((key) => {
      row[key] = this.parseRow(key, row[key] as NullableToken, schema)
    })

    return this.transformer ? this.transformer(row) : row
  }

  // Parses the message values using the provided parser based on the schema information
  private parseRow(
    key: string,
    value: NullableToken,
    schema: Schema
  ): Value<GetExtensions<T>> {
    const columnInfo = schema[key]
    if (!columnInfo) {
      // We don't have information about the value
      // so we just return it
      return value
    }

    // Copy the object but don't include `dimensions` and `type`
    const { type: typ, dims: dimensions, ...additionalInfo } = columnInfo

    // Pick the right parser for the type
    // and support parsing null values if needed
    // if no parser is provided for the given type, just return the value as is
    const typeParser = this.parser[typ] ?? identityParser
    const parser = makeNullableParser(typeParser, columnInfo, key)

    if (dimensions && dimensions > 0) {
      // It's an array
      const nullablePgArrayParser = makeNullableParser(
        (value, _) => pgArrayParser(value, parser),
        columnInfo,
        key
      )
      return nullablePgArrayParser(value)
    }

    return parser(value, additionalInfo)
  }
}

function makeNullableParser<Extensions>(
  parser: ParseFunction<Extensions>,
  columnInfo: ColumnInfo,
  columnName?: string
): NullableParseFunction<Extensions> {
  const isNullable = !(columnInfo.not_null ?? false)
  // The sync service contains `null` value for a column whose value is NULL
  // but if the column value is an array that contains a NULL value
  // then it will be included in the array string as `NULL`, e.g.: `"{1,NULL,3}"`
  return (value: NullableToken) => {
    if (value === null) {
      if (!isNullable) {
        throw new ParserNullValueError(columnName ?? `unknown`)
      }
      return null
    }
    return parser(value, columnInfo)
  }
}
