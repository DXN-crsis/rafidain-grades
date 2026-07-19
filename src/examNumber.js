const crypto = require('node:crypto');

// Generates a unique, unguessable 8-digit exam number.
function generateExamNumber(db) {
  const exists = db.prepare('SELECT 1 FROM students WHERE exam_number = ?');
  for (let attempts = 0; attempts < 50; attempts++) {
    const n = String(crypto.randomInt(10000000, 100000000));
    if (!exists.get(n)) return n;
  }
  throw new Error('تعذر توليد رقم امتحاني فريد');
}

module.exports = { generateExamNumber };
