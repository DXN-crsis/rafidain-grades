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
      for (const f of FIELDS) {
        if (!validGrade(e[f])) {
          return res.status(400).json({ error: 'الدرجة يجب أن تكون بين 0 و 100' });
        }
      }
    }
    const upsert = db.prepare(`
      INSERT INTO grades (student_id, subject_id, first_term_avg, midyear, second_term_avg, annual_effort, final_exam, final_grade)
      VALUES (@student_id, @subject_id, @first_term_avg, @midyear, @second_term_avg, @annual_effort, @final_exam, @final_grade)
      ON CONFLICT(student_id, subject_id) DO UPDATE SET
        first_term_avg=excluded.first_term_avg, midyear=excluded.midyear,
        second_term_avg=excluded.second_term_avg, annual_effort=excluded.annual_effort,
        final_exam=excluded.final_exam, final_grade=excluded.final_grade
    `);
    const saveAll = db.transaction((rows) => {
      for (const e of rows) {
        upsert.run({
          student_id: e.student_id, subject_id,
          first_term_avg: e.first_term_avg ?? null, midyear: e.midyear ?? null,
          second_term_avg: e.second_term_avg ?? null, annual_effort: e.annual_effort ?? null,
          final_exam: e.final_exam ?? null, final_grade: e.final_grade ?? null,
        });
      }
    });
    saveAll(entries);
    res.json({ saved: entries.length });
  });

  return router;
}
module.exports = { gradesRouter };
