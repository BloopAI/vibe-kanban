// Copyright 2023 Roy T. Hashimoto. All Rights Reserved.
import * as VFS from '../VFS.js';

const SECTOR_SIZE = 4096;

// Each OPFS file begins with a fixed-size header with metadata. The
// contents of the file follow immediately after the header.
const HEADER_MAX_PATH_SIZE = 512;
const HEADER_FLAGS_SIZE = 4;
const HEADER_DIGEST_SIZE = 8;
const HEADER_CORPUS_SIZE = HEADER_MAX_PATH_SIZE + HEADER_FLAGS_SIZE;
const HEADER_OFFSET_FLAGS = HEADER_MAX_PATH_SIZE;
const HEADER_OFFSET_DIGEST = HEADER_CORPUS_SIZE;
const HEADER_OFFSET_DATA = SECTOR_SIZE;

// These file types are expected to persist in the file system outside
// a session. Other files will be removed on VFS start.
const PERSISTENT_FILE_TYPES =
  VFS.SQLITE_OPEN_MAIN_DB |
  VFS.SQLITE_OPEN_MAIN_JOURNAL |
  VFS.SQLITE_OPEN_SUPER_JOURNAL |
  VFS.SQLITE_OPEN_WAL;

const DEFAULT_CAPACITY = 6;

function log(...args) {
  // console.debug(...args);
}

/**
 * This VFS uses the updated Access Handle API with all synchronous methods
 * on FileSystemSyncAccessHandle (instead of just read and write). It will
 * work with the regular SQLite WebAssembly build, i.e. the one without
 * Asyncify.
 */
export class AccessHandlePoolVFS extends VFS.Base {
  // All the OPFS files the VFS uses are contained in one flat directory
  // specified in the constructor. No other files should be written here.
  #directoryPath;
  #directoryHandle;

  // The OPFS files all have randomly-generated names that do not match
  // the SQLite files whose data they contain. This map links those names
  // with their respective OPFS access handles.
  #mapAccessHandleToName = new Map();

  // When a SQLite file is associated with an OPFS file, that association
  // is kept in #mapPathToAccessHandle. Each access handle is in exactly
  // one of #mapPathToAccessHandle or #availableAccessHandles.
  #mapPathToAccessHandle = new Map();
  #availableAccessHandles = new Set();

  #mapIdToFile = new Map();

  constructor(directoryPath) {
    super();
    this.#directoryPath = directoryPath;
    this.isReady = this.reset().then(async () => {
      if (this.getCapacity() === 0) {
        await this.addCapacity(DEFAULT_CAPACITY);
      }
    });
  }

  get name() { return 'AccessHandlePool'; }

