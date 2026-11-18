/**
 * Zero-dependency Excel (.xlsx) and RFC-4180 CSV Writer for OmniScrape AI
 * Built with native Node.js zlib and standard OpenPackaging Conventions (OPC)
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
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
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, 'utf8');

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed: 2.0
    localHeader.writeUInt16LE(0, 6);          // General purpose bit flag
    localHeader.writeUInt16LE(8, 8);          // Compression method: Deflate
    localHeader.writeUInt16LE(0, 10);         // Last mod file time
    localHeader.writeUInt16LE(0, 12);         // Last mod file date
    localHeader.writeUInt32LE(crc, 14);       // CRC-32
    localHeader.writeUInt32LE(compressed.length, 18); // Compressed size
    localHeader.writeUInt32LE(data.length, 22);       // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);    // File name length
    localHeader.writeUInt16LE(0, 28);                 // Extra field length
    nameBuf.copy(localHeader, 30);

    fileEntries.push({
      nameBuf,
      crc,
      compressedSize: compressed.length,
      uncompressedSize: data.length,
      offset,
      localHeader,
      compressed
    });

    offset += localHeader.length + compressed.length;
  }

  const centralDirBuffers = [];
  let centralDirSize = 0;

  for (const entry of fileEntries) {
    const cdHeader = Buffer.alloc(46 + entry.nameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Central directory header signature
    cdHeader.writeUInt16LE(20, 4);         // Version made by
    cdHeader.writeUInt16LE(20, 6);         // Version needed
    cdHeader.writeUInt16LE(0, 8);          // General purpose bit flag
    cdHeader.writeUInt16LE(8, 10);         // Compression method: Deflate
    cdHeader.writeUInt16LE(0, 12);         // Last mod file time
    cdHeader.writeUInt16LE(0, 14);         // Last mod file date
    cdHeader.writeUInt32LE(entry.crc, 16); // CRC-32
    cdHeader.writeUInt32LE(entry.compressedSize, 20);   // Compressed size
    cdHeader.writeUInt32LE(entry.uncompressedSize, 24); // Uncompressed size
    cdHeader.writeUInt16LE(entry.nameBuf.length, 28);   // File name length
    cdHeader.writeUInt16LE(0, 30);                      // Extra field length
    cdHeader.writeUInt16LE(0, 32);                      // Comment length
    cdHeader.writeUInt16LE(0, 34);                      // Disk number start
    cdHeader.writeUInt16LE(0, 36);                      // Internal file attributes
    cdHeader.writeUInt32LE(0, 38);                      // External file attributes
    cdHeader.writeUInt32LE(entry.offset, 42);           // Relative offset of local header
    entry.nameBuf.copy(cdHeader, 46);

    centralDirBuffers.push(cdHeader);
    centralDirSize += cdHeader.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  eocd.writeUInt16LE(0, 4);          // Number of this disk
  eocd.writeUInt16LE(0, 6);          // Disk with start of central directory
  eocd.writeUInt16LE(fileEntries.length, 8);  // Total entries in central directory on this disk
  eocd.writeUInt16LE(fileEntries.length, 10); // Total entries in central directory
  eocd.writeUInt32LE(centralDirSize, 12);     // Size of central directory
  eocd.writeUInt32LE(offset, 16);             // Offset of central directory
  eocd.writeUInt16LE(0, 20);                  // Zip file comment length

  const allBuffers = [];
  for (const entry of fileEntries) {
    allBuffers.push(entry.localHeader);
    allBuffers.push(entry.compressed);
  }
  allBuffers.push(...centralDirBuffers);
  allBuffers.push(eocd);

  return Buffer.concat(allBuffers);
}

function xmlEscape(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnToLetters(colIndex) {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Builds standard Excel .xlsx binary buffer from an array of JSON objects
 */
