/* ===== helpers ===== */
async function apiCall(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Network-level failure (server down, connection dropped, offline, etc.)
    // — fetch() throws a native English TypeError here. Never show that;
    // match the Arabic message public/js/student.js already uses for the
    // same situation.
    throw new Error('تعذر الاتصال بالخادم. تأكد من تشغيل الخادم ثم حاول مرة أخرى');
  }
  if (res.status === 401) { location.href = '/admin-login.html'; throw new Error('انتهت الجلسة — يجري تحويلك لتسجيل الدخول'); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || 'حدث خطأ');
  return data;
}

function showToast(msg, isError = false) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function injectIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(n => { n.innerHTML = window.icons[n.dataset.icon] || ''; });
}

// Converts western digits to Arabic-Indic digits for plain-language UI text
// (counts, status sentences). Exam numbers themselves stay western-digit —
// they must match exactly what a student types on the public login page.
function arDigits(n) {
  return String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

// Rewrites a backend error into "what to do" phrasing instead of "what failed",
// per the real-time-guidance requirement: never leave a teacher with a dead end.
function friendlyError(msg) {
  if (/موجود مسبقاً/.test(msg)) return `${msg} — جرّب اسماً آخر`;
  return msg;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

// Replaces the native prompt() dialog for renaming a list item with an
// inline text field in the app's own design system. nameSpan is swapped
// for an input + حفظ/إلغاء; onCancel is responsible for putting the view
// back the way it was (the caller's list already knows how to do that,
// typically by re-rendering from the server).
function startInlineRename(nameSpan, currentName, { onSave, onCancel }) {
  const wrap = el(`<span class="grow inline-edit">
    <input class="input" value="${escapeHtml(currentName)}">
    <button class="btn btn-primary btn-sm" data-save>حفظ</button>
    <button class="btn btn-ghost btn-sm" data-cancel>إلغاء</button>
  </span>`);
  nameSpan.replaceWith(wrap);
  const input = wrap.querySelector('input');
  input.focus();
  input.select();
  async function save() {
    const val = input.value.trim();
    if (!val) { showToast('اكتب اسماً أولاً', true); return; }
    try { await onSave(val); }
    catch (e) { showToast(friendlyError(e.message), true); }
  }
  wrap.querySelector('[data-save]').onclick = save;
  wrap.querySelector('[data-cancel]').onclick = () => onCancel();
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  });
}

// Briefly highlights a freshly-created row so a teacher can see where their
// action landed. A plain class toggle on a JS timer, not a CSS animation/
// transition, so it still shows under prefers-reduced-motion.
function flashNew(rowEl) {
  if (!rowEl) return;
  rowEl.classList.add('just-added');
  setTimeout(() => rowEl.classList.remove('just-added'), 2200);
}

const view = document.getElementById('view');

/* ===== state shared across views ===== */
const state = { deptId: null, stageId: null, sectionId: null, subjectId: null };

