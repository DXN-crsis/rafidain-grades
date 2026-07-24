const express = require('express');
const { requireAdmin } = require('../middleware/requireAdmin');
const calc = require('../grades/calc');
const resolve = require('../grades/resolve');

// FIELDS مصدرها الآن src/grades/calc.js — نفس المصفوفة بالضبط (الحقول
// الستة بترتيب عرضها)، حتى لا يوجد تعريفان لنفس القائمة قد ينحرفان.
const FIELDS = calc.FIELDS;

function validGrade(v) {
  return calc.isValidGrade(v);
}

function gradesRouter(db) {
  const router = express.Router();
  router.use(requireAdmin);

  router.get('/grades', (req, res) => {
    const { section_id, subject_id } = req.query;
    if (!section_id || !subject_id) {
      return res.status(400).json({ error: 'الشعبة والمادة مطلوبتان' });
    }
    const rows = db.prepare(`
      SELECT s.id AS student_id, s.name AS student_name, s.exam_number,
             g.first_term_avg, g.midyear, g.second_term_avg,
             g.annual_effort, g.final_exam, g.final_grade
      FROM students s
      LEFT JOIN grades g ON g.student_id = s.id AND g.subject_id = ?
      WHERE s.section_id = ?
      ORDER BY s.name
    `).all(subject_id, section_id);
    res.json(rows);
  });

  // جلب الطالب + مرحلة شعبته + صف درجاته الحالي لهذه المادة (إن وجد) في
  // استعلام واحد — يخدم فحص تطابق المرحلة (كان موجوداً) وحسم الحقول
  // المشتقة (جديد: نحتاج القيم المحفوظة سابقاً لدمجها مع ما لم يُرسَل الآن).
  const studentForGrading = db.prepare(`
    SELECT sec.stage_id AS stage_id,
           g.first_term_avg, g.midyear, g.second_term_avg,
           g.annual_effort, g.final_exam, g.final_grade
    FROM students s
    JOIN sections sec ON s.section_id = sec.id
    LEFT JOIN grades g ON g.student_id = s.id AND g.subject_id = ?
    WHERE s.id = ?
  `);

  router.put('/grades', (req, res) => {
    const { subject_id, entries } = req.body || {};
    if (!subject_id || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'بيانات غير صالحة' });
    }

    // ---- المرحلة ١: شكل كل عنصر، حدود كل درجة، وشكل manual_fields إن وُجد.
    // فحوصات بنيوية بحتة لا تحتاج قاعدة البيانات، تماماً كما كانت سابقاً،
    // مع إضافة فحص شكل manual_fields (M3: راية التجاوز اليدوي الصريحة). ----
    for (const e of entries) {
      if (!e || typeof e !== 'object') {
        return res.status(400).json({ error: 'بيانات غير صالحة' });
      }
      for (const f of FIELDS) {
        if (!validGrade(e[f])) {
          return res.status(400).json({ error: 'الدرجة يجب أن تكون بين 0 و 100' });
        }
      }
      const manualProblem = resolve.validateManualFields(e);
      if (manualProblem) {
        return res.status(400).json({ error: manualProblem.message });
      }
    }

    // ---- المرحلة ٢: المادة موجودة، ومرحلتها معروفة (تُستخدم أدناه لفحص
    // تطابق المرحلة ولتحديد نمط سجل الدرجات: كامل أم نهائية فقط). ----
    const subject = db.prepare('SELECT id, stage_id, grade_mode FROM subjects WHERE id = ?').get(subject_id);
    if (!subject) {
      return res.status(404).json({ error: 'المادة غير موجودة' });
    }

    // ---- المرحلة ٣: مادة «نهائية فقط» لا تقبل حقولاً تفصيلية إطلاقاً —
    // (M2: يجب معاملة هذه الحالة بتعمّد، لا تجاهلها أو قبولها بصمت). ----
    if (subject.grade_mode === 'final_only') {
      for (const e of entries) {
        const violation = resolve.findFinalOnlyViolation(e);
        if (violation) {
          return res.status(400).json({ error: violation.message });
        }
      }
    }

    // ---- المرحلة ٤: لكل عنصر — الطالب موجود، مادته تطابق مرحلته (فحوصات
    // قديمة دون تغيير)، ثم (لمادة السجل الكامل فقط) حسم الحقلين المشتقّين:
    // تصديق تجاوز يدوي صريح، أو إعادة حساب من المكوّنات الفعلية، أو رفض
    // الإرسال كله إن تناقضت قيمة مُرسلة غير يدوية مع حساب مكتمل. يتم هذا
    // بالكامل قبل أي كتابة — فشل عنصر واحد يمنع كتابة الجميع، تماماً كما كان
    // سلوك فحص المرحلة سابقاً؛ لا تناقض حسابي يُكتَب أبداً في القاعدة. ----
    const resolutions = new Array(entries.length);
    const storedRows = new Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const student = studentForGrading.get(subject_id, e.student_id);
      if (!student) {
        return res.status(400).json({ error: 'الطالب غير موجود' });
      }
      if (student.stage_id !== subject.stage_id) {
        return res.status(400).json({ error: 'المادة لا تنتمي إلى مرحلة الطالب' });
      }
      storedRows[i] = student;

      if (subject.grade_mode !== 'final_only') {
        const result = resolve.resolveFullModeEntry(e, student);
        if (!result.ok) {
          return res.status(400).json({ error: result.problem.message });
        }
        resolutions[i] = result;
      }
    }

    // ---- المرحلة ٥: بناء الصفوف النهائية للكتابة. آلية has_<field> في
    // SQL أدناه غير معدَّلة إطلاقاً؛ الجديد فقط أن الحقلين annual_effort
    // و final_grade في مادة السجل الكامل يُبنيان الآن من قرار resolve.js
    // (قيمة صريحة تُكتب، أو حذف المفتاح فيُحفَظ القديم) بدل المرور الحرفي
    // لما أرسله العميل. مادة «نهائية فقط» تمر دون أي تعديل كما كانت. ----
    const resolvedEntries = entries.map((e, i) => {
      if (subject.grade_mode === 'final_only') return e;
      const r = resolutions[i];
      const out = Object.assign({}, e);
      for (const field of calc.DERIVED_FIELDS) {
        const fieldResolution = r[field];
        if (fieldResolution.has) {
          out[field] = fieldResolution.value;
        } else {
          delete out[field];
        }
      }
      return out;
    });

    const setClauses = FIELDS.map(
      (f) => `${f} = CASE WHEN @has_${f} = 1 THEN @${f} ELSE grades.${f} END`
    ).join(', ');
    const upsert = db.prepare(`
      INSERT INTO grades (student_id, subject_id, first_term_avg, midyear, second_term_avg, annual_effort, final_exam, final_grade)
      VALUES (@student_id, @subject_id, @first_term_avg, @midyear, @second_term_avg, @annual_effort, @final_exam, @final_grade)
      ON CONFLICT(student_id, subject_id) DO UPDATE SET
        ${setClauses}
    `);
    const saveAll = db.transaction((rows) => {
      for (const e of rows) {
        const params = { student_id: e.student_id, subject_id };
        for (const f of FIELDS) {
          const has = Object.prototype.hasOwnProperty.call(e, f);
          params[`has_${f}`] = has ? 1 : 0;
          params[f] = has ? e[f] ?? null : null;
        }
        upsert.run(params);
      }
    });
    try {
      saveAll(resolvedEntries);
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return res.status(400).json({ error: 'الطالب غير موجود' });
      }
      throw e;
    }

    // ---- المرحلة ٦: الرد يحمل، إضافةً إلى العدد المحفوظ (كما كان، ليبقى
    // العميل القديم يعمل دون تعديل)، القيم الفعلية الموثوقة لكل طالب — كي
    // تعرض الواجهة رقم الخادم لا تخمينها الخاص، دون الحاجة لإعادة تحميل
    // الشبكة بعد كل حفظ (مفيد خصوصاً للحفظ التلقائي). إضافة اختيارية بحتة:
    // أي عميل لا يقرأ rows لا يتأثر إطلاقاً. ----
    const rows = entries.map((e, i) => {
      const stored = storedRows[i];
      if (subject.grade_mode === 'final_only') {
        return {
          student_id: e.student_id,
          first_term_avg: stored.first_term_avg,
          midyear: stored.midyear,
          second_term_avg: stored.second_term_avg,
          annual_effort: stored.annual_effort,
          final_exam: stored.final_exam,
          final_grade: Object.prototype.hasOwnProperty.call(e, 'final_grade') ? e.final_grade : stored.final_grade,
        };
      }
      const r = resolutions[i];
      return {
        student_id: e.student_id,
        first_term_avg: r.effectiveTerms.first_term_avg,
        midyear: r.effectiveTerms.midyear,
        second_term_avg: r.effectiveTerms.second_term_avg,
        annual_effort: r.annual_effort.effective,
        final_exam: r.effectiveFinalExam,
        final_grade: r.final_grade.effective,
      };
    });

    res.json({ saved: entries.length, rows });
  });

  return router;
}
module.exports = { gradesRouter };