function buildXlsxBuffer(rows, sheetName = 'Scraped Data') {
  if (!rows || rows.length === 0) {
    rows = [{ Status: 'No data extracted' }];
  }

  const columns = Array.from(
    rows.reduce((acc, row) => {
      Object.keys(row).forEach(k => acc.add(k));
      return acc;
    }, new Set())
  );

  // 1. [Content_Types].xml
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  // 2. _rels/.rels
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  // 3. xl/workbook.xml
  const safeSheetName = xmlEscape(sheetName.replace(/[\\/?*[\]]/g, '_').slice(0, 31));
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${safeSheetName}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  // 4. xl/_rels/workbook.xml.rels
  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // 5. xl/styles.xml (Header styling & fonts)
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`;

  // Calculate column widths
  const colWidths = columns.map(col => {
    let max = col.length;
    for (let r = 0; r < Math.min(rows.length, 100); r++) {
      const val = rows[r][col];
      if (val) max = Math.max(max, String(val).length);
    }
    return Math.min(Math.max(max + 3, 12), 65);
  });

  let colsXml = '<cols>';
  colWidths.forEach((width, idx) => {
    colsXml += `<col min="${idx + 1}" max="${idx + 1}" width="${width}" customWidth="1"/>`;
  });
  colsXml += '</cols>';

  // Build sheet data
  let sheetDataXml = '<sheetData>';

  // Header Row (Row 1 with header style s="1")
  sheetDataXml += '<row r="1">';
  columns.forEach((col, cIdx) => {
    const cellRef = `${columnToLetters(cIdx)}1`;
    sheetDataXml += `<c r="${cellRef}" t="inlineStr" s="1"><is><t>${xmlEscape(col)}</t></is></c>`;
  });
  sheetDataXml += '</row>';

  // Data Rows (Row 2..N)
  rows.forEach((row, rIdx) => {
    const rowNum = rIdx + 2;
    sheetDataXml += `<row r="${rowNum}">`;
    columns.forEach((col, cIdx) => {
      const cellRef = `${columnToLetters(cIdx)}${rowNum}`;
      const val = row[col];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        const strVal = String(val);
        // If numeric value, store as number
        if (!isNaN(strVal) && !isNaN(parseFloat(strVal)) && isFinite(strVal) && !strVal.startsWith('0') && strVal.length < 12) {
          sheetDataXml += `<c r="${cellRef}" t="n"><v>${strVal}</v></c>`;
        } else {
          sheetDataXml += `<c r="${cellRef}" t="inlineStr"><is><t>${xmlEscape(strVal)}</t></is></c>`;
        }
      }
    });
    sheetDataXml += '</row>';
  });
  sheetDataXml += '</sheetData>';

  const lastColLetter = columnToLetters(columns.length - 1);
  const totalRows = rows.length + 1;
  const dimension = `A1:${lastColLetter}${totalRows}`;

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimension}"/>
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="16"/>
  ${colsXml}
  ${sheetDataXml}
</worksheet>`;

  return createZipBuffer({
    '[Content_Types].xml': contentTypesXml,
    '_rels/.rels': rootRelsXml,
    'xl/workbook.xml': workbookXml,
    'xl/_rels/workbook.xml.rels': workbookRelsXml,
    'xl/styles.xml': stylesXml,
    'xl/worksheets/sheet1.xml': sheet1Xml
  });
}

/**
 * Builds RFC-4180 compliant CSV with UTF-8 BOM
 */
function buildCsvString(rows) {
  if (!rows || rows.length === 0) return '';

  const columns = Array.from(
    rows.reduce((acc, row) => {
      Object.keys(row).forEach(k => acc.add(k));
      return acc;
    }, new Set())
  );

  const escapeCell = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = columns.map(escapeCell).join(',');
  const dataLines = rows.map(row => columns.map(col => escapeCell(row[col])).join(','));

  // Prepend UTF-8 Byte Order Mark for instant, zero-corruption Excel opening
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

/**
 * Writes both .xlsx and .csv to disk
 */
function saveDatasets(targetDir, baseFilename, rows, sheetName = 'Scraped Dataset') {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const csvPath = path.join(targetDir, `${baseFilename}.csv`);
  const xlsxPath = path.join(targetDir, `${baseFilename}.xlsx`);

  const csvContent = buildCsvString(rows);
  fs.writeFileSync(csvPath, csvContent, 'utf8');

  const xlsxBuffer = buildXlsxBuffer(rows, sheetName);
  fs.writeFileSync(xlsxPath, xlsxBuffer);

  return {
    csvPath,
    xlsxPath,
    csvSize: fs.statSync(csvPath).size,
    xlsxSize: fs.statSync(xlsxPath).size,
    rowCount: rows.length
  };
}

module.exports = {
  buildXlsxBuffer,
  buildCsvString,
  saveDatasets
};