/* ===== quick view: one screen, four steps, no re-picking ===== */
async function renderQuickView() {
  view.innerHTML = '';
  const card = el(`<div class="glass-card fade-in quick-view">
    <h3 style="margin-bottom:0.6rem">الإضافة السريعة</h3>
    <p style="color:var(--text-muted);margin-bottom:1rem">أضف كل شيء من هذه الشاشة — دون الحاجة للتنقل بين صفحات متعددة.</p>
    <p class="status-line" data-tour="status-line"></p>

    <section class="quick-step" data-tour="quick-where" id="qStepWhere">
      <div class="step-head">
        <span class="step-num">١</span>
        <h4>أين؟</h4>
        <span class="step-check" data-icon="check" hidden></span>
      </div>
      <p class="step-hint">اختر القسم ثم المرحلة ثم الشعبة. إذا لم تكن موجودة بعد، أنشئها من هنا مباشرة دون مغادرة الشاشة.</p>
      <div class="step-waiting-msg" hidden></div>
      <div class="step-body">
        <div class="toolbar picker-row">
          <div class="picker" data-picker="dept">
            <select class="input" id="qDept"></select>
            <div class="inline-add" id="qDeptAdd" hidden>
              <input class="input" placeholder="اسم القسم الجديد">
              <button class="btn btn-primary btn-sm" data-save>حفظ</button>
              <button class="btn btn-ghost btn-sm" data-cancel>إلغاء</button>
            </div>
          </div>
          <div class="picker" data-picker="stage">
            <select class="input" id="qStage" disabled></select>
            <div class="inline-add" id="qStageAdd" hidden>
              <input class="input" placeholder="اسم المرحلة الجديدة">
              <button class="btn btn-primary btn-sm" data-save>حفظ</button>
              <button class="btn btn-ghost btn-sm" data-cancel>إلغاء</button>
            </div>
          </div>
          <div class="picker" data-picker="section">
            <select class="input" id="qSec" disabled></select>
            <div class="inline-add" id="qSecAdd" hidden>
              <input class="input" placeholder="اسم الشعبة الجديدة">
              <button class="btn btn-primary btn-sm" data-save>حفظ</button>
              <button class="btn btn-ghost btn-sm" data-cancel>إلغاء</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="quick-step" data-tour="quick-subjects" id="qStepSubjects">
      <div class="step-head">
        <span class="step-num">٢</span>
        <h4>المواد</h4>
        <span class="step-check" data-icon="check" hidden></span>
      </div>
      <p class="step-hint">هذه المواد تنطبق على كل طلبة هذه المرحلة — لا حاجة لإعادة إدخالها لكل طالب.</p>
      <div class="step-waiting-msg" hidden></div>
      <div class="step-body">
        <div id="qSubList"></div>
        <div class="toolbar">
          <input class="input" id="qNewSub" placeholder="اسم المادة">
          <select class="input" id="qSubMode">
            <option value="final_only" selected>الدرجة النهائية فقط</option>
            <option value="full">سجل درجات كامل</option>
          </select>
          <button class="btn btn-primary" id="qAddSub"><span data-icon="plus"></span>أضف مادة</button>
        </div>
      </div>
    </section>

    <section class="quick-step" data-tour="quick-students" id="qStepStudents">
      <div class="step-head">
        <span class="step-num">٣</span>
        <h4>الطلبة</h4>
        <span class="step-check" data-icon="check" hidden></span>
      </div>
      <p class="step-hint">اكتب اسم الطالب الثلاثي واضغط Enter لإضافته. يحصل كل طالب على رقم امتحاني تلقائياً.</p>
      <div class="step-waiting-msg" hidden></div>
      <div class="step-body">
        <div class="toolbar">
          <input class="input" id="qNewStudent" placeholder="اسم الطالب الثلاثي">
          <button class="btn btn-primary" id="qAddStudent"><span data-icon="plus"></span>إضافة</button>
        </div>
        <div id="qStudentConfirm"></div>
        <div id="qStudentList"></div>
      </div>
    </section>

    <section class="quick-step" data-tour="quick-grades" id="qStepGrades">
      <div class="step-head">
        <span class="step-num">٤</span>
        <h4>الدرجات</h4>
        <span class="step-check" data-icon="check" hidden></span>
      </div>
      <p class="step-hint">اضغط الزر لإدخال درجات طلبة هذه الشعبة — لن تحتاج لاختيار القسم أو المرحلة أو الشعبة مرة أخرى.</p>
      <div class="step-waiting-msg" hidden></div>
      <div class="step-body">
        <button class="btn btn-primary" id="qGoGrades"><span data-icon="grid"></span>إدخال الدرجات</button>
      </div>
    </section>
  </div>`);
  view.appendChild(card);
  injectIcons(card);

  const statusEl = card.querySelector('.status-line');
  const stepWhereEl = card.querySelector('#qStepWhere');
  const stepSubjectsEl = card.querySelector('#qStepSubjects');
  const stepStudentsEl = card.querySelector('#qStepStudents');
  const stepGradesEl = card.querySelector('#qStepGrades');

  let depts = [];
  let stages = [];
  let sections = [];
  let subjects = [];
  let students = [];

  /* ---- generic "pick or create inline" select ---- */
  function makePicker(select, addRow, { placeholder, fetchItems, createItem, onSelect }) {
    const input = addRow.querySelector('input');
    const saveBtn = addRow.querySelector('[data-save]');
    const cancelBtn = addRow.querySelector('[data-cancel]');
    let items = [];

    function renderOptions(selectedId) {
      select.innerHTML = '';
      select.appendChild(el(`<option value="">${placeholder}</option>`));
      for (const it of items) select.appendChild(el(`<option value="${it.id}">${escapeHtml(it.name)}</option>`));
      select.appendChild(el('<option value="__new__">+ إضافة جديد</option>'));
      select.value = selectedId != null ? String(selectedId) : '';
    }

    async function load(preferId) {
      items = await fetchItems();
      select.disabled = false;
      let autoId = null;
      if (preferId != null && items.some(i => i.id === preferId)) autoId = preferId;
      else if (items.length === 1) autoId = items[0].id;
      renderOptions(autoId);
      onSelect(autoId, items);
      return items;
    }

    function reset() {
      items = [];
      select.innerHTML = `<option value="">${placeholder}</option>`;
      select.disabled = true;
      addRow.hidden = true;
      select.hidden = false;
    }

    select.addEventListener('change', () => {
      if (select.value === '__new__') {
        select.hidden = true;
        addRow.hidden = false;
        input.value = '';
        input.focus();
        return;
      }
      onSelect(select.value ? Number(select.value) : null, items);
    });

    saveBtn.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!name) { showToast('اكتب اسماً أولاً', true); return; }
      try {
        const created = await createItem(name);
        showToast('تمت الإضافة');
        addRow.hidden = true;
        select.hidden = false;
        await load(created.id);
      } catch (e) { showToast(friendlyError(e.message), true); }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveBtn.click(); }
    });
    cancelBtn.addEventListener('click', () => {
      addRow.hidden = true;
      select.hidden = false;
      renderOptions(null);
    });

    return {
      load, reset,
      get items() { return items; },
      // Whichever control is actually visible right now — the select, or
      // the inline "add new" text input when that mode is active. Used to
      // aim the real-time visual pointer at something the teacher can see.
      visibleControl() { return addRow.hidden ? select : input; },
    };
  }

  function handleDeptSelected(id) {
    state.deptId = id;
    if (id) {
      stagePicker.load(state.stageId).catch(e => showToast(e.message, true));
    } else {
      state.stageId = null; state.sectionId = null;
      stagePicker.reset(); sectionPicker.reset();
      clearStep2(); clearStep3();
    }
    refreshUI();
  }

  function handleStageSelected(id) {
    state.stageId = id;
    if (id) {
      sectionPicker.load(state.sectionId).catch(e => showToast(e.message, true));
    } else {
      state.sectionId = null;
      sectionPicker.reset();
      clearStep2(); clearStep3();
    }
    refreshUI();
  }

  function handleSectionSelected(id) {
    state.sectionId = id;
    if (id) {
      loadStep2().catch(e => showToast(e.message, true));
      loadStep3().catch(e => showToast(e.message, true));
    } else {
      clearStep2(); clearStep3();
    }
    refreshUI();
  }

  const deptPicker = makePicker(card.querySelector('#qDept'), card.querySelector('#qDeptAdd'), {
    placeholder: 'اختر القسم',
    fetchItems: () => apiCall('GET', '/api/admin/departments').then(r => { depts = r; return r; }),
    createItem: name => apiCall('POST', '/api/admin/departments', { name }),
    onSelect: handleDeptSelected,
  });
  const stagePicker = makePicker(card.querySelector('#qStage'), card.querySelector('#qStageAdd'), {
    placeholder: 'اختر المرحلة',
    fetchItems: () => apiCall('GET', `/api/admin/stages?department_id=${state.deptId}`).then(r => { stages = r; return r; }),
    createItem: name => apiCall('POST', '/api/admin/stages', { name, department_id: state.deptId }),
    onSelect: handleStageSelected,
  });
  const sectionPicker = makePicker(card.querySelector('#qSec'), card.querySelector('#qSecAdd'), {
    placeholder: 'اختر الشعبة',
    fetchItems: () => apiCall('GET', `/api/admin/sections?stage_id=${state.stageId}`).then(r => { sections = r; return r; }),
    createItem: name => apiCall('POST', '/api/admin/sections', { name, stage_id: state.stageId }),
    onSelect: handleSectionSelected,
  });

  /* ---- step 2: subjects ---- */
  function clearStep2() {
    subjects = [];
    const list = stepSubjectsEl.querySelector('#qSubList');
    if (list) list.innerHTML = '';
  }

  function renderSubList() {
    const list = stepSubjectsEl.querySelector('#qSubList');
    list.innerHTML = '';
    if (subjects.length === 0) {
      list.innerHTML = '<p class="muted">لا توجد مواد لهذه المرحلة بعد.</p>';
      return;
    }
    for (const sb of subjects) {
      const modeLabel = sb.grade_mode === 'full' ? 'سجل كامل' : 'الدرجة النهائية فقط';
      const row = el(`<div class="list-row"><span class="grow">${escapeHtml(sb.name)} <span class="muted">(${escapeHtml(modeLabel)})</span></span></div>`);
      list.appendChild(row);
    }
  }

  async function loadStep2() {
    subjects = await apiCall('GET', `/api/admin/subjects?stage_id=${state.stageId}`);
    renderSubList();
    refreshUI();
  }

  card.querySelector('#qAddSub').onclick = async () => {
    const nameInput = card.querySelector('#qNewSub');
    const modeSel = card.querySelector('#qSubMode');
    const name = nameInput.value.trim();
    if (!name) { showToast('اكتب اسم المادة أولاً', true); return; }
    if (!state.stageId) { showToast('اختر المرحلة أولاً', true); return; }
    try {
      await apiCall('POST', '/api/admin/subjects', { name, stage_id: state.stageId, grade_mode: modeSel.value });
      nameInput.value = '';
      showToast('تمت إضافة المادة');
      await loadStep2();
    } catch (e) { showToast(friendlyError(e.message), true); }
  };

  /* ---- step 3: students ---- */
  function clearStep3() {
    students = [];
    const list = stepStudentsEl.querySelector('#qStudentList');
    if (list) list.innerHTML = '';
    const confirmBox = stepStudentsEl.querySelector('#qStudentConfirm');
    if (confirmBox) confirmBox.innerHTML = '';
  }

  function renderStudentList() {
    const list = stepStudentsEl.querySelector('#qStudentList');
    list.innerHTML = '';
    if (students.length === 0) {
      list.innerHTML = '<p class="muted">لم يُضف أي طالب بعد.</p>';
      return;
    }
    for (const st of students) {
      const row = el(`<div class="list-row">
        <span class="grow">${escapeHtml(st.name)} <span class="muted" style="direction:ltr">${escapeHtml(st.exam_number)}</span></span>
        <button class="btn btn-ghost btn-sm copy-btn"><span data-icon="copy"></span>نسخ الرقم</button>
      </div>`);
      injectIcons(row);
      row.querySelector('.copy-btn').onclick = async () => {
        const ok = await copyToClipboard(st.exam_number);
        showToast(ok ? 'تم نسخ الرقم الامتحاني' : 'تعذر النسخ — انسخه يدوياً', !ok);
      };
      list.appendChild(row);
    }
  }

  async function loadStep3() {
    students = await apiCall('GET', `/api/admin/students?section_id=${state.sectionId}`);
    renderStudentList();
    refreshUI();
  }

  async function addStudent() {
    const input = card.querySelector('#qNewStudent');
    const name = input.value.trim();
    if (!name) { showToast('اكتب اسم الطالب أولاً', true); return; }
    if (!state.sectionId) { showToast('اختر الشعبة أولاً', true); return; }
    try {
      const created = await apiCall('POST', '/api/admin/students', { name, section_id: state.sectionId });
      input.value = '';
      input.focus();
      const confirmBox = card.querySelector('#qStudentConfirm');
      confirmBox.innerHTML = '';
      const box = el(`<div class="inline-confirm">
        تمت إضافة الطالب. رقمه الامتحاني: <b style="direction:ltr">${escapeHtml(created.exam_number)}</b>
        <button class="btn btn-ghost btn-sm copy-btn"><span data-icon="copy"></span>نسخ الرقم</button>
      </div>`);
      injectIcons(box);
      box.querySelector('button').onclick = async () => {
        const ok = await copyToClipboard(created.exam_number);
        showToast(ok ? 'تم نسخ الرقم الامتحاني' : 'تعذر النسخ — انسخه يدوياً', !ok);
      };
      confirmBox.appendChild(box);
      await loadStep3();
    } catch (e) { showToast(friendlyError(e.message), true); }
  }
  card.querySelector('#qAddStudent').onclick = addStudent;
  card.querySelector('#qNewStudent').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addStudent(); }
  });

  /* ---- step 4: go to grades, carrying state forward ---- */
  card.querySelector('#qGoGrades').onclick = () => route('grades');

  /* ---- step visual states + always-on status line (R9) ---- */
  function setStepState(stepEl, state_, waitReason) {
    stepEl.dataset.state = state_;
    const waitMsg = stepEl.querySelector('.step-waiting-msg');
    const body = stepEl.querySelector('.step-body');
    const check = stepEl.querySelector('.step-check');
    if (state_ === 'waiting') {
      waitMsg.textContent = waitReason || '';
      waitMsg.hidden = false;
      body.hidden = true;
      check.hidden = true;
    } else {
      waitMsg.hidden = true;
      body.hidden = false;
      check.hidden = state_ !== 'done';
    }
  }

  function updateStepStates() {
    const step1Done = !!(state.deptId && state.stageId && state.sectionId);
    setStepState(stepWhereEl, step1Done ? 'done' : 'active');

    if (!state.stageId) {
      setStepState(stepSubjectsEl, 'waiting', 'اختر القسم والمرحلة أولاً');
    } else {
      setStepState(stepSubjectsEl, subjects.length > 0 ? 'done' : 'active');
    }

    if (!state.sectionId) {
      setStepState(stepStudentsEl, 'waiting', 'اختر الشعبة أولاً');
    } else {
      setStepState(stepStudentsEl, students.length > 0 ? 'done' : 'active');
    }

    if (!state.sectionId) {
      setStepState(stepGradesEl, 'waiting', 'اختر الشعبة أولاً');
    } else if (subjects.length === 0) {
      setStepState(stepGradesEl, 'waiting', 'أضف مادة واحدة على الأقل في الخطوة ٢');
    } else {
      setStepState(stepGradesEl, 'active');
    }
  }

  function computeStatus() {
    if (!state.deptId) return 'اختر القسم أولاً';
    const dept = depts.find(d => d.id === state.deptId);
    if (!state.stageId) return `اخترت: ${dept ? dept.name : ''}. الآن اختر المرحلة.`;
    const stage = stages.find(s => s.id === state.stageId);
    if (!state.sectionId) return `اخترت: ${stage ? stage.name : ''}. الآن اختر الشعبة.`;
    if (subjects.length === 0) return 'القسم والمرحلة والشعبة جاهزة. الآن أضف مادة واحدة على الأقل في الخطوة ٢.';
    if (students.length === 0) return 'جاهز. اكتب اسم الطالب واضغط Enter.';
    return `جاهز — ${arDigits(students.length)} طالب مسجل. اضغط "إدخال الدرجات" في الخطوة ٤ أو أضف طالباً آخر.`;
  }

  // Real-time visual pointer: exactly one control is marked as "do this
  // next" at a time, moving as the teacher progresses. This is separate
  // from — and in addition to — the status-line sentence.
  function pointTo(target) {
    card.querySelectorAll('.next-target').forEach(n => n.classList.remove('next-target'));
    if (target) target.classList.add('next-target');
  }

  function updatePointer() {
    if (!state.deptId) { pointTo(deptPicker.visibleControl()); return; }
    if (!state.stageId) { pointTo(stagePicker.visibleControl()); return; }
    if (!state.sectionId) { pointTo(sectionPicker.visibleControl()); return; }
    if (subjects.length === 0) { pointTo(card.querySelector('#qNewSub')); return; }
    if (students.length === 0) { pointTo(card.querySelector('#qNewStudent')); return; }
    pointTo(card.querySelector('#qGoGrades'));
  }

  function refreshUI() {
    updateStepStates();
    statusEl.textContent = computeStatus();
    updatePointer();
  }

  refreshUI();
  deptPicker.load(state.deptId).catch(e => showToast(e.message, true));
}

