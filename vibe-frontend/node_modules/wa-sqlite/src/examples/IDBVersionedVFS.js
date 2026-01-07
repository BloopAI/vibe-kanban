// Copyright 2021 Roy T. Hashimoto. All Rights Reserved.
import * as VFS from '../VFS.js';
import { WebLocksExclusive as WebLocks } from './WebLocks.js';
import { IDBContext } from './IDBContext.js';

const SECTOR_SIZE = 512;
const GENERIC_FILE_BLOCK_SIZE = 4096;

/**
 * @typedef VFSOptions
 * @property {"default"|"strict"|"relaxed"} [durability]
 * @property {"deferred"|"manual"} [purge]
 * @property {number} [purgeAtLeast]
 */

/** @type {VFSOptions} */
const DEFAULT_OPTIONS = {
  durability: "default",
  purge: "deferred",
  purgeAtLeast: 16
};

function log(...args) {
  // console.debug(...args);
}

/**
 * @typedef FileBlock
 * @property {string} name
 * @property {number} index
 * @property {number} version
 * @property {Uint8Array} data
 *
 * @property {number} [fileSize]
*/

/**
 * @typedef OpenedFileEntry
 * @property {string} path
 * @property {number} flags
 * @property {FileBlock} block0
 * @property {WebLocks} locks
 * 
 * Extra state for database files:
 * @property {number[]} [journalPages]
 * @property {Set<number>} [changedPages]
 * 
 * Extra state for journal files:
 * @property {number} [cachedPageIndex]
 * @property {Uint8Array} [cachedPageEntry]
 */

// Use IndexedDB as a versioned block device. Each object in IndexedDB holds
// a fixed-size block of file data (block 0 for each file contains some
// extra metadata).
//
// There can be multiple versions of a file block. Newer versions have lower
// numbers (e.g. version -50 is newer than version -20), which makes it
// easier to get the latest version using IndexedDB. This versioning makes
// it possible to implement zero-store rollback journals because the
// pre-transaction data can be restored from the database file.
export class IDBVersionedVFS extends VFS.Base {
  #options;
  /** @type {Map<number, OpenedFileEntry>} */ #mapIdToFile = new Map();
  /** @type {Map<string, OpenedFileEntry>} */ #mapPathToFile = new Map();

  /** @type {IDBContext} */ #idb;
  /** @type {Set<string>} */ #pendingPurges = new Set();