  xOpen(name, fileId, flags, pOutFlags) {
    log(`xOpen ${name} ${fileId} 0x${flags.toString(16)}`);
    try {
      // First try to open a path that already exists in the file system.
      const path = name ? this.#getPath(name) : Math.random().toString(36);
      let accessHandle = this.#mapPathToAccessHandle.get(path);
      if (!accessHandle && (flags & VFS.SQLITE_OPEN_CREATE)) {
        // File not found so try to create it.
        if (this.getSize() < this.getCapacity()) {
          // Choose an unassociated OPFS file from the pool.
          ([accessHandle] = this.#availableAccessHandles.keys());
          this.#setAssociatedPath(accessHandle, path, flags);
        } else {
          // Out of unassociated files. This can be fixed by calling
          // addCapacity() from the application.
          throw new Error('cannot create file');
        }
      }
      if (!accessHandle) {
        throw new Error('file not found');
      }
      // Subsequent methods are only passed the fileId, so make sure we have
      // a way to get the file resources.
      const file = { path, flags, accessHandle };
      this.#mapIdToFile.set(fileId, file);

      pOutFlags.setInt32(0, flags, true);
      return VFS.SQLITE_OK;
    } catch (e) {
      console.error(e.message);
      return VFS.SQLITE_CANTOPEN;
    }
  }

  xClose(fileId) {
    const file = this.#mapIdToFile.get(fileId);
    if (file) {
      log(`xClose ${file.path}`);

      file.accessHandle.flush();
      this.#mapIdToFile.delete(fileId);
      if (file.flags & VFS.SQLITE_OPEN_DELETEONCLOSE) {
        this.#deletePath(file.path);
      }
    }
    return VFS.SQLITE_OK;
  }

  xRead(fileId, pData, iOffset) {
    const file = this.#mapIdToFile.get(fileId);
    log(`xRead ${file.path} ${pData.byteLength} ${iOffset}`);

    const nBytes = file.accessHandle.read(pData, { at: HEADER_OFFSET_DATA + iOffset });
    if (nBytes < pData.byteLength) {
      pData.fill(0, nBytes, pData.byteLength);
      return VFS.SQLITE_IOERR_SHORT_READ;
    }
    return VFS.SQLITE_OK;
  }

  xWrite(fileId, pData, iOffset) {
    const file = this.#mapIdToFile.get(fileId);
    log(`xWrite ${file.path} ${pData.byteLength} ${iOffset}`);

    const nBytes = file.accessHandle.write(pData, { at: HEADER_OFFSET_DATA + iOffset });
    return nBytes === pData.byteLength ? VFS.SQLITE_OK : VFS.SQLITE_IOERR;
  }

  xTruncate(fileId, iSize) {
    const file = this.#mapIdToFile.get(fileId);
    log(`xTruncate ${file.path} ${iSize}`);

    file.accessHandle.truncate(HEADER_OFFSET_DATA + iSize);
    return VFS.SQLITE_OK;
  }

  xSync(fileId, flags) {
    const file = this.#mapIdToFile.get(fileId);
    log(`xSync ${file.path} ${flags}`);

    file.accessHandle.flush();
    return VFS.SQLITE_OK;
  }

  xFileSize(fileId, pSize64) {
    const file = this.#mapIdToFile.get(fileId);
    const size = file.accessHandle.getSize() - HEADER_OFFSET_DATA;
    log(`xFileSize ${file.path} ${size}`);
    pSize64.setBigInt64(0, BigInt(size), true);
    return VFS.SQLITE_OK;
  }

  xSectorSize(fileId) {
    log('xSectorSize', SECTOR_SIZE);
    return SECTOR_SIZE;
  }

  xDeviceCharacteristics(fileId) {
    log('xDeviceCharacteristics');
    return VFS.SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN;
  }

  xAccess(name, flags, pResOut) {
    log(`xAccess ${name} ${flags}`);
    const path = this.#getPath(name);
    pResOut.setInt32(0, this.#mapPathToAccessHandle.has(path) ? 1 : 0, true);
    return VFS.SQLITE_OK;
  }

  xDelete(name, syncDir) {
    log(`xDelete ${name} ${syncDir}`);
    const path = this.#getPath(name);
    this.#deletePath(path);
    return VFS.SQLITE_OK;
  }

  async close() {
    await this.#releaseAccessHandles();
  }

  /**
   * Release and reacquire all OPFS access handles. This must be called
   * and awaited before any SQLite call that uses the VFS and also before
   * any capacity changes.
   */
  async reset() {
    await this.isReady;

    // All files are stored in a single directory.
    let handle = await navigator.storage.getDirectory();
    for (const d of this.#directoryPath.split('/')) {
      if (d) {
        handle = await handle.getDirectoryHandle(d, { create: true });
      }
    }
    this.#directoryHandle = handle;

    await this.#releaseAccessHandles();
    await this.#acquireAccessHandles();
  }

  /**
   * Returns the number of SQLite files in the file system.
   * @returns {number}
   */
  getSize() {
    return this.#mapPathToAccessHandle.size;
  }

  /**
   * Returns the maximum number of SQLite files the file system can hold.
   * @returns {number}
   */
  getCapacity() {
    return this.#mapAccessHandleToName.size;
  }

  /**
   * Increase the capacity of the file system by n.
   * @param {number} n 
   * @returns {Promise<number>} 
   */
  async addCapacity(n) {
    for (let i = 0; i < n; ++i) {
      const name = Math.random().toString(36).replace('0.', '');
      const handle = await this.#directoryHandle.getFileHandle(name, { create: true });
      const accessHandle = await handle.createSyncAccessHandle();
      this.#mapAccessHandleToName.set(accessHandle, name);

      this.#setAssociatedPath(accessHandle, '', 0);
    }
    return n;
  }

  /**
   * Decrease the capacity of the file system by n. The capacity cannot be
   * decreased to fewer than the current number of SQLite files in the
   * file system.
   * @param {number} n 
   * @returns {Promise<number>}
   */
  async removeCapacity(n) {
    let nRemoved = 0;
    for (const accessHandle of Array.from(this.#availableAccessHandles)) {
      if (nRemoved == n || this.getSize() === this.getCapacity()) return nRemoved;

      const name = this.#mapAccessHandleToName.get(accessHandle);
      await accessHandle.close();
      await this.#directoryHandle.removeEntry(name);
      this.#mapAccessHandleToName.delete(accessHandle);
      this.#availableAccessHandles.delete(accessHandle);
      ++nRemoved;
    }
    return nRemoved;
  }

  async #acquireAccessHandles() {
    // Enumerate all the files in the directory.
    const files = [];
    for await (const [name, handle] of this.#directoryHandle) {
      if (handle.kind === 'file') {
        files.push([name, handle]);
      }
    }

    // Open access handles in parallel, separating associated and unassociated.
    await Promise.all(files.map(async ([name, handle]) => {
      const accessHandle = await handle.createSyncAccessHandle();
      this.#mapAccessHandleToName.set(accessHandle, name);
      const path = this.#getAssociatedPath(accessHandle);
      if (path) {
        this.#mapPathToAccessHandle.set(path, accessHandle);
      } else {
        this.#availableAccessHandles.add(accessHandle);
      }
    }));
  }

  #releaseAccessHandles() {
    for (const accessHandle of this.#mapAccessHandleToName.keys()) {
      accessHandle.close();
    }
    this.#mapAccessHandleToName.clear();
    this.#mapPathToAccessHandle.clear();
    this.#availableAccessHandles.clear();
  }

  /**
   * Read and return the associated path from an OPFS file header.
   * Empty string is returned for an unassociated OPFS file.
   * @param accessHandle FileSystemSyncAccessHandle
   * @returns {string} path or empty string
   */
  #getAssociatedPath(accessHandle) {
    // Read the path and digest of the path from the file.
    const corpus = new Uint8Array(HEADER_CORPUS_SIZE);
    accessHandle.read(corpus, { at: 0 })

    // Delete files not expected to be present.
    const dataView = new DataView(corpus.buffer, corpus.byteOffset);
    const flags = dataView.getUint32(HEADER_OFFSET_FLAGS);
    if (corpus[0] &&
        ((flags & VFS.SQLITE_OPEN_DELETEONCLOSE) ||
         (flags & PERSISTENT_FILE_TYPES) === 0)) {
      console.warn(`Remove file with unexpected flags ${flags.toString(16)}`);
      this.#setAssociatedPath(accessHandle, '', 0);
      return '';
    }

    const fileDigest = new Uint32Array(HEADER_DIGEST_SIZE / 4);
    accessHandle.read(fileDigest, { at: HEADER_OFFSET_DIGEST });

    // Verify the digest.
    const computedDigest = this.#computeDigest(corpus);
    if (fileDigest.every((value, i) => value === computedDigest[i])) {
      // Good digest. Decode the null-terminated path string.
      const pathBytes = corpus.findIndex(value => value === 0);
      if (pathBytes === 0) {
        // Ensure that unassociated files are empty. Unassociated files are
        // truncated in #setAssociatedPath after the header is written. If
        // an interruption occurs right before the truncation then garbage
        // may remain in the file.
        accessHandle.truncate(HEADER_OFFSET_DATA);
      }
      return new TextDecoder().decode(corpus.subarray(0, pathBytes));
    } else {
      // Bad digest. Repair this header.
      console.warn('Disassociating file with bad digest.');
      this.#setAssociatedPath(accessHandle, '', 0);
      return '';
    }
  }

