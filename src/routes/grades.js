const express = require('express');
const { requireAdmin } = require('../middleware/requireAdmin');

const FIELDS = ['first_term_avg', 'midyear', 'second_term_avg', 'annual_effort', 'final_exam', 'final_grade'];

function validGrade(v) {
  return v === null || v === undefined || (typeof v === 'number' && v >= 0 && v <= 100);
}

function gradesRouter(db) {
  const router = express.Router();
  router.use(requireAdmin);

  router.get('/grades', (req, res) => {
    const { section_id, subject_id } = req.query;
    if (!section_id || !subject_id) {
      return res.status(400).json({ error: 'الشعبة والمادة مطلوبتان' });
    }
    const rows = db.prepare(`
      SELECT s.id AS student_id, s.name AS student_name, s.exam_number,
             g.first_term_avg, g.midyear, g.second_term_avg,
             g.annual_effort, g.final_exam, g.final_grade
      FROM students s
      LEFT JOIN grades g ON g.student_id = s.id AND g.subject_id = ?
      WHERE s.section_id = ?
      ORDER BY s.name
    `).all(subject_id, section_id);
    res.json(rows);
  });

  router.put('/grades', (req, res) => {
    const { subject_id, entries } = req.body || {};
    if (!subject_id || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'بيانات غير صالحة' });
    }
    for (const e of entries) {
      if (!e || typeof e !== 'object') {
        return res.status(400).json({ error: 'بيانات غير صالحة' });
      }
      for (const f of FIELDS) {
        if (!validGrade(e[f])) {
          return res.status(400).json({ error: 'الدرجة يجب أن تكون بين 0 و 100' });
        }
      }
    }

    // Validate the subject's stage matches every graded student's stage BEFORE writing,
    // so a mismatch never results in a partial write and never silently vanishes.
    const subject = db.prepare('SELECT id, stage_id FROM subjects WHERE id = ?').get(subject_id);
    if (!subject) {
      return res.status(404).json({ error: 'المادة غير موجودة' });
    }
    for (const e of entries) {
      const student = db.prepare(`
        SELECT sec.stage_id AS stage_id
        FROM students s JOIN sections sec ON s.section_id = sec.id
        WHERE s.id = ?
      `).get(e.student_id);
      if (!student) {
        return res.status(400).json({ error: 'الطالب غير موجود' });
      }
      if (student.stage_id !== subject.stage_id) {
        return res.status(400).json({ error: 'المادة لا تنتمي إلى مرحلة الطالب' });
      }
    }

    const setClauses = FIELDS.map(
      (f) => `${f} = CASE WHEN @has_${f} = 1 THEN @${f} ELSE grades.${f} END`
    ).join(', ');
    const upsert = db.prepare(`
      INSERT INTO grades (student_id, subject_id, first_term_avg, midyear, second_term_avg, annual_effort, final_exam, final_grade)
      VALUES (@student_id, @subject_id, @first_term_avg, @midyear, @second_term_avg, @annual_effort, @final_exam, @final_grade)
      ON CONFLICT(student_id, subject_id) DO UPDATE SET
        ${setClauses}
    `);
    const saveAll = db.transaction((rows) => {
      for (const e of rows) {
        const params = { student_id: e.student_id, subject_id };
        for (const f of FIELDS) {
          const has = Object.prototype.hasOwnProperty.call(e, f);
          params[`has_${f}`] = has ? 1 : 0;
          params[f] = has ? e[f] ?? null : null;
        }
        upsert.run(params);
      }
    });
    try {
      saveAll(entries);
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return res.status(400).json({ error: 'الطالب غير موجود' });
      }
      throw e;
    }
    res.json({ saved: entries.length });
  });

  return router;
}
module.exports = { gradesRouter };
