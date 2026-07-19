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
  app.locals.dbPath = dbPath;
  return app;
}

module.exports = { createApp };
