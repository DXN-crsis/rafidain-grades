const express = require('express');
const { requireAdmin } = require('../middleware/requireAdmin');

// Generic CRUD factory for the three catalog levels.
function crud(router, db, table, { parentCol, dupError, listSql }) {
  const base = `/${table}`;

  router.get(base, (req, res) => {
    let rows;
    if (parentCol && req.query[parentCol]) {
      rows = db.prepare(`SELECT * FROM ${table} WHERE ${parentCol} = ? ORDER BY name`)
        .all(req.query[parentCol]);
    } else {
      rows = db.prepare(listSql || `SELECT * FROM ${table} ORDER BY name`).all();
    }
    res.json(rows);
  });

  router.post(base, (req, res) => {
    const body = req.body || {};
    const name = (body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    if (parentCol && !body[parentCol]) {
      return res.status(400).json({ error: 'الحقل الأب مطلوب' });
    }
    try {
      const cols = parentCol ? `(name, ${parentCol})` : '(name)';
      const vals = parentCol ? [name, body[parentCol]] : [name];
      const placeholders = parentCol ? '(?, ?)' : '(?)';
      const info = db.prepare(`INSERT INTO ${table} ${cols} VALUES ${placeholders}`).run(...vals);
      res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid));
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: dupError });
      if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'العنصر الأب غير موجود' });
      throw e;
    }
  });

  router.put(`${base}/:id`, (req, res) => {
    const name = ((req.body || {}).name || '').trim();
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    try {
      const info = db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name, req.params.id);
      if (info.changes === 0) return res.status(404).json({ error: 'غير موجود' });
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: dupError });
      throw e;
    }
  });

  router.delete(`${base}/:id`, (req, res) => {
    const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'غير موجود' });
    res.json({ ok: true });
  });
}

// Departments are listed with stage/student counts for the dashboard cards.
const DEPARTMENTS_LIST_SQL = `
  SELECT d.id, d.name,
    (SELECT COUNT(*) FROM stages s WHERE s.department_id = d.id) AS stage_count,
    (SELECT COUNT(*) FROM students st
       JOIN sections sec ON st.section_id = sec.id
       JOIN stages s2 ON sec.stage_id = s2.id
     WHERE s2.department_id = d.id) AS student_count
  FROM departments d ORDER BY d.name
`;

function catalogRouter(db) {
  const router = express.Router();
  router.use(requireAdmin);
  crud(router, db, 'departments', {
    parentCol: null,
    dupError: 'القسم موجود مسبقاً',
    listSql: DEPARTMENTS_LIST_SQL,
  });
  crud(router, db, 'stages', { parentCol: 'department_id', dupError: 'المرحلة موجودة مسبقاً' });
  crud(router, db, 'sections', { parentCol: 'stage_id', dupError: 'الشعبة موجودة مسبقاً' });

  const MODES = ['full', 'final_only'];

  router.get('/subjects', (req, res) => {
    const rows = req.query.stage_id
      ? db.prepare('SELECT * FROM subjects WHERE stage_id = ? ORDER BY sort_order, id').all(req.query.stage_id)
      : db.prepare('SELECT * FROM subjects ORDER BY sort_order, id').all();
    res.json(rows);
  });

  router.post('/subjects', (req, res) => {
    const body = req.body || {};
    const name = (body.name || '').trim();
    const { stage_id } = body;
    const grade_mode = body.grade_mode || 'full';
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    if (!stage_id) return res.status(400).json({ error: 'المرحلة مطلوبة' });
    if (!MODES.includes(grade_mode)) return res.status(400).json({ error: 'نوع سجل الدرجات غير صالح' });
    try {
      const info = db.prepare(
        'INSERT INTO subjects (name, stage_id, grade_mode) VALUES (?, ?, ?)'
      ).run(name, stage_id, grade_mode);
      res.status(201).json(db.prepare('SELECT * FROM subjects WHERE id = ?').get(info.lastInsertRowid));
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'المادة موجودة مسبقاً' });
      if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'المرحلة غير موجودة' });
      throw e;
    }
  });

  router.put('/subjects/:id', (req, res) => {
    const body = req.body || {};
    const name = (body.name || '').trim();
    const grade_mode = body.grade_mode || 'full';
    const sort_order = Number.isInteger(body.sort_order) ? body.sort_order : 0;
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    if (!MODES.includes(grade_mode)) return res.status(400).json({ error: 'نوع سجل الدرجات غير صالح' });
    try {
      const info = db.prepare(
        'UPDATE subjects SET name = ?, grade_mode = ?, sort_order = ? WHERE id = ?'
      ).run(name, grade_mode, sort_order, req.params.id);
      if (info.changes === 0) return res.status(404).json({ error: 'غير موجود' });
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'المادة موجودة مسبقاً' });
      throw e;
    }
  });

  router.delete('/subjects/:id', (req, res) => {
    const info = db.prepare('DELETE FROM subjects WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'غير موجود' });
    res.json({ ok: true });
  });

  return router;
}
module.exports = { catalogRouter };
