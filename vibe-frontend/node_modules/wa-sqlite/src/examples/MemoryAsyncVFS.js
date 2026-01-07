// Copyright 2021 Roy T. Hashimoto. All Rights Reserved.
import { MemoryVFS } from './MemoryVFS.js';

// Asynchronous memory filesystem. This filesystem requires an Asyncify
// build. It is mainly useful for testing that the Asyncify build is
// working.
export class MemoryAsyncVFS extends MemoryVFS {
  name = 'memory-async';
  
  constructor() {
    super();
  }

  async close() {
    for (const fileId of this.mapIdToFile.keys()) {
      await this.xClose(fileId);
    }
  }

  /**
   * @param {string?} name 
   * @param {number} fileId 
   * @param {number} flags 
   * @param {DataView} pOutFlags 
   * @returns {number}
   */
  xOpen(name, fileId, flags, pOutFlags) {
    return this.handleAsync(async () => super.xOpen(name, fileId, flags, pOutFlags));
  }

  /**
   * @param {number} fileId 
   * @returns {number}
   */
  xClose(fileId) {
    return this.handleAsync(async () => super.xClose(fileId));
  }

  /**
   * @param {number} fileId 
   * @param {Uint8Array} pData 
   * @param {number} iOffset
   * @returns {number}
   */
  xRead(fileId, pData, iOffset) {
    return this.handleAsync(async () => super.xRead(fileId, pData, iOffset));
  }

  /**
   * @param {number} fileId 
   * @param {Uint8Array} pData 
   * @param {number} iOffset
   * @returns {number}
   */
  xWrite(fileId, pData, iOffset) {
    return this.handleAsync(async () => super.xWrite(fileId, pData, iOffset));
  }

  /**
   * @param {number} fileId 
   * @param {number} iSize 
   * @returns {number}
   */
  xTruncate(fileId, iSize) {
    return this.handleAsync(async () => super.xTruncate(fileId, iSize));
  }

  /**
   * @param {number} fileId 
   * @param {DataView} pSize64 
   * @returns {number}
   */
  xFileSize(fileId, pSize64) {
    return this.handleAsync(async () => super.xFileSize(fileId, pSize64));
  }

  /**
   * 
   * @param {string} name 
   * @param {number} syncDir 
   * @returns {number}
   */
  xDelete(name, syncDir) {
    return this.handleAsync(async () => super.xDelete(name, syncDir));
  }

  /**
   * @param {string} name 
   * @param {number} flags 
   * @param {DataView} pResOut 
   * @returns {number}
   */
  xAccess(name, flags, pResOut) {
    return this.handleAsync(async () => super.xAccess(name, flags, pResOut));
  }
}
