const { Store } = require('express-session');
const Database = require('better-sqlite3');

const DAY_MS = 24 * 60 * 60 * 1000;

class SqliteSessionStore extends Store {
  constructor(options = {}) {
    super();
    if (!options.db && !options.dbPath) {
      throw new Error('SqliteSessionStore requires a `db` handle or a `dbPath`');
    }

    this.ttlMs = options.ttlMs || DAY_MS;
    this.ownsDb = !options.db;
    this.db = options.db || new Database(options.dbPath);
    if (this.ownsDb) {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('busy_timeout = 5000');
    }

    this.db.exec(
      'CREATE TABLE IF NOT EXISTS sessions (\n' +
      '  sid TEXT PRIMARY KEY,\n' +
      '  data TEXT NOT NULL,\n' +
      '  expires_at INTEGER NOT NULL\n' +
      ')'
    );
    this.stmts = {
      get: this.db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?'),
      set: this.db.prepare(
        'INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at'
      ),
      destroy: this.db.prepare('DELETE FROM sessions WHERE sid = ?'),
      touch: this.db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?'),
      prune: this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
      length: this.db.prepare('SELECT COUNT(*) AS c FROM sessions'),
      clear: this.db.prepare('DELETE FROM sessions'),
      all: this.db.prepare('SELECT data FROM sessions WHERE expires_at > ?'),
    };

    this.prune();
    this.pruneTimer = setInterval(() => {
      try { this.prune(); } catch {  }
    }, options.pruneIntervalMs || 15 * 60 * 1000);
    if (this.pruneTimer.unref) this.pruneTimer.unref();
  }

  expiryOf(session) {
    const expires = session && session.cookie && session.cookie.expires;
    const t = expires ? new Date(expires).getTime() : NaN;
    return Number.isFinite(t) ? t : Date.now() + this.ttlMs;
  }

  get(sid, callback) {
    let session;
    try {
      const row = this.stmts.get.get(sid);
      if (!row) {
        session = undefined;
      } else if (row.expires_at <= Date.now()) {
        this.stmts.destroy.run(sid);
        session = undefined;
      } else {
        session = JSON.parse(row.data);
      }
    } catch (err) {
      return setImmediate(callback, err);
    }
    setImmediate(callback, null, session);
  }

  set(sid, session, callback) {
    try {
      this.stmts.set.run(sid, JSON.stringify(session), this.expiryOf(session));
    } catch (err) {
      return setImmediate(callback, err);
    }
    setImmediate(callback, null);
  }

  destroy(sid, callback) {
    try {
      this.stmts.destroy.run(sid);
    } catch (err) {
      return setImmediate(callback, err);
    }
    setImmediate(callback, null);
  }

  touch(sid, session, callback) {
    try {
      this.stmts.touch.run(this.expiryOf(session), sid);
    } catch (err) {
      return setImmediate(callback, err);
    }
    setImmediate(callback, null);
  }

  length(callback) {
    let n;
    try {
      n = this.stmts.length.get().c;
    } catch (err) {
      return setImmediate(callback, err);
    }
    setImmediate(callback, null, n);
  }

  clear(callback) {
    try {
      this.stmts.clear.run();
    } catch (err) {
      return setImmediate(callback, err);
    }
    setImmediate(callback, null);
  }

  all(callback) {
    let sessions;
    try {
      sessions = this.stmts.all.all(Date.now()).map((row) => JSON.parse(row.data));
    } catch (err) {
      return setImmediate(callback, err);
    }
    setImmediate(callback, null, sessions);
  }

  prune() {
    return this.stmts.prune.run(Date.now()).changes;
  }

  close() {
    clearInterval(this.pruneTimer);
    if (this.ownsDb) this.db.close();
  }
}

module.exports = { SqliteSessionStore };
