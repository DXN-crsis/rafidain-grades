const express = require('express');
const bcrypt = require('bcryptjs');
const { createRateLimiter } = require('../middleware/rateLimit');
const { requireAdmin } = require('../middleware/requireAdmin');

function authRouter(db) {
  const router = express.Router();

  router.post('/login', createRateLimiter({ max: 10, windowMs: 900000 }), (req, res) => {
    const { username, password } = req.body || {};
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username || '');
    if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
      res.locals.rateLimitHit();
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'حدث خطأ في الخادم' });
      req.session.adminId = admin.id;
      res.json({ ok: true });
    });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  router.get('/me', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'غير مصرح' });
    const admin = db.prepare('SELECT username FROM admins WHERE id = ?').get(req.session.adminId);
    res.json({ username: admin.username });
  });

  router.post('/password', requireAdmin, (req, res) => {
    const { current_password, new_password } = req.body || {};
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
    if (!admin || !bcrypt.compareSync(current_password || '', admin.password_hash)) {
      return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }
    if (!new_password || String(new_password).length < 8) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' });
    }
    const hash = bcrypt.hashSync(String(new_password), 10);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);
    res.json({ ok: true });
  });

  return router;
}
module.exports = { authRouter };
