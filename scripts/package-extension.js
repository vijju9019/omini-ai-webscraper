/**
 * Zero-dependency Extension Packager for OmniScrape AI
 * Reads extension/dist and packages into extension/omniscrape-ai.zip & website/omniscrape-ai.zip
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
  }
  return (~c) >>> 0;
}

function createZipBuffer(fileMap) {
  const fileEntries = [];
  let offset = 0;

  for (const [name, content] of Object.entries(fileMap)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const nameBuf = Buffer.from(name.replace(/\\/g, '/'), 'utf8');

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    fileEntries.push({
      nameBuf,
      crc,
      compressedSize: compressed.length,
      uncompressedSize: data.length,
      offset,
      localHeader,
      compressed,
    });

    offset += localHeader.length + compressed.length;
  }

  const centralDirBuffers = [];
  let centralDirSize = 0;

  for (const entry of fileEntries) {
    const cdHeader = Buffer.alloc(46 + entry.nameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(0, 8);
    cdHeader.writeUInt16LE(8, 10);
    cdHeader.writeUInt16LE(0, 12);
    cdHeader.writeUInt16LE(0, 14);
    cdHeader.writeUInt32LE(entry.crc, 16);
    cdHeader.writeUInt32LE(entry.compressedSize, 20);
    cdHeader.writeUInt32LE(entry.uncompressedSize, 24);
    cdHeader.writeUInt16LE(entry.nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    cdHeader.writeUInt32LE(0, 38);
    cdHeader.writeUInt32LE(entry.offset, 42);
    entry.nameBuf.copy(cdHeader, 46);

    centralDirBuffers.push(cdHeader);
    centralDirSize += cdHeader.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(fileEntries.length, 8);
  eocd.writeUInt16LE(fileEntries.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  const allBuffers = [];
  for (const entry of fileEntries) {
    allBuffers.push(entry.localHeader);
    allBuffers.push(entry.compressed);
  }
  allBuffers.push(...centralDirBuffers);
  allBuffers.push(eocd);

  return Buffer.concat(allBuffers);
}

function collectFiles(dir, baseDir = dir) {
  const result = {};
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, collectFiles(fullPath, baseDir));
    } else {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      result[relPath] = fs.readFileSync(fullPath);
    }
  }
  return result;
}

const distDir = path.join(__dirname, '..', 'extension', 'dist');
if (!fs.existsSync(distDir)) {
  console.error('dist directory does not exist:', distDir);
  process.exit(1);
}

const files = collectFiles(distDir);
console.log(`Packaging ${Object.keys(files).length} files from ${distDir}...`);

const zipBuffer = createZipBuffer(files);

const target1 = path.join(__dirname, '..', 'extension', 'omniscrape-ai.zip');
const target2 = path.join(__dirname, '..', 'website', 'omniscrape-ai.zip');

fs.writeFileSync(target1, zipBuffer);
fs.writeFileSync(target2, zipBuffer);

console.log(`Saved extension package: ${target1} (${(zipBuffer.length / 1024).toFixed(1)} KB)`);
console.log(`Saved website download package: ${target2} (${(zipBuffer.length / 1024).toFixed(1)} KB)`);
