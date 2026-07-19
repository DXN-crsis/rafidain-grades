const express = require('express');
const { requireAdmin } = require('../middleware/requireAdmin');
const { generateExamNumber } = require('../examNumber');

function studentsRouter(db) {
  const router = express.Router();
  router.use(requireAdmin);

  router.get('/students', (req, res) => {
    const rows = req.query.section_id
      ? db.prepare('SELECT * FROM students WHERE section_id = ? ORDER BY name').all(req.query.section_id)
      : db.prepare('SELECT * FROM students ORDER BY name').all();
    res.json(rows);
  });

  router.post('/students', (req, res) => {
    const name = (req.body.name || '').trim();
    const { section_id } = req.body;
    if (!name) return res.status(400).json({ error: 'اسم الطالب مطلوب' });
    if (!section_id) return res.status(400).json({ error: 'الشعبة مطلوبة' });
    try {
      const exam_number = generateExamNumber(db);
      const info = db.prepare(
        'INSERT INTO students (name, exam_number, section_id) VALUES (?, ?, ?)'
      ).run(name, exam_number, section_id);
      res.status(201).json(db.prepare('SELECT * FROM students WHERE id = ?').get(info.lastInsertRowid));
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'الشعبة غير موجودة' });
      throw e;
    }
  });

  router.put('/students/:id', (req, res) => {
    const name = (req.body.name || '').trim();
    const { section_id } = req.body;
    if (!name) return res.status(400).json({ error: 'اسم الطالب مطلوب' });
    if (!section_id) return res.status(400).json({ error: 'الشعبة مطلوبة' });
    const info = db.prepare(
      'UPDATE students SET name = ?, section_id = ? WHERE id = ?'
    ).run(name, section_id, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'غير موجود' });
    res.json({ ok: true });
  });

  router.delete('/students/:id', (req, res) => {
    const info = db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'غير موجود' });
    res.json({ ok: true });
  });

  return router;
}
module.exports = { studentsRouter };
