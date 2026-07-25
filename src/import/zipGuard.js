const { unzipSync } = require('fflate');

const LIMITS = {
  maxEntries: 4096,
  maxEntryBytes: 30 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
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
        return false;
      },
    });
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError(ERR_CORRUPT);
  }
  return names;
}

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
