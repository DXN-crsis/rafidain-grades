/* ===== helpers ===== */
async function apiCall(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) { location.href = '/admin-login.html'; throw new Error('unauthorized'); }
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

const view = document.getElementById('view');

/* ===== state shared across views ===== */
const state = { deptId: null, stageId: null, sectionId: null, subjectId: null };

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

  async function loadDepts() {
    const depts = await apiCall('GET', '/api/admin/departments');
    const list = card.querySelector('#deptList');
    list.innerHTML = '';
    for (const d of depts) {
      const row = el(`<div class="list-row">
        <span class="grow" style="cursor:pointer">${escapeHtml(d.name)}</span>
        <button class="icon-btn" title="تعديل" data-icon="edit"></button>
        <button class="icon-btn danger" title="حذف" data-icon="trash"></button>
      </div>`);
      injectIcons(row);
      row.querySelector('.grow').onclick = () => { state.deptId = d.id; loadStages(d); };
      row.querySelector('[title="تعديل"]').onclick = async () => {
        const name = prompt('الاسم الجديد للقسم:', d.name);
        if (!name) return;
        try { await apiCall('PUT', `/api/admin/departments/${d.id}`, { name }); loadDepts().catch(e => showToast(e.message, true)); }
        catch (e) { showToast(e.message, true); }
      };
      row.querySelector('[title="حذف"]').onclick = async () => {
        if (!confirm(`حذف قسم "${d.name}" وكل ما يتبعه من مراحل وشعب وطلبة؟`)) return;
        try { await apiCall('DELETE', `/api/admin/departments/${d.id}`); loadDepts().catch(e => showToast(e.message, true)); }
        catch (e) { showToast(e.message, true); }
      };
      list.appendChild(row);
    }
  }

  card.querySelector('#addDept').onclick = async () => {
    const input = card.querySelector('#newDept');
    if (!input.value.trim()) return;
    try { await apiCall('POST', '/api/admin/departments', { name: input.value }); input.value = ''; loadDepts().catch(e => showToast(e.message, true)); showToast('تمت إضافة القسم'); }
    catch (e) { showToast(e.message, true); }
  };

  async function loadStages(dept) {
    const pane = card.querySelector('#detailPane');
    pane.innerHTML = '';
    const box = el(`<div>
      <h4 style="margin-bottom:0.8rem">مراحل قسم ${escapeHtml(dept.name)}</h4>
      <div class="toolbar">
        <input class="input" id="newStage" placeholder="مثال: المرحلة الثالثة">
        <button class="btn btn-primary" id="addStage"><span data-icon="plus"></span>إضافة مرحلة</button>
      </div>
      <div id="stageList"></div>
    </div>`);
    pane.appendChild(box);
    injectIcons(box);

    async function refresh() {
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
      }
    }

    box.querySelector('#addStage').onclick = async () => {
      const input = box.querySelector('#newStage');
      if (!input.value.trim()) return;
      try { await apiCall('POST', '/api/admin/stages', { name: input.value, department_id: dept.id }); input.value = ''; refresh().catch(e => showToast(e.message, true)); }
      catch (e) { showToast(e.message, true); }
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
    async function refresh() {
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
      }
    }
    box.querySelector('#addSec').onclick = async () => {
      const input = box.querySelector('#newSec');
      if (!input.value.trim()) return;
      try { await apiCall('POST', '/api/admin/sections', { name: input.value, stage_id: stage.id }); input.value = ''; refresh().catch(e => showToast(e.message, true)); }
      catch (e) { showToast(e.message, true); }
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
    async function refresh() {
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
          try { await apiCall('PUT', `/api/admin/subjects/${sb.id}`, { name: sb.name, grade_mode: newMode, sort_order: sb.sort_order }); refresh().catch(e => showToast(e.message, true)); }
          catch (e) { showToast(e.message, true); }
        };
        row.querySelector('[title="حذف"]').onclick = async () => {
          if (!confirm(`حذف مادة "${sb.name}" ودرجاتها؟`)) return;
          try { await apiCall('DELETE', `/api/admin/subjects/${sb.id}`); refresh().catch(e => showToast(e.message, true)); }
          catch (e) { showToast(e.message, true); }
        };
        list.appendChild(row);
      }
    }
    box.querySelector('#addSub').onclick = async () => {
      const name = box.querySelector('#newSub');
      const mode = box.querySelector('#subMode').value;
      if (!name.value.trim()) return;
      try { await apiCall('POST', '/api/admin/subjects', { name: name.value, stage_id: stage.id, grade_mode: mode }); name.value = ''; refresh().catch(e => showToast(e.message, true)); showToast('تمت إضافة المادة'); }
      catch (e) { showToast(e.message, true); }
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

  async function loadStudents() {
    const students = await apiCall('GET', `/api/admin/students?section_id=${secSel.value}`);
    const list = card.querySelector('#studentList');
    list.innerHTML = '';
    if (students.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted)">لا يوجد طلبة في هذه الشعبة بعد</p>';
      return;
    }
    for (const st of students) {
      const row = el(`<div class="list-row">
        <span class="grow">${escapeHtml(st.name)}
          <span class="muted">الرقم الامتحاني: <b style="direction:ltr;display:inline-block">${escapeHtml(st.exam_number)}</b></span>
        </span>
        <button class="icon-btn" title="تعديل" data-icon="edit"></button>
        <button class="icon-btn danger" title="حذف" data-icon="trash"></button>
      </div>`);
      injectIcons(row);
      row.querySelector('[title="تعديل"]').onclick = async () => {
        const name = prompt('الاسم الجديد:', st.name);
        if (!name) return;
        try { await apiCall('PUT', `/api/admin/students/${st.id}`, { name, section_id: st.section_id }); loadStudents().catch(e => showToast(e.message, true)); }
        catch (e) { showToast(e.message, true); }
      };
      row.querySelector('[title="حذف"]').onclick = async () => {
        if (!confirm(`حذف الطالب "${st.name}" ودرجاته؟`)) return;
        try { await apiCall('DELETE', `/api/admin/students/${st.id}`); loadStudents().catch(e => showToast(e.message, true)); }
        catch (e) { showToast(e.message, true); }
      };
      list.appendChild(row);
    }
  }

  card.querySelector('#addStudent').onclick = async () => {
    const input = card.querySelector('#newStudent');
    if (!input.value.trim()) return;
    try {
      const created = await apiCall('POST', '/api/admin/students', { name: input.value, section_id: Number(secSel.value) });
      input.value = '';
      showToast(`تمت الإضافة — الرقم الامتحاني: ${created.exam_number}`);
      loadStudents().catch(e => showToast(e.message, true));
    } catch (e) { showToast(e.message, true); }
  };
}

/* ===== router ===== */
const routes = { catalog: renderCatalogView };
routes.students = renderStudentsView;
// grades view is registered by a later task:
// routes.grades = renderGradesView;

function route(name) {
  document.querySelectorAll('.nav-btn[data-route]').forEach(b =>
    b.classList.toggle('active', b.dataset.route === name));
  Promise.resolve((routes[name] || renderCatalogView)())
    .catch(e => showToast(e.message, true));
}

document.querySelectorAll('.nav-btn[data-route]').forEach(b =>
  b.addEventListener('click', () => route(b.dataset.route)));

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await apiCall('POST', '/api/admin/logout');
    location.href = '/admin-login.html';
  } catch (e) {
    showToast(e.message, true);
  }
});

injectIcons();
apiCall('GET', '/api/admin/me').then(() => route('catalog')).catch(() => {});
