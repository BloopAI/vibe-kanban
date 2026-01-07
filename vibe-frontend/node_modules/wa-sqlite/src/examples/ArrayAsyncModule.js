// Copyright 2022 Roy T. Hashimoto. All Rights Reserved.
import * as SQLite from '../sqlite-api.js';
import { ArrayModule } from './ArrayModule.js';

// This is an asynchronous subclass of ArrayModule used for testing
// asynchronous virtual tables.
export class ArrayAsyncModule extends ArrayModule {
  #isInHandleAsync = false;

  /**
   * @param {SQLiteAPI} sqlite3 
   * @param {number} db 
   * @param {Array<Array>} rows Table data.
   * @param {Array<string>} columns Column names.
   */
  constructor(sqlite3, db, rows, columns) {
    super(sqlite3, db, rows, columns);
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
    // Asynchronous xCreate and xConnect methods are tricky because they
    // are required to call the sqlite3.declare_vtab() function, even
    // though Asyncify doesn't allow making calls back into WebAssembly
    // from an asynchronous callback. That means no sqlite3.* calls can
    // be inside the handleAsync function argument.
    //
    // If you need a SQLite callback to be asynchronous *and* you need
    // to make calls back into SQLite - e.g. your virtual table schema
    // can only be determined by making an asynchronous call at the time
    // is is created - then your code probably needs to look something
    // like this:
    const result = this.handleAsync(async () => {
      try {
        // Set some state to test whether SQLite is suspended.
        this.#isInHandleAsync = true;

        // Other asynchronous connection code would go here, but no
        // sqlite3 calls.
      } finally {
        // Reset the suspended flag when the async function is complete.
        // The "await null" statement makes sure the suspended flag was
        // actually seen to be set, just in case the execution of this
        // function wasn't actually asynchronous to this point.
        await null;
        this.#isInHandleAsync = false;
      }
    });

    if (result === SQLite.SQLITE_OK && !this.#isInHandleAsync) {
      // If the suspended flag is *not* set here, then WebAssembly is
      // back to running synchronously and calls into SQLite can be
      // made. In this example class, calling sqlite3.declare_vtab()
      // is done in the (synchronous) superclass method. A real
      // class would probably need to pass some data, e.g. the table
      // schema, from inside the asynchronous function to code that
      // runs here.
      return super.xConnect(db, appData, argv, pVTab, pzErr);
    }
    return result;
  }

  /**
   * @param {number} pVTab 
   * @param {SQLiteModuleIndexInfo} indexInfo 
   * @returns {number}
   */
  xBestIndex(pVTab, indexInfo) {
    return this.handleAsync(async () => {
      return super.xBestIndex(pVTab, indexInfo);
    });
  }

  /**
   * @param {number} pVTab 
   * @returns {number}
   */
  xDisconnect(pVTab) {
    return this.handleAsync(async () => {
      return super.xDisconnect(pVTab);
    });
  }

  /**
   * @param {number} pVTab 
   */
  xDestroy(pVTab) {
    return this.xDisconnect(pVTab);
  }

  /**
   * @param {number} pVTab 
   * @param {number} pCursor 
   * @returns {number}
   */
  xOpen(pVTab, pCursor) {
    return this.handleAsync(async () => {
      return super.xOpen(pVTab, pCursor);
    });
  }

  /**
   * @param {number} pCursor 
   * @returns {number}
   */
  xClose(pCursor) {
    return this.handleAsync(async () => {
      return super.xClose(pCursor);
    });
  }

  /**
   * @param {number} pCursor 
   * @param {number} idxNum 
   * @param {string?} idxStr 
   * @param {Array<number>} values 
   * @returns {number}
   */
  xFilter(pCursor, idxNum, idxStr, values) {
    return this.handleAsync(async () => {
      return super.xFilter(pCursor, idxNum, idxStr, values);
    });
  }

  /**
   * @param {number} pCursor 
   * @returns {number}
   */
  xNext(pCursor) {
    return this.handleAsync(async () => {
      return super.xNext(pCursor);
    });
  }

  /**
   * @param {number} pCursor 
   * @returns {number}
   */
  xEof(pCursor) {
    return this.handleAsync(async () => {
      return super.xEof(pCursor);
    });
  }

  /**
   * @param {number} pCursor 
   * @param {number} pContext 
   * @param {number} iCol 
   * @returns {number}
   */
  xColumn(pCursor, pContext, iCol) {
    return this.handleAsync(async () => {
      return super.xColumn(pCursor, pContext, iCol);
    });
  }

  /**
   * @param {number} pCursor 
   * @param {DataView} pRowid 
   * @returns {number}
   */
  xRowid(pCursor, pRowid) {
    return this.handleAsync(async () => {
      return super.xRowid(pCursor, pRowid);
    });
  }

  // All "x" methods beyond this point are optional.

  /**
   * @param {number} pVTab 
   * @param {Array<number>} values sqlite3_value pointers
   * @param {DataView} pRowid 
   * @returns {number}
   */
  xUpdate(pVTab, values, pRowid) {
    return this.handleAsync(async () => {
      return super.xUpdate(pVTab, values, pRowid);
    });
  }

  /**
   * @param {function} f 
   * @returns {number}
   */
  handleAsync(f) {
    // When sqlite3.create_module is called on an asynchronous build,
    // it injects a handleAsync method into the module that will shadow
    // this implementation.
    throw new Error('requires an asynchronous build');
  }
}