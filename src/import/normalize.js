// Text normalization for messy Arabic school files.
//
// Two distinct levels, never confused with each other:
//   cleanCell()           what gets STORED — the teacher's original text, freed
//                         only of invisible characters and whitespace chaos.
//                         Letters are never rewritten here.
//   normalizeForCompare() what gets COMPARED — aggressive orthographic
//                         unification (أ/إ/آ→ا, ة→ه, ى→ي, tashkeel stripped,
//                         digits unified) used only for duplicate detection and
//                         header matching. Never stored.
//
// All character classes are written as \u escapes on purpose: several of these
// characters are invisible, and source code you cannot read is source code you
// cannot review.

// Zero-width / directional / joiner characters that ride along in copied text:
// ZWSP ZWNJ ZWJ LRM RLM (200B-200F), directional embeddings (202A-202E),
// word joiner (2060), BOM (FEFF), Arabic letter mark (061C), soft hyphen (00AD),
// Mongolian vowel separator (180E).
const INVISIBLE_RE = new RegExp('[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF\\u061C\\u00AD\\u180E]', 'g');

// Space-like characters other than plain space: tab, NBSP (00A0), ogham space
// (1680), en..hair spaces (2000-200A), line/para separators (2028-2029),
// narrow NBSP (202F), math space (205F), ideographic space (3000).
const SPACE_RE = new RegExp('[\t\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]', 'g');

// Arabic diacritics: Quranic marks (0610-061A), tashkeel (064B-065F),
// superscript alef (0670), Quranic annotation signs (06D6-06DC, 06DF-06E4,
// 06E7-06E8, 06EA-06ED), and tatweel (0640) — elongation, not a letter.
const TASHKEEL_RE = new RegExp('[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0640]', 'g');

// Any character from the Arabic blocks (incl. presentation of digits, marks).
const ARABIC_RE = new RegExp('[\\u0600-\\u06FF\\u0750-\\u077F]');
// Arabic letters proper (0621-064A) plus extended letters (0671-06D3, 0750-077F).
const ARABIC_LETTER_RE = new RegExp('[\\u0621-\\u064A\\u0671-\\u06D3\\u0750-\\u077F]');

// Arabic-Indic (0660-0669) and Extended/Persian (06F0-06F9) digits to ASCII.
function normalizeDigits(s) {
  return String(s)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

// Storage-grade cleanup: invisible characters out, whitespace unified and
// collapsed, edges trimmed. Letters, digits and diacritics stay untouched.
function cleanCell(value) {
  return String(value ?? '')
    .replace(INVISIBLE_RE, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(SPACE_RE, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// Comparison-grade normalization (duplicate detection, header matching).
function normalizeForCompare(value) {
  return normalizeDigits(cleanCell(value))
    .replace(TASHKEEL_RE, '')
    .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ → ا
    .replace(/ة/g, 'ه')                     // ة → ه
    .replace(/ى/g, 'ي')                     // ى → ي
    .toLowerCase()
    .replace(/ {2,}/g, ' ')
    .trim();
}

// Removes a leading serial number fused into a text cell: «١. علي», «12- علي»,
// «3) علي». Requires a separator or whitespace after the digits and something
// real left over — structure removal, never name rewriting.
function stripLeadingSerial(s) {
  return String(s)
    .replace(/^\s*[0-9٠-٩۰-۹]{1,4}\s*(?:[-.,)»:،؛/\\–—]+\s*|\s+)/, '')
    .trim();
}

// True when the cell holds only digits / serial punctuation — a serial, a date
// or a phone fragment, but certainly not a person.
function isDigitsOnly(s) {
  const bare = normalizeDigits(String(s)).replace(/[\s\-.,()«»:،؛/\\–—]+/g, '');
  return bare.length > 0 && /^[0-9]+$/.test(bare);
}

// Vocabulary that marks a cell as document furniture rather than a student:
// school-header words, table captions, counters, signature lines. Stored in
// COMPARISON form (post-normalizeForCompare). Matched token-exact only, never
// as substrings, so real names (قاسم، صفاء، عامر، درجال…) can never collide.
const JUNK_TOKENS = new Set([
  'كشف', 'اعداديه', 'ثانويه', 'متوسطه', 'ابتدائيه', 'مدرسه', 'وزاره',
  'تربيه', 'مديريه', 'بسم', 'دراسي', 'توقيع', 'ختم', 'مدير', 'مديره',
  'مدرس', 'ماده', 'عدد', 'مجموع', 'ملاحظه', 'ملاحظات', 'تاريخ', 'صف',
  'شعبه', 'مرحله', 'قسم', 'فرع', 'درجات', 'امتحان', 'امتحانيه', 'جدول',
  'قائمه', 'لجنه', 'اشراف', 'مشرف', 'مشرفه', 'اداره', 'تعليمات',
]);

// «الاسم» and «اسم» are the same word for matching purposes.
function stripAl(token) {
  return token.length > 3 && token.startsWith('ال') ? token.slice(2) : token;
}

// Bare form of a token: punctuation trimmed from both edges («التاريخ:» → «تاريخ»).
function bareToken(token) {
  return stripAl(token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
}

// Token-exact junk detection on the comparison form of a cell.
function isJunkText(s) {
  const norm = normalizeForCompare(s);
  if (!norm) return false;
  return norm.split(' ').some((tok) => JUNK_TOKENS.has(bareToken(tok)));
}

// Does this cell plausibly hold a person's full name? Used for headerless
// name-column inference and for roster-sheet selection.
function looksLikeName(s) {
  let t = cleanCell(s);
  if (!t) return false;
  t = stripLeadingSerial(t) || t;
  if (t.length < 4 || t.length > 80) return false;
  if (/[0-9٠-٩۰-۹]/.test(t)) return false;
  if (isJunkText(t)) return false;
  const words = t.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 8) return false;
  const arabicWords = words.filter((w) => ARABIC_LETTER_RE.test(w));
  const latinWords = words.filter((w) => /^[A-Za-z'.-]+$/.test(w));
  return arabicWords.length === words.length || latinWords.length === words.length;
}

function hasArabic(s) {
  return ARABIC_RE.test(String(s));
}

module.exports = {
  cleanCell,
  normalizeForCompare,
  normalizeDigits,
  stripLeadingSerial,
  isDigitsOnly,
  isJunkText,
  looksLikeName,
  hasArabic,
  stripAl,
  bareToken,
};
