'use strict';

/*
 * src/grades/resolve.js
 * ======================
 * منطق حسم الحقول المشتقة عند الحفظ — خادمي بحت، لا يُحمَّل في المتصفح أبداً.
 *
 * يستخدم src/grades/calc.js للحساب الصرف فقط؛ عمل هذا الملف مختلف تماماً:
 * يقرر «ما الذي يُكتَب فعلياً في قاعدة البيانات» بالنظر إلى ثلاثة مصادر لكل
 * حقل مشتق (annual_effort أو final_grade):
 *   ١) هل صرّح المستخدم أن هذا الحقل تجاوز يدوي متعمَّد لهذا الإرسال تحديداً
 *      (عبر manual_fields في الحمولة)؟
 *   ٢) ما القيمة المُرسلة فعلياً في هذا الطلب، إن وُجدت؟
 *   ٣) ما القيمة المحسوبة آلياً من المكوّنات الفعلية (المُرسلة، أو المحفوظة
 *      سابقاً لو لم تُرسَل هذه المرة)؟
 *
 * -- آلية التجاوز اليدوي (القرار المعماري لهذا الملف) -----------------------
 * الخيار المُعتمَد: **راية صريحة على كل إرسال** (manual_fields: string[] في
 * كل عنصر من entries)، لا عمود دائم في قاعدة البيانات يُسجِّل «هذا الحقل
 * يدوي إلى الأبد». الأسباب:
 *   - لا هجرة مخاطرة على قاعدة بيانات حيّة: عمود دائم يعني ALTER TABLE على
 *     قاعدة فعلية تخدم مدرسة الآن؛ الراية على الحمولة لا تلمس المخطط إطلاقاً.
 *   - الواجهة (وكيل E) هي مصدر الحقيقة الطبيعي لـ «هل كتب المستخدم هذا
 *     الحقل بيده الآن؟» — تتابع ذلك في الجلسة الحالية بدقة (كل ضغطة مفتاح)
 *     لا يمكن لعمود قاعدة بيانات ماضٍ أن يعرفها.
 *   - **مهم للمُستدعي (وكيل E وأي عميل آخر):** لا ذاكرة للخادم بين الطلبات؛
 *     manual_fields يصف *هذا الإرسال فقط*. إن أراد العميل أن يبقى حقل ما
 *     مثبَّتاً يدوياً عبر حفظات لاحقة لا تلمسه، فعليه إعادة إرساله ضمن
 *     manual_fields في كل مرة يحفظ فيها ذلك الصف — تماماً كما يحتفظ العميل
 *     الحالي بـ data-manual="1" في الذاكرة طوال الجلسة حتى إعادة تحميل
 *     الشبكة. هذا موثَّق بوضوح في عقد الواجهة الختامي.
 *   - عند التحميل، القيمة غير الفارغة المحفوظة سابقاً تبقى أفضل تخمين
 *     لـ «هل هذا يدوي؟» (يطابق سلوك الواجهة الحالي: أي قيمة موجودة تُعامَل
 *     كيدوية حتى تُمسَح أو تُعاد إلى «تلقائي» صراحة) — وهذا قرار واجهة يخص
 *     وكيل E، لا هذا الملف.
 *
 * -- القاعدة الموحَّدة لكل حقل مشتق غير يدوي هذه المرة ----------------------
 * الحقل المشتق «يتزامن دائماً» مع مكوّناته الفعلية عند أي لمسة لصف الطالب،
 * سواء ذُكر مفتاحه في الحمولة أم لا — لأنه، ببساطة، ناتج معادلة لا قيمة
 * مستقلة. القيمة المُرسلة صراحة لحقل غير يدوي تُقارَن بالناتج المحسوب:
 *   - تطابق (أو تعذّر الحساب فلا يوجد ما يُناقَض) → تُقبل.
 *   - تناقض حقيقي (الحساب مكتمل وناتج مختلف) → **رفض** الإرسال كاملاً قبل
 *     أي كتابة، برسالة عربية تُسمّي الحقل والقيمتين المُرسلة والمتوقَّعة.
 * هذا هو «الرفض الحسابي» المطلوب: يحدث فقط حين يُصرِّح المُرسِل بقيمة تخالف
 * حساباً مكتملاً دون أن يُعلنها تجاوزاً يدوياً — أي بالضبط الحالة التي تصف
 * الخلل البنيوي الأصلي (تبويب قديم، استدعاء مباشر لا يعرف الصيغة الحالية).
 */

const calc = require('./calc');