/* ===== catalog view: departments -> stages -> sections + subjects ===== */
async function renderCatalogView() {
  view.innerHTML = '';
  const card = el(`<div class="glass-card fade-in">
    <h3 style="margin-bottom:1rem">الأقسام والمراحل والشعب والمواد</h3>
    <div class="grid-2">
      <div>
        <div class="toolbar">
          <input class="input" id="newDept" placeholder="اسم القسم الجديد">
          <button class="btn btn-primary" id="addDept"><span data-icon="plus"></span>إضافة قسم</button>
        </div>
        <div id="deptList"></div>
      </div>
      <div id="detailPane"><p style="color:var(--text-muted)">اختر قسماً لعرض مراحله</p></div>
    </div>
  </div>`);
  view.appendChild(card);
  injectIcons(card);

  async function loadDepts(highlightId) {
    const depts = await apiCall('GET', '/api/admin/departments');
    const list = card.querySelector('#deptList');
    list.innerHTML = '';
    for (const d of depts) {
      const row = el(`<div class="list-row${d.id === state.deptId ? ' selected' : ''}">
        <span class="grow dept-name">${escapeHtml(d.name)}<span class="row-hint">عرض المراحل والشعب ›</span></span>
        <button class="icon-btn" title="تعديل" data-icon="edit"></button>
        <button class="icon-btn danger" title="حذف" data-icon="trash"></button>
      </div>`);
      injectIcons(row);
      row.querySelector('.dept-name').onclick = () => {
        state.deptId = d.id;
        list.querySelectorAll('.list-row').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        loadStages(d);
      };
      row.querySelector('[title="تعديل"]').onclick = () => {
        startInlineRename(row.querySelector('.dept-name'), d.name, {
          onSave: async (name) => {
            await apiCall('PUT', `/api/admin/departments/${d.id}`, { name });
            showToast('تم تعديل الاسم');
            await loadDepts(d.id);
          },
          onCancel: () => loadDepts().catch(e => showToast(e.message, true)),
        });
      };
      row.querySelector('[title="حذف"]').onclick = async () => {
        if (!confirm(`حذف قسم "${d.name}" وكل ما يتبعه من مراحل وشعب وطلبة؟`)) return;
        try { await apiCall('DELETE', `/api/admin/departments/${d.id}`); loadDepts().catch(e => showToast(e.message, true)); }
        catch (e) { showToast(e.message, true); }
      };
      list.appendChild(row);
      if (d.id === highlightId) flashNew(row);
    }
  }

  card.querySelector('#addDept').onclick = async () => {
    const input = card.querySelector('#newDept');
    if (!input.value.trim()) return;
    try {
      const created = await apiCall('POST', '/api/admin/departments', { name: input.value });
      input.value = '';
      showToast('تمت إضافة القسم');
      loadDepts(created.id).catch(e => showToast(e.message, true));
    } catch (e) { showToast(friendlyError(e.message), true); }
  };

  async function loadStages(dept) {
    const pane = card.querySelector('#detailPane');
    pane.innerHTML = '';
    const box = el(`<div>
      <h4 style="margin-bottom:0.8rem">مراحل قسم: ${escapeHtml(dept.name)}</h4>
      <div class="toolbar">
        <input class="input" id="newStage" placeholder="مثال: المرحلة الثالثة">
        <button class="btn btn-primary" id="addStage"><span data-icon="plus"></span>إضافة مرحلة</button>
      </div>
      <div id="stageList"></div>
    </div>`);
    pane.appendChild(box);
    injectIcons(box);

    async function refresh(highlightId) {
      const stages = await apiCall('GET', `/api/admin/stages?department_id=${dept.id}`);
      const list = box.querySelector('#stageList');
      list.innerHTML = '';
      for (const s of stages) {
        const row = el(`<div>
          <div class="list-row">
            <span class="grow">${escapeHtml(s.name)}</span>
            <button class="btn btn-ghost btn-sm" data-act="sections">الشعب</button>
            <button class="btn btn-ghost btn-sm" data-act="subjects">المواد</button>
            <button class="icon-btn danger" title="حذف" data-icon="trash"></button>
          </div>
          <div class="sub-pane" style="padding-inline-start:1rem"></div>
        </div>`);
        injectIcons(row);
        row.querySelector('[title="حذف"]').onclick = async () => {
          if (!confirm(`حذف "${s.name}" وكل ما يتبعه من شعب ومواد وطلبة؟`)) return;
          try { await apiCall('DELETE', `/api/admin/stages/${s.id}`); refresh().catch(e => showToast(e.message, true)); }
          catch (e) { showToast(e.message, true); }
        };
        row.querySelector('[data-act="sections"]').onclick = () => renderSections(s, row.querySelector('.sub-pane'));
        row.querySelector('[data-act="subjects"]').onclick = () => renderSubjects(s, row.querySelector('.sub-pane'));
        list.appendChild(row);
        if (s.id === highlightId) flashNew(row.querySelector('.list-row'));
      }
    }

    box.querySelector('#addStage').onclick = async () => {
      const input = box.querySelector('#newStage');
      if (!input.value.trim()) return;
      try {
        const created = await apiCall('POST', '/api/admin/stages', { name: input.value, department_id: dept.id });
        input.value = '';
        showToast('تمت إضافة المرحلة');
        refresh(created.id).catch(e => showToast(e.message, true));
      } catch (e) { showToast(friendlyError(e.message), true); }
    };
    refresh().catch(e => showToast(e.message, true));
  }

  async function renderSections(stage, pane) {
    pane.innerHTML = '';
    const box = el(`<div class="glass-card" style="padding:1rem;margin:0.5rem 0">
      <div class="toolbar">
        <input class="input" id="newSec" placeholder="مثال: شعبة أ">
        <button class="btn btn-primary" id="addSec"><span data-icon="plus"></span>إضافة شعبة</button>
      </div>
      <div id="secList"></div>
    </div>`);
    pane.appendChild(box);
    injectIcons(box);
    async function refresh(highlightId) {
      const secs = await apiCall('GET', `/api/admin/sections?stage_id=${stage.id}`);
      const list = box.querySelector('#secList');
      list.innerHTML = '';
      for (const sc of secs) {
        const row = el(`<div class="list-row"><span class="grow">${escapeHtml(sc.name)}</span>
          <button class="icon-btn danger" title="حذف" data-icon="trash"></button></div>`);
        injectIcons(row);
        row.querySelector('[title="حذف"]').onclick = async () => {
          if (!confirm(`حذف "${sc.name}" وكل طلبتها؟`)) return;
          try { await apiCall('DELETE', `/api/admin/sections/${sc.id}`); refresh().catch(e => showToast(e.message, true)); }
          catch (e) { showToast(e.message, true); }
        };
        list.appendChild(row);
        if (sc.id === highlightId) flashNew(row);
      }
    }
    box.querySelector('#addSec').onclick = async () => {
      const input = box.querySelector('#newSec');
      if (!input.value.trim()) return;
      try {
        const created = await apiCall('POST', '/api/admin/sections', { name: input.value, stage_id: stage.id });
        input.value = '';
        showToast('تمت إضافة الشعبة');
        refresh(created.id).catch(e => showToast(e.message, true));
      } catch (e) { showToast(friendlyError(e.message), true); }
    };
    refresh().catch(e => showToast(e.message, true));
  }

  async function renderSubjects(stage, pane) {
    pane.innerHTML = '';
    const box = el(`<div class="glass-card" style="padding:1rem;margin:0.5rem 0">
      <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:0.6rem">
        المواد هنا تنطبق تلقائياً على جميع طلبة هذه المرحلة — لا حاجة لإعادة إدخالها لكل طالب.
      </p>
      <div class="toolbar">
        <input class="input" id="newSub" placeholder="اسم المادة">
        <select class="input" id="subMode">
          <option value="full">سجل درجات كامل</option>
          <option value="final_only">الدرجة النهائية فقط</option>
        </select>
        <button class="btn btn-primary" id="addSub"><span data-icon="plus"></span>إضافة مادة</button>
      </div>
      <div id="subList"></div>
    </div>`);
    pane.appendChild(box);
    injectIcons(box);
    async function refresh(highlightId) {
      const subs = await apiCall('GET', `/api/admin/subjects?stage_id=${stage.id}`);
      const list = box.querySelector('#subList');
      list.innerHTML = '';
      for (const sb of subs) {
        const modeLabel = sb.grade_mode === 'full' ? 'سجل كامل' : 'نهائية فقط';
        const row = el(`<div class="list-row">
          <span class="grow">${escapeHtml(sb.name)} <span class="muted">(${escapeHtml(modeLabel)})</span></span>
          <button class="icon-btn" title="تبديل النوع" data-icon="edit"></button>
          <button class="icon-btn danger" title="حذف" data-icon="trash"></button>
        </div>`);
        injectIcons(row);
        row.querySelector('[title="تبديل النوع"]').onclick = async () => {
          const newMode = sb.grade_mode === 'full' ? 'final_only' : 'full';
          const msg = newMode === 'final_only'
            ? `تبديل "${sb.name}" إلى الدرجة النهائية فقط سيخفي بقية أعمدة الدرجات لهذه المادة. هل تريد المتابعة؟`
            : `تبديل "${sb.name}" إلى سجل الدرجات الكامل سيظهر بقية أعمدة الدرجات لهذه المادة. هل تريد المتابعة؟`;
          if (!confirm(msg)) return;
          try { await apiCall('PUT', `/api/admin/subjects/${sb.id}`, { name: sb.name, grade_mode: newMode, sort_order: sb.sort_order }); refresh().catch(e => showToast(e.message, true)); }
          catch (e) { showToast(e.message, true); }
        };
        row.querySelector('[title="حذف"]').onclick = async () => {
          if (!confirm(`حذف مادة "${sb.name}" ودرجاتها؟`)) return;
          try { await apiCall('DELETE', `/api/admin/subjects/${sb.id}`); refresh().catch(e => showToast(e.message, true)); }
          catch (e) { showToast(e.message, true); }
        };
        list.appendChild(row);
        if (sb.id === highlightId) flashNew(row);
      }
    }
    box.querySelector('#addSub').onclick = async () => {
      const name = box.querySelector('#newSub');
      const mode = box.querySelector('#subMode').value;
      if (!name.value.trim()) return;
      try {
        const created = await apiCall('POST', '/api/admin/subjects', { name: name.value, stage_id: stage.id, grade_mode: mode });
        name.value = '';
        showToast('تمت إضافة المادة');
        refresh(created.id).catch(e => showToast(e.message, true));
      } catch (e) { showToast(friendlyError(e.message), true); }
    };
    refresh().catch(e => showToast(e.message, true));
  }

  loadDepts().catch(e => showToast(e.message, true));
}

