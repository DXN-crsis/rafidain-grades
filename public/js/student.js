const NET_ERR = 'تعذر الاتصال بالخادم. تأكد من تشغيل الخادم ثم حاول مرة أخرى.';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

const examInput = document.getElementById('exam');
if (examInput) {
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('error');

  async function lookup() {
    const num = examInput.value.trim();
    errEl.hidden = true;
    if (!/^\d{8}$/.test(num)) {
      errEl.textContent = 'الرقم الامتحاني يتكون من 8 أرقام';
      errEl.hidden = false;
      return;
    }
    btn.disabled = true;
    try {
      const res = await fetch('/api/student/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ exam_number: num }),
      });
      const data = await res.json();
      if (!res.ok) {
        errEl.textContent = data.error || 'حدث خطأ، حاول مرة أخرى';
        errEl.hidden = false;
        return;
      }

      data.exam_number = num;
      sessionStorage.setItem('studentData', JSON.stringify(data));
      location.href = '/student.html';
    } catch {
      errEl.textContent = NET_ERR;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  }
  btn.addEventListener('click', lookup);
  examInput.addEventListener('keydown', e => { if (e.key === 'Enter') lookup(); });
  examInput.addEventListener('input', () => { examInput.value = examInput.value.replace(/\D/g, ''); });
}