// الحقول التفصيلية الخمسة التي لا معنى لها في مادة «نهائية فقط» — أي منها
// حاضر بقيمة غير فارغة في إرسال لمادة كهذه هو خطأ يجب رفضه صراحة (M2: «مادة
// نهائية فقط تحمل حقول تفصيلية يجب أن تُعامَل بتعمّد»).
const DETAIL_FIELDS = ['first_term_avg', 'midyear', 'second_term_avg', 'annual_effort', 'final_exam'];

function hasField(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * يتحقق من شكل manual_fields في عنصر واحد من entries.
 * يُرجع رسالة مشكلة (كائن) إن كان الشكل غير صالح، أو null إن كان سليماً
 * (بما فيها حالة عدم إرساله إطلاقاً — وهذا سليم، يعني «لا شيء يدوي»).
 */
function validateManualFields(entry) {
  if (!hasField(entry, 'manual_fields') || entry.manual_fields === undefined) return null;
  const mf = entry.manual_fields;
  const valid = Array.isArray(mf) && mf.every((f) => calc.DERIVED_FIELDS.indexOf(f) !== -1);
  if (!valid) {
    return {
      field: 'manual_fields',
      code: 'INVALID_MANUAL_FIELDS',
      message: 'قائمة الحقول اليدوية (manual_fields) يجب أن تكون مصفوفة تضم فقط: annual_effort أو final_grade.',
    };
  }
  return null;
}

/**
 * يفحص عنصر إرسال لمادة «نهائية فقط»: يجب ألا يحمل أي حقل تفصيلي بقيمة
 * غير فارغة. يُرجع رسالة مشكلة أو null.
 */
function findFinalOnlyViolation(entry) {
  const offending = DETAIL_FIELDS.filter((f) => hasField(entry, f) && entry[f] !== null && entry[f] !== undefined);
  if (offending.length === 0) return null;
  const labels = offending.map((f) => calc.FIELD_LABELS_AR[f]).join('، ');
  return {
    field: offending[0],
    code: 'FINAL_ONLY_DETAIL_FIELDS',
    message: 'هذه المادة من نوع «الدرجة النهائية فقط» ولا تقبل حقولاً تفصيلية. لا تُرسِل: ' + labels + '.',
  };
}

/**
 * يحسم قيمة حقل مشتق واحد (annual_effort أو final_grade) لعنصر واحد.
 *
 * @param {object} p
 * @param {string} p.field - اسم الحقل، للرسائل فقط.
 * @param {boolean} p.submittedPresent - هل مفتاح الحقل حاضر في الحمولة؟
 * @param {*} p.submitted - القيمة المُرسلة (ذات معنى فقط إن submittedPresent).
 * @param {number|null} p.storedValue - القيمة المحفوظة سابقاً (null إن لا شيء).
 * @param {number|null} p.canonical - الناتج المحسوب من المكوّنات الفعلية.
 * @param {boolean} p.isManual - هل هذا الحقل ضمن manual_fields لهذا الإرسال؟
 * @returns {{has:boolean, value:(number|null), effective:(number|null)}|{problem:object}}
 *   has       — هل يجب كتابة قيمة صريحة لهذا الحقل (مقابل الحفاظ على القديم)؟
 *   value     — القيمة المطلوب كتابتها إن has=true.
 *   effective — القيمة الفعلية لهذا الحقل بعد هذا القرار (سواء كُتبت أم
 *               حُفظت كما كانت) — تُستخدم كمكوِّن لحساب الحقل المشتق التالي
 *               (annual_effort يُغذّي final_grade).
 */
function resolveDerivedField(p) {
  const field = p.field;
  const label = calc.FIELD_LABELS_AR[field];

  if (p.isManual) {
    if (!p.submittedPresent) {
      // يدوي، ولم يُرسَل هذه المرة: يبقى كما كان — لا يُعاد حسابه ولا يُمحى.
      return { has: false, value: null, effective: p.storedValue };
    }
    // يدوي ومُرسَل: يُصدَّق حرفياً (الحدود ٠-١٠٠ فُحصت مسبقاً في مسار منفصل).
    return { has: true, value: p.submitted, effective: p.submitted };
  }

  if (p.submittedPresent && p.submitted !== null) {
    if (!calc.isPresent(p.submitted) || typeof p.submitted !== 'number' || Number.isNaN(p.submitted)) {
      // احتياط دفاعي: قيمة غير رقمية وصلت إلى هنا رغم فحص الحدود المسبق.
      return {
        problem: {
          field: field,
          code: 'INVALID_VALUE',
          message: 'قيمة ' + label + ' المُرسلة ليست رقماً صالحاً.',
        },
      };
    }
    if (p.canonical === null) {
      // لا ناتج نحاكم القيمة المُرسلة إليه (مكوّنات غائبة) — لا تناقض ممكناً،
      // فتُقبل كإدخال مباشر (مثال: طالب انتقالي بلا درجات فصلية سابقة).
      return { has: true, value: p.submitted, effective: p.submitted };
    }
    if (Math.abs(p.submitted - p.canonical) <= calc.CONSISTENCY_EPSILON) {
      return { has: true, value: p.canonical, effective: p.canonical };
    }
    return {
      problem: {
        field: field,
        code: 'MISMATCH',
        message: label + ' المُرسل (' + p.submitted + ') لا يطابق الناتج المحسوب من مكوّناته (' + p.canonical +
          '). إذا كانت هذه قيمة معدَّلة عمداً، أرسل الحقل ضمن manual_fields.',
        submitted: p.submitted,
        expected: p.canonical,
      },
    };
  }

  // الحقل غائب عن الحمولة أصلاً (لم يُذكر مفتاحه): لا يُمَس إطلاقاً — لا
  // يُعاد حسابه ولا يُمحى. هذا العقد القائم للواجهة منذ البداية («الحقول
  // المحذوفة تحافظ على قيمها المحفوظة»)، وكسره يعني أن تعديل درجة فصل واحد
  // يمحو صامتاً درجة نهائية وضعها المدرّس بنفسه — إتلاف لقيمة لم يطلب أحد
  // تغييرها. الحفظ الجزئي (حقل واحد) شائع في الحفظ التلقائي، فالخطر واقعي.
  if (!p.submittedPresent) {
    return { has: false, value: null, effective: p.storedValue };
  }

  // مُرسَل كـ null صراحة: طلب مباشر بمزامنة الحقل مع ناتج معادلته الحالي —
  // يملؤه إن اكتملت المكوّنات، ويمسحه إن نقصت. هذا مسار «احسبه لي».
  return { has: true, value: p.canonical, effective: p.canonical };
}

/**
 * يحسم كِلا الحقلين المشتقّين لعنصر إرسال واحد في مادة «سجل كامل».
 *
 * @param {object} entry - عنصر من entries كما وصل في جسم الطلب.
 * @param {object} stored - الصف المحفوظ سابقاً لنفس (الطالب، المادة)، بكل
 *   الحقول الستة (قد تكون كلها null إن لم يوجد صف من قبل).
 * @returns {{ok:true, annual_effort:object, final_grade:object}|{ok:false, problem:object}}
 */
function resolveFullModeEntry(entry, stored) {
  const manualList = Array.isArray(entry.manual_fields) ? entry.manual_fields : [];
  const manual = new Set(manualList);
  const s = stored || {};

  const effectiveTerms = {
    first_term_avg: hasField(entry, 'first_term_avg') ? entry.first_term_avg : (s.first_term_avg != null ? s.first_term_avg : null),
    midyear: hasField(entry, 'midyear') ? entry.midyear : (s.midyear != null ? s.midyear : null),
    second_term_avg: hasField(entry, 'second_term_avg') ? entry.second_term_avg : (s.second_term_avg != null ? s.second_term_avg : null),
  };
  const effortCanonical = calc.computeAnnualEffort(effectiveTerms).value;

  const effortResolution = resolveDerivedField({
    field: 'annual_effort',
    submittedPresent: hasField(entry, 'annual_effort'),
    submitted: entry.annual_effort,
    storedValue: s.annual_effort != null ? s.annual_effort : null,
    canonical: effortCanonical,
    isManual: manual.has('annual_effort'),
  });
  if (effortResolution.problem) return { ok: false, problem: effortResolution.problem };

  const effectiveFinalExam = hasField(entry, 'final_exam') ? entry.final_exam : (s.final_exam != null ? s.final_exam : null);
  const finalCanonical = calc.computeFinalGrade({
    annual_effort: effortResolution.effective,
    final_exam: effectiveFinalExam,
  }).value;

  const finalResolution = resolveDerivedField({
    field: 'final_grade',
    submittedPresent: hasField(entry, 'final_grade'),
    submitted: entry.final_grade,
    storedValue: s.final_grade != null ? s.final_grade : null,
    canonical: finalCanonical,
    isManual: manual.has('final_grade'),
  });
  if (finalResolution.problem) return { ok: false, problem: finalResolution.problem };

  return {
    ok: true,
    annual_effort: effortResolution,
    final_grade: finalResolution,
    effectiveTerms: effectiveTerms,
    effectiveFinalExam: effectiveFinalExam,
  };
}

module.exports = {
  DETAIL_FIELDS,
  hasField,
  validateManualFields,
  findFinalOnlyViolation,
  resolveDerivedField,
  resolveFullModeEntry,
};
