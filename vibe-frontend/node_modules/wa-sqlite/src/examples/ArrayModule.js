// Copyright 2021 Roy T. Hashimoto. All Rights Reserved.
import * as SQLite from '../sqlite-api.js';

// This is an example implementation of a SQLite module (for virtual
// tables). It lets SQLite access a Javascript array as a table.
// See https://sqlite.org/vtab.html for details.
export class ArrayModule {
  mapCursorToState = new Map();

  /**
   * @param {SQLiteAPI} sqlite3 
   * @param {number} db 
   * @param {Array<Array>} rows Table data.
   * @param {Array<string>} columns Column names.
   */
  constructor(sqlite3, db, rows, columns) {
    this.sqlite3 = sqlite3;
    this.db = db;
    this.rows = rows;
    this.columns = columns;
  }

  /**
   * @param {number} db 
   * @param {*} appData Application data passed to `SQLiteAPI.create_module`.
   * @param {Array<string>} argv 
   * @param {number} pVTab 
   * @param {DataView} pzErr 
   * @returns {number}
   */
  xCreate(db, appData, argv, pVTab, pzErr) {
    return this.xConnect(db, appData, argv, pVTab, pzErr);
  }

  /**
   * @param {number} db 
   * @param {*} appData Application data passed to `SQLiteAPI.create_module`.
   * @param {Array<string>} argv 
   * @param {number} pVTab 
   * @param {DataView} pzErr 
   * @returns {number}
   */
  xConnect(db, appData, argv, pVTab, pzErr) {
    // All virtual tables in this module will use the same array. If
    // different virtual tables could have separate backing stores then
    // we would handle that association using pVTab.

    const sql = `CREATE TABLE any (${this.columns.join(',')})`;
    this.sqlite3.declare_vtab(db, sql);
    return SQLite.SQLITE_OK;
  }

  /**
   * @param {number} pVTab 
   * @param {SQLiteModuleIndexInfo} indexInfo 
   * @returns {number}
   */
  xBestIndex(pVTab, indexInfo) {
    // All the code here is for an optional optimization. If we simply
    // returned SQLITE_OK instead then we would traverse all the array
    // data and SQLite would ignore whatever it doesn't need.

    // SQLite's implicit ROWID column maps to the array index. Constraints
    // on ROWID can be used to restrict the range of the table traversal.

    // Tag constraints with their index so we can associate them with
    // the corresponding aConstraintUsage element.
    indexInfo.aConstraint.forEach((constraint, i) => {
      // @ts-ignore
      constraint.index = i;
    });

    // We're only interested in ROWID constraints, so extract them in a
    // well-defined order.
    const rowidConstraints = indexInfo.aConstraint.filter(constraint => {
      if (!constraint.usable) return false;
      if (constraint.iColumn !== -1) return false;
      switch (constraint.op) {
        case SQLite.SQLITE_INDEX_CONSTRAINT_EQ:
        case SQLite.SQLITE_INDEX_CONSTRAINT_GT:
        case SQLite.SQLITE_INDEX_CONSTRAINT_LE:
        case SQLite.SQLITE_INDEX_CONSTRAINT_LT:
        case SQLite.SQLITE_INDEX_CONSTRAINT_GE:
          return true;
        default:
          return false;
      }
    });
    rowidConstraints.sort((a, b) => a.op - b.op);

    // Encode which ROWID constraints were present and request their
    // values for xFilter.
    indexInfo.idxNum = 0x0;
    let valueIndex = 0;
    rowidConstraints.forEach(constraint => {
      indexInfo.idxNum |= constraint.op;
      // @ts-ignore
      indexInfo.aConstraintUsage[constraint.index].argvIndex = ++valueIndex;

      if (constraint.op === SQLite.SQLITE_INDEX_CONSTRAINT_EQ) {
        // Optional optimization tells SQLite at most one row matches.
        indexInfo.idxFlags = SQLite.SQLITE_INDEX_SCAN_UNIQUE;
      }
    });
    return SQLite.SQLITE_OK;
  }

  /**
   * @param {number} pVTab 
   * @returns {number}
   */
  xDisconnect(pVTab) {
    return SQLite.SQLITE_OK;
  }

  /**
   * @param {number} pVTab 
   * @returns {number}
   */
  xDestroy(pVTab) {
    return SQLite.SQLITE_OK;
  }

  /**
   * @param {number} pVTab 
   * @param {number} pCursor 
   * @returns {number}
   */
  xOpen(pVTab, pCursor) {
    this.mapCursorToState.set(pCursor, {});
    return SQLite.SQLITE_OK;
  }

  /**
   * @param {number} pCursor 
   * @returns {number}
   */
  xClose(pCursor) {
    this.mapCursorToState.delete(pCursor);
    return SQLite.SQLITE_OK;
  }