/* ===== students view ===== */
async function renderStudentsView() {
  view.innerHTML = '';
  const card = el(`<div class="glass-card fade-in">
    <h3 style="margin-bottom:1rem">إدارة الطلبة</h3>
    <div class="toolbar">
      <select class="input" id="deptSel"><option value="">اختر القسم</option></select>
      <select class="input" id="stageSel" disabled><option value="">اختر المرحلة</option></select>
      <select class="input" id="secSel" disabled><option value="">اختر الشعبة</option></select>
    </div>
    <div class="toolbar" id="addBar" hidden>
      <input class="input" id="newStudent" placeholder="اسم الطالب الثلاثي">
      <button class="btn btn-primary" id="addStudent"><span data-icon="plus"></span>إضافة طالب</button>
    </div>
    <div id="studentList"></div>
  </div>`);
  view.appendChild(card);
  injectIcons(card);

  const deptSel = card.querySelector('#deptSel');
  const stageSel = card.querySelector('#stageSel');
  const secSel = card.querySelector('#secSel');
  const addBar = card.querySelector('#addBar');

  const depts = await apiCall('GET', '/api/admin/departments');
  for (const d of depts) deptSel.appendChild(el(`<option value="${d.id}">${escapeHtml(d.name)}</option>`));

  deptSel.onchange = async () => {
    stageSel.innerHTML = '<option value="">اختر المرحلة</option>';
    secSel.innerHTML = '<option value="">اختر الشعبة</option>';
    secSel.disabled = true; addBar.hidden = true;
    card.querySelector('#studentList').innerHTML = '';
    if (!deptSel.value) { stageSel.disabled = true; return; }
    try {
      const stages = await apiCall('GET', `/api/admin/stages?department_id=${deptSel.value}`);
      for (const s of stages) stageSel.appendChild(el(`<option value="${s.id}">${escapeHtml(s.name)}</option>`));
      stageSel.disabled = false;
    } catch (e) { showToast(e.message, true); }
  };

  stageSel.onchange = async () => {
    secSel.innerHTML = '<option value="">اختر الشعبة</option>';
    addBar.hidden = true;
    card.querySelector('#studentList').innerHTML = '';
    if (!stageSel.value) { secSel.disabled = true; return; }
    try {
      const secs = await apiCall('GET', `/api/admin/sections?stage_id=${stageSel.value}`);
      for (const s of secs) secSel.appendChild(el(`<option value="${s.id}">${escapeHtml(s.name)}</option>`));
      secSel.disabled = false;
    } catch (e) { showToast(e.message, true); }
  };

  secSel.onchange = () => {
    addBar.hidden = !secSel.value;
    if (secSel.value) loadStudents().catch(e => showToast(e.message, true));
  };

  async function loadStudents(highlightId) {
    const students = await apiCall('GET', `/api/admin/students?section_id=${secSel.value}`);
    const list = card.querySelector('#studentList');
    list.innerHTML = '';
    if (students.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted)">لا يوجد طلبة في هذه الشعبة بعد</p>';
      return;
    }
    for (const st of students) {
      const row = el(`<div class="list-row">
        <span class="grow student-name">${escapeHtml(st.name)}
          <span class="muted">الرقم الامتحاني: <b style="direction:ltr;display:inline-block">${escapeHtml(st.exam_number)}</b></span>
        </span>
        <button class="icon-btn" title="تعديل" data-icon="edit"></button>
        <button class="icon-btn danger" title="حذف" data-icon="trash"></button>
      </div>`);
      injectIcons(row);
      row.querySelector('[title="تعديل"]').onclick = () => {
        startInlineRename(row.querySelector('.student-name'), st.name, {
          onSave: async (name) => {
            await apiCall('PUT', `/api/admin/students/${st.id}`, { name, section_id: st.section_id });
            showToast('تم تعديل الاسم');
            await loadStudents();
          },
          onCancel: () => loadStudents().catch(e => showToast(e.message, true)),
        });
      };
      row.querySelector('[title="حذف"]').onclick = async () => {
        if (!confirm(`حذف الطالب "${st.name}" ودرجاته؟`)) return;
        try { await apiCall('DELETE', `/api/admin/students/${st.id}`); loadStudents().catch(e => showToast(e.message, true)); }
        catch (e) { showToast(e.message, true); }
      };
      list.appendChild(row);
      if (st.id === highlightId) flashNew(row);
    }
  }

  card.querySelector('#addStudent').onclick = async () => {
    const input = card.querySelector('#newStudent');
    if (!input.value.trim()) return;
    try {
      const created = await apiCall('POST', '/api/admin/students', { name: input.value, section_id: Number(secSel.value) });
      input.value = '';
      showToast(`تمت الإضافة — الرقم الامتحاني: ${created.exam_number}`);
      loadStudents(created.id).catch(e => showToast(e.message, true));
    } catch (e) { showToast(friendlyError(e.message), true); }
  };
}

