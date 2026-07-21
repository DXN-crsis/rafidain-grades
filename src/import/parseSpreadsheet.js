// XLSX / XLS / CSV to a uniform grid model:
//   { sheets: [ { name, rows: string[][], firstRowNumber } ] }
// where firstRowNumber is the 1-based row number OF THE FIRST GRID ROW in the
// user's own file (Excel numbering), so every report entry can point the
// teacher at the exact line they can see on their screen.

const XLSX = require('xlsx');
const { ImportError } = require('./zipGuard');

const MAX_GRID_ROWS = 20000;
const MAX_GRID_COLS = 256;

const ERR_UNREADABLE = 'تعذر قراءة الملف — يبدو أنه تالف أو غير مكتمل. أعد حفظ الملف ثم حاول مرة أخرى';
const ERR_TOO_WIDE = 'الملف أكبر من المعقول لكشف طلبة — تأكد من أنك رفعت الملف الصحيح';

// windows-1256 (Arabic) high half, from the Unicode reference mapping.
// Index = byte - 0x80.
const CP1256_HIGH = [
  0x20AC, 0x067E, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
  0x02C6, 0x2030, 0x0679, 0x2039, 0x0152, 0x0686, 0x0698, 0x0688,
  0x06AF, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
  0x06A9, 0x2122, 0x0691, 0x203A, 0x0153, 0x200C, 0x200D, 0x06BA,
  0x00A0, 0x060C, 0x00A2, 0x00A3, 0x00A4, 0x00A5, 0x00A6, 0x00A7,
  0x00A8, 0x00A9, 0x06BE, 0x00AB, 0x00AC, 0x00AD, 0x00AE, 0x00AF,
  0x00B0, 0x00B1, 0x00B2, 0x00B3, 0x00B4, 0x00B5, 0x00B6, 0x00B7,
  0x00B8, 0x00B9, 0x061B, 0x00BB, 0x00BC, 0x00BD, 0x00BE, 0x061F,
  0x06C1, 0x0621, 0x0622, 0x0623, 0x0624, 0x0625, 0x0626, 0x0627,
  0x0628, 0x0629, 0x062A, 0x062B, 0x062C, 0x062D, 0x062E, 0x062F,
  0x0630, 0x0631, 0x0632, 0x0633, 0x0634, 0x0635, 0x0636, 0x00D7,
  0x0637, 0x0638, 0x0639, 0x063A, 0x0640, 0x0641, 0x0642, 0x0643,
  0x00E0, 0x0644, 0x00E2, 0x0645, 0x0646, 0x0647, 0x0648, 0x00E7,
  0x00E8, 0x00E9, 0x00EA, 0x00EB, 0x0649, 0x064A, 0x00EE, 0x00EF,
  0x064B, 0x064C, 0x064D, 0x064E, 0x00F4, 0x064F, 0x0650, 0x00F7,
  0x0651, 0x00F9, 0x0652, 0x00FB, 0x00FC, 0x200E, 0x200F, 0x06D2,
];

function decodeCp1256(buffer) {
  let out = '';
  for (const b of buffer) out += String.fromCharCode(b < 0x80 ? b : CP1256_HIGH[b - 0x80]);
  return out;
}

// CSV bytes to a JS string: UTF-8/UTF-16 BOMs first, then strict UTF-8,
// then legacy Arabic Windows-1256 (what old Excel installations export).
function decodeTextBuffer(buffer) {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) return buffer.toString('utf16le').slice(1);
    if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
      return Buffer.from(buffer.subarray(2)).swap16().toString('utf16le');
    }
  }
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.toString('utf8', 3);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return decodeCp1256(buffer);
  }
}

function workbookToSheets(wb) {
  const sheets = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) {
      sheets.push({ name, rows: [], firstRowNumber: 1 });
      continue;
    }
    const range = XLSX.utils.decode_range(ws['!ref']);
    const height = range.e.r - range.s.r + 1;
    const width = range.e.c - range.s.c + 1;
    if (height > MAX_GRID_ROWS || width > MAX_GRID_COLS) throw new ImportError(ERR_TOO_WIDE);
    // raw:false → the formatted text the teacher actually sees in the cell.
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1, raw: false, defval: '', blankrows: true,
    }).map((r) => r.map((c) => String(c ?? '')));
    sheets.push({ name, rows, firstRowNumber: range.s.r + 1 });
  }
  return sheets;
}

function parseWorkbook(buffer, kind) {
  let wb;
  try {
    if (kind === 'csv') {
      const text = decodeTextBuffer(buffer);
      wb = XLSX.read(text, { type: 'string', raw: false, dense: true });
    } else {
      wb = XLSX.read(buffer, {
        type: 'buffer', dense: true, cellFormula: false, cellHTML: false,
      });
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError(ERR_UNREADABLE);
  }
  const sheets = workbookToSheets(wb);
  if (sheets.length === 0) throw new ImportError(ERR_UNREADABLE);
  return { sheets };
}

module.exports = { parseWorkbook, decodeTextBuffer, decodeCp1256 };
