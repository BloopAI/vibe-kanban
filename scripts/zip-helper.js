#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { createHash } = require('crypto');

/**
 * Simple ZIP file creator using Node.js built-in modules
 * Creates ZIP files compatible with standard unzip tools
 */
class SimpleZip {
  constructor() {
    this.files = [];
    this.centralDirectory = [];
  }

  addFile(filename, buffer) {
    const timestamp = new Date();
    const dosDate = this.toDosDate(timestamp);
    const dosTime = this.toDosTime(timestamp);
    
    // Use deflate compression
    const compressed = zlib.deflateRawSync(buffer);
    const crc32 = this.crc32(buffer);
    
    const localFileHeader = Buffer.alloc(30 + filename.length);
    let offset = 0;
    
    // Local file header signature
    localFileHeader.writeUInt32LE(0x04034b50, offset); offset += 4;
    // Version needed to extract (2.0)
    localFileHeader.writeUInt16LE(20, offset); offset += 2;
    // General purpose bit flag
    localFileHeader.writeUInt16LE(0, offset); offset += 2;
    // Compression method (8 = deflate)
    localFileHeader.writeUInt16LE(8, offset); offset += 2;
    // File last modification time
    localFileHeader.writeUInt16LE(dosTime, offset); offset += 2;
    // File last modification date
    localFileHeader.writeUInt16LE(dosDate, offset); offset += 2;
    // CRC-32
    localFileHeader.writeUInt32LE(crc32, offset); offset += 4;
    // Compressed size
    localFileHeader.writeUInt32LE(compressed.length, offset); offset += 4;
    // Uncompressed size
    localFileHeader.writeUInt32LE(buffer.length, offset); offset += 4;
    // Filename length
    localFileHeader.writeUInt16LE(filename.length, offset); offset += 2;
    // Extra field length
    localFileHeader.writeUInt16LE(0, offset); offset += 2;
    // Filename
    localFileHeader.write(filename, offset);
    
    const localFileEntry = Buffer.concat([localFileHeader, compressed]);
    
    // Store info for central directory
    this.centralDirectory.push({
      filename,
      crc32,
      compressedSize: compressed.length,
      uncompressedSize: buffer.length,
      dosDate,
      dosTime,
      localHeaderOffset: this.files.reduce((sum, file) => sum + file.length, 0)
    });
    
    this.files.push(localFileEntry);
  }

