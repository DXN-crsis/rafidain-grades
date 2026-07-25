const INVISIBLE_RE = new RegExp('[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF\\u061C\\u00AD\\u180E]', 'g');

const SPACE_RE = new RegExp('[\t\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]', 'g');

const TASHKEEL_RE = new RegExp('[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0640]', 'g');

const ARABIC_RE = new RegExp('[\\u0600-\\u06FF\\u0750-\\u077F]');

const ARABIC_LETTER_RE = new RegExp('[\\u0621-\\u064A\\u0671-\\u06D3\\u0750-\\u077F]');

function normalizeDigits(s) {
  return String(s)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

function cleanCell(value) {
  return String(value ?? '')
    .replace(INVISIBLE_RE, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(SPACE_RE, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function normalizeForCompare(value) {
  return normalizeDigits(cleanCell(value))
    .replace(TASHKEEL_RE, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/ {2,}/g, ' ')
    .trim();
}

function stripLeadingSerial(s) {
  return String(s)
    .replace(/^\s*[0-9٠-٩۰-۹]{1,4}\s*(?:[-.,)»:،؛/\\–—]+\s*|\s+)/, '')
    .trim();
}

function isDigitsOnly(s) {
  const bare = normalizeDigits(String(s)).replace(/[\s\-.,()«»:،؛/\\–—]+/g, '');
  return bare.length > 0 && /^[0-9]+$/.test(bare);
}

const JUNK_TOKENS = new Set([
  'كشف', 'اعداديه', 'ثانويه', 'متوسطه', 'ابتدائيه', 'مدرسه', 'وزاره',
  'تربيه', 'مديريه', 'بسم', 'دراسي', 'توقيع', 'ختم', 'مدير', 'مديره',
  'مدرس', 'ماده', 'عدد', 'مجموع', 'ملاحظه', 'ملاحظات', 'تاريخ', 'صف',
  'شعبه', 'مرحله', 'قسم', 'فرع', 'درجات', 'امتحان', 'امتحانيه', 'جدول',
  'قائمه', 'لجنه', 'اشراف', 'مشرف', 'مشرفه', 'اداره', 'تعليمات',
]);

function stripAl(token) {
  return token.length > 3 && token.startsWith('ال') ? token.slice(2) : token;
}

function bareToken(token) {
  return stripAl(token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
}

function isJunkText(s) {
  const norm = normalizeForCompare(s);
  if (!norm) return false;
  return norm.split(' ').some((tok) => JUNK_TOKENS.has(bareToken(tok)));
}

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
