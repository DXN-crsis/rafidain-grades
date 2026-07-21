const express = require('express');
const session = require('express-session');
const path = require('node:path');
const crypto = require('node:crypto');

function createApp({ dbPath }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Routes are mounted here by later tasks.
  const { createDb } = require('./db');
  app.locals.db = createDb(dbPath);

  const { authRouter } = require('./routes/auth');
  app.use('/api/admin', authRouter(app.locals.db));

  const { catalogRouter } = require('./routes/catalog');
  app.use('/api/admin', catalogRouter(app.locals.db));

  const { studentsRouter } = require('./routes/students');
  app.use('/api/admin', studentsRouter(app.locals.db));

  const { gradesRouter } = require('./routes/grades');
  app.use('/api/admin', gradesRouter(app.locals.db));

  const { importRouter } = require('./routes/import');
  app.use('/api/admin', importRouter(app.locals.db));

  const { studentLookupRouter } = require('./routes/student');
  app.use('/api/student', studentLookupRouter(app.locals.db));

  // JSON 404 fallback for unmatched API routes (must not affect static/HTML serving).
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'المسار غير موجود' });
  });

  // Terminal error handler: never leak stack traces / HTML error pages to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status && err.status < 500 ? err.status : 500;
    res.status(status).json({ error: status === 400 ? 'بيانات غير صالحة' : 'حدث خطأ في الخادم' });
  });

  return app;
}

module.exports = { createApp };
