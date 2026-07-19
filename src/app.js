const express = require('express');
const session = require('express-session');
const path = require('node:path');
const crypto = require('node:crypto');

function createApp({ dbPath }) {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
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

  return app;
}

module.exports = { createApp };
