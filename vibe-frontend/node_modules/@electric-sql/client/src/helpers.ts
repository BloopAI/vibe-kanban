import {
  ChangeMessage,
  ControlMessage,
  Message,
  NormalizedPgSnapshot,
  Offset,
  PostgresSnapshot,
  Row,
} from './types'

/**
 * Type guard for checking {@link Message} is {@link ChangeMessage}.
 *
 * See [TS docs](https://www.typescriptlang.org/docs/handbook/advanced-types.html#user-defined-type-guards)
 * for information on how to use type guards.
 *
 * @param message - the message to check
 * @returns true if the message is a {@link ChangeMessage}
 *
 * @example
 * ```ts
 * if (isChangeMessage(message)) {
 *   const msgChng: ChangeMessage = message // Ok
 *   const msgCtrl: ControlMessage = message // Err, type mismatch
 * }
 * ```
 */
export function isChangeMessage<T extends Row<unknown> = Row>(
  message: Message<T>
): message is ChangeMessage<T> {
  return `key` in message
}

/**
 * Type guard for checking {@link Message} is {@link ControlMessage}.
 *
 * See [TS docs](https://www.typescriptlang.org/docs/handbook/advanced-types.html#user-defined-type-guards)
 * for information on how to use type guards.
 *
 * @param message - the message to check
 * @returns true if the message is a {@link ControlMessage}
 *
 *  * @example
 * ```ts
 * if (isControlMessage(message)) {
 *   const msgChng: ChangeMessage = message // Err, type mismatch
 *   const msgCtrl: ControlMessage = message // Ok
 * }
 * ```
 */
export function isControlMessage<T extends Row<unknown> = Row>(
  message: Message<T>
): message is ControlMessage {
  return !isChangeMessage(message)
}

export function isUpToDateMessage<T extends Row<unknown> = Row>(
  message: Message<T>
): message is ControlMessage & { up_to_date: true } {
  return isControlMessage(message) && message.headers.control === `up-to-date`
}

/**
 * Parses the LSN from the up-to-date message and turns it into an offset.
 * The LSN is only present in the up-to-date control message when in SSE mode.
 * If we are not in SSE mode this function will return undefined.
 */
export function getOffset(message: ControlMessage): Offset | undefined {
  if (message.headers.control != `up-to-date`) return
  const lsn = message.headers.global_last_seen_lsn
  return lsn ? (`${lsn}_0` as Offset) : undefined
}

/**
 * Checks if a transaction is visible in a snapshot.
 *
 * @param txid - the transaction id to check
 * @param snapshot - the information about the snapshot
 * @returns true if the transaction is visible in the snapshot
 */
export function isVisibleInSnapshot(
  txid: number | bigint | `${bigint}`,
  snapshot: PostgresSnapshot | NormalizedPgSnapshot
): boolean {
  const xid = BigInt(txid)
  const xmin = BigInt(snapshot.xmin)
  const xmax = BigInt(snapshot.xmax)
  const xip = snapshot.xip_list.map(BigInt)

  // If the transaction id is less than the minimum transaction id, it is visible in the snapshot.
  // If the transaction id is less than the maximum transaction id and not in the list of active
  //   transactions at the time of the snapshot, it has been committed before the snapshot was taken
  //   and is therefore visible in the snapshot.
  // Otherwise, it is not visible in the snapshot.

  return xid < xmin || (xid < xmax && !xip.includes(xid))
}
