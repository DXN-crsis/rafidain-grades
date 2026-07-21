// Zip container inspection for untrusted uploads.
//
// XLSX and DOCX are zip archives, which makes a zip bomb a real attack here:
// a 60 KB upload can declare gigabytes of uncompressed content. This module
// walks the archive's directory WITHOUT inflating anything (fflate's filter
// callback runs before inflation) and rejects archives whose declared sizes
// are out of all proportion to a school roster.

const { unzipSync } = require('fflate');

const LIMITS = {
  maxEntries: 4096,
  maxEntryBytes: 30 * 1024 * 1024,  // any single member
  maxTotalBytes: 50 * 1024 * 1024,  // whole archive, uncompressed
};

class ImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportError';
    this.status = 400;
  }
}

const ERR_CORRUPT = 'تعذر قراءة الملف — يبدو أنه تالف أو غير مكتمل. أعد حفظ الملف ثم حاول مرة أخرى';
const ERR_BOMB = 'الملف مضغوط بشكل غير طبيعي ولا يمكن قبوله';

// Returns the entry names after validating declared sizes. Throws ImportError.
function inspectZip(buffer) {
  const names = [];
  let total = 0;
  let count = 0;
  try {
    unzipSync(buffer, {
      filter(entry) {
        count += 1;
        if (count > LIMITS.maxEntries) throw new ImportError(ERR_BOMB);
        const size = entry.originalSize || 0;
        if (size > LIMITS.maxEntryBytes) throw new ImportError(ERR_BOMB);
        total += size;
        if (total > LIMITS.maxTotalBytes) throw new ImportError(ERR_BOMB);
        names.push(entry.name);
        return false; // never inflate during inspection
      },
    });
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError(ERR_CORRUPT);
  }
  return names;
}

// Inflates exactly one entry from an already-inspected archive.
function readZipEntry(buffer, entryName) {
  let out = null;
  try {
    const files = unzipSync(buffer, {
      filter: (entry) => entry.name === entryName && (entry.originalSize || 0) <= LIMITS.maxEntryBytes,
    });
    out = files[entryName] || null;
  } catch {
    throw new ImportError(ERR_CORRUPT);
  }
  return out;
}

module.exports = { inspectZip, readZipEntry, ImportError, LIMITS };
