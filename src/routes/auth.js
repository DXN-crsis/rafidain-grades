const express = require('express');
const bcrypt = require('bcryptjs');

function authRouter(db) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username || '');
    if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    req.session.adminId = admin.id;
    res.json({ ok: true });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  router.get('/me', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'غير مصرح' });
    const admin = db.prepare('SELECT username FROM admins WHERE id = ?').get(req.session.adminId);
    res.json({ username: admin.username });
  });

  return router;
}
module.exports = { authRouter };
