const express = require('express');
const { createRateLimiter } = require('../middleware/rateLimit');

function studentLookupRouter(db) {
  const router = express.Router();

  router.post('/lookup', createRateLimiter({ max: 10, windowMs: 60000 }), (req, res) => {
    const examNumber = String((req.body || {}).exam_number || '').trim();
    const student = db.prepare(`
      SELECT s.id, s.name, sec.name AS section, st.name AS stage, st.id AS stage_id, d.name AS department
      FROM students s
      JOIN sections sec ON s.section_id = sec.id
      JOIN stages st ON sec.stage_id = st.id
      JOIN departments d ON st.department_id = d.id
      WHERE s.exam_number = ?
    `).get(examNumber);

    if (!student) {
      res.locals.rateLimitHit();
      return res.status(404).json({ error: 'الرقم الامتحاني غير صحيح' });
    }

    const subjects = db.prepare(`
      SELECT sub.id, sub.name, sub.grade_mode,
             g.first_term_avg, g.midyear, g.second_term_avg,
             g.annual_effort, g.final_exam, g.final_grade
      FROM subjects sub
      LEFT JOIN grades g ON g.subject_id = sub.id AND g.student_id = ?
      WHERE sub.stage_id = ?
      ORDER BY sub.sort_order, sub.id
    `).all(student.id, student.stage_id);

    res.json({
      name: student.name,
      department: student.department,
      stage: student.stage,
      section: student.section,
      subjects,
    });
  });

  return router;
}
module.exports = { studentLookupRouter };
