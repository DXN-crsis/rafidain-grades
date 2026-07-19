// Inject icons into any [data-icon] slot.
document.querySelectorAll('[data-icon]').forEach(el => {
  el.innerHTML = window.icons[el.dataset.icon] || '';
});

const examInput = document.getElementById('exam');
if (examInput) {
  // ---- login page logic ----
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
      errEl.textContent = 'تعذر الاتصال بالخادم';
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
  // ---- grades page logic ----
  const raw = sessionStorage.getItem('studentData');
  if (!raw) { location.href = '/'; }
  else {
    const data = JSON.parse(raw);
    document.getElementById('studentName').textContent = data.name;
    document.getElementById('studentMeta').textContent =
      `${data.department} — ${data.stage} — ${data.section}`;

    const FULL_COLS = [
      ['first_term_avg', 'معدل النصف الأول'],
      ['midyear', 'درجة نصف السنة'],
      ['second_term_avg', 'معدل النصف الثاني'],
      ['annual_effort', 'معدل السعي السنوي'],
      ['final_exam', 'درجة الامتحان النهائي'],
      ['final_grade', 'الدرجة النهائية'],
    ];

    const tbody = document.getElementById('gradesBody');
    for (const sub of data.subjects) {
      const tr = document.createElement('tr');
      tr.className = 'fade-in';
      const cells = FULL_COLS.map(([key]) => {
        if (sub.grade_mode === 'final_only' && key !== 'final_grade') return '<td>—</td>';
        const v = sub[key];
        return `<td class="grade-cell" data-value="${v ?? ''}">${v ?? '—'}</td>`;
      }).join('');
      const status = sub.final_grade == null
        ? '<td>—</td>'
        : sub.final_grade >= 50
          ? '<td><span class="badge-pass">ناجح</span></td>'
          : '<td><span class="badge-fail">راسب</span></td>';
      tr.innerHTML = `<td class="subject-name">${sub.name}</td>${cells}${status}`;
      tbody.appendChild(tr);
    }

    // Animated counters for grade cells.
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

    document.getElementById('backBtn').addEventListener('click', () => {
      sessionStorage.removeItem('studentData');
      location.href = '/';
    });
  }
}
