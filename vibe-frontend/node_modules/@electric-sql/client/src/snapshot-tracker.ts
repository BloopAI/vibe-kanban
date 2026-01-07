import { isVisibleInSnapshot } from './helpers'
import { Row, SnapshotMetadata } from './types'
import { ChangeMessage } from './types'

/**
 * Tracks active snapshots and filters out duplicate change messages that are already included in snapshots.
 *
 * When requesting a snapshot in changes_only mode, we need to track which transactions were included in the
 * snapshot to avoid processing duplicate changes that arrive via the live stream. This class maintains that
 * tracking state and provides methods to:
 *
 * - Add new snapshots for tracking via addSnapshot()
 * - Remove completed snapshots via removeSnapshot()
 * - Check if incoming changes should be filtered via shouldRejectMessage()
 */
export class SnapshotTracker {
  private activeSnapshots: Map<
    number,
    { xmin: bigint; xmax: bigint; xip_list: bigint[]; keys: Set<string> }
  > = new Map()
  private xmaxSnapshots: Map<bigint, Set<number>> = new Map()
  private snapshotsByDatabaseLsn: Map<bigint, Set<number>> = new Map()

  /**
   * Add a new snapshot for tracking
   */
  addSnapshot(metadata: SnapshotMetadata, keys: Set<string>): void {
    this.activeSnapshots.set(metadata.snapshot_mark, {
      xmin: BigInt(metadata.xmin),
      xmax: BigInt(metadata.xmax),
      xip_list: metadata.xip_list.map(BigInt),
      keys,
    })
    const xmaxSet =
      this.xmaxSnapshots
        .get(BigInt(metadata.xmax))
        ?.add(metadata.snapshot_mark) ?? new Set([metadata.snapshot_mark])
    this.xmaxSnapshots.set(BigInt(metadata.xmax), xmaxSet)
    const databaseLsnSet =
      this.snapshotsByDatabaseLsn
        .get(BigInt(metadata.database_lsn))
        ?.add(metadata.snapshot_mark) ?? new Set([metadata.snapshot_mark])
    this.snapshotsByDatabaseLsn.set(
      BigInt(metadata.database_lsn),
      databaseLsnSet
    )
  }

  /**
   * Remove a snapshot from tracking
   */
  removeSnapshot(snapshotMark: number): void {
    this.activeSnapshots.delete(snapshotMark)
  }

  /**
   * Check if a change message should be filtered because its already in an active snapshot
   * Returns true if the message should be filtered out (not processed)
   */
  shouldRejectMessage(message: ChangeMessage<Row<unknown>>): boolean {
    const txids = message.headers.txids || []
    if (txids.length === 0) return false

    const xid = Math.max(...txids) // Use the maximum transaction ID

    for (const [xmax, snapshots] of this.xmaxSnapshots.entries()) {
      if (xid >= xmax) {
        for (const snapshot of snapshots) {
          this.removeSnapshot(snapshot)
        }
      }
    }

    return [...this.activeSnapshots.values()].some(
      (x) => x.keys.has(message.key) && isVisibleInSnapshot(xid, x)
    )
  }

  lastSeenUpdate(newDatabaseLsn: bigint): void {
    for (const [dbLsn, snapshots] of this.snapshotsByDatabaseLsn.entries()) {
      if (dbLsn <= newDatabaseLsn) {
        for (const snapshot of snapshots) {
          this.removeSnapshot(snapshot)
        }
      }
    }
  }
}
