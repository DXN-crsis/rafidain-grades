const express = require('express');
const { requireAdmin } = require('../middleware/requireAdmin');

// Generic CRUD factory for the three catalog levels.
function crud(router, db, table, { parentCol, dupError }) {
  const base = `/${table}`;

  router.get(base, (req, res) => {
    let rows;
    if (parentCol && req.query[parentCol]) {
      rows = db.prepare(`SELECT * FROM ${table} WHERE ${parentCol} = ? ORDER BY name`)
        .all(req.query[parentCol]);
    } else {
      rows = db.prepare(`SELECT * FROM ${table} ORDER BY name`).all();
    }
    res.json(rows);
  });

  router.post(base, (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    if (parentCol && !req.body[parentCol]) {
      return res.status(400).json({ error: 'الحقل الأب مطلوب' });
    }
    try {
      const cols = parentCol ? `(name, ${parentCol})` : '(name)';
      const vals = parentCol ? [name, req.body[parentCol]] : [name];
      const placeholders = parentCol ? '(?, ?)' : '(?)';
      const info = db.prepare(`INSERT INTO ${table} ${cols} VALUES ${placeholders}`).run(...vals);
      res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid));
    } catch (e) {
      if (String(e).includes('UNIQUE')) return res.status(409).json({ error: dupError });
      if (String(e).includes('FOREIGN KEY')) return res.status(400).json({ error: 'العنصر الأب غير موجود' });
      throw e;
    }
  });

  router.put(`${base}/:id`, (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    try {
      const info = db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name, req.params.id);
      if (info.changes === 0) return res.status(404).json({ error: 'غير موجود' });
      res.json({ ok: true });
    } catch (e) {
      if (String(e).includes('UNIQUE')) return res.status(409).json({ error: dupError });
      throw e;
    }
  });

  router.delete(`${base}/:id`, (req, res) => {
    const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'غير موجود' });
    res.json({ ok: true });
  });
}

function catalogRouter(db) {
  const router = express.Router();
  router.use(requireAdmin);
  crud(router, db, 'departments', { parentCol: null, dupError: 'القسم موجود مسبقاً' });
  crud(router, db, 'stages', { parentCol: 'department_id', dupError: 'المرحلة موجودة مسبقاً' });
  crud(router, db, 'sections', { parentCol: 'stage_id', dupError: 'الشعبة موجودة مسبقاً' });

  // Enrich department list with counts for the dashboard cards.
  router.get('/departments-summary', (req, res) => {
    res.json(db.prepare(`
      SELECT d.id, d.name,
        (SELECT COUNT(*) FROM stages s WHERE s.department_id = d.id) AS stage_count,
        (SELECT COUNT(*) FROM students st
           JOIN sections sec ON st.section_id = sec.id
           JOIN stages s2 ON sec.stage_id = s2.id
         WHERE s2.department_id = d.id) AS student_count
      FROM departments d ORDER BY d.name
    `).all());
  });

  return router;
}
module.exports = { catalogRouter };
