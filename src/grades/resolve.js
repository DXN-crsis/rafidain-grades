'use strict';

const calc = require('./calc');

const DETAIL_FIELDS = ['first_term_avg', 'midyear', 'second_term_avg', 'annual_effort', 'final_exam'];

function hasField(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

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

function resolveDerivedField(p) {
  const field = p.field;
  const label = calc.FIELD_LABELS_AR[field];

  if (p.isManual) {
    if (!p.submittedPresent) {
      return { has: false, value: null, effective: p.storedValue };
    }

    return { has: true, value: p.submitted, effective: p.submitted };
  }

  if (p.submittedPresent && p.submitted !== null) {
    if (!calc.isPresent(p.submitted) || typeof p.submitted !== 'number' || Number.isNaN(p.submitted)) {
      return {
        problem: {
          field: field,
          code: 'INVALID_VALUE',
          message: 'قيمة ' + label + ' المُرسلة ليست رقماً صالحاً.',
        },
      };
    }
    if (p.canonical === null) {
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

  if (!p.submittedPresent) {
    return { has: false, value: null, effective: p.storedValue };
  }

  return { has: true, value: p.canonical, effective: p.canonical };
}

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
