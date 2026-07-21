// Short-lived, in-memory preview tokens.
//
// A token proves that THIS admin session ran a preview for THIS section
// recently. It is opaque, single-use, expires quickly, and the store is
// capacity-bounded. Restarting the server invalidates all tokens, which is
// fine — the teacher simply uploads again.

const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;

function createTokenStore({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
  const entries = new Map(); // token -> { sessionId, payload, expiresAt }

  function sweep(now) {
    for (const [token, e] of entries) {
      if (e.expiresAt <= now) entries.delete(token);
    }
  }

  // issue(sessionId, payload) -> token. `opts.now` is injectable for tests.
  function issue(sessionId, payload, opts = {}) {
    const now = (opts.now || Date.now)();
    sweep(Date.now());
    while (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value; // Map preserves insertion order
      entries.delete(oldest);
    }
    const token = crypto.randomBytes(24).toString('base64url');
    entries.set(token, { sessionId, payload, expiresAt: now + ttlMs });
    return token;
  }

  // Consumes the token ONLY when everything matches; a mismatched session or
  // section must not burn someone else's token. Expired entries are dropped.
  function take(token, sessionId, sectionId) {
    const now = Date.now();
    const e = entries.get(token);
    if (!e) return null;
    if (e.expiresAt <= now) { entries.delete(token); return null; }
    if (e.sessionId !== sessionId) return null;
    if (sectionId !== undefined && e.payload && e.payload.section_id !== sectionId) return null;
    entries.delete(token);
    return { payload: e.payload };
  }

  return { issue, take, get size() { return entries.size; } };
}

module.exports = { createTokenStore };
