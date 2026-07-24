/*
 * وحدة حساب الدرجات — منصة درجات إعدادية الرافدين المهنية
 * =========================================================
 * src/grades/calc.js
 *
 * المصدر الوحيد للحقيقة الحسابية لدرجتي «معدل السعي السنوي» و«الدرجة النهائية».
 * وحدة نقية بلا أي اعتماديات (لا قاعدة بيانات، لا HTTP، لا DOM) كي يحمّلها الخادم
 * (Node، عبر require) والمتصفح (عبر وسم <script>) من نفس الملف تماماً — فلا يوجد
 * نسخ ثانٍ من المعادلة يمكن أن ينحرف عن الأصل. الخادم في src/routes/grades.js هو
 * من يقرر متى يثق بقيمة مُرسلة (تجاوز يدوي) ومتى يعيد الحساب — ذلك المنطق في
 * src/grades/resolve.js، وهو خادمي بحت. هذا الملف يقتصر على الحساب الصرف فقط.
 *
 * ---------------------------------------------------------------------------
 * القرارات الرياضية (كل قرار خلف ثابت أو دالة واحدة قابلة للتعديل من مكان واحد):
 * ---------------------------------------------------------------------------
 *
 * ١) قاعدة التقريب — roundHalfUp (نصف لأعلى):
 *    ٧٤٫٥ تُقرَّب إلى ٧٥، وليس ٧٤. هذا يطابق العرف المتّبع في الدراسة الإعدادية
 *    العراقية (تقريب نصف الدرجة لصالح الطالب)، ويطابق أيضاً سلوك Math.round
 *    الحالي في الواجهة القديمة (public/js/admin.js) — فالتغيير هنا ليس في
 *    القاعدة نفسها بل في متانتها: راجع القرار (٥) عن مشكلة الفاصلة العائمة
 *    التي تجعل Math.round وحده غير موثوق عند نقاط ٫٥ بالضبط.
 *
 * ٢) الدقة عند تركيب الدرجة النهائية من معدل السعي — FINAL_GRADE_USES_STORED_EFFORT:
 *    الدرجة النهائية = جولة(( معدل السعي المُقرَّب + الامتحان النهائي ) / ٢)،
 *    أي أنها تُبنى على معدل السعي بعد تقريبه، لا على متوسط الفصول الثلاثة الخام
 *    قبل التقريب. كان البديل (البناء على القيمة الخام) يقلّل خطأ التقريب
 *    المُركَّب نظرياً، لكنه مرفوض هنا لثلاثة أسباب:
 *      - معدل السعي درجة رسمية بذاتها تُعرض وتُحفَظ في عمودها الخاص، وليست
 *        قيمة وسيطة مؤقتة؛ الطبيعي تربوياً هو معاملتها كدرجة عمود مثل أي درجة
 *        عمود أخرى عند حساب المعدل التالي.
 *      - قابلية التدقيق اليدوي: إذا أعاد مدرّس أو لجنة تدقيق حساب الدرجة
 *        النهائية يدوياً من الرقمين المعروضين (معدل السعي، الامتحان النهائي)،
 *        يجب أن يحصل على نفس الرقم الذي يعرضه النظام تماماً. البناء على قيمة
 *        خفية غير معروضة يكسر هذا التطابق ويبدو كأنه خطأ في النظام.
 *      - التوافق مع البيانات القديمة: كل الصفوف المحفوظة سابقاً حُسبت بهذه
 *        الطريقة بالضبط (معدل مُقرَّب ثم امتحان)؛ تغيير القاعدة يعني أن نفس
 *        المدخلات تنتج نتيجة مختلفة عن الماضي دون أي داعٍ رياضي قاهر.
 *    القرار مُعزول في مكان واحد: computeFinalGrade تستقبل annual_effort كما هو
 *    مُمرَّر إليها (وهي دائماً القيمة المُقرَّرة/المعروضة عملياً في resolve.js) —
 *    لتبديل القرار مستقبلاً يكفي تمرير القيمة الخام بدل المُقرَّبة من المستدعي.
 *
 * ٣) المكوّن الغائب مقابل «لم يُدخَل بعد» — averageOrNull:
 *    لا يوجد في هذا النظام فرق بين «الدرجة غائبة لأن المادة لا تنطبق على هذا
 *    الطالب» و«لم تُدخَل بعد» — كلاهما يمثَّلان بـ null، ولا يوجد عمود أو راية
 *    ثالثة لتمييزهما. القرار: أي حقل مشتق (معدل السعي أو الدرجة النهائية) لا
 *    يُحسَب إلا إذا كانت **كل** مكوّناته الثلاثة (أو الاثنين) حاضرة ورقمية؛ فإن
 *    غاب مكوّن واحد فالناتج null (غير معروف)، لا صفر ولا تخمين. أما إذا أرسل
 *    مستخدم قيمة مباشرة لحقل مشتق مع غياب مكوّناته (حالة طالب انتقالي مثلاً لا
 *    توجد له درجات فصلية) فتلك ليست «حساباً» بل «إدخالاً مباشراً» تقرّره طبقة
 *    الخادم (resolve.js)، وهذه الوحدة لا تتدخّل في ذلك القرار — فقط تُرجع null
 *    بصدق حين يتعذّر الحساب.
 *
 * ٤) الحدود والسلامة — isValidGrade:
 *    كل درجة يجب أن تكون رقماً محدوداً (لا NaN ولا Infinity) بين ٠ و١٠٠
 *    شاملتين. القيمة null/undefined تُعتبر «غياباً» صالحاً بنيوياً (لا قيمة
 *    بعد)، وهذا تمييز متعمَّد عن «رقم غير صالح» — الفحص عند نقطة الإدخال في
 *    الخادم هو من يقرر ما إذا كان الغياب مقبولاً في سياقه.
 *
 * ٥) فخّ الفاصلة العائمة — التنظيف قبل التقريب:
 *    الجمع والقسمة بالفاصلة العائمة الثنائية (IEEE-754) لا يمثّلان كثيراً من
 *    الكسور العشرية تمثيلاً دقيقاً. مثال مُتحقَّق منه فعلياً وليس افتراضياً:
 *      (70.1 + 70.3 + 71.1) / 3 === 70.49999999999999   (وليس 70.5 بالضبط)
 *    Math.round على هذه القيمة يعطي ٧٠ (تقريب لأسفل خاطئ)، بينما القيمة
 *    الرياضية الحقيقية ٧٠٫٥ بالضبط ويجب أن تُقرَّب إلى ٧١ بحسب القرار (١).
 *    الحل: roundHalfUp تُنظِّف القيمة إلى ٩ منازل عشرية عبر toFixed قبل تطبيق
 *    floor(x + 0.5) — تسعة منازل أكبر بكثير من أي دقة حقيقية يحتاجها نظام
 *    درجات (٪ بمنزلة عشرية واحدة أو اثنتين على الأكثر)، وأصغر بكثير من ضوضاء
 *    الفاصلة العائمة (تظهر عادة عند المنزلة ١٣-١٥)، فتفصل الإشارة الحقيقية عن
 *    الضوضاء دون أي مجازفة بقصّ دقة مقصودة. نفس الأسلوب يُصلح فخّ 0.1+0.2
 *    الكلاسيكي (0.30000000000000004).
 *
 * لا اعتماديات خارجية. لا خطوة بناء (build step). يعمل حرفياً كما هو في
 * Node (module.exports) وفي المتصفح (يُلحَق بـ window.RafidainGradeCalc) عبر
 * ذيل UMD صغير في آخر الملف.
 */

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    var g = typeof globalThis !== 'undefined' ? globalThis : root;
    g.RafidainGradeCalc = factory();
  }
})(this, function () {
  'use strict';

  // ---- ثوابت الحدود والحقول ------------------------------------------------

  var MIN_GRADE = 0;
  var MAX_GRADE = 100;

  // الحقول التي يُبنى منها معدل السعي السنوي، بالترتيب.
  var EFFORT_FIELDS = ['first_term_avg', 'midyear', 'second_term_avg'];
  // الحقول التي تُبنى منها الدرجة النهائية، بالترتيب.
  var FINAL_FIELDS = ['annual_effort', 'final_exam'];
  // كل حقول صف الدرجات الستة، بالترتيب المعروض في الواجهة.
  var FIELDS = ['first_term_avg', 'midyear', 'second_term_avg', 'annual_effort', 'final_exam', 'final_grade'];
  // الحقلان المشتقّان (يُحسبان تلقائياً ما لم يُعلَّما كتجاوز يدوي).
  var DERIVED_FIELDS = ['annual_effort', 'final_grade'];

  // تسميات عربية للحقول — تطابق public/js/admin.js (GRADE_COLS) حرفياً، كي
  // تحمل رسائل الخادم نفس مصطلحات الواجهة أمام المدرّس. تكرار مقصود ومحدود
  // لنصوص عرض فقط، وليس لأي جزء من الحساب.
  var FIELD_LABELS_AR = {
    first_term_avg: 'معدل النصف الأول',
    midyear: 'درجة نصف السنة',
    second_term_avg: 'معدل النصف الثاني',
    annual_effort: 'معدل السعي السنوي',
    final_exam: 'درجة الامتحان النهائي',
    final_grade: 'الدرجة النهائية',
  };

  // هامش تسامح عند مقارنة قيمة مُرسلة بقيمة محسوبة (راجع resolve.js). القيمتان
  // المُقارَنتان عادة عددان صحيحان ناتجان عن roundHalfUp نفسها في الطرفين
  // (الخادم والمتصفح يحمّلان نفس هذه الوحدة)، فالتطابق التام هو المتوقَّع
  // عملياً؛ هذا الهامش شبكة أمان ضد شذوذ فاصلة عائمة لا أكثر.
  var CONSISTENCY_EPSILON = 1e-6;

  // عدد المنازل العشرية التي تُنظَّف إليها القيمة قبل التقريب — راجع القرار (٥).
  var FLOAT_NOISE_DECIMALS = 9;

  // ---- أدوات مساعدة صرفة -----------------------------------------------

  function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  // «حاضر» يعني: ليس null وليس undefined — أي أن قيمة ما أُرسلت فعلاً، سواء
  // كانت رقماً صالحاً أم لا. عمداً لا تُدرَج NaN هنا ضمن «الغياب»: NaN قيمة
  // مُرسلة (وإن كانت فاسدة)، وليست غياباً بريئاً كالحقل الذي لم يُملأ بعد؛
  // الخلط بينهما كان يجعل isValidGrade يقبل NaN خطأً بوصفه «غياباً مقبولاً».
  // صلاحية الرقم نفسه (محدود، ضمن ٠-١٠٠) فحص منفصل تماماً — isValidGrade.
  function isPresent(v) {
    return v !== null && v !== undefined;
  }

  // درجة صالحة بنيوياً: إما غائبة (null/undefined، وهذا مقبول هنا عمداً —
  // القرار (٤))، أو رقماً محدوداً بين ٠ و١٠٠ شاملتين.
  function isValidGrade(v) {
    if (!isPresent(v)) return true;
    return isFiniteNumber(v) && v >= MIN_GRADE && v <= MAX_GRADE;
  }

  // نصف لأعلى، مع تنظيف ضوضاء الفاصلة العائمة أولاً — القراران (١) و(٥).
  // الدرجات هنا غير سالبة دائماً (٠-١٠٠) فـ floor(x + 0.5) يطابق «نصف لأعلى»
  // تماماً دون أي التباس قد ينشأ مع الأعداد السالبة في تعريفات أخرى.
  function roundHalfUp(value) {
    if (!isFiniteNumber(value)) return null;
    var safe = Number(value.toFixed(FLOAT_NOISE_DECIMALS));
    return Math.floor(safe + 0.5);
  }

  // متوسط قائمة قيم، أو null إن غاب أي عنصر منها أو لم يكن رقماً صالحاً —
  // القرار (٣): لا حساب جزئي، لا تخمين.
  function averageOrNull(values) {
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (!isPresent(v) || !isFiniteNumber(v)) return null;
      sum += v;
    }
    return sum / values.length;
  }

  function missingFields(fieldNames, components) {
    var out = [];
    for (var i = 0; i < fieldNames.length; i++) {
      var f = fieldNames[i];
      var v = components[f];
      if (!isPresent(v) || !isFiniteNumber(v)) out.push(f);
    }
    return out;
  }

  // ---- الحساب المشتق ---------------------------------------------------

  /**
   * يحسب معدل السعي السنوي من الفصول الثلاثة.
   * components: { first_term_avg, midyear, second_term_avg } — أي منها قد
   * يكون رقماً أو null/undefined.
   * يُرجع: { value, raw, missing }
   *   value   — الناتج المُقرَّب (عدد صحيح) أو null إن تعذّر الحساب.
   *   raw     — المتوسط قبل التقريب (للتشخيص فقط؛ لا يُستخدم في تركيب
   *             الدرجة النهائية — راجع القرار (٢)).
   *   missing — أسماء الحقول الناقصة إن وُجدت (مصفوفة فارغة إن اكتملت).
   */
  function computeAnnualEffort(components) {
    var c = components || {};
    var raw = averageOrNull(EFFORT_FIELDS.map(function (f) { return c[f]; }));
    return { value: roundHalfUp(raw), raw: raw, missing: missingFields(EFFORT_FIELDS, c) };
  }

  /**
   * يحسب الدرجة النهائية من معدل السعي ودرجة الامتحان النهائي.
   * components: { annual_effort, final_exam }. القيمة المُمرَّرة لـ
   * annual_effort هي مسؤولية المستدعي (عادة القيمة المُقرَّبة/المُقرَّرة
   * فعلياً — القرار ٢)، لا هذه الدالة.
   * يُرجع: { value, raw, missing } بنفس معنى computeAnnualEffort أعلاه.
   */
  function computeFinalGrade(components) {
    var c = components || {};
    var raw = averageOrNull(FINAL_FIELDS.map(function (f) { return c[f]; }));
    return { value: roundHalfUp(raw), raw: raw, missing: missingFields(FINAL_FIELDS, c) };
  }

  function closeEnough(a, b) {
    return Math.abs(a - b) <= CONSISTENCY_EPSILON;
  }

  /**
   * يفحص صفاً كاملاً (الحقول الستة كما تُعرَض أو تُرسَل) ويقرر هل هو متّسق
   * حسابياً مع نفسه. دالة صرفة لا تعرف شيئاً عن التجاوز اليدوي أو قاعدة
   * البيانات — فقط: «هذه الأرقام الستة، هل تُصدِّق بعضها بعضاً؟». مفيدة
   * لسكربت تدقيق الصفوف القديمة (dry-run) ولأي فحص أولي في المتصفح.
   *
   * row: { first_term_avg, midyear, second_term_avg, annual_effort,
   *        final_exam, final_grade } — أي حقل قد يغيب.
   * يُرجع: { consistent, problems, computed }
   *   consistent — true إن لم توجد أي مخالفة.
   *   problems   — مصفوفة { field, code, message, submitted, expected? }
   *                حيث code هي 'MISSING_COMPONENTS' أو 'MISMATCH'.
   *   computed   — { annual_effort, final_grade } كما تحسبهما هذه الوحدة
   *                من مكوّنات الصف نفسه (وليس من الأعمدة المشتقة الأخرى).
   */
  function verifyRow(row) {
    var r = row || {};
    var problems = [];

    var effort = computeAnnualEffort(r);
    if (isPresent(r.annual_effort)) {
      if (!isFiniteNumber(r.annual_effort)) {
        problems.push({
          field: 'annual_effort',
          code: 'INVALID_VALUE',
          message: 'قيمة معدل السعي السنوي المُرسلة ليست رقماً صالحاً.',
          submitted: r.annual_effort,
        });
      } else if (effort.value === null) {
        problems.push({
          field: 'annual_effort',
          code: 'MISSING_COMPONENTS',
          message: 'معدل السعي السنوي مذكور، لكن مكوّناته غير مكتملة (' +
            effort.missing.map(function (f) { return FIELD_LABELS_AR[f]; }).join('، ') + ').',
          submitted: r.annual_effort,
          missing: effort.missing,
        });
      } else if (!closeEnough(r.annual_effort, effort.value)) {
        problems.push({
          field: 'annual_effort',
          code: 'MISMATCH',
          message: 'معدل السعي السنوي المذكور (' + r.annual_effort + ') لا يطابق ناتج معادلته (' + effort.value + ').',
          submitted: r.annual_effort,
          expected: effort.value,
        });
      }
    }

    // الدرجة النهائية تُقاس بالنسبة لمعدل السعي كما يظهر في هذا الصف نفسه
    // إن كان مذكوراً (حتى لو كان هو نفسه غير متّسق مع مكوّناته — نتحقق من ذلك
    // بشكل مستقل أعلاه)، وإلا فبالقيمة المحسوبة. هذا يطابق ما يراه إنسان يعيد
    // الحساب يدوياً من الرقمين المعروضين أمامه.
    var effortForFinal = isPresent(r.annual_effort) ? r.annual_effort : effort.value;
    var finalCalc = computeFinalGrade({ annual_effort: effortForFinal, final_exam: r.final_exam });

    if (isPresent(r.final_grade)) {
      if (!isFiniteNumber(r.final_grade)) {
        problems.push({
          field: 'final_grade',
          code: 'INVALID_VALUE',
          message: 'قيمة الدرجة النهائية المُرسلة ليست رقماً صالحاً.',
          submitted: r.final_grade,
        });
      } else if (finalCalc.value === null) {
        problems.push({
          field: 'final_grade',
          code: 'MISSING_COMPONENTS',
          message: 'الدرجة النهائية مذكورة، لكن معدل السعي أو درجة الامتحان النهائي غير مكتملين.',
          submitted: r.final_grade,
          missing: finalCalc.missing,
        });
      } else if (!closeEnough(r.final_grade, finalCalc.value)) {
        problems.push({
          field: 'final_grade',
          code: 'MISMATCH',
          message: 'الدرجة النهائية المذكورة (' + r.final_grade + ') لا تطابق ناتج معادلتها (' + finalCalc.value + ').',
          submitted: r.final_grade,
          expected: finalCalc.value,
        });
      }
    }

    return {
      consistent: problems.length === 0,
      problems: problems,
      computed: { annual_effort: effort.value, final_grade: finalCalc.value },
    };
  }

  return {
    MIN_GRADE: MIN_GRADE,
    MAX_GRADE: MAX_GRADE,
    FIELDS: FIELDS,
    EFFORT_FIELDS: EFFORT_FIELDS,
    FINAL_FIELDS: FINAL_FIELDS,
    DERIVED_FIELDS: DERIVED_FIELDS,
    FIELD_LABELS_AR: FIELD_LABELS_AR,
    CONSISTENCY_EPSILON: CONSISTENCY_EPSILON,
    isPresent: isPresent,
    isValidGrade: isValidGrade,
    roundHalfUp: roundHalfUp,
    averageOrNull: averageOrNull,
    computeAnnualEffort: computeAnnualEffort,
    computeFinalGrade: computeFinalGrade,
    verifyRow: verifyRow,
  };
});
