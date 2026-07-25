const { generateExamNumber } = require('../examNumber');
const { cleanCell, normalizeForCompare } = require('./normalize');

const MAX_NAME_LENGTH = 100;

function commitNames(db, sectionId, names, { generate = generateExamNumber } = {}) {
  const existing = new Set(
    db.prepare('SELECT name FROM students WHERE section_id = ?').all(sectionId)
      .map((s) => normalizeForCompare(s.name))
  );

  const accepted = [];
  const rejected = [];
  const seen = new Set();

  for (const raw of names) {
    const name = cleanCell(raw);
    if (!name) {
      rejected.push({ name: String(raw ?? ''), reason: 'اسم فارغ' });
      continue;
    }
    if (name.length > MAX_NAME_LENGTH) {
      rejected.push({ name, reason: 'الاسم أطول من المسموح' });
      continue;
    }
    const compare = normalizeForCompare(name);
    if (seen.has(compare)) {
      rejected.push({ name, reason: 'مكرر في القائمة المرسلة' });
      continue;
    }
    if (existing.has(compare)) {
      rejected.push({ name, reason: 'مسجل مسبقاً في هذه الشعبة' });
      continue;
    }
    seen.add(compare);
    accepted.push(name);
  }

  const insert = db.prepare('INSERT INTO students (name, exam_number, section_id) VALUES (?, ?, ?)');
  const runAll = db.transaction((list) => list.map((name) => {
    const examNumber = generate(db);
    const info = insert.run(name, examNumber, sectionId);
    return { id: info.lastInsertRowid, name, exam_number: examNumber };
  }));

  const students = accepted.length > 0 ? runAll(accepted) : [];
  return { imported: students.length, students, rejected };
}

module.exports = { commitNames };