const resultRoot = document.getElementById('result');
if (resultRoot) {
  const CELEBRATION_DELAY_MS = 2500;
  const CELEBRATION_AUTO_DISMISS_MS = 7000;

  const DISTINCTION_AVERAGE_THRESHOLD = 85;

  const raw = sessionStorage.getItem('studentData');
  if (!raw) { location.href = '/'; }
  else {
    const data = JSON.parse(raw);
    document.getElementById('studentName').textContent = data.name;

    const metaEl = document.getElementById('studentMeta');
    metaEl.innerHTML = '';

    const chips = [['القسم', data.department], ['المرحلة', data.stage]];
    if (data.section && data.section !== 'بدون شعبة') chips.push(['الشعبة', data.section]);
    chips.forEach(([label, value]) => {
      const li = document.createElement('li');
      li.className = 'chip';
      const lab = document.createElement('span');
      lab.className = 'chip-label';
      lab.textContent = label + ':';
      li.appendChild(lab);
      li.appendChild(document.createTextNode(' ' + String(value ?? '')));
      metaEl.appendChild(li);
    });

    const FULL_FIELDS = [
      ['first_term_avg', 'معدل النصف الأول'],
      ['midyear', 'درجة نصف السنة'],
      ['second_term_avg', 'معدل النصف الثاني'],
      ['annual_effort', 'معدل السعي السنوي'],
      ['final_exam', 'درجة الامتحان النهائي'],
      ['final_grade', 'الدرجة النهائية'],
    ];

    const fields = FULL_FIELDS.filter(([key]) =>
      key === 'final_grade' || data.subjects.some(sub => sub[key] != null)
    );

    const gradesList = document.getElementById('gradesList');
    data.subjects.forEach(sub => {
      const card = document.createElement('article');
      card.className = 'subject-card';

      let statusHtml;
      if (sub.final_grade == null) {
        statusHtml = '<span class="muted">—</span>';
      } else if (sub.final_grade >= 50) {
        statusHtml = '<span class="badge-pass blur-target">ناجح</span>';
      } else {
        statusHtml = '<span class="badge-fail blur-target">راسب</span>';
      }

      const rowsHtml = fields.map(([key, label]) => {
        const v = sub[key];
        const rowCls = key === 'final_grade' ? ' subject-row-final' : '';
        const cellCls = 'grade-cell' + (v == null ? '' : ' blur-target');
        return `<div class="subject-row${rowCls}">
          <dt>${escapeHtml(label)}</dt>
          <dd class="${cellCls}" data-value="${escapeHtml(v ?? '')}">${v == null ? '—' : escapeHtml(v)}</dd>
        </div>`;
      }).join('');

      card.innerHTML = `
        <header class="subject-card-head">
          <h2 class="subject-card-name">${escapeHtml(sub.name)}</h2>
          ${statusHtml}
        </header>
        <dl class="subject-grid">${rowsHtml}</dl>`;

      gradesList.appendChild(card);
    });

    function buildPrintTable() {
      const SUBJECT_PCT = 20;
      const STATUS_PCT = 9;
      const detailPct = (100 - SUBJECT_PCT - STATUS_PCT) / fields.length;

      const colgroup = document.getElementById('printColgroup');
      const colHtml = [`<col style="width:${SUBJECT_PCT}%">`];
      for (let i = 0; i < fields.length; i++) colHtml.push(`<col style="width:${detailPct}%">`);
      colHtml.push(`<col style="width:${STATUS_PCT}%">`);
      colgroup.innerHTML = colHtml.join('');

      const headRow = document.createElement('tr');
      headRow.innerHTML = `<th>${escapeHtml('المادة')}</th>` +
        fields.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('') +
        `<th>${escapeHtml('النتيجة')}</th>`;
      document.getElementById('printHead').appendChild(headRow);

      const printBody = document.getElementById('printBody');
      data.subjects.forEach(sub => {
        const tr = document.createElement('tr');
        const detailCells = fields.map(([key]) => {
          const v = sub[key];
          const cls = key === 'final_grade' ? ' class="final-cell"' : '';
          return `<td${cls}>${v == null ? '—' : escapeHtml(v)}</td>`;
        }).join('');
        const status = sub.final_grade == null
          ? '<td>—</td>'
          : sub.final_grade >= 50
            ? '<td><span class="badge-pass">ناجح</span></td>'
            : '<td><span class="badge-fail">راسب</span></td>';
        tr.innerHTML = `<td>${escapeHtml(sub.name)}</td>${detailCells}${status}`;
        printBody.appendChild(tr);
      });
    }
    buildPrintTable();

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function formatAvg(n) {
      const rounded = Math.round(n * 10) / 10;
      return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    }

    function animateAverage(el, target) {
      let cur = 0;
      const step = Math.max(1, Math.ceil(target / 25));
      const tick = () => {
        cur = Math.min(cur + step, target);
        el.textContent = cur >= target ? formatAvg(target) : String(Math.round(cur));
        if (cur < target) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    function animateGradeCells() {
      gradesList.querySelectorAll('.grade-cell').forEach(cell => {
        const target = parseFloat(cell.dataset.value);
        if (Number.isNaN(target)) return;
        let cur = 0;
        const step = Math.max(1, Math.ceil(target / 25));
        const tick = () => {
          cur = Math.min(cur + step, target);
          cell.textContent = cur;
          if (cur < target) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }

    const gradedSubjects = data.subjects.filter(s => s.final_grade != null);
    const complete = data.subjects.length > 0 && gradedSubjects.length === data.subjects.length;
    const passing = complete && gradedSubjects.every(s => s.final_grade >= 50);
    const average = complete
      ? gradedSubjects.reduce((sum, s) => sum + s.final_grade, 0) / gradedSubjects.length
      : null;

    const successBanner = document.getElementById('successBanner');
    const successAvgValue = document.getElementById('successAvgValue');
    const celebrationOverlay = document.getElementById('celebrationOverlay');
    const celebrationClose = document.getElementById('celebrationClose');
    const celebrationDismissBtn = document.getElementById('celebrationDismiss');
    const celebrationAvgValue = document.getElementById('celebrationAvgValue');

    if (!complete || !passing) {
      [successBanner, celebrationOverlay].forEach((node) => {
        if (node && node.parentNode) node.parentNode.removeChild(node);
      });
    }

    let celebrationTimer = null;
    let celebrationReturnFocus = null;

    function onCelebrationKeydown(e) {
      if (e.key === 'Escape') closeCelebration();
    }
    function closeCelebration() {
      if (!celebrationOverlay || celebrationOverlay.hidden) return;
      celebrationOverlay.hidden = true;
      if (celebrationTimer) { clearTimeout(celebrationTimer); celebrationTimer = null; }
      document.removeEventListener('keydown', onCelebrationKeydown);
      if (celebrationReturnFocus && typeof celebrationReturnFocus.focus === 'function') {
        celebrationReturnFocus.focus();
      }
    }
    function openCelebration() {
      if (!celebrationOverlay) return;
      celebrationReturnFocus = document.activeElement;
      celebrationOverlay.hidden = false;
      document.addEventListener('keydown', onCelebrationKeydown);
      if (celebrationClose) celebrationClose.focus();
      if (reduceMotion) celebrationAvgValue.textContent = formatAvg(average);
      else animateAverage(celebrationAvgValue, average);
      celebrationTimer = setTimeout(closeCelebration, CELEBRATION_AUTO_DISMISS_MS);
    }
    if (celebrationClose) celebrationClose.addEventListener('click', closeCelebration);
    if (celebrationDismissBtn) celebrationDismissBtn.addEventListener('click', closeCelebration);
    if (celebrationOverlay) {
      celebrationOverlay.addEventListener('click', (e) => {
        if (e.target === celebrationOverlay) closeCelebration();
      });
    }

    function openSuccessBanner() {
      if (!successBanner) return;
      successBanner.hidden = false;
      successBanner.classList.add('rise');
      if (reduceMotion) successAvgValue.textContent = formatAvg(average);
      else animateAverage(successAvgValue, average);
    }

    function showOutcome() {
      if (!complete || !passing) return;
      if (average >= DISTINCTION_AVERAGE_THRESHOLD) openCelebration();
      else openSuccessBanner();
    }

    const gradesSection = document.getElementById('gradesSection');
    const revealGate = document.getElementById('revealGate');
    const revealBtn = document.getElementById('revealBtn');

    const examNumber = data.exam_number || '';
    const revealKey = examNumber ? `revealed:${examNumber}` : null;
    const alreadyRevealed = !!(revealKey && localStorage.getItem(revealKey) === '1');

    function finishReveal() {
      if (revealKey) localStorage.setItem(revealKey, '1');
      setTimeout(showOutcome, CELEBRATION_DELAY_MS);
    }

    if (alreadyRevealed) {
      if (revealGate) revealGate.remove();
      gradesSection.classList.remove('is-blurred');
      finishReveal();
    } else if (revealGate && revealBtn) {
      revealBtn.addEventListener('click', () => {
        gradesSection.classList.remove('is-blurred');
        if (!reduceMotion) animateGradeCells();
        if (reduceMotion) {
          revealGate.remove();
        } else {
          revealGate.classList.add('is-leaving');
          revealGate.addEventListener('transitionend', () => revealGate.remove(), { once: true });
        }
        finishReveal();
      }, { once: true });
    } else {
      gradesSection.classList.remove('is-blurred');
      finishReveal();
    }

    const printDateEl = document.getElementById('printDate');
    if (printDateEl) {
      printDateEl.textContent = new Date().toLocaleDateString('ar-IQ', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    }

    const printBtn = document.getElementById('printBtn');
    if (printBtn) printBtn.addEventListener('click', () => window.print());

    document.getElementById('backBtn').addEventListener('click', () => {
      sessionStorage.removeItem('studentData');
      location.href = '/';
    });
  }
}
