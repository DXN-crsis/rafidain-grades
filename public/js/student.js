/* واجهة الطالب: صفحة الاستعلام (index.html) وصفحة النتيجة (student.html).
   ملاحظة ثابتة: منطق اشتقاق أعمدة جدول النتيجة (FULL_COLS ومرشّح cols
   وبناء الترويسة والصفوف) مجمّد — أي تعديل هنا شكلي فقط. */

const NET_ERR = 'تعذر الاتصال بالخادم. تأكد من تشغيل الخادم ثم حاول مرة أخرى.';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

const examInput = document.getElementById('exam');
if (examInput) {
  // ---- صفحة الاستعلام ----
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
  // ---- صفحة النتيجة ----
  const raw = sessionStorage.getItem('studentData');
  if (!raw) { location.href = '/'; }
  else {
    const data = JSON.parse(raw);
    document.getElementById('studentName').textContent = data.name;

    // بطاقة الهوية: القسم والمرحلة والشعبة كرقاقات (بناء DOM آمن دون innerHTML).
    const metaEl = document.getElementById('studentMeta');
    metaEl.innerHTML = '';
    [['القسم', data.department], ['المرحلة', data.stage], ['الشعبة', data.section]].forEach(([label, value]) => {
      const li = document.createElement('li');
      li.className = 'chip';
      const lab = document.createElement('span');
      lab.className = 'chip-label';
      lab.textContent = label + ':';
      li.appendChild(lab);
      li.appendChild(document.createTextNode(' ' + String(value ?? '')));
      metaEl.appendChild(li);
    });

    const FULL_COLS = [
      ['first_term_avg', 'معدل النصف الأول'],
      ['midyear', 'درجة نصف السنة'],
      ['second_term_avg', 'معدل النصف الثاني'],
      ['annual_effort', 'معدل السعي السنوي'],
      ['final_exam', 'درجة الامتحان النهائي'],
      ['final_grade', 'الدرجة النهائية'],
    ];

    // A detail column is rendered only if at least one subject in this result
    // set has a non-null value for it. الدرجة النهائية is always rendered.
    // The header (below) and the row cells (further below) are both derived
    // from this single computed list, so they can never drift out of sync.
    const cols = FULL_COLS.filter(([key]) =>
      key === 'final_grade' || data.subjects.some(sub => sub[key] != null)
    );

    const theadRow = document.createElement('tr');
    theadRow.innerHTML = `<th>${escapeHtml('المادة')}</th>` +
      cols.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('') +
      `<th>${escapeHtml('النتيجة')}</th>`;
    document.getElementById('gradesHead').appendChild(theadRow);

    const tbody = document.getElementById('gradesBody');
    for (const sub of data.subjects) {
      const tr = document.createElement('tr');
      tr.className = 'fade-in';
      const cells = cols.map(([key]) => {
        const v = sub[key];
        return `<td class="grade-cell" data-value="${escapeHtml(v ?? '')}">${v == null ? '—' : escapeHtml(v)}</td>`;
      }).join('');
      const status = sub.final_grade == null
        ? '<td>—</td>'
        : sub.final_grade >= 50
          ? '<td><span class="badge-pass">ناجح</span></td>'
          : '<td><span class="badge-fail">راسب</span></td>';
      tr.innerHTML = `<td class="subject-name">${escapeHtml(sub.name)}</td>${cells}${status}`;
      tbody.appendChild(tr);
    }

    // عدّادات متحركة لخلايا الدرجات — تُتخطى كلياً عند تفعيل «تقليل الحركة»
    // فتظهر القيم النهائية مباشرة (الخلايا مرسومة بقيمها أصلاً).
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
      document.querySelectorAll('.grade-cell').forEach(cell => {
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

    const printBtn = document.getElementById('printBtn');
    if (printBtn) printBtn.addEventListener('click', () => window.print());

    document.getElementById('backBtn').addEventListener('click', () => {
      sessionStorage.removeItem('studentData');
      location.href = '/';
    });
  }
}