  constructor(idbDatabaseName = 'wa-sqlite', options = DEFAULT_OPTIONS) {
    super();
    this.name = idbDatabaseName;
    this.#options = Object.assign({}, DEFAULT_OPTIONS, options);
    this.#idb = new IDBContext(openDatabase(idbDatabaseName), {
      durability: this.#options.durability
    });
  }

  /**
   * @param {string?} name 
   * @param {number} fileId 
   * @param {number} flags 
   * @param {DataView} pOutFlags 
   * @returns {number}
   */
  xOpen(name, fileId, flags, pOutFlags) {
    return this.handleAsync(async () => {
      if (name === null) name = `null_${fileId}`;
      log(`xOpen ${name} ${fileId} 0x${flags.toString(16)}`);

      try {
        const url = new URL(name, 'http://localhost/');
        const file = {
          path: url.pathname,
          flags,
          block0: null,
          locks: new WebLocks(url.pathname)
        };
        this.#mapIdToFile.set(fileId, file);
        this.#mapPathToFile.set(file.path, file);

        // Read the first block, which also contains the file metadata.
        file.block0 = await this.#idb.run('readonly', ({blocks}) => {
          return blocks.get(IDBKeyRange.bound(
            [file.path, 0],
            [file.path, 0, Infinity]))
        });
        if (!file.block0) {
          // File doesn't exist, create if requested.
          if (flags & VFS.SQLITE_OPEN_CREATE) {
            file.block0 = {
              name: file.path,
              index: 0,
              version: 0,
              data: null,
              fileSize: 0
            };

            // Write metadata block to IndexedDB.
            if (!this.#isJournal(file)) {
              this.#idb.run('readwrite', ({blocks}) => blocks.put(file.block0));
              this.purge(file.path);
              await this.#idb.sync();
            }
          } else {
            throw new Error(`file not found: ${file.path}`);
          }
        }

        pOutFlags.setInt32(0, flags & VFS.SQLITE_OPEN_READONLY, true);
        return VFS.SQLITE_OK;
      } catch (e) {
        console.error(e.message);
        return VFS.SQLITE_CANTOPEN;
      }
    });
  }

  /**
   * @param {number} fileId 
   * @returns {number}
   */
  xClose(fileId) {
    return this.handleAsync(async () => {
      const file = this.#mapIdToFile.get(fileId);
      if (file) {
        log(`xClose ${file.path}`);

        this.#mapIdToFile.delete(fileId);
        this.#mapPathToFile.delete(file.path);
        if (file.flags & VFS.SQLITE_OPEN_DELETEONCLOSE) {
          this.#idb.run('readwrite', ({blocks}) => {
            blocks.delete(IDBKeyRange.bound(
              [file.path],
              [file.path, []],
            ))
          });
        }
      }
      return VFS.SQLITE_OK;
    });
  }

  /**
   * @param {number} fileId 
   * @param {Uint8Array} pData 
   * @param {number} iOffset
   * @returns {number}
   */
  xRead(fileId, pData, iOffset) {
    return this.handleAsync(async () => {
      // Special handling for journal files.
      const file = this.#mapIdToFile.get(fileId);
      if (this.#isJournal(file)) {
        return this.#xReadJournal(file, pData, iOffset);
      }

      log(`xRead ${file.path} ${pData.byteLength} ${iOffset}`);

      // Check for read past the end of data.
      if (iOffset >= file.block0.fileSize) {
        pData.fill(0, pData.byteLength);
        return VFS.SQLITE_IOERR_SHORT_READ;
      }

      // Clip the requested read to the file boundary.
      const bgn = Math.min(iOffset, file.block0.fileSize);
      const end = Math.min(iOffset + pData.byteLength, file.block0.fileSize);    

      let bytesRemaining = end - bgn;
      let bufferOffset = 0;
      let fileOffset = iOffset;
      const blockSize = file.block0.data ? file.block0.data.byteLength : pData.byteLength;
      while (bytesRemaining) {
        const blockIndex = Math.floor(fileOffset / blockSize);
        const blockOffset = fileOffset % blockSize;
        const blockBytes = Math.min(blockSize - blockOffset, bytesRemaining);

        // Fetch from IndexedDB.
        const version = file.block0.version - (file.changedPages?.size ? 1 : 0);
        /** @type {FileBlock} */ let block = await this.#idb.run('readonly', ({blocks}) => {
            return blocks.get(IDBKeyRange.bound(
              [file.path, blockIndex, version],
              [file.path, blockIndex, Infinity]
            ));
          });

        // Block 0 contains file metadata so it is cached.
        if (blockIndex === 0) {
          if (file.block0.version > block.version) {
            // Incoming version is newer.
            file.block0 = block;
          } else {
            block = file.block0;
          }
        }

        pData.subarray(bufferOffset)
          .set(block.data.subarray(blockOffset, blockOffset + blockBytes));

        bufferOffset += blockBytes;
        fileOffset += blockBytes;
        bytesRemaining -= blockBytes;
      }

      if (bufferOffset !== pData.byteLength) {
        // Zero unused area of read buffer.
        pData.subarray(bufferOffset).fill(0, pData.byteLength - bufferOffset);
        return VFS.SQLITE_IOERR_SHORT_READ;
      }
      return VFS.SQLITE_OK;
    });
  }

  /**
   * Reads rollback journal files. Journal data is not saved to IndexedDB
   * so it needs to be reconstituted from the previous version of the
   * database.
   * @param {OpenedFileEntry} file 
   * @param {Uint8Array} pData 
   * @param {number} iOffset 
   * @returns 
   */
  async #xReadJournal(file, pData, iOffset) {
    log(`xRead (journal) ${file.path} ${pData.byteLength} ${iOffset}`);

    const dbPath = this.#getJournalDatabasePath(file);
    const dbFile = this.#mapPathToFile.get(dbPath);
    const journalHeader = new DataView(file.block0.data.buffer);
    const entrySize = dbFile.block0.data.length + 8;
    if (iOffset >= SECTOR_SIZE) {
      // This read is past the header so it is reading a rollback page
      // entry. The entry must be regenerated by reading the database file.
      // The entry is typically read with three calls to xRead so it is
      // cached.
      const entryIndex = ((iOffset - SECTOR_SIZE) / entrySize) | 0;
      const pageIndex = dbFile.journalPages[entryIndex];
      if (file.cachedPageIndex !== pageIndex) {
        // Fetch original file data.
        /** @type {FileBlock} */ const block = await this.#idb.run('readonly', ({blocks}) => {
          return blocks.get(IDBKeyRange.bound(
            [dbPath, pageIndex, dbFile.block0.version],
            [dbPath, pageIndex, Infinity]));
        });

        // Build a rollback page entry, which contains the page index,
        // the page data, and the page checksum. In the journal the page
        // index is 1-based.
        // https://www.sqlite.org/fileformat.html#the_rollback_journal
        const nonce = journalHeader.getUint32(12);
        const pageSize = dbFile.block0.data.length;
        this.cachedPageIndex = pageIndex;
        this.cachedPageEntry = new Uint8Array(entrySize);
        const cachedPageView = new DataView(this.cachedPageEntry.buffer);
        cachedPageView.setUint32(0, pageIndex + 1); // 1-based
        this.cachedPageEntry.set(block.data, 4);
        cachedPageView.setUint32(entrySize - 4, this.#checksum(block.data, nonce, pageSize));
      }
    
      // Transfer the requested portion of the page entry.
      const skip = (iOffset - SECTOR_SIZE) % entrySize;
      pData.set(this.cachedPageEntry.subarray(skip, skip + pData.byteLength));
    } else {
      // Read journal header.
      pData.set(file.block0.data.subarray(iOffset, iOffset + pData.byteLength));
    }
    return VFS.SQLITE_OK;
  }

  /**
   * @param {number} fileId 
   * @param {Uint8Array} pData 
   * @param {number} iOffset
   * @returns {number}
   */
  xWrite(fileId, pData, iOffset) {
    const file = this.#mapIdToFile.get(fileId);
    if (this.#isDatabase(file)) {
      return this.#xWriteDatabase(file, pData, iOffset);
    }
    if (this.#isJournal(file)) {
      return this.#xWriteJournal(file, pData, iOffset);
    }

    return this.handleAsync(async () => {
      log(`xWrite (slow path) ${file.path} ${pData.byteLength} ${iOffset}`);

      // Determine the appropriate block size for this file.
      let blockSize = file.block0.data?.byteLength;
      if (!blockSize) {
        const fileType = file.flags & VFS.FILE_TYPE_MASK;
        if (fileType === VFS.SQLITE_OPEN_MAIN_DB ||
            fileType === VFS.SQLITE_OPEN_TEMP_DB) {
          // This is a database file, so all writes will be the page size.
          blockSize = pData.byteLength;
        } else {
          blockSize = GENERIC_FILE_BLOCK_SIZE;
        }
      }

      let bufferOffset = 0;
      let fileOffset = iOffset;
      let bytesRemaining = pData.byteLength;
      const lastBlockIndex = Math.max(Math.ceil(file.block0.fileSize / blockSize) - 1, 0);
      while (bytesRemaining) {
        const blockIndex = Math.floor(fileOffset / blockSize);
        const blockOffset = fileOffset % blockSize;
        const blockBytes = Math.min(blockSize - blockOffset, bytesRemaining);

        // Read.
        /** @type {FileBlock} */ let block;
        if (blockIndex === 0) {
          // Block 0 is always cached.
          block = file.block0;
          block.data = block.data || new Uint8Array(blockSize);
        } else if (blockIndex <= lastBlockIndex && blockBytes !== blockSize) {
          // Fetch from IndexedDB.
          block = await this.#idb.run('readonly', ({blocks}) => {
            return blocks.get(IDBKeyRange.bound(
              [file.path, blockIndex],
              [file.path, blockIndex, Infinity]
            ));
          });
        }
        
        if (!block) {
          // Either no data was read (SQLite does not always write
          // sequentially) or the write is beyond EOF.
          block = {
            name: file.block0.name,
            index: blockIndex,
            version: file.block0.version,
            data: new Uint8Array(blockSize)
          };
        }

        // Modify.
        block.data.set(
          pData.subarray(bufferOffset, bufferOffset + blockBytes),
          blockOffset);
        
        // Write (except block 0).
        if (blockIndex) {
          this.#idb.run('readwrite', ({blocks}) => {
            blocks.put(block);
          });
        }
        file.changedPages?.add(blockIndex);

        bufferOffset += blockBytes;
        fileOffset += blockBytes;
        bytesRemaining -= blockBytes;
      }
      
      file.block0.fileSize = Math.max(file.block0.fileSize, iOffset + pData.byteLength);
      return VFS.SQLITE_OK;
    });
  }

  /**
   * Writes database files.
   * @param {OpenedFileEntry} file 
   * @param {Uint8Array} pData 
   * @param {number} iOffset 
   */
  #xWriteDatabase(file, pData, iOffset) {
    log(`xWrite (database) ${file.path} ${pData.byteLength} ${iOffset}`);

    // Database writes (and reads) should be a complete single page.
    const blockSize = pData.byteLength;
    const blockIndex = (iOffset / blockSize) | 0;
    if (iOffset !== blockIndex * blockSize ||
        (file.block0.data && blockSize !== file.block0.data.length)) {
      console.error('unexpected database write parameters');
      return VFS.SQLITE_IOERR;
    }

    // Store the block to IndexedDB, except the cached block 0.
    /** @type {FileBlock} */ const block = {
      name: file.block0.name,
      index: blockIndex,
      version: file.block0.version - 1,
      data: pData.slice()
    };
    if (blockIndex) {
      this.#idb.run('readwrite', ({blocks}) => {
        blocks.put(block);
      });
    } else {
      file.block0.data = block.data;
    }

    // Extend the file when writing past the end.
    file.block0.fileSize = Math.max(file.block0.fileSize, iOffset + pData.byteLength);
    file.changedPages?.add(blockIndex);
    return VFS.SQLITE_OK;
  }

  /**
   * Writes rollback journal files.
   * @param {OpenedFileEntry} file 
   * @param {Uint8Array} pData 
   * @param {number} iOffset 
   */
  #xWriteJournal(file, pData, iOffset) {
    log(`xWrite (journal) ${file.path} ${pData.byteLength} ${iOffset}`);

    // Get the associated opened database file.
    const dbPath = this.#getJournalDatabasePath(file);
    const dbFile = this.#mapPathToFile.get(dbPath);

    if (iOffset === 0) {
      // Writing the journal header. This is the only journal data saved.
      if (pData[0] && !file.block0.data?.[0]) {
        // This begins a new journalled transaction.
        dbFile.journalPages = [];
        dbFile.changedPages = new Set();
        file.cachedPageIndex = -1;
        file.cachedPageEntry = null;
      }
      file.block0.data = pData.slice();
    } else if (iOffset < SECTOR_SIZE) {
      // This is probably preparation to append another journal (possibly
      // for SAVEPOINT) which is unsupported.
      console.error('unexpected write to journal header');
      this.#restoreBlock0(dbFile, dbFile.block0.version);
      return VFS.SQLITE_IOERR;
    } else {
      // Extract and store page indices.
      // See https://www.sqlite.org/fileformat.html#the_rollback_journal
      const entrySize = dbFile.block0.data.length + 8;
      if ((iOffset - SECTOR_SIZE) % entrySize === 0) {
        // Store the page index for this page entry. The data is discarded.
        // The page index in the journal data is 1-based.
        const entryIndex = (iOffset - SECTOR_SIZE) / entrySize;
        const pageIndex =
          new DataView(pData.buffer).getUint32(pData.byteOffset) - 1;
        dbFile.journalPages[entryIndex] = pageIndex;
      }
    }

    file.block0.fileSize = Math.max(file.block0.fileSize, iOffset + pData.byteLength);
    return VFS.SQLITE_OK;
  }

  /**
   * @param {number} fileId 
   * @param {number} iSize 
   * @returns {number}
   */
  xTruncate(fileId, iSize) {
    const file = this.#mapIdToFile.get(fileId);
    log(`xTruncate ${file.path} ${iSize}`);

    file.block0.fileSize = iSize;

    // Update metadata and delete all blocks beyond the file size. We
    // expect SQLite to call this outside any journal lifetime.
    const block0 = Object.assign({}, file.block0);
    const lastBlockIndex = file.block0.fileSize ?
      Math.floor(file.block0.fileSize / file.block0.data.length) :
      0;
    this.#idb.run('readwrite', ({blocks})=> {
      blocks.put(block0);
      blocks.delete(IDBKeyRange.bound(
        [file.path, lastBlockIndex, Infinity],
        [file.path, Infinity, Infinity],
        true, false));
    });
    return VFS.SQLITE_OK;
  }

  /**
   * @param {number} fileId 
   * @param {*} flags 
   * @returns {number}
   */
  xSync(fileId, flags) {
    return this.handleAsync(async () => {
      const file = this.#mapIdToFile.get(fileId);
      log(`xSync ${file.path} ${flags}`);

      if (!this.#isJournal(file)) {
        if (this.#options.durability !== 'relaxed') {
          await this.#idb.sync();
        }
      }
      return VFS.SQLITE_OK;
    });
  }

  /**
   * @param {number} fileId 
   * @param {DataView} pSize64 
   * @returns {number}
   */
  xFileSize(fileId, pSize64) {
    const file = this.#mapIdToFile.get(fileId);
    log(`xFileSize ${file.path}`);

    pSize64.setBigInt64(0, BigInt(file.block0.fileSize), true)
    return VFS.SQLITE_OK;
  }

  /**
   * @param {number} fileId 
   * @param {number} flags 
   * @returns {number}
   */
  xLock(fileId, flags) {
    return this.handleAsync(async () => {
      const file = this.#mapIdToFile.get(fileId);
      log(`xLock ${file.path} ${flags}`);

      // Acquire the lock.
      const result = file.locks.lock(flags);
      if (file.locks.state === VFS.SQLITE_LOCK_RESERVED && !this.#isJournal(file)) {
        // Clear blocks from abandoned transactions, i.e. blocks with
        // lower (newer) versions than block 0. This is done on reserved
        // locking which is after changes by other connections can be made,
        // and before a journal file is initialized.
        this.#idb.run('readwrite', async ({blocks}) => {
          const keys = await blocks.index('version').getAllKeys(IDBKeyRange.bound(
            [file.path],
            [file.path, file.block0.version],
            false, true));
          for (const key of keys) {
            blocks.delete(key);
          }
        });
      }
      return result;
    });
  }

  /**
   * @param {number} fileId 
   * @param {number} flags 
   * @returns {number}
   */
  xUnlock(fileId, flags) {
    return this.handleAsync(async () => {
      const file = this.#mapIdToFile.get(fileId);
      log(`xUnlock ${file.path} ${flags}`);
      
      return file.locks.unlock(flags);
    });
  }

  /**
   * @param {number} fileId 
   * @returns {number}
   */
  xSectorSize(fileId) {
    log('xSectorSize');
    return SECTOR_SIZE;
  }

  /**
   * @param {number} fileId 
   * @returns {number}
   */
  xDeviceCharacteristics(fileId) {
    log('xDeviceCharacteristics');
    return VFS.SQLITE_IOCAP_SAFE_APPEND |
           VFS.SQLITE_IOCAP_SEQUENTIAL |
           VFS.SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN;
  }

  /**
   * @param {number} fileId 
   * @param {number} op 
   * @param {DataView} pArg 
   * @returns {number}
   */
  xFileControl(fileId, op, pArg) {
    if (op === VFS.SQLITE_FCNTL_SYNC) {
      // This opcode is called on database files immediately before xSync is
      // or would have been called (i.e. even if PRAGMA synchronous=OFF).
      // We use it to complete any outstanding transaction.
      const file = this.#mapIdToFile.get(fileId);
      log(`xFileControl ${file.path} ${op}`);

      // Don't accept changes to the page size.
      if (file.block0.fileSize) {
        const view = new DataView(file.block0.data.buffer, file.block0.data.byteOffset);
        const pageSize = view.getUint16(16);
        if (pageSize !== file.block0.data.length) {
          console.error('unsupported page size change');
          return VFS.SQLITE_IOERR_VNODE;
        }
      }

      // journalPages are pre-existing pages that *may* have been
      // overwritten. changedPages are written pages. The intersection
      // of these collections need to be purged.
      const purgeList = new Set();
      const purgeVersion = file.block0.version - 1;
      if (file.changedPages) {
        file.block0.version = purgeVersion;
        file.journalPages
          .filter(pageIndex => file.changedPages.has(pageIndex))
          .forEach(pageIndex => purgeList.add(pageIndex));
        file.changedPages = null;
      }

      this.#idb.run('readwrite', async ({blocks})=> {
        blocks.put(file.block0);
        if (purgeList.size) {
          // Blocks to purge are saved in a special IndexedDB object with
          // an "index" of "purge".
          const purgeBlock = await blocks.get([file.path, 'purge', 0]) ?? {
            name: file.path,
            index: 'purge',
            version: 0,
            data: new Map()
          };

          for (const pageIndex of purgeList) {
            purgeBlock.data.set(pageIndex, purgeVersion);
          }

          blocks.put(purgeBlock);
          this.#maybePurge(file.path, purgeBlock.data.size);
        }
      });
      return VFS.SQLITE_OK;
    }
    return VFS.SQLITE_NOTFOUND;
  }

  /**
   * @param {string} name 
   * @param {number} flags 
   * @param {DataView} pResOut 
   * @returns {number}
   */
  xAccess(name, flags, pResOut) {
    return this.handleAsync(async () => {
      const path = new URL(name, 'file://localhost/').pathname;
      log(`xAccess ${path} ${flags}`);

      // Check if block 0 exists.
      const key = await this.#idb.run('readonly', ({blocks}) => {
        return blocks.getKey(IDBKeyRange.bound(
          [path, 0],
          [path, 0, Infinity]));
      });
      pResOut.setInt32(0, key ? 1 : 0, true);
      return VFS.SQLITE_OK;
    });
  }

  /**
   * @param {string} name 
   * @param {number} syncDir 
   * @returns {number}
   */
  xDelete(name, syncDir) {
    return this.handleAsync(async () => {
      const path = new URL(name, 'file://localhost/').pathname;
      log(`xDelete ${path} ${syncDir}`);

      const complete = this.#idb.run('readwrite', ({blocks}) => {
        return blocks.delete(IDBKeyRange.bound(
          [path],
          [path, []]));
      });
      if (syncDir) {
        await complete;
      }
      return VFS.SQLITE_OK;
    });
  }

  /**
   * Purge obsolete blocks from a database file.
   * @param {string} name 
   */
  purge(name) {
    const start = Date.now();
    const path = new URL(name, 'file://localhost/').pathname;
    this.#idb.run('readwrite', async ({blocks}) => {
      const purgeBlock = await blocks.get([path, 'purge', 0]);
      if (purgeBlock) {
        for (const [pageIndex, version] of purgeBlock.data) {
          blocks.delete(IDBKeyRange.bound(
            [path, pageIndex, version],
            [path, pageIndex, Infinity],
            true, false));
        }
        await blocks.delete([path, 'purge', 0]);
      }
      log(`purge ${name} ${purgeBlock?.data.size ?? 0} pages in ${Date.now() - start} ms`);
    });
    }

  /**
   * Conditionally schedule a purge task.
   * @param {string} name 
   * @param {number} nPages 
   */
  #maybePurge(name, nPages) {
    if (this.#options.purge === 'manual' ||
        this.#pendingPurges.has(name) ||
        nPages < this.#options.purgeAtLeast) {
      // No purge needed.
      return;
    }
    
    if (globalThis.requestIdleCallback) {
      globalThis.requestIdleCallback(() => {
        this.purge(name);
        this.#pendingPurges.delete(name)
      });
    } else {
      setTimeout(() => {
        this.purge(name);
        this.#pendingPurges.delete(name)
      });
    }
    this.#pendingPurges.add(name);
  }

  /**
   * @param {OpenedFileEntry} file 
   */
  #isDatabase(file) {
    return file.flags & (VFS.SQLITE_OPEN_MAIN_DB | VFS.SQLITE_OPEN_TEMP_DB);
  }

  /**
   * @param {OpenedFileEntry} file 
   */
  #isJournal(file) {
    return file.flags & VFS.SQLITE_OPEN_MAIN_JOURNAL;
  }

  /**
   * @param {OpenedFileEntry} file 
   */
  #getJournalDatabasePath(file) {
    return file.path.replace(/-journal$/, '');
  }

  #restoreBlock0(file, version) {
    return this.#idb.run('readonly', async ({blocks}) => {
      file.block0 = await blocks.get(IDBKeyRange.bound(
        [file.path, 0, version],
        [file.path, 0, Infinity]));
    });
  }

  /**
   * @param {Uint8Array} data 
   * @param {number} nonce 
   * @param {number} pageSize 
   * @returns {number}
   */
  #checksum(data, nonce, pageSize) {
    let result = nonce;
    let x = pageSize - 200;
    while (x > 0) {
      const value = data[x];
      result += value;
      x -= 200;
    }
    return result;
  }
}

