// Structure detection: which sheet holds the roster, where the header row is,
// and which column carries the students' names.
//
// The detection NEVER guesses silently: every choice comes back with an Arabic
// reason string and a confidence level, and a manual override always wins.

const {
  cleanCell, normalizeForCompare, looksLikeName, bareToken,
} = require('./normalize');

// Header synonyms in comparison form with «ال» stripped per token.
// Matched against the whole cell and cell tokens — token-exact, no substrings.
const NAME_HEADER_EXACT = new Set([
  'اسم', 'اسم طالب', 'اسم ثلاثي', 'اسم طالب ثلاثي', 'اسم رباعي',
  'اسم طالب رباعي', 'اسم كامل', 'طالب', 'اسماء', 'اسماء طلبه',
  'name', 'student name', 'student', 'full name', 'students',
]);
const SERIAL_HEADER = new Set(['ت', 'م', 'رقم', 'تسلسل', 'رقم متسلسل', '#', 'no', 'seq', 'ر م']);
const OTHER_HEADER = new Set([
  'شعبه', 'صف', 'مرحله', 'ملاحظات', 'ملاحظه', 'توقيع', 'مواليد', 'تولد',
  'رقم امتحاني', 'قسم', 'فرع', 'عنوان', 'هاتف', 'درجه', 'معدل', 'نتيجه',
  'مدرسه', 'جنس', 'دور',
]);

// Comparison form of a header cell: normalized, punctuation-trimmed tokens,
// «ال» stripped from each token («الاسم الثلاثي:» → «اسم ثلاثي»).
function headerForm(cell) {
  return normalizeForCompare(cell)
    .split(' ')
    .map(bareToken)
    .filter(Boolean)
    .join(' ');
}

function isNameHeader(cell) {
  const h = headerForm(cell);
  if (!h) return false;
  if (NAME_HEADER_EXACT.has(h)) return { exact: true };
  // Fuzzy: one of the tokens IS the word «اسم»/«اسماء» (e.g. «اسم الطالب المسائي»).
  const tokens = h.split(' ');
  if (tokens.includes('اسم') || tokens.includes('اسماء')) return { exact: false };
  return false;
}

function isKnownHeader(cell) {
  const h = headerForm(cell);
  return h && (SERIAL_HEADER.has(h) || OTHER_HEADER.has(h) || NAME_HEADER_EXACT.has(h));
}

const HEADER_SCAN_LIMIT = 40;

// Scans the first rows for a header row containing a name-column label.
// Returns { headerIdx, nameCol, nameHeader, exact } or null.
function findHeaderRow(rows) {
  const limit = Math.min(rows.length, HEADER_SCAN_LIMIT);
  for (let i = 0; i < limit; i++) {
    const row = rows[i] || [];
    let nameHit = null;
    let knownHits = 0;
    for (let j = 0; j < row.length; j++) {
      const hit = isNameHeader(row[j]);
      if (hit && (!nameHit || (hit.exact && !nameHit.exact))) {
        nameHit = { col: j, exact: hit.exact };
      }
      if (isKnownHeader(row[j])) knownHits += 1;
    }
    if (nameHit) {
      return {
        headerIdx: i,
        nameCol: nameHit.col,
        nameHeader: cleanCell(row[nameHit.col]),
        exact: nameHit.exact,
        knownHits,
      };
    }
  }
  return null;
}

// Fallback when no header exists: the column whose non-empty values are most
// often multi-word Arabic names.
function inferNameColumn(rows) {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  let best = { col: 0, score: -1, filled: 0 };
  for (let j = 0; j < width; j++) {
    let filled = 0;
    let nameish = 0;
    for (const row of rows) {
      const v = cleanCell(row[j]);
      if (!v) continue;
      filled += 1;
      if (looksLikeName(v)) nameish += 1;
    }
    const score = filled === 0 ? 0 : nameish / filled;
    if (score > best.score || (score === best.score && filled > best.filled)) {
      best = { col: j, score, filled };
    }
  }
  return best;
}

// How roster-like is a sheet? Counts rows whose cells contain at least one
// plausible student name.
function sheetScore(rows) {
  let score = 0;
  for (const row of rows) {
    if (row.some((cell) => looksLikeName(cell))) score += 1;
  }
  return score;
}

// Picks the most roster-like sheet. Returns { index, score, reason } where the
// Arabic reason is only present when there was an actual choice to explain.
function chooseSheet(sheets) {
  if (sheets.length === 1) return { index: 0, score: sheetScore(sheets[0].rows), reason: null };
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < sheets.length; i++) {
    const s = sheetScore(sheets[i].rows);
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }
  const chosen = sheets[bestIdx];
  return {
    index: bestIdx,
    score: bestScore,
    reason: `تم اختيار الورقة «${chosen.name}» من بين ${sheets.length} أوراق لاحتوائها على أكبر عدد من الأسماء (${bestScore})`,
  };
}

// Full detection for one grid. `override` is a 0-based column index or undefined.
// Returns { headerIdx (grid index or -1), headerRowNumber (file row or null),
//           nameCol, nameHeader, confidence, reason }.
function detectStructure(rows, firstRowNumber, override) {
  const header = findHeaderRow(rows);
  const headerIdx = header ? header.headerIdx : -1;
  const headerRowNumber = header ? firstRowNumber + header.headerIdx : null;

  if (override !== undefined) {
    const nameHeader = header ? cleanCell((rows[header.headerIdx] || [])[override]) || null : null;
    return {
      headerIdx,
      headerRowNumber,
      nameCol: override,
      nameHeader,
      confidence: 'high',
      reason: 'تم تحديد عمود الأسماء يدوياً من قبل المستخدم',
    };
  }

  if (header) {
    return {
      headerIdx,
      headerRowNumber,
      nameCol: header.nameCol,
      nameHeader: header.nameHeader,
      confidence: header.exact ? 'high' : 'medium',
      reason: `تم العثور على صف العناوين في السطر ${headerRowNumber} والتعرف على عمود الأسماء من عنوانه «${header.nameHeader}»`,
    };
  }

  const inferred = inferNameColumn(rows);
  const confidence = inferred.score >= 0.6 ? 'medium' : 'low';
  return {
    headerIdx: -1,
    headerRowNumber: null,
    nameCol: inferred.col,
    nameHeader: null,
    confidence,
    reason: inferred.score > 0
      ? `لا يحتوي الملف صف عناوين؛ تم اختيار العمود رقم ${inferred.col + 1} لأن أغلب قيمه أسماء متعددة الكلمات — يرجى التأكد من صحة الاختيار`
      : 'لا يحتوي الملف صف عناوين ولم يتضح عمود الأسماء — يرجى تحديد العمود الصحيح يدوياً',
  };
}

module.exports = {
  detectStructure, chooseSheet, findHeaderRow, inferNameColumn, headerForm, sheetScore,
};
