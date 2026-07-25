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

  var MIN_GRADE = 0;
  var MAX_GRADE = 100;

  var EFFORT_FIELDS = ['first_term_avg', 'midyear', 'second_term_avg'];

  var FINAL_FIELDS = ['annual_effort', 'final_exam'];

  var FIELDS = ['first_term_avg', 'midyear', 'second_term_avg', 'annual_effort', 'final_exam', 'final_grade'];

  var DERIVED_FIELDS = ['annual_effort', 'final_grade'];

  var FIELD_LABELS_AR = {
    first_term_avg: 'معدل النصف الأول',
    midyear: 'درجة نصف السنة',
    second_term_avg: 'معدل النصف الثاني',
    annual_effort: 'معدل السعي السنوي',
    final_exam: 'درجة الامتحان النهائي',
    final_grade: 'الدرجة النهائية',
  };

  var CONSISTENCY_EPSILON = 1e-6;

  var FLOAT_NOISE_DECIMALS = 9;

  function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  function isPresent(v) {
    return v !== null && v !== undefined;
  }

  function isValidGrade(v) {
    if (!isPresent(v)) return true;
    return isFiniteNumber(v) && v >= MIN_GRADE && v <= MAX_GRADE;
  }

  function roundHalfUp(value) {
    if (!isFiniteNumber(value)) return null;
    var safe = Number(value.toFixed(FLOAT_NOISE_DECIMALS));
    return Math.floor(safe + 0.5);
  }

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

  function computeAnnualEffort(components) {
    var c = components || {};
    var raw = averageOrNull(EFFORT_FIELDS.map(function (f) { return c[f]; }));
    return { value: roundHalfUp(raw), raw: raw, missing: missingFields(EFFORT_FIELDS, c) };
  }

  function computeFinalGrade(components) {
    var c = components || {};
    var raw = averageOrNull(FINAL_FIELDS.map(function (f) { return c[f]; }));
    return { value: roundHalfUp(raw), raw: raw, missing: missingFields(FINAL_FIELDS, c) };
  }

  function closeEnough(a, b) {
    return Math.abs(a - b) <= CONSISTENCY_EPSILON;
  }

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