/* ===== grades view ===== */
const GRADE_COLS = [
  ['first_term_avg', 'معدل النصف الأول'],
  ['midyear', 'درجة نصف السنة'],
  ['second_term_avg', 'معدل النصف الثاني'],
  ['annual_effort', 'معدل السعي السنوي'],
  ['final_exam', 'درجة الامتحان النهائي'],
  ['final_grade', 'الدرجة النهائية'],
];

// Set true while the grades grid has unsaved edits; checked by route() and
// beforeunload so a teacher is warned before losing work — a real data-loss
// bug once already (see plan v2 Task 4).
let gradesDirty = false;

async function renderGradesView() {
  view.innerHTML = '';
  const card = el(`<div class="glass-card fade-in">
    <h3 style="margin-bottom:0.6rem">إدخال الدرجات</h3>
    <p class="status-line" id="gStatusLine"></p>
    <div class="toolbar">
      <select class="input" id="gDept"><option value="">القسم</option></select>
      <select class="input" id="gStage" disabled><option value="">المرحلة</option></select>
      <select class="input" id="gSec" disabled><option value="">الشعبة</option></select>
      <select class="input" id="gSub" disabled><option value="">المادة</option></select>
    </div>
    <div id="gridWrap"></div>
  </div>`);
  view.appendChild(card);
  injectIcons(card);

  const gDept = card.querySelector('#gDept');
  const gStage = card.querySelector('#gStage');
  const gSec = card.querySelector('#gSec');
  const gSub = card.querySelector('#gSub');
  const statusLine = card.querySelector('#gStatusLine');
  const gridWrap = card.querySelector('#gridWrap');
  let subjects = [];
  let currentMode = null;
  let gridCounts = { total: 0, filled: 0 };
  gradesDirty = false;

  function selectedText(select) {
    const opt = select.options[select.selectedIndex];
    return opt ? opt.textContent : '';
  }

  // Real-time visual pointer, same pattern as the quick view: exactly one
  // control marked as "do this next", moving as the teacher progresses.
  function updatePointer() {
    const mark = (elm) => {
      card.querySelectorAll('.next-target').forEach(n => n.classList.remove('next-target'));
      if (elm) elm.classList.add('next-target');
    };
    if (!gDept.value) { mark(gDept); return; }
    if (!gStage.value) { mark(gStage); return; }
    if (!gSec.value) { mark(gSec); return; }
    if (!gSub.value) { mark(gSub); return; }
    if (currentMode === 'final_only') {
      const nextEmpty = [...gridWrap.querySelectorAll('input.fo-grade')].find(i => i.value === '');
      mark(nextEmpty || gridWrap.querySelector('#gFoSave'));
      return;
    }
    mark(null);
  }

  function updateStatus() {
    if (gradesDirty) { statusLine.textContent = 'فيه تغييرات غير محفوظة — اضغط حفظ'; updatePointer(); return; }
    if (!gDept.value) { statusLine.textContent = 'اختر القسم أولاً'; updatePointer(); return; }
    if (!gStage.value) { statusLine.textContent = `اخترت: ${selectedText(gDept)}. الآن اختر المرحلة.`; updatePointer(); return; }
    if (!gSec.value) { statusLine.textContent = `اخترت: ${selectedText(gStage)}. الآن اختر الشعبة.`; updatePointer(); return; }
    if (!gSub.value) { statusLine.textContent = 'اخترت الشعبة. الآن اختر المادة.'; updatePointer(); return; }
    if (currentMode === 'final_only') {
      const remaining = gridCounts.total - gridCounts.filled;
      statusLine.textContent = remaining === 0
        ? 'تم إدخال درجات جميع الطلبة. اضغط حفظ.'
        : `أدخل الدرجة النهائية لكل طالب، ثم اضغط حفظ — بقي ${arDigits(remaining)} من ${arDigits(gridCounts.total)}.`;
      updatePointer();
      return;
    }
    statusLine.textContent = 'أدخل الدرجات ثم اضغط حفظ.';
    updatePointer();
  }
  updateStatus();

  function confirmDiscard() {
    if (!gradesDirty) return true;
    const ok = confirm('فيه تغييرات غير محفوظة في الدرجات. هل تريد المتابعة دون حفظ؟');
    if (ok) gradesDirty = false;
    return ok;
  }

  for (const d of await apiCall('GET', '/api/admin/departments')) {
    gDept.appendChild(el(`<option value="${d.id}">${escapeHtml(d.name)}</option>`));
  }

  async function loadStages() {
    gStage.innerHTML = '<option value="">المرحلة</option>'; gSec.innerHTML = '<option value="">الشعبة</option>'; gSub.innerHTML = '<option value="">المادة</option>';
    gSec.disabled = gSub.disabled = true; gridWrap.innerHTML = '';
    if (!gDept.value) { gStage.disabled = true; updateStatus(); return; }
    for (const s of await apiCall('GET', `/api/admin/stages?department_id=${gDept.value}`)) {
      gStage.appendChild(el(`<option value="${s.id}">${escapeHtml(s.name)}</option>`));
    }
    gStage.disabled = false;
    updateStatus();
  }

  async function loadSections() {
    gSec.innerHTML = '<option value="">الشعبة</option>'; gSub.innerHTML = '<option value="">المادة</option>';
    gSub.disabled = true; gridWrap.innerHTML = '';
    if (!gStage.value) { gSec.disabled = true; updateStatus(); return; }
    for (const s of await apiCall('GET', `/api/admin/sections?stage_id=${gStage.value}`)) {
      gSec.appendChild(el(`<option value="${s.id}">${escapeHtml(s.name)}</option>`));
    }
    subjects = await apiCall('GET', `/api/admin/subjects?stage_id=${gStage.value}`);
    gSec.disabled = false;
    updateStatus();
  }

  function loadSubjectsIntoSelect() {
    gSub.innerHTML = '<option value="">المادة</option>';
    gridWrap.innerHTML = '';
    if (!gSec.value) { gSub.disabled = true; updateStatus(); return; }
    for (const s of subjects) {
      gSub.appendChild(el(`<option value="${s.id}">${escapeHtml(s.name)}</option>`));
    }
    gSub.disabled = false;
    if (subjects.length === 1) {
      gSub.value = String(subjects[0].id);
      gSub.dataset.prev = gSub.value;
      loadGrid().catch(e => showToast(e.message, true));
    } else {
      updateStatus();
    }
  }

  gDept.onchange = async () => {
    if (!confirmDiscard()) { gDept.value = gDept.dataset.prev || ''; return; }
    gDept.dataset.prev = gDept.value;
    try { await loadStages(); } catch (e) { showToast(e.message, true); }
  };
  gStage.onchange = async () => {
    if (!confirmDiscard()) { gStage.value = gStage.dataset.prev || ''; return; }
    gStage.dataset.prev = gStage.value;
    try { await loadSections(); } catch (e) { showToast(e.message, true); }
  };
  gSec.onchange = () => {
    if (!confirmDiscard()) { gSec.value = gSec.dataset.prev || ''; return; }
    gSec.dataset.prev = gSec.value;
    loadSubjectsIntoSelect();
  };
  gSub.onchange = () => {
    if (!confirmDiscard()) { gSub.value = gSub.dataset.prev || ''; return; }
    gSub.dataset.prev = gSub.value;
    if (gSub.value) loadGrid().catch(e => showToast(e.message, true));
    else { gridWrap.innerHTML = ''; updateStatus(); }
  };

  async function loadGrid() {
    gradesDirty = false;
    const subject = subjects.find(s => s.id === Number(gSub.value));
    currentMode = subject.grade_mode;
    const rows = await apiCall('GET', `/api/admin/grades?section_id=${gSec.value}&subject_id=${gSub.value}`);
    gridWrap.innerHTML = '';
    if (rows.length === 0) { gridWrap.innerHTML = '<p style="color:var(--text-muted)">لا يوجد طلبة في هذه الشعبة</p>'; updateStatus(); return; }

    if (currentMode === 'final_only') renderFinalOnlyGrid(rows);
    else renderFullGrid(rows);
    updateStatus();
  }

  /* ---- full grid: unchanged six-column behavior (auto-compute, keyboard nav) ---- */
  function renderFullGrid(rows) {
    const cols = GRADE_COLS;
    const box = el(`<div>
      <p class="grade-rule-hint">كل الدرجات من ٠ إلى ١٠٠</p>
      <div class="table-wrap"><table class="grades">
        <thead><tr><th>الطالب</th>${cols.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead>
        <tbody></tbody>
      </table></div>
    </div>`);
    const tbody = box.querySelector('tbody');

    for (const r of rows) {
      const tr = el(`<tr data-student="${r.student_id}">
        <td class="subject-name">${escapeHtml(r.student_name)}<br><span class="muted" style="direction:ltr">${escapeHtml(r.exam_number)}</span></td>
        ${cols.map(([k]) => {
          const isManual = ['annual_effort', 'final_grade'].includes(k) && r[k] !== null && r[k] !== undefined && r[k] !== '';
          return `<td><input class="input" data-field="${k}" inputmode="numeric" value="${r[k] ?? ''}"${isManual ? ' data-manual="1"' : ''}></td>`;
        }).join('')}
      </tr>`);
      tbody.appendChild(tr);
    }
    gridWrap.appendChild(box);

    const saveBtn = el(`<button class="btn btn-primary" style="margin-top:1rem"><span data-icon="save"></span>حفظ الدرجات</button>`);
    injectIcons(saveBtn);
    gridWrap.appendChild(saveBtn);

    // numeric guard + auto-compute + keyboard navigation
    box.querySelectorAll('input[data-field]').forEach(input => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
        if (parseFloat(input.value) > 100) input.value = '100';
        if (['annual_effort', 'final_grade'].includes(input.dataset.field)) input.dataset.manual = '1';
        autoCompute(input.closest('tr'));
        gradesDirty = true;
        updateStatus();
      });
      input.addEventListener('keydown', e => {
        if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
        e.preventDefault();
        const tr = input.closest('tr');
        const target = (e.key === 'ArrowUp') ? tr.previousElementSibling : tr.nextElementSibling;
        if (target) {
          const next = target.querySelector(`input[data-field="${input.dataset.field}"]`);
          if (next) { next.focus(); next.select(); }
        }
      });
    });

    function autoCompute(tr) {
      const get = f => { const i = tr.querySelector(`[data-field="${f}"]`); return i && i.value !== '' ? parseFloat(i.value) : null; };
      const set = (f, v) => {
        const i = tr.querySelector(`[data-field="${f}"]`);
        if (i && i.dataset.manual !== '1') i.value = v;
      };
      const t1 = get('first_term_avg'), mid = get('midyear'), t2 = get('second_term_avg');
      if (t1 !== null && mid !== null && t2 !== null) set('annual_effort', Math.round((t1 + mid + t2) / 3));
      const eff = get('annual_effort'), fin = get('final_exam');
      if (eff !== null && fin !== null) set('final_grade', Math.round((eff + fin) / 2));
    }

    saveBtn.onclick = async () => {
      const entries = [...tbody.querySelectorAll('tr')].map(tr => {
        const entry = { student_id: Number(tr.dataset.student) };
        for (const [k] of cols) {
          const i = tr.querySelector(`[data-field="${k}"]`);
          entry[k] = i.value !== '' ? parseFloat(i.value) : null;
        }
        return entry;
      });
      try {
        const r = await apiCall('PUT', '/api/admin/grades', { subject_id: Number(gSub.value), entries });
        gradesDirty = false;
        showToast(`تم حفظ درجات ${r.saved} طالب`);
        updateStatus();
      } catch (e) { showToast(e.message, true); }
    };
  }

  /* ---- final-only grid: one number box per student — the easiest path, per R5 ----
     IMPORTANT: entries sent to PUT /api/admin/grades only ever carry the
     `final_grade` key. The backend only overwrites fields present in the
     payload (see gradesRouter's has_<field> pattern), so the five detail
     columns for subjects that have them are never nulled out by a save here. */
  function renderFinalOnlyGrid(rows) {
    const wrap = el(`<div>
      <p class="grades-count" id="gCount"></p>
      <div class="fo-list"></div>
      <button class="btn btn-primary" id="gFoSave"><span data-icon="save"></span>حفظ</button>
    </div>`);
    injectIcons(wrap);
    const list = wrap.querySelector('.fo-list');
    const countEl = wrap.querySelector('#gCount');

    function updateCount() {
      const inputs = [...list.querySelectorAll('input.fo-grade')];
      gridCounts.total = inputs.length;
      gridCounts.filled = inputs.filter(i => i.value !== '').length;
      countEl.textContent = `تم إدخال ${arDigits(gridCounts.filled)} من ${arDigits(gridCounts.total)}`;
    }

    for (const r of rows) {
      // Pre-loaded non-null final_grade values carry data-manual="1" so a
      // later switch back to 'full' mode never lets auto-compute silently
      // overwrite what a teacher already saved here.
      const isManual = r.final_grade !== null && r.final_grade !== undefined && r.final_grade !== '';
      const row = el(`<div class="fo-row" data-student="${r.student_id}">
        <span class="fo-name">${escapeHtml(r.student_name)} <span class="muted" style="direction:ltr">${escapeHtml(r.exam_number)}</span></span>
        <span class="fo-grade-wrap">
          <input class="input fo-grade" data-field="final_grade" inputmode="numeric" value="${r.final_grade ?? ''}"${isManual ? ' data-manual="1"' : ''}>
          <small>من ٠ إلى ١٠٠</small>
        </span>
      </div>`);
      list.appendChild(row);
    }
    gridWrap.appendChild(wrap);
    updateCount();

    list.querySelectorAll('input.fo-grade').forEach(input => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
        if (parseFloat(input.value) > 100) input.value = '100';
        input.dataset.manual = '1';
        gradesDirty = true;
        updateCount();
        updateStatus();
      });
      input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const row = input.closest('.fo-row');
        const next = row.nextElementSibling;
        if (next) {
          const ni = next.querySelector('input.fo-grade');
          if (ni) { ni.focus(); ni.select(); }
        } else {
          input.blur();
        }
      });
    });

    wrap.querySelector('#gFoSave').onclick = async () => {
      // Only `final_grade` is ever included per entry — the five detail
      // columns are omitted entirely, not sent as null, so the backend's
      // has_<field> guard leaves any existing detail values untouched.
      const entries = [...list.querySelectorAll('.fo-row')].map(row => {
        const input = row.querySelector('input.fo-grade');
        return {
          student_id: Number(row.dataset.student),
          final_grade: input.value !== '' ? parseFloat(input.value) : null,
        };
      });
      try {
        const r = await apiCall('PUT', '/api/admin/grades', { subject_id: Number(gSub.value), entries });
        gradesDirty = false;
        showToast(`تم حفظ درجات ${r.saved} طالب`);
        updateStatus();
      } catch (e) { showToast(e.message, true); }
    };
  }

  /* ---- carry department/stage/section forward from the quick view or a
     previous grades session — a teacher must never re-pick them here ---- */
  if (state.deptId) {
    gDept.value = String(state.deptId);
    if (gDept.value === String(state.deptId)) {
      gDept.dataset.prev = gDept.value;
      await loadStages().catch(e => showToast(e.message, true));
      if (state.stageId) {
        gStage.value = String(state.stageId);
        if (gStage.value === String(state.stageId)) {
          gStage.dataset.prev = gStage.value;
          await loadSections().catch(e => showToast(e.message, true));
          if (state.sectionId) {
            gSec.value = String(state.sectionId);
            if (gSec.value === String(state.sectionId)) {
              gSec.dataset.prev = gSec.value;
              loadSubjectsIntoSelect();
            }
          }
        }
      }
    }
  }
}

