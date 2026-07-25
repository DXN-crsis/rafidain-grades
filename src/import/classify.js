const {
  cleanCell, normalizeForCompare, stripLeadingSerial, isDigitsOnly,
  isJunkText, hasArabic,
} = require('./normalize');

const MAX_NAME_LENGTH = 80;

function rowIsEmpty(row) {
  return row.every((cell) => cleanCell(cell) === '');
}

function classifyRows({ rows, firstRowNumber, headerIdx, nameCol, dbNames }) {
  const report = [];
  const summary = {
    total: rows.length, valid: 0, duplicate_in_file: 0, duplicate_in_db: 0, skipped: 0, invalid: 0,
  };
  const seen = new Map();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const rowNumber = firstRowNumber + i;
    const push = (status, name, reason) => {
      summary[status] += 1;
      report.push({ row_number: rowNumber, name, status, reason: reason || null });
    };

    if (headerIdx >= 0 && i < headerIdx) {
      push('skipped', cleanCell(row.join(' ')), rowIsEmpty(row)
        ? 'سطر فارغ'
        : 'سطر يسبق صف العناوين — ليس من بيانات الطلبة');
      continue;
    }
    if (i === headerIdx) {
      push('skipped', cleanCell(row.join(' ')), 'صف العناوين');
      continue;
    }
    if (rowIsEmpty(row)) {
      push('skipped', '', 'سطر فارغ');
      continue;
    }

    const cell = cleanCell(row[nameCol]);
    if (!cell) {
      push('skipped', cleanCell(row.join(' ')), 'لا يوجد اسم في عمود الأسماء لهذا السطر');
      continue;
    }
    if (isDigitsOnly(cell)) {
      push('skipped', cell, 'السطر يحتوي رقماً فقط وليس اسماً');
      continue;
    }

    const name = stripLeadingSerial(cell) || cell;

    if (isJunkText(name)) {
      push('skipped', cell, 'سطر عنوان أو توقيع أو إحصاء — ليس اسم طالب');
      continue;
    }

    const words = name.split(' ').filter(Boolean);
    if (words.length < 2) {
      push('invalid', name, 'الاسم غير مكتمل — كلمة واحدة فقط');
      continue;
    }
    if (name.length > MAX_NAME_LENGTH) {
      push('invalid', name, 'النص أطول من أن يكون اسم طالب');
      continue;
    }
    if (/[0-9٠-٩۰-۹]/.test(name)) {
      push('invalid', name, 'الاسم يحتوي أرقاماً — تأكد من محتوى الخلية');
      continue;
    }
    if (!hasArabic(name) && !/[A-Za-z]/.test(name)) {
      push('invalid', name, 'محتوى الخلية غير مقروء كاسم');
      continue;
    }

    const compare = normalizeForCompare(name);
    if (seen.has(compare)) {
      push('duplicate_in_file', name, `مكرر في الملف — ورد أولاً في السطر ${seen.get(compare)}`);
      continue;
    }
    if (dbNames.has(compare)) {
      seen.set(compare, rowNumber);
      push('duplicate_in_db', name, 'مسجل مسبقاً في هذه الشعبة');
      continue;
    }
    seen.set(compare, rowNumber);
    push('valid', name, null);
  }

  return { rows: report, summary };
}

module.exports = { classifyRows };