  /**
   * @param {number} pCursor 
   * @param {number} idxNum 
   * @param {string?} idxStr 
   * @param {Array<number>} values 
   * @returns {number}
   */
  xFilter(pCursor, idxNum, idxStr, values) {
    const cursorState = this.mapCursorToState.get(pCursor);
    cursorState.index = 0;
    cursorState.endIndex = this.rows.length;

    // Process the constraints. This is an optional optimization prepared
    // by xBestIndex that uses ROWID constraints to limit cursor range.
    let valueIndex = 0;
    if (idxNum & SQLite.SQLITE_INDEX_CONSTRAINT_EQ) {
      cursorState.index = this.sqlite3.value_int(values[valueIndex++]);
      cursorState.endIndex = cursorState.index + 1;
    }
    if (idxNum & SQLite.SQLITE_INDEX_CONSTRAINT_GT) {
      cursorState.index = this.sqlite3.value_int(values[valueIndex++]) + 1;
    }
    if (idxNum & SQLite.SQLITE_INDEX_CONSTRAINT_LE) {
      cursorState.endIndex = this.sqlite3.value_int(values[valueIndex++]) + 1;
    }
    if (idxNum & SQLite.SQLITE_INDEX_CONSTRAINT_LT) {
      cursorState.endIndex = this.sqlite3.value_int(values[valueIndex++]);
    }
    if (idxNum & SQLite.SQLITE_INDEX_CONSTRAINT_GE) {
      cursorState.index = this.sqlite3.value_int(values[valueIndex++]);
    }

    // Clip bounds to array size.
    cursorState.index = Math.max(cursorState.index, 0);
    cursorState.endIndex = Math.min(cursorState.endIndex, this.rows.length);
    this._adjustCursorIfInvalid(cursorState);
    return SQLite.SQLITE_OK;
  }

  /**
   * @param {number} pCursor 
   * @returns {number}
   */
  xNext(pCursor) {
    // Advance to the next valid row or EOF.
    const cursorState = this.mapCursorToState.get(pCursor);
    ++cursorState.index;
    this._adjustCursorIfInvalid(cursorState);
    return SQLite.SQLITE_OK;
  }

  /**
   * @param {number} pCursor 
   * @returns {number}
   */
  xEof(pCursor) {
    const cursorState = this.mapCursorToState.get(pCursor);
    return cursorState.index < cursorState.endIndex ? 0 : 1;
  }

  /**
   * @param {number} pCursor 
   * @param {number} pContext 
   * @param {number} iCol 
   * @returns {number}
   */
  xColumn(pCursor, pContext, iCol) {
    const cursorState = this.mapCursorToState.get(pCursor);
    const value = this.rows[cursorState.index][iCol];
    this.sqlite3.result(pContext, value);
    return SQLite.SQLITE_OK;
  }

  /**
   * @param {number} pCursor 
   * @param {DataView} pRowid 
   * @returns {number}
   */
  xRowid(pCursor, pRowid) {
    const cursorState = this.mapCursorToState.get(pCursor);
    pRowid.setBigInt64(0, BigInt(cursorState.index), true);
    return SQLite.SQLITE_OK;
  }

  // All "x" methods beyond this point are optional.

  /**
   * @param {number} pVTab 
   * @param {Array<number>} values sqlite3_value pointers
   * @param {DataView} pRowid 
   * @returns {number}
   */
  xUpdate(pVTab, values, pRowid) {
    let index = this.sqlite3.value_type(values[0]) === SQLite.SQLITE_NULL ?
      null :
      this.sqlite3.value_int(values[0]);
    if (values.length === 1) {
      // Delete row.
      const index = this.sqlite3.value_int(values[0]);
      this.rows[index] = null;
    } else {
      const row = [];
      for (let i = 2; i < values.length; ++i) {
        row.push(this.sqlite3.value(values[i]));
      }

      if (index === null) {
        // Insert row.
        pRowid.setBigInt64(0, BigInt(this.rows.length), true);
        this.rows.push(row);
      } else {
        // Update row.
        this.rows[index] = null;
        this.rows[this.sqlite3.value_int(values[1])] = row;
      }
    }
    return SQLite.SQLITE_OK;
  }

  // xBegin(pVTab) { return SQLite.SQLITE_OK; }
  // xSync(pVTab) { return SQLite.SQLITE_OK; }
  // xCommit(pVTab) { return SQLite.SQLITE_OK; }
  // xRollback(pVTab) { return SQLite.SQLITE_OK; }
  // xRename(pVTab, zNew) { return SQLite.SQLITE_OK; }

  /**
   * Ensure cursor index references either a valid (non-null) row or EOF.
   * Rows become invalid by deletion.
   */
  _adjustCursorIfInvalid(cursorState) {
    while (cursorState.index < cursorState.endIndex && !this.rows[cursorState.index]) {
      ++cursorState.index;
    }
  }
}