/* ===== password view ===== */
async function renderPasswordView() {
  view.innerHTML = '';
  const card = el(`<div class="glass-card fade-in" style="max-width:420px">
    <h3 style="margin-bottom:1rem">تغيير كلمة المرور</h3>
    <div class="field-group" style="display:flex;flex-direction:column;gap:0.8rem">
      <input class="input" type="password" id="curPass" placeholder="كلمة المرور الحالية">
      <input class="input" type="password" id="newPass" placeholder="كلمة المرور الجديدة">
      <input class="input" type="password" id="confPass" placeholder="تأكيد كلمة المرور الجديدة">
      <button class="btn btn-primary" id="savePass"><span data-icon="save"></span>حفظ</button>
    </div>
  </div>`);
  view.appendChild(card);
  injectIcons(card);

  const curPass = card.querySelector('#curPass');
  const newPass = card.querySelector('#newPass');
  const confPass = card.querySelector('#confPass');

  card.querySelector('#savePass').onclick = async () => {
    if (newPass.value !== confPass.value) {
      showToast('كلمتا المرور غير متطابقتين', true);
      return;
    }
    if (newPass.value.length < 8) {
      showToast('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل', true);
      return;
    }
    try {
      await apiCall('POST', '/api/admin/password', { current_password: curPass.value, new_password: newPass.value });
      showToast('تم تغيير كلمة المرور');
      curPass.value = ''; newPass.value = ''; confPass.value = '';
    } catch (e) { showToast(e.message, true); }
  };
}