  /**
   * Set the path on an OPFS file header.
   * @param accessHandle FileSystemSyncAccessHandle
   * @param {string} path
   * @param {number} flags
   */
  #setAssociatedPath(accessHandle, path, flags) {
    // Convert the path string to UTF-8.
    const corpus = new Uint8Array(HEADER_CORPUS_SIZE);
    const encodedResult = new TextEncoder().encodeInto(path, corpus);
    if (encodedResult.written >= HEADER_MAX_PATH_SIZE) {
      throw new Error('path too long');
    }

    // Add the creation flags.
    const dataView = new DataView(corpus.buffer, corpus.byteOffset);
    dataView.setUint32(HEADER_OFFSET_FLAGS, flags);

    // Write the OPFS file header, including the digest.
    const digest = this.#computeDigest(corpus);
    accessHandle.write(corpus, { at: 0 });
    accessHandle.write(digest, { at: HEADER_OFFSET_DIGEST });
    accessHandle.flush();

    if (path) {
      this.#mapPathToAccessHandle.set(path, accessHandle);
      this.#availableAccessHandles.delete(accessHandle);
    } else {
      // This OPFS file doesn't represent any SQLite file so it doesn't
      // need to keep any data.
      accessHandle.truncate(HEADER_OFFSET_DATA);
      this.#availableAccessHandles.add(accessHandle);
    }
  }

  /**
   * We need a synchronous digest function so can't use WebCrypto.
   * Adapted from https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
   * @param {Uint8Array} corpus 
   * @returns {ArrayBuffer} 64-bit digest
   */
  #computeDigest(corpus) {
    if (!corpus[0]) {
      // Optimization for deleted file.
      return new Uint32Array([0xfecc5f80, 0xaccec037]);
    }

    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    
    for (const value of corpus) {
      h1 = Math.imul(h1 ^ value, 2654435761);
      h2 = Math.imul(h2 ^ value, 1597334677);
    }
    
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    
    return new Uint32Array([h1 >>> 0, h2 >>> 0]);
  };
  
  /**
   * Convert a bare filename, path, or URL to a UNIX-style path.
   * @param {string|URL} nameOrURL
   * @returns {string} path
   */
  #getPath(nameOrURL) {
    const url = typeof nameOrURL === 'string' ?
      new URL(nameOrURL, 'file://localhost/') :
      nameOrURL;
    return url.pathname;
  }

  /**
   * Remove the association between a path and an OPFS file.
   * @param {string} path 
   */
  #deletePath(path) {
    const accessHandle = this.#mapPathToAccessHandle.get(path);
    if (accessHandle) {
      // Un-associate the SQLite path from the OPFS file.
      this.#mapPathToAccessHandle.delete(path);
      this.#setAssociatedPath(accessHandle, '', 0);
    }
  }
}