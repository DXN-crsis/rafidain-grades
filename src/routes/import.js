// Two-phase smart student import:
//   POST /api/admin/import/preview  multipart(file, section_id[, name_column])
//   POST /api/admin/import/commit   json{ token, section_id, names[] }
//
// Preview parses and reports; it writes nothing. Commit re-validates everything
// server-side and imports transactionally. Both sit behind requireAdmin like
// every other admin route, and every error the client can cause is Arabic JSON.

const express = require('express');
const multer = require('multer');
const { requireAdmin } = require('../middleware/requireAdmin');
const { buildPreview, ImportError } = require('../import/engine');
const { createTokenStore } = require('../import/tokens');
const { commitNames } = require('../import/commitNames');

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_COMMIT_NAMES = 2000;
const ERR_TOKEN = 'انتهت صلاحية المعاينة أو أنها غير صالحة — أعد رفع الملف';

function importRouter(db) {
  const router = express.Router();
  const tokens = createTokenStore();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 10, parts: 12 },
  });

  router.use(requireAdmin);

  const receiveFile = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? 'حجم الملف يتجاوز الحد المسموح (5 ميغابايت)'
          : 'تعذر استلام الملف — تحقق من الملف وأعد المحاولة';
        return res.status(400).json({ error: message });
      }
      next();
    });
  };

  router.post('/import/preview', receiveFile, (req, res) => {
    const body = req.body || {};
    const sectionId = Number(body.section_id);
    if (!Number.isInteger(sectionId) || sectionId <= 0) {
      return res.status(400).json({ error: 'الشعبة مطلوبة' });
    }
    if (!db.prepare('SELECT id FROM sections WHERE id = ?').get(sectionId)) {
      return res.status(400).json({ error: 'الشعبة غير موجودة' });
    }
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'الملف مطلوب — اختر ملف Excel أو Word أو CSV' });
    }

    let nameColumn;
    if (body.name_column !== undefined && body.name_column !== '') {
      nameColumn = Number(body.name_column);
      if (!Number.isInteger(nameColumn) || nameColumn < 0 || nameColumn > 63) {
        return res.status(400).json({ error: 'رقم العمود المحدد غير صالح' });
      }
    }

    try {
      const report = buildPreview({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        db,
        sectionId,
        nameColumn,
      });
      const token = tokens.issue(req.sessionID, { section_id: sectionId });
      res.json({ ...report, token });
    } catch (e) {
      if (e instanceof ImportError) return res.status(400).json({ error: e.message });
      throw e; // terminal error middleware answers in Arabic without a stack trace
    }
  });

  router.post('/import/commit', (req, res) => {
    const body = req.body || {};
    const sectionId = Number(body.section_id);
    if (!Number.isInteger(sectionId) || sectionId <= 0) {
      return res.status(400).json({ error: 'الشعبة مطلوبة' });
    }
    if (typeof body.token !== 'string' || body.token.length === 0) {
      return res.status(400).json({ error: ERR_TOKEN });
    }
    if (!Array.isArray(body.names) || body.names.length === 0) {
      return res.status(400).json({ error: 'قائمة الأسماء فارغة — لا يوجد ما يُستورد' });
    }
    if (body.names.length > MAX_COMMIT_NAMES) {
      return res.status(400).json({ error: `عدد الأسماء يتجاوز الحد المسموح (${MAX_COMMIT_NAMES})` });
    }
    if (!body.names.every((n) => typeof n === 'string')) {
      return res.status(400).json({ error: 'قائمة الأسماء غير صالحة' });
    }
    if (!db.prepare('SELECT id FROM sections WHERE id = ?').get(sectionId)) {
      return res.status(400).json({ error: 'الشعبة غير موجودة' });
    }
    if (!tokens.take(body.token, req.sessionID, sectionId)) {
      return res.status(400).json({ error: ERR_TOKEN });
    }

    const result = commitNames(db, sectionId, body.names);
    res.json(result);
  });

  return router;
}

module.exports = { importRouter };