/* ===== router ===== */
const routes = { quick: renderQuickView };
routes.catalog = renderCatalogView;
routes.students = renderStudentsView;
routes.grades = renderGradesView;
routes.password = renderPasswordView;

function route(name) {
  if (gradesDirty) {
    if (!confirm('فيه تغييرات غير محفوظة في الدرجات. هل تريد المغادرة دون حفظ؟')) return;
    gradesDirty = false;
  }
  document.querySelectorAll('.nav-btn[data-route]').forEach(b =>
    b.classList.toggle('active', b.dataset.route === name));
  Promise.resolve((routes[name] || renderQuickView)())
    .catch(e => showToast(e.message, true));
}

document.querySelectorAll('.nav-btn[data-route]').forEach(b =>
  b.addEventListener('click', () => route(b.dataset.route)));

document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (gradesDirty && !confirm('فيه تغييرات غير محفوظة في الدرجات. هل تريد تسجيل الخروج دون حفظ؟')) return;
  try {
    await apiCall('POST', '/api/admin/logout');
    location.href = '/admin-login.html';
  } catch (e) {
    showToast(e.message, true);
  }
});

window.addEventListener('beforeunload', (e) => {
  if (!gradesDirty) return;
  e.preventDefault();
  e.returnValue = '';
});

injectIcons();
apiCall('GET', '/api/admin/me').then(() => route('quick')).catch(() => {});
