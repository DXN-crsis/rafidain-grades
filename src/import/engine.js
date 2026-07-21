// The import engine's front door: bytes in, preview report out.
//
// Nothing in this module writes to the database — preview is read-only by
// contract. File kind is decided by CONTENT (magic bytes, zip members), not by
// the filename extension, so a mislabeled file still parses or fails honestly.

const { inspectZip, ImportError } = require('./zipGuard');
const { parseWorkbook } = require('./parseSpreadsheet');
const { parseDocx } = require('./parseDocx');
const { detectStructure, chooseSheet } = require('./detect');
const { classifyRows } = require('./classify');
const { cleanCell, normalizeForCompare } = require('./normalize');

const ERR_UNSUPPORTED = 'نوع الملف غير مدعوم — الأنواع المقبولة: Excel (‎.xlsx أو ‎.xls) أو Word (‎.docx) أو CSV';
const ERR_EMPTY = 'الملف فارغ أو لا يحتوي أي بيانات — تأكد من الملف وحاول مرة أخرى';

const CFB_MAGIC = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

function startsWith(buffer, bytes) {
  if (buffer.length < bytes.length) return false;
  return bytes.every((b, i) => buffer[i] === b);
}

// Content-first kind sniffing. The zip inspection doubles as the bomb guard,
// so a zip bomb is rejected before we even know what it claims to be.
function sniffKind(buffer, filename) {
  if (startsWith(buffer, [0x50, 0x4B, 0x03, 0x04])) {
    const names = inspectZip(buffer);
    if (names.some((n) => n === 'xl/workbook.xml' || n.startsWith('xl/'))) return 'xlsx';
    if (names.includes('word/document.xml')) return 'docx';
    throw new ImportError(ERR_UNSUPPORTED);
  }
  if (startsWith(buffer, CFB_MAGIC)) return 'xls';
  const ext = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  if (ext && (ext[1] === 'csv' || ext[1] === 'txt')) return 'csv';
  throw new ImportError(ERR_UNSUPPORTED);
}

// Reflected back to the client — keep it boring: basename, no controls, capped.
function sanitizeFilename(name) {
  return cleanCell(String(name || 'ملف').split(/[/\\]/).pop()).slice(0, 120) || 'ملف';
}

function columnsReport(rows, headerIdx) {
  const width = Math.min(rows.reduce((w, r) => Math.max(w, r.length), 0), 64);
  const columns = [];
  for (let j = 0; j < width; j++) {
    const header = headerIdx >= 0 ? cleanCell((rows[headerIdx] || [])[j]) || null : null;
    const sample = [];
    for (let i = headerIdx >= 0 ? headerIdx + 1 : 0; i < rows.length && sample.length < 5; i++) {
      const v = cleanCell((rows[i] || [])[j]);
      if (v) sample.push(v.slice(0, 60));
    }
    columns.push({ index: j, header, sample });
  }
  return columns;
}

// buffer + filename + target section -> the full preview report (minus token,
// which is the route's concern).
function buildPreview({ buffer, filename, db, sectionId, nameColumn }) {
  const kind = sniffKind(buffer, filename);

  let rows;
  let firstRowNumber = 1;
  let sheetName = null;
  let sourceNote = null; // Arabic, prepended to the detection reason

  if (kind === 'docx') {
    const doc = parseDocx(buffer);
    rows = doc.rows;
    sourceNote = doc.mode === 'table'
      ? `تمت قراءة الجدول الأكبر في المستند (${rows.length} صفاً${doc.tableCount > 1 ? ` من أصل ${doc.tableCount} جداول` : ''})`
      : 'لا يحتوي المستند جدولاً؛ تمت قراءة الفقرات كقائمة أسماء';
  } else {
    const { sheets } = parseWorkbook(buffer, kind);
    const pick = chooseSheet(sheets);
    const sheet = sheets[pick.index];
    rows = sheet.rows;
    firstRowNumber = sheet.firstRowNumber;
    sheetName = kind === 'csv' ? null : sheet.name;
    sourceNote = kind === 'csv' ? null : pick.reason;
  }

  if (rows.length === 0) throw new ImportError(ERR_EMPTY);

  const detection = detectStructure(rows, firstRowNumber, nameColumn);
  const reason = [sourceNote, detection.reason].filter(Boolean).join('؛ ');

  const dbNames = new Set(
    db.prepare('SELECT name FROM students WHERE section_id = ?').all(sectionId)
      .map((s) => normalizeForCompare(s.name))
  );

  const { rows: reportRows, summary } = classifyRows({
    rows,
    firstRowNumber,
    headerIdx: detection.headerIdx,
    nameCol: detection.nameCol,
    dbNames,
  });

  return {
    source: {
      filename: sanitizeFilename(filename),
      kind,
      sheet: sheetName,
      header_row: detection.headerRowNumber,
      total_rows: rows.length,
    },
    detection: {
      name_column: detection.nameCol,
      name_header: detection.nameHeader,
      confidence: detection.confidence,
      reason,
    },
    columns: columnsReport(rows, detection.headerIdx),
    rows: reportRows,
    summary,
  };
}

module.exports = { buildPreview, sniffKind, ImportError };
