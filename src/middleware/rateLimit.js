function createRateLimiter({ max = 10, windowMs = 60000 } = {}) {
  const hits = new Map();
  return function rateLimit(req, res, next) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    if (entry.count >= max) {
      return res.status(429).json({ error: 'محاولات كثيرة، حاول بعد دقيقة' });
    }
    res.locals.rateLimitHit = () => { entry.count++; };
    next();
  };
}
module.exports = { createRateLimiter };
