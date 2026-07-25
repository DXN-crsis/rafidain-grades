const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;

function createTokenStore({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
  const entries = new Map();

  function sweep(now) {
    for (const [token, e] of entries) {
      if (e.expiresAt <= now) entries.delete(token);
    }
  }

  function issue(sessionId, payload, opts = {}) {
    const now = (opts.now || Date.now)();
    sweep(Date.now());
    while (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
    }
    const token = crypto.randomBytes(24).toString('base64url');
    entries.set(token, { sessionId, payload, expiresAt: now + ttlMs });
    return token;
  }

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