function openDatabase(idbDatabaseName) {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(idbDatabaseName, 5);
    request.addEventListener('upgradeneeded', async (event) => {
      const { oldVersion, newVersion } = event;
      console.log(`Upgrading "${idbDatabaseName}" ${oldVersion} -> ${newVersion}`);

      // Upgrade one previous version.
      /** @type {IDBDatabase} */ const db = request.result;
      /** @type {IDBTransaction} */ const tx = request.transaction;
      switch (oldVersion) {
        case 0:
          db.createObjectStore('database');
          db.createObjectStore('spill');
          db.createObjectStore('journal');
        case 4:
          const blocks = db.createObjectStore('blocks', {
            keyPath: ['name', 'index', 'version']
          })
          blocks.createIndex('version', ['name', 'version']);
          await new Promise((complete, fail) => {
            const database = tx.objectStore('database');
            const cursorRequest = database.openCursor();
            cursorRequest.addEventListener('success', () => {
              /** @type {IDBCursorWithValue} */ const cursor = cursorRequest.result;
              if (cursor) {
                const block = cursor.value;
                block.name = `/${block.name}`;
                block.version = 0;
                block.data = new Uint8Array(block.data);
                blocks.put(cursor.value);
                cursor.continue();
              } else {
                complete();
              }
            });
            cursorRequest.addEventListener('error', () => {
              fail(cursorRequest.error);
            });
          });            
          db.deleteObjectStore('database');
          db.deleteObjectStore('spill');
          db.deleteObjectStore('journal');
          break;
        default:
          const error = new Error(`incompatible IDB database '${idbDatabaseName}' exists`);
          reject(error);
          throw error;
      }
    });
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error);
    });
  });
}