  generateZip() {
    // Combine all local file entries
    const localFiles = Buffer.concat(this.files);
    
    // Generate central directory
    const centralDirEntries = [];
    
    for (const entry of this.centralDirectory) {
      const centralDirHeader = Buffer.alloc(46 + entry.filename.length);
      let offset = 0;
      
      // Central directory signature
      centralDirHeader.writeUInt32LE(0x02014b50, offset); offset += 4;
      // Version made by
      centralDirHeader.writeUInt16LE(20, offset); offset += 2;
      // Version needed to extract
      centralDirHeader.writeUInt16LE(20, offset); offset += 2;
      // General purpose bit flag
      centralDirHeader.writeUInt16LE(0, offset); offset += 2;
      // Compression method
      centralDirHeader.writeUInt16LE(8, offset); offset += 2;
      // File last modification time
      centralDirHeader.writeUInt16LE(entry.dosTime, offset); offset += 2;
      // File last modification date
      centralDirHeader.writeUInt16LE(entry.dosDate, offset); offset += 2;
      // CRC-32
      centralDirHeader.writeUInt32LE(entry.crc32, offset); offset += 4;
      // Compressed size
      centralDirHeader.writeUInt32LE(entry.compressedSize, offset); offset += 4;
      // Uncompressed size
      centralDirHeader.writeUInt32LE(entry.uncompressedSize, offset); offset += 4;
      // Filename length
      centralDirHeader.writeUInt16LE(entry.filename.length, offset); offset += 2;
      // Extra field length
      centralDirHeader.writeUInt16LE(0, offset); offset += 2;
      // File comment length
      centralDirHeader.writeUInt16LE(0, offset); offset += 2;
      // Disk number start
      centralDirHeader.writeUInt16LE(0, offset); offset += 2;
      // Internal file attributes
      centralDirHeader.writeUInt16LE(0, offset); offset += 2;
      // External file attributes
      centralDirHeader.writeUInt32LE(0, offset); offset += 4;
      // Relative offset of local header
      centralDirHeader.writeUInt32LE(entry.localHeaderOffset, offset); offset += 4;
      // Filename
      centralDirHeader.write(entry.filename, offset);
      
      centralDirEntries.push(centralDirHeader);
    }
    
    const centralDirectory = Buffer.concat(centralDirEntries);
    
    // End of central directory record
    const endOfCentralDir = Buffer.alloc(22);
    let offset = 0;
    
    // End of central directory signature
    endOfCentralDir.writeUInt32LE(0x06054b50, offset); offset += 4;
    // Number of this disk
    endOfCentralDir.writeUInt16LE(0, offset); offset += 2;
    // Disk where central directory starts
    endOfCentralDir.writeUInt16LE(0, offset); offset += 2;
    // Number of central directory records on this disk
    endOfCentralDir.writeUInt16LE(this.centralDirectory.length, offset); offset += 2;
    // Total number of central directory records
    endOfCentralDir.writeUInt16LE(this.centralDirectory.length, offset); offset += 2;
    // Size of central directory
    endOfCentralDir.writeUInt32LE(centralDirectory.length, offset); offset += 4;
    // Offset of start of central directory
    endOfCentralDir.writeUInt32LE(localFiles.length, offset); offset += 4;
    // ZIP file comment length
    endOfCentralDir.writeUInt16LE(0, offset);
    
    return Buffer.concat([localFiles, centralDirectory, endOfCentralDir]);
  }

  toDosDate(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return ((year - 1980) << 9) | (month << 5) | day;
  }

  toDosTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);
    return (hours << 11) | (minutes << 5) | seconds;
  }

  crc32(buffer) {
    const crcTable = [];
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
      }
      crcTable[i] = crc;
    }

    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buffer.length; i++) {
      crc = crcTable[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
}

// Recursively add directory contents
function addDirectoryToZip(zip, dirPath, baseDir = '') {
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const relativePath = baseDir ? path.join(baseDir, item) : item;
    
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      addDirectoryToZip(zip, itemPath, relativePath);
    } else {
      const buffer = fs.readFileSync(itemPath);
      zip.addFile(relativePath, buffer);
    }
  }
}

// Command line interface
function createZip(zipFilename, ...inputFiles) {
  const zip = new SimpleZip();
  let totalFiles = 0;
  
  for (const inputFile of inputFiles) {
    if (!fs.existsSync(inputFile)) {
      console.error(`❌ Input file not found: ${inputFile}`);
      process.exit(1);
    }
    
    const stat = fs.statSync(inputFile);
    if (stat.isDirectory()) {
      addDirectoryToZip(zip, inputFile, path.basename(inputFile));
      const dirFiles = countFilesInDirectory(inputFile);
      totalFiles += dirFiles;
    } else {
      const buffer = fs.readFileSync(inputFile);
      const filename = path.basename(inputFile);
      zip.addFile(filename, buffer);
      totalFiles += 1;
    }
  }
  
  const zipBuffer = zip.generateZip();
  fs.writeFileSync(zipFilename, zipBuffer);
  console.log(`✅ Created ${zipFilename} with ${totalFiles} file(s)`);
}

// Helper to count files in directory recursively
function countFilesInDirectory(dirPath) {
  let count = 0;
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      count += countFilesInDirectory(itemPath);
    } else {
      count += 1;
    }
  }
  return count;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node zip-helper.js <output.zip> <input-file> [input-file2] ...');
    process.exit(1);
  }
  
  const [zipFilename, ...inputFiles] = args;
  createZip(zipFilename, ...inputFiles);
}

module.exports = { SimpleZip, createZip };