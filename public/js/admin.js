/* ==========================================================================
   لوحة إدارة النتائج — v4
   بنية الشيفرة: مساعدات عامة ثم شاشة لكل دالة render ثم الموجّه والتمهيد.
   قواعد ثابتة:
   - كل نص قادم من قاعدة البيانات يمر عبر escapeHtml قبل أي innerHTML.
   - لا window.prompt ولا alert ولا confirm — كل التأكيدات عناصر مضمّنة.
   - كل فشل شبكة يعرض جملة عربية واحدة موحدة (NET_ERR).
   - مؤشر «التالي» (.next-target) على عنصر واحد فقط في أي لحظة.
   ========================================================================== */

const NET_ERR = 'تعذر الاتصال بالخادم. تأكد من تشغيل الخادم ثم حاول مرة أخرى.';

/* ===== مساعدات عامة ===== */
async function apiCall(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // فشل على مستوى الشبكة — fetch يرمي خطأ إنكليزياً تقنياً؛ لا يظهر أبداً.
    throw new Error(NET_ERR);
  }
  if (res.status === 401) { location.href = '/admin-login.html'; throw new Error('انتهت الجلسة — يجري تحويلك لتسجيل الدخول'); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || 'حدث خطأ');
  return data;
}

/* ===== مركز الإشعارات =====
   كل رسائل النجاح والفشل تمر من هنا: لافتة تنزل من أعلى المنتصف بأسلوب
   iOS ثم تنسحب تلقائياً، ويُحفظ سجل الجلسة في قائمة الجرس أعلى الصفحة. */
const notifCenter = { items: [], unread: 0, panelOpen: false };

function notifStackEl() {
  let s = document.getElementById('notifStack');
  if (!s) { s = document.createElement('div'); s.id = 'notifStack'; document.body.appendChild(s); }
  return s;
}

function notify(msg, type = 'ok') {
  const stack = notifStackEl();
  while (stack.children.length >= 3) stack.removeChild(stack.lastElementChild);
  const n = el(`<div class="notif${type === 'danger' ? ' danger' : ''}" role="status">
    <span class="notif-ic">${iconHtml(type === 'danger' ? 'alert' : 'checkCircle')}</span>
    <div class="notif-body"><div class="notif-msg">${escapeHtml(msg)}</div></div>
  </div>`);
  stack.prepend(n);
  injectIcons(n);
  const dismiss = () => {
    if (!n.isConnected) return;
    n.classList.add('leaving');
    setTimeout(() => n.remove(), 200);
  };
  const timer = setTimeout(dismiss, 3500);
  n.addEventListener('click', () => { clearTimeout(timer); dismiss(); });

  notifCenter.items.unshift({ msg, type, ts: Date.now() });
  if (notifCenter.items.length > 60) notifCenter.items.pop();
  if (!notifCenter.panelOpen) notifCenter.unread += 1;
  updateNotifBadge();
  renderNotifPanelList();
}

// اسم قديم تستدعيه كل الشاشات — يمرر إلى مركز الإشعارات.
function showToast(msg, isError = false) {
  notify(msg, isError ? 'danger' : 'ok');
}

function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (notifCenter.unread > 0) {
    badge.hidden = false;
    badge.textContent = notifCenter.unread > 9 ? '+٩' : arDigits(notifCenter.unread);
  } else {
    badge.hidden = true;
  }
}

function renderNotifPanelList() {
  const list = document.getElementById('notifPanelList');
  if (!list) return;
  if (notifCenter.items.length === 0) {
    list.innerHTML = '<div class="notif-empty">لا إشعارات بعد — يظهر هنا سجل ما تنجزه في هذه الجلسة.</div>';
    return;
  }
  list.innerHTML = '';
  for (const it of notifCenter.items) {
    const row = el(`<div class="notif-row">
      <span class="notif-ic${it.type === 'danger' ? '' : ''}" style="${it.type === 'danger' ? 'background:var(--danger-bg);color:var(--danger)' : ''}">${iconHtml(it.type === 'danger' ? 'alert' : 'checkCircle')}</span>
      <span class="notif-row-text">${escapeHtml(it.msg)}</span>
      <span class="notif-row-time">${escapeHtml(relTime(it.ts))}</span>
    </div>`);
    list.appendChild(row);
  }
  injectIcons(list);
}

function closeNotifPanel() {
  const p = document.getElementById('notifPanel');
  if (p) p.remove();
  notifCenter.panelOpen = false;
}

function openNotifPanel() {
  const wrap = document.getElementById('bellWrap');
  if (!wrap) return;
  closeNotifPanel();
  const panel = el(`<div class="notif-panel" id="notifPanel" role="region" aria-label="سجل الإشعارات">
    <div class="notif-panel-head"><span>الإشعارات</span><button type="button" class="icon-btn" style="min-width:36px;min-height:36px" aria-label="إغلاق">${iconHtml('x')}</button></div>
    <div class="notif-panel-list" id="notifPanelList"></div>
  </div>`);
  panel.querySelector('button').onclick = closeNotifPanel;
  wrap.appendChild(panel);
  injectIcons(panel);
  notifCenter.panelOpen = true;
  notifCenter.unread = 0;
  updateNotifBadge();
  renderNotifPanelList();
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

// أرقام عربية-هندية لنصوص الحالة والعدّ فقط. الأرقام الامتحانية تبقى
// غربية دائماً — يجب أن تطابق ما يكتبه الطالب في صفحة الاستعلام حرفياً.
function arDigits(n) {
  return String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

// تمييز العدد العربي الصحيح: ٠ نص خاص، ١ مفرد، ٢ مثنى،
// ٣-١٠ جمع، ١١ فأكثر مفرد منصوب.
function countNoun(n, forms) {
  if (n === 0) return forms.zero;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${arDigits(n)} ${forms.few}`;
  return `${arDigits(n)} ${forms.many}`;
}
const countStudents = n => countNoun(n, { zero: 'لا طلبة', one: 'طالب واحد', two: 'طالبان', few: 'طلاب', many: 'طالباً' });
const countSubjects = n => countNoun(n, { zero: 'لا مواد', one: 'مادة واحدة', two: 'مادتان', few: 'مواد', many: 'مادة' });
const countStages = n => countNoun(n, { zero: 'بلا مراحل', one: 'مرحلة واحدة', two: 'مرحلتان', few: 'مراحل', many: 'مرحلة' });
const countResults = n => countNoun(n, { zero: 'لا نتائج', one: 'نتيجة واحدة', two: 'نتيجتان', few: 'نتائج', many: 'نتيجة' });

// وقت نسبي عربي موجز لسجل الإشعارات.
function relTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return 'قبل لحظات';
  const m = Math.floor(s / 60);
  if (m < 60) return 'قبل ' + countNoun(Math.max(m, 1), { zero: 'لحظات', one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' });
  const h = Math.floor(m / 60);
  if (h < 24) return 'قبل ' + countNoun(h, { zero: 'ساعة', one: 'ساعة', two: 'ساعتين', few: 'ساعات', many: 'ساعة' });
  const d = Math.floor(h / 24);
  return 'قبل ' + countNoun(d, { zero: 'يوم', one: 'يوم', two: 'يومين', few: 'أيام', many: 'يوماً' });
}

// يعيد صياغة خطأ الخادم إلى «ما العمل الآن» بدل «ما الذي فشل».
function friendlyError(msg) {
  if (/موجود مسبقاً|موجودة مسبقاً/.test(msg)) return `${msg} — جرّب اسماً آخر.`;
  return msg;
}

function iconHtml(name) {
  return `<span data-icon="${name}"></span>`;
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

// زر نسخ موحّد: ينسخ الرقم ويؤكد على الزر نفسه لحظة النجاح.
function wireCopyButton(btn, value) {
  const original = btn.innerHTML;
  btn.addEventListener('click', async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      btn.innerHTML = `${iconHtml('check')}نُسخ`;
      injectIcons(btn);
      setTimeout(() => { btn.innerHTML = original; injectIcons(btn); }, 1600);
    } else {
      showToast('تعذر النسخ — انسخ الرقم يدوياً', true);
    }
  });
}

// استبدال نافذة prompt: تعديل الاسم داخل الصف نفسه بحقل + حفظ/إلغاء.
function startInlineRename(nameSpan, currentName, { onSave, onCancel }) {
  const wrap = el(`<span class="grow inline-edit">
    <input class="input" value="${escapeHtml(currentName)}" aria-label="الاسم الجديد">
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

// استبدال نافذة confirm: شريط تأكيد مضمّن يظهر تحت الصف المعني مباشرة.
function confirmRow(row, { message, confirmLabel = 'تأكيد الحذف', neutral = false, onConfirm }) {
  const existing = row.parentElement && row.parentElement.querySelector(':scope > .confirm-strip');
  if (existing) existing.remove();
  const strip = el(`<div class="confirm-strip${neutral ? ' neutral' : ''}" role="group" aria-label="تأكيد">
    <span class="confirm-msg">${escapeHtml(message)}</span>
    <button class="btn btn-sm ${neutral ? 'btn-primary' : 'btn-danger-solid'}" data-yes>${escapeHtml(confirmLabel)}</button>
    <button class="btn btn-ghost btn-sm" data-no>إلغاء</button>
  </div>`);
  row.insertAdjacentElement('afterend', strip);
  const yes = strip.querySelector('[data-yes]');
  const no = strip.querySelector('[data-no]');
  no.focus();
  no.onclick = () => strip.remove();
  strip.addEventListener('keydown', e => { if (e.key === 'Escape') strip.remove(); });
  yes.onclick = async () => {
    yes.disabled = true; no.disabled = true;
    try { await onConfirm(); strip.remove(); }
    catch (e) { showToast(e.message, true); strip.remove(); }
  };
}

// إبراز صف أُنشئ للتو — صنف على مؤقّت JS لا حركة CSS،
// فيبقى ظاهراً حتى مع تفعيل «تقليل الحركة».
function flashNew(rowEl) {
  if (!rowEl) return;
  rowEl.classList.add('just-added');
  setTimeout(() => rowEl.classList.remove('just-added'), 2200);
}

function sklRows(n = 3) {
  return `<div aria-hidden="true">${'<div class="skl"></div>'.repeat(n)}</div>`;
}

function emptyStateHtml(icon, title, sub) {
  return `<div class="empty-state">${iconHtml(icon)}<p>${escapeHtml(title)}</p>${sub ? `<p class="empty-sub">${escapeHtml(sub)}</p>` : ''}</div>`;
}

const view = document.getElementById('view');

/* ===== حالة مشتركة بين الشاشات ===== */
const state = { deptId: null, stageId: null, sectionId: null, subjectId: null };

/* ==========================================================================
   شاشة الإضافة السريعة — خمس خطوات على مسار واحد، دون مغادرة الشاشة
   ========================================================================== */
const quickUI = {
  expanded: { dept: false, stage: false, section: false, subjects: false },
  touched: { subjects: false, students: false },
  drafts: { dept: '', stage: '', section: '', subject: '', subjectMode: 'final_only', student: '' },
  errors: {},
  lastConfirm: null,        // { step: 'dept'|'stage'|'section'|'subjects', html }
  lastStudent: null,        // { name, exam_number }
};

async function renderQuickView() {
  view.innerHTML = '';
  const qd = { depts: null, stages: null, sections: null, subjects: null, students: null };
  quickUI.expanded = { dept: false, stage: false, section: false, subjects: false };
  quickUI.touched = { subjects: false, students: false };
  quickUI.errors = {};
  quickUI.lastConfirm = null;
  quickUI.lastStudent = null;

  const root = el(`<div class="quick-flow rise">
    <h2 class="view-title">الإضافة السريعة</h2>
    <p class="view-sub">جهّز كل شيء من شاشة واحدة: القسم ثم المرحلة ثم الشعبة ثم المواد ثم الطلبة — وصولاً إلى إدخال الدرجات.</p>
    <div class="status-line">${iconHtml('arrowRight')}<span id="qStatus" aria-live="polite"></span></div>
    <div id="qSteps"></div>
    <div id="qFinale"></div>
  </div>`);
  view.appendChild(root);
  injectIcons(root);
  const stepsHost = root.querySelector('#qSteps');
  const finaleHost = root.querySelector('#qFinale');
  const statusEl = root.querySelector('#qStatus');

  /* ---- تحميل البيانات المتسلسل مع الاختيار التلقائي للعنصر الوحيد ---- */
  async function loadDepts() {
    qd.depts = null; paint();
    qd.depts = await apiCall('GET', '/api/admin/departments');
    if (state.deptId && !qd.depts.some(d => d.id === state.deptId)) state.deptId = null;
    if (!state.deptId && qd.depts.length === 1) state.deptId = qd.depts[0].id;
    if (state.deptId) await loadStages(); else paint();
  }
  async function loadStages() {
    qd.stages = null; paint();
    qd.stages = await apiCall('GET', `/api/admin/stages?department_id=${state.deptId}`);
    if (state.stageId && !qd.stages.some(s => s.id === state.stageId)) state.stageId = null;
    if (!state.stageId && qd.stages.length === 1) state.stageId = qd.stages[0].id;
    if (state.stageId) await loadSections(); else paint();
  }
  async function loadSections() {
    qd.sections = null; qd.subjects = null; paint();
    const [sections, subjects] = await Promise.all([
      apiCall('GET', `/api/admin/sections?stage_id=${state.stageId}`),
      apiCall('GET', `/api/admin/subjects?stage_id=${state.stageId}`),
    ]);
    qd.sections = sections;
    qd.subjects = subjects;
    if (state.sectionId && !qd.sections.some(s => s.id === state.sectionId)) state.sectionId = null;
    if (!state.sectionId && qd.sections.length === 1) state.sectionId = qd.sections[0].id;
    if (state.sectionId) await loadStudents(); else paint();
  }
  async function loadStudents() {
    qd.students = null; paint();
    qd.students = await apiCall('GET', `/api/admin/students?section_id=${state.sectionId}`);
    paint();
  }
  async function reloadSubjects() {
    qd.subjects = await apiCall('GET', `/api/admin/subjects?stage_id=${state.stageId}`);
    paint();
  }

  /* ---- حساب حالة كل خطوة ---- */
  function stepStates() {
    const s = {};
    s.dept = state.deptId ? 'done' : 'active';
    s.stage = !state.deptId ? 'waiting' : (state.stageId ? 'done' : 'active');
    s.section = !state.stageId ? 'waiting' : (state.sectionId ? 'done' : 'active');
    const subsReady = qd.subjects && qd.subjects.length > 0;
    s.subjects = !state.sectionId ? 'waiting' : (subsReady ? 'done' : 'active');
    const stReady = qd.students && qd.students.length > 0;
    s.students = !state.sectionId || !subsReady ? 'waiting' : (stReady ? 'done' : 'active');
    return s;
  }

  function statusText(s) {
    const sec = state.sectionId && qd.sections ? qd.sections.find(x => x.id === state.sectionId) : null;
    if (s.dept === 'active') return 'الخطوة ١ من ٥ — اختر القسم أو أضف قسماً جديداً.';
    if (s.stage === 'active') return 'الخطوة ٢ من ٥ — اختر المرحلة أو أضف مرحلة جديدة.';
    if (s.section === 'active') return 'الخطوة ٣ من ٥ — اختر الشعبة أو أضف شعبة جديدة.';
    if (s.subjects === 'active') return 'الخطوة ٤ من ٥ — أضف مواد هذه المرحلة، وتُطبَّق على جميع طلبتها.';
    if (s.students === 'active') return 'الخطوة ٥ من ٥ — اكتب اسم الطالب الثلاثي واضغط إضافة.';
    const n = qd.students ? qd.students.length : 0;
    return `اكتمل الإعداد — ${countStudents(n)} في ${sec ? sec.name : 'الشعبة'}. اضغط «ابدأ إدخال الدرجات».`;
  }

  /* ---- لبنات البناء ---- */
  function pillList(items, selectedId, onPick) {
    const group = el('<div class="pick-group" role="group"></div>');
    for (const it of items) {
      const pill = el(`<button type="button" class="pick-pill" aria-pressed="${it.id === selectedId}">${escapeHtml(it.name)}</button>`);
      if (it.id === selectedId) pill.innerHTML = `${iconHtml('check')}${escapeHtml(it.name)}`;
      pill.onclick = () => onPick(it.id);
      group.appendChild(pill);
    }
    return group;
  }

  function addRowFor(key, placeholder, btnLabel, onAdd) {
    const row = el(`<div class="add-row">
      <input class="input" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}">
      <button type="button" class="btn btn-soft">${iconHtml('plus')}${escapeHtml(btnLabel)}</button>
    </div>`);
    const input = row.querySelector('input');
    const btn = row.querySelector('button');
    input.value = quickUI.drafts[key] || '';
    input.addEventListener('input', () => { quickUI.drafts[key] = input.value; });
    async function go() {
      const name = input.value.trim();
      if (!name) { quickUI.errors[key] = 'اكتب الاسم أولاً.'; paint(); return; }
      btn.disabled = true;
      try {
        await onAdd(name);
        quickUI.drafts[key] = '';
        quickUI.errors[key] = '';
      } catch (e) {
        quickUI.errors[key] = friendlyError(e.message);
        paint();
      }
    }
    btn.onclick = go;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    return row;
  }

  function stepShell(num, key, title, stateName, { summary, waitReason, collapsed }) {
    const doneNum = stateName === 'done' ? iconHtml('check') : arDigits(num);
    return el(`<section class="q-step" data-state="${stateName}" data-step="${key}" aria-label="${escapeHtml(title)}">
      <div class="q-head">
        <span class="q-num">${doneNum}</span>
        <span class="q-title">${escapeHtml(title)}</span>
        ${collapsed && summary ? `<span class="q-summary">${summary}</span>` : ''}
        ${collapsed ? `<button type="button" class="btn btn-ghost btn-sm q-edit-btn" data-edit>${iconHtml('edit')}<span class="label">تعديل</span></button>` : ''}
      </div>
      ${stateName === 'waiting' ? `<p class="q-wait">${iconHtml('lock')}${escapeHtml(waitReason || '')}</p>` : ''}
      <div class="q-body" ${collapsed || stateName === 'waiting' ? 'hidden' : ''}></div>
    </section>`);
  }

  function confirmNoteHtml(html) {
    return `<div class="inline-note ok" role="status">${iconHtml('checkCircle')}<span>${html}</span></div>`;
  }

  /* ---- الرسم الكامل ---- */
  function paint() {
    const s = stepStates();
    statusEl.textContent = statusText(s);
    stepsHost.innerHTML = '';

    /* الخطوة ١: القسم */
    const deptDone = s.dept === 'done';
    const deptCollapsed = deptDone && !quickUI.expanded.dept;
    const deptObj = qd.depts && state.deptId ? qd.depts.find(d => d.id === state.deptId) : null;
    const stepDept = stepShell(1, 'dept', 'القسم', s.dept, {
      collapsed: deptCollapsed,
      summary: deptObj ? `<b>${escapeHtml(deptObj.name)}</b>` : '',
    });
    if (!deptCollapsed) {
      const body = stepDept.querySelector('.q-body');
      if (qd.depts === null) body.innerHTML = sklRows(2);
      else {
        if (qd.depts.length > 0) {
          body.appendChild(pillList(qd.depts, state.deptId, id => {
            state.deptId = id; state.stageId = null; state.sectionId = null;
            qd.stages = qd.sections = qd.subjects = qd.students = null;
            quickUI.expanded.dept = false;
            loadStages().catch(e => showToast(e.message, true));
          }));
          body.appendChild(el('<div class="or-sep">أو أضف قسماً جديداً</div>'));
        } else {
          body.appendChild(el(`<p class="q-hint">لا توجد أقسام بعد — اكتب اسم القسم الأول (مثل: تقنيات الحاسوب) واضغط إضافة.</p>`));
        }
        body.appendChild(addRowFor('dept', 'اسم القسم', 'إضافة القسم', async (name) => {
          const created = await apiCall('POST', '/api/admin/departments', { name });
          state.deptId = created.id; state.stageId = null; state.sectionId = null;
          quickUI.expanded.dept = false;
          quickUI.lastConfirm = { step: 'dept', html: `تمت إضافة القسم: <b>${escapeHtml(created.name)}</b>` };
          notify(`تمت إضافة القسم «${created.name}»`);
          await loadDepts();
        }));
        if (quickUI.errors.dept) body.appendChild(el(`<p class="field-error">${escapeHtml(quickUI.errors.dept)}</p>`));
      }
    }
    if (quickUI.lastConfirm && quickUI.lastConfirm.step === 'dept') {
      stepDept.appendChild(el(confirmNoteHtml(quickUI.lastConfirm.html)));
    }
    stepsHost.appendChild(stepDept);

    /* الخطوة ٢: المرحلة */
    const stageDone = s.stage === 'done';
    const stageCollapsed = stageDone && !quickUI.expanded.stage;
    const stageObj = qd.stages && state.stageId ? qd.stages.find(x => x.id === state.stageId) : null;
    const stepStage = stepShell(2, 'stage', 'المرحلة', s.stage, {
      collapsed: stageCollapsed,
      summary: stageObj ? `<b>${escapeHtml(stageObj.name)}</b>` : '',
      waitReason: 'اختر القسم أولاً',
    });
    if (s.stage !== 'waiting' && !stageCollapsed) {
      const body = stepStage.querySelector('.q-body');
      if (qd.stages === null) body.innerHTML = sklRows(2);
      else {
        if (qd.stages.length > 0) {
          body.appendChild(pillList(qd.stages, state.stageId, id => {
            state.stageId = id; state.sectionId = null;
            qd.sections = qd.subjects = qd.students = null;
            quickUI.expanded.stage = false;
            loadSections().catch(e => showToast(e.message, true));
          }));
          body.appendChild(el('<div class="or-sep">أو أضف مرحلة جديدة</div>'));
        } else {
          body.appendChild(el(`<p class="q-hint">لا توجد مراحل في هذا القسم بعد — اكتب اسم المرحلة (مثل: المرحلة الثالثة) واضغط إضافة.</p>`));
        }
        body.appendChild(addRowFor('stage', 'اسم المرحلة', 'إضافة المرحلة', async (name) => {
          const created = await apiCall('POST', '/api/admin/stages', { name, department_id: state.deptId });
          state.stageId = created.id; state.sectionId = null;
          quickUI.expanded.stage = false;
          quickUI.lastConfirm = { step: 'stage', html: `تمت إضافة المرحلة: <b>${escapeHtml(created.name)}</b>` };
          notify(`تمت إضافة المرحلة «${created.name}»`);
          await loadStages();
        }));
        if (quickUI.errors.stage) body.appendChild(el(`<p class="field-error">${escapeHtml(quickUI.errors.stage)}</p>`));
      }
    }
    if (quickUI.lastConfirm && quickUI.lastConfirm.step === 'stage') {
      stepStage.appendChild(el(confirmNoteHtml(quickUI.lastConfirm.html)));
    }
    stepsHost.appendChild(stepStage);

    /* الخطوة ٣: الشعبة */
    const secDone = s.section === 'done';
    const secCollapsed = secDone && !quickUI.expanded.section;
    const secObj = qd.sections && state.sectionId ? qd.sections.find(x => x.id === state.sectionId) : null;
    const stepSec = stepShell(3, 'section', 'الشعبة', s.section, {
      collapsed: secCollapsed,
      summary: secObj ? `<b>${escapeHtml(secObj.name)}</b>` : '',
      waitReason: 'اختر المرحلة أولاً',
    });
    if (s.section !== 'waiting' && !secCollapsed) {
      const body = stepSec.querySelector('.q-body');
      if (qd.sections === null) body.innerHTML = sklRows(2);
      else {
        if (qd.sections.length > 0) {
          body.appendChild(pillList(qd.sections, state.sectionId, id => {
            state.sectionId = id;
            qd.students = null;
            quickUI.expanded.section = false;
            loadStudents().catch(e => showToast(e.message, true));
          }));
          body.appendChild(el('<div class="or-sep">أو أضف شعبة جديدة</div>'));
        } else {
          body.appendChild(el(`<p class="q-hint">لا توجد شعب في هذه المرحلة بعد — اكتب اسم الشعبة (مثل: شعبة أ) واضغط إضافة.</p>`));
        }
        body.appendChild(addRowFor('section', 'اسم الشعبة', 'إضافة الشعبة', async (name) => {
          const created = await apiCall('POST', '/api/admin/sections', { name, stage_id: state.stageId });
          state.sectionId = created.id;
          quickUI.expanded.section = false;
          quickUI.lastConfirm = { step: 'section', html: `تمت إضافة الشعبة: <b>${escapeHtml(created.name)}</b>` };
          notify(`تمت إضافة الشعبة «${created.name}»`);
          await loadSections();
        }));
        if (quickUI.errors.section) body.appendChild(el(`<p class="field-error">${escapeHtml(quickUI.errors.section)}</p>`));
      }
    }
    if (quickUI.lastConfirm && quickUI.lastConfirm.step === 'section') {
      stepSec.appendChild(el(confirmNoteHtml(quickUI.lastConfirm.html)));
    }
    stepsHost.appendChild(stepSec);

    /* الخطوة ٤: المواد */
    const subsDone = s.subjects === 'done';
    const subsCollapsed = subsDone && !quickUI.expanded.subjects && !quickUI.touched.subjects;
    let subsSummary = '';
    if (qd.subjects && qd.subjects.length > 0) {
      const names = qd.subjects.slice(0, 3).map(x => escapeHtml(x.name)).join('، ');
      const more = qd.subjects.length > 3 ? ` <span class="muted">+${arDigits(qd.subjects.length - 3)}</span>` : '';
      subsSummary = `<b>${countSubjects(qd.subjects.length)}:</b> ${names}${more}`;
    }
    const stepSubs = stepShell(4, 'subjects', 'المواد', s.subjects, {
      collapsed: subsCollapsed,
      summary: subsSummary,
      waitReason: 'اختر الشعبة أولاً',
    });
    if (s.subjects !== 'waiting' && !subsCollapsed) {
      const body = stepSubs.querySelector('.q-body');
      body.appendChild(el('<p class="q-hint">المواد تخص المرحلة كاملة — تُطبَّق تلقائياً على جميع شعبها وطلبتها.</p>'));
      if (qd.subjects === null) body.appendChild(el(sklRows(2)));
      else {
        if (qd.subjects.length > 0) {
          const list = el('<div class="list-stack"></div>');
          for (const sb of qd.subjects) {
            const modeLabel = sb.grade_mode === 'full' ? 'سجل كامل' : 'نهائية فقط';
            list.appendChild(el(`<div class="list-row" data-id="${sb.id}">
              <span class="grow">${escapeHtml(sb.name)}</span>
              <span class="badge badge-mode${sb.grade_mode === 'full' ? ' full' : ''}">${escapeHtml(modeLabel)}</span>
            </div>`));
          }
          body.appendChild(list);
        }
        const addRow = el(`<div class="add-row" style="margin-top:${qd.subjects.length ? 'var(--space-3)' : '0'}">
          <input class="input" id="qSubName" placeholder="اسم المادة" aria-label="اسم المادة">
          <select class="input" id="qSubMode" aria-label="نوع سجل الدرجات">
            <option value="final_only">الدرجة النهائية فقط — الأسهل</option>
            <option value="full">سجل درجات كامل</option>
          </select>
          <button type="button" class="btn btn-soft">${iconHtml('plus')}إضافة المادة</button>
        </div>`);
        const nameInput = addRow.querySelector('#qSubName');
        const modeSel = addRow.querySelector('#qSubMode');
        nameInput.value = quickUI.drafts.subject || '';
        modeSel.value = quickUI.drafts.subjectMode || 'final_only';
        nameInput.addEventListener('input', () => { quickUI.drafts.subject = nameInput.value; });
        modeSel.addEventListener('change', () => { quickUI.drafts.subjectMode = modeSel.value; });
        async function addSubject() {
          const name = nameInput.value.trim();
          if (!name) { quickUI.errors.subject = 'اكتب اسم المادة أولاً.'; paint(); return; }
          try {
            const created = await apiCall('POST', '/api/admin/subjects', { name, stage_id: state.stageId, grade_mode: modeSel.value });
            quickUI.drafts.subject = '';
            quickUI.errors.subject = '';
            quickUI.touched.subjects = true;
            quickUI.lastConfirm = { step: 'subjects', html: `تمت إضافة المادة: <b>${escapeHtml(created.name)}</b>` };
            notify(`تمت إضافة المادة «${created.name}»`);
            await reloadSubjects();
            const rowEl = stepsHost.querySelector(`.q-step[data-step="subjects"] .list-row[data-id="${created.id}"]`);
            flashNew(rowEl);
            const again = stepsHost.querySelector('#qSubName');
            if (again) again.focus();
          } catch (e) {
            quickUI.errors.subject = friendlyError(e.message);
            paint();
          }
        }
        addRow.querySelector('button').onclick = addSubject;
        nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSubject(); } });
        body.appendChild(addRow);
        if (quickUI.errors.subject) body.appendChild(el(`<p class="field-error">${escapeHtml(quickUI.errors.subject)}</p>`));
      }
    }
    if (quickUI.lastConfirm && quickUI.lastConfirm.step === 'subjects' && !subsCollapsed) {
      stepSubs.appendChild(el(confirmNoteHtml(quickUI.lastConfirm.html)));
    }
    stepsHost.appendChild(stepSubs);

    /* الخطوة ٥: الطلبة */
    const stDone = s.students === 'done';
    const stCollapsed = stDone && !quickUI.touched.students && !quickUI.expanded.students;
    let stSummary = '';
    if (qd.students && qd.students.length > 0) stSummary = `<b>${countStudents(qd.students.length)}</b> في الشعبة`;
    const stepSt = stepShell(5, 'students', 'الطلبة', s.students, {
      collapsed: stCollapsed,
      summary: stSummary,
      waitReason: !state.sectionId ? 'اختر الشعبة أولاً' : 'أضف مادة واحدة على الأقل أولاً',
    });
    if (s.students !== 'waiting' && !stCollapsed) {
      const body = stepSt.querySelector('.q-body');
      body.appendChild(el('<p class="q-hint">يولّد النظام لكل طالب رقماً امتحانياً من ٨ أرقام تلقائياً — سلّمه للطالب ليستعلم به عن نتيجته.</p>'));
      if (qd.students === null) body.appendChild(el(sklRows(3)));
      else {
        const addRow = el(`<div class="add-row">
          <input class="input" id="qStudentName" placeholder="اسم الطالب الثلاثي" aria-label="اسم الطالب الثلاثي">
          <button type="button" class="btn btn-primary">${iconHtml('plus')}إضافة الطالب</button>
        </div>`);
        const input = addRow.querySelector('input');
        input.value = quickUI.drafts.student || '';
        input.addEventListener('input', () => { quickUI.drafts.student = input.value; });
        async function addStudent() {
          const name = input.value.trim();
          if (!name) { quickUI.errors.student = 'اكتب اسم الطالب أولاً.'; paint(); return; }
          try {
            const created = await apiCall('POST', '/api/admin/students', { name, section_id: state.sectionId });
            quickUI.drafts.student = '';
            quickUI.errors.student = '';
            quickUI.touched.students = true;
            quickUI.lastStudent = created;
            notify(`تمت إضافة الطالب «${created.name}»`);
            await loadStudents();
            const rowEl = stepsHost.querySelector(`.q-step[data-step="students"] .list-row[data-id="${created.id}"]`);
            flashNew(rowEl);
            const again = stepsHost.querySelector('#qStudentName');
            if (again) again.focus();
          } catch (e) {
            quickUI.errors.student = friendlyError(e.message);
            paint();
          }
        }
        addRow.querySelector('button').onclick = addStudent;
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addStudent(); } });
        body.appendChild(addRow);
        if (quickUI.errors.student) body.appendChild(el(`<p class="field-error">${escapeHtml(quickUI.errors.student)}</p>`));

        // مسار بديل للإدخال اليدوي: استيراد كشف كامل دفعة واحدة من ملف
        // (public/js/import.js) — الشعبة المختارة هنا تُمرَّر مُهيّأة فتُختصر
        // خطوة اختيار الشعبة في شاشة الاستيراد.
        const importBtn = el(`<button type="button" class="btn btn-ghost btn-sm" style="margin-top:var(--space-2)">${iconHtml('upload')}استيراد من ملف</button>`);
        importBtn.onclick = () => {
          const path = [deptObj, stageObj, secObj].filter(Boolean).map(x => x.name).join(' — ');
          openImportFlow({ id: state.sectionId, name: secObj ? secObj.name : '', path });
        };
        body.appendChild(importBtn);

        if (quickUI.lastStudent) {
          const c = quickUI.lastStudent;
          const note = el(`<div class="inline-note ok" role="status">${iconHtml('checkCircle')}
            <span>تمت إضافة <b>${escapeHtml(c.name)}</b> — الرقم الامتحاني: <span class="exam-chip">${escapeHtml(c.exam_number)}</span></span>
            <button type="button" class="btn btn-ghost btn-sm">${iconHtml('copy')}نسخ الرقم</button>
          </div>`);
          wireCopyButton(note.querySelector('button'), c.exam_number);
          body.appendChild(note);
        }

        if (qd.students.length === 0) {
          body.appendChild(el(`<p class="q-hint">لم يُضف أي طالب بعد.</p>`));
        } else {
          const list = el('<div class="list-stack"></div>');
          for (const st of qd.students) {
            const row = el(`<div class="list-row" data-id="${st.id}">
              <span class="grow">${escapeHtml(st.name)}</span>
              <span class="exam-chip">${escapeHtml(st.exam_number)}</span>
              <button type="button" class="btn btn-ghost btn-sm">${iconHtml('copy')}نسخ</button>
            </div>`);
            wireCopyButton(row.querySelector('button'), st.exam_number);
            list.appendChild(row);
          }
          body.appendChild(list);
        }
      }
    }
    stepsHost.appendChild(stepSt);

    /* بطاقة الانطلاق: إدخال الدرجات بالسياق المحفوظ */
    finaleHost.innerHTML = '';
    if (state.sectionId && qd.subjects && qd.subjects.length > 0) {
      const n = qd.students ? qd.students.length : 0;
      const finale = el(`<div class="finale-card">
        <div class="finale-text">
          <strong>جاهز لإدخال الدرجات</strong>
          <span>${n > 0 ? `${countStudents(n)} و${countSubjects(qd.subjects.length)} — ` : ''}سيفتح جدول الدرجات على هذه الشعبة مباشرة دون إعادة اختيار.</span>
        </div>
        <button type="button" class="btn btn-primary btn-lg" id="qGoGrades">${iconHtml('grid')}ابدأ إدخال الدرجات</button>
      </div>`);
      finale.querySelector('#qGoGrades').onclick = () => route('grades');
      finaleHost.appendChild(finale);
    }

    /* أزرار «تعديل» للخطوات المطوية */
    stepsHost.querySelectorAll('.q-step [data-edit]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.closest('.q-step').dataset.step;
        quickUI.expanded[key] = true;
        paint();
      };
    });

    /* المؤشر المرئي: عنصر واحد فقط */
    root.querySelectorAll('.next-target').forEach(x => x.classList.remove('next-target'));
    let target = null;
    if (s.dept === 'active') {
      target = qd.depts && qd.depts.length > 0
        ? stepDept.querySelector('.pick-group')
        : stepDept.querySelector('.add-row input');
    } else if (s.stage === 'active') {
      target = qd.stages && qd.stages.length > 0
        ? stepStage.querySelector('.pick-group')
        : stepStage.querySelector('.add-row input');
    } else if (s.section === 'active') {
      target = qd.sections && qd.sections.length > 0
        ? stepSec.querySelector('.pick-group')
        : stepSec.querySelector('.add-row input');
    } else if (s.subjects === 'active') {
      target = stepSubs.querySelector('#qSubName');
    } else if (s.students === 'active') {
      target = stepSt.querySelector('#qStudentName');
    } else {
      target = finaleHost.querySelector('#qGoGrades');
    }
    if (target) target.classList.add('next-target');

    injectIcons(root);
  }

  paint();
  loadDepts().catch(e => { showToast(e.message, true); qd.depts = []; paint(); });
}

/* ==========================================================================
   شاشة الأقسام والمراحل — تنقّل تدريجي: أقسام ثم مراحل ثم تفاصيل المرحلة
   ========================================================================== */
async function renderCatalogView() {
  view.innerHTML = '';
  const root = el(`<div class="rise">
    <h2 class="view-title">الأقسام والمراحل</h2>
    <p class="view-sub">هيكل المدرسة من الأعلى إلى الأسفل: القسم يضم مراحل، والمرحلة تضم شعباً ومواد.</p>
    <div class="card" id="catCard"></div>
  </div>`);
  view.appendChild(root);
  const host = root.querySelector('#catCard');

  // cat.level: 'depts' | 'stages' | 'stage'
  const cat = { level: 'depts', dept: null, stage: null };
  if (state.deptId) cat.level = 'depts';

  function crumbs() {
    const bar = el('<nav class="crumbs" aria-label="مسار التنقل"></nav>');
    const mk = (label, current, onClick) => {
      const c = el(`<button type="button" class="crumb"${current ? ' aria-current="page"' : ''}>${escapeHtml(label)}</button>`);
      if (!current) c.onclick = onClick;
      return c;
    };
    bar.appendChild(mk('الأقسام', cat.level === 'depts', () => { cat.level = 'depts'; cat.stage = null; paint(); }));
    if (cat.dept && cat.level !== 'depts') {
      bar.appendChild(el(`<span class="crumb-sep">${iconHtml('chevronLeft')}</span>`));
      bar.appendChild(mk(cat.dept.name, cat.level === 'stages', () => { cat.level = 'stages'; cat.stage = null; paint(); }));
    }
    if (cat.stage && cat.level === 'stage') {
      bar.appendChild(el(`<span class="crumb-sep">${iconHtml('chevronLeft')}</span>`));
      bar.appendChild(mk(cat.stage.name, true));
    }
    return bar;
  }

  async function paint() {
    host.innerHTML = '';
    host.appendChild(crumbs());
    try {
      if (cat.level === 'depts') await paintDepts();
      else if (cat.level === 'stages') await paintStages();
      else await paintStage();
    } catch (e) {
      showToast(e.message, true);
      host.appendChild(el(`<div class="inline-note danger">${iconHtml('alert')}<span>${escapeHtml(e.message)}</span></div>`));
    }
    injectIcons(host);
  }

  async function paintDepts(highlightId) {
    const listHost = el('<div></div>');
    const addRow = el(`<div class="add-row">
      <input class="input" placeholder="اسم القسم الجديد (مثل: تقنيات الحاسوب)" aria-label="اسم القسم الجديد">
      <button type="button" class="btn btn-primary">${iconHtml('plus')}إضافة قسم</button>
    </div>`);
    const input = addRow.querySelector('input');
    async function addDept() {
      const name = input.value.trim();
      if (!name) { showToast('اكتب اسم القسم أولاً', true); return; }
      try {
        const created = await apiCall('POST', '/api/admin/departments', { name });
        input.value = '';
        await refresh(created.id);
      } catch (e) { showToast(friendlyError(e.message), true); }
    }
    addRow.querySelector('button').onclick = addDept;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addDept(); } });
    host.appendChild(addRow);
    host.appendChild(listHost);

    async function refresh(hlId) {
      listHost.innerHTML = sklRows(3);
      const depts = await apiCall('GET', '/api/admin/departments');
      listHost.innerHTML = '';
      if (depts.length === 0) {
        listHost.innerHTML = emptyStateHtml('layers', 'لا توجد أقسام بعد', 'اكتب اسم القسم الأول في الحقل أعلاه واضغط «إضافة قسم».');
        injectIcons(listHost);
        return;
      }
      const stack = el('<div class="list-stack"></div>');
      for (const d of depts) {
        const row = el(`<div class="list-row${d.id === state.deptId ? ' selected' : ''}" data-id="${d.id}">
          <button type="button" class="row-link">
            <span class="dept-name">${escapeHtml(d.name)}</span>
            ${iconHtml('chevronLeft')}
            <span class="row-hint">عرض المراحل</span>
          </button>
          <span class="muted">${countStages(d.stage_count)} — ${countStudents(d.student_count)}</span>
          <button type="button" class="icon-btn" title="تعديل الاسم" aria-label="تعديل اسم ${escapeHtml(d.name)}">${iconHtml('edit')}</button>
          <button type="button" class="icon-btn danger" title="حذف" aria-label="حذف ${escapeHtml(d.name)}">${iconHtml('trash')}</button>
        </div>`);
        row.querySelector('.row-link').onclick = () => {
          state.deptId = d.id;
          cat.dept = d; cat.level = 'stages'; cat.stage = null;
          paint();
        };
        row.querySelector('[title="تعديل الاسم"]').onclick = () => {
          startInlineRename(row.querySelector('.row-link'), d.name, {
            onSave: async (name) => {
              await apiCall('PUT', `/api/admin/departments/${d.id}`, { name });
              showToast('تم تعديل الاسم');
              await refresh(d.id);
            },
            onCancel: () => refresh().catch(e => showToast(e.message, true)),
          });
        };
        row.querySelector('[title="حذف"]').onclick = () => {
          confirmRow(row, {
            message: `حذف القسم «${d.name}» يحذف معه كل مراحله وشعبه وطلبته ودرجاتهم نهائياً.`,
            onConfirm: async () => {
              await apiCall('DELETE', `/api/admin/departments/${d.id}`);
              if (state.deptId === d.id) { state.deptId = null; state.stageId = null; state.sectionId = null; }
              showToast('تم حذف القسم');
              await refresh();
            },
          });
        };
        stack.appendChild(row);
        if (d.id === hlId) flashNew(row);
      }
      listHost.appendChild(stack);
      injectIcons(listHost);
    }
    await refresh(highlightId);
  }

  async function paintStages(highlightId) {
    const d = cat.dept;
    const addRow = el(`<div class="add-row">
      <input class="input" placeholder="اسم المرحلة الجديدة (مثل: المرحلة الثالثة)" aria-label="اسم المرحلة الجديدة">
      <button type="button" class="btn btn-primary">${iconHtml('plus')}إضافة مرحلة</button>
    </div>`);
    const listHost = el('<div></div>');
    const input = addRow.querySelector('input');
    async function addStage() {
      const name = input.value.trim();
      if (!name) { showToast('اكتب اسم المرحلة أولاً', true); return; }
      try {
        const created = await apiCall('POST', '/api/admin/stages', { name, department_id: d.id });
        input.value = '';
        await refresh(created.id);
      } catch (e) { showToast(friendlyError(e.message), true); }
    }
    addRow.querySelector('button').onclick = addStage;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addStage(); } });
    host.appendChild(addRow);
    host.appendChild(listHost);

    async function refresh(hlId) {
      listHost.innerHTML = sklRows(3);
      const stages = await apiCall('GET', `/api/admin/stages?department_id=${d.id}`);
      listHost.innerHTML = '';
      if (stages.length === 0) {
        listHost.innerHTML = emptyStateHtml('layers', 'لا توجد مراحل في هذا القسم بعد', 'اكتب اسم المرحلة في الحقل أعلاه واضغط «إضافة مرحلة».');
        injectIcons(listHost);
        return;
      }
      const stack = el('<div class="list-stack"></div>');
      for (const s of stages) {
        const row = el(`<div class="list-row${s.id === state.stageId ? ' selected' : ''}" data-id="${s.id}">
          <button type="button" class="row-link">
            <span>${escapeHtml(s.name)}</span>
            ${iconHtml('chevronLeft')}
            <span class="row-hint">الشعب والمواد</span>
          </button>
          <button type="button" class="icon-btn" title="تعديل الاسم" aria-label="تعديل اسم ${escapeHtml(s.name)}">${iconHtml('edit')}</button>
          <button type="button" class="icon-btn danger" title="حذف" aria-label="حذف ${escapeHtml(s.name)}">${iconHtml('trash')}</button>
        </div>`);
        row.querySelector('.row-link').onclick = () => {
          state.stageId = s.id;
          cat.stage = s; cat.level = 'stage';
          paint();
        };
        row.querySelector('[title="تعديل الاسم"]').onclick = () => {
          startInlineRename(row.querySelector('.row-link'), s.name, {
            onSave: async (name) => {
              await apiCall('PUT', `/api/admin/stages/${s.id}`, { name });
              showToast('تم تعديل الاسم');
              await refresh(s.id);
            },
            onCancel: () => refresh().catch(e => showToast(e.message, true)),
          });
        };
        row.querySelector('[title="حذف"]').onclick = () => {
          confirmRow(row, {
            message: `حذف المرحلة «${s.name}» يحذف معها كل شعبها وموادها وطلبتها ودرجاتهم نهائياً.`,
            onConfirm: async () => {
              await apiCall('DELETE', `/api/admin/stages/${s.id}`);
              if (state.stageId === s.id) { state.stageId = null; state.sectionId = null; }
              showToast('تم حذف المرحلة');
              await refresh();
            },
          });
        };
        stack.appendChild(row);
        if (s.id === hlId) flashNew(row);
      }
      listHost.appendChild(stack);
      injectIcons(listHost);
    }
    await refresh(highlightId);
  }

  async function paintStage() {
    const s = cat.stage;

    /* --- الشعب --- */
    const secBlock = el(`<section class="group-block" style="margin-top:0">
      <h3 class="group-title">${iconHtml('users')}الشعب <span class="muted">— كل طالب ينتمي إلى شعبة واحدة</span></h3>
      <div class="add-row">
        <input class="input" placeholder="اسم الشعبة الجديدة (مثل: شعبة أ)" aria-label="اسم الشعبة الجديدة">
        <button type="button" class="btn btn-primary">${iconHtml('plus')}إضافة شعبة</button>
      </div>
      <div class="sec-list"></div>
    </section>`);
    const secInput = secBlock.querySelector('input');
    const secList = secBlock.querySelector('.sec-list');
    async function addSection() {
      const name = secInput.value.trim();
      if (!name) { showToast('اكتب اسم الشعبة أولاً', true); return; }
      try {
        const created = await apiCall('POST', '/api/admin/sections', { name, stage_id: s.id });
        secInput.value = '';
        await refreshSections(created.id);
      } catch (e) { showToast(friendlyError(e.message), true); }
    }
    secBlock.querySelector('.add-row button').onclick = addSection;
    secInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSection(); } });

    async function refreshSections(hlId) {
      secList.innerHTML = sklRows(2);
      const secs = await apiCall('GET', `/api/admin/sections?stage_id=${s.id}`);
      secList.innerHTML = '';
      if (secs.length === 0) {
        secList.innerHTML = emptyStateHtml('users', 'لا توجد شعب بعد', 'أضف الشعبة الأولى من الحقل أعلاه.');
        injectIcons(secList);
        return;
      }
      const stack = el('<div class="list-stack"></div>');
      for (const sc of secs) {
        const row = el(`<div class="list-row" data-id="${sc.id}">
          <span class="grow">${escapeHtml(sc.name)}</span>
          <button type="button" class="icon-btn" title="تعديل الاسم" aria-label="تعديل اسم ${escapeHtml(sc.name)}">${iconHtml('edit')}</button>
          <button type="button" class="icon-btn danger" title="حذف" aria-label="حذف ${escapeHtml(sc.name)}">${iconHtml('trash')}</button>
        </div>`);
        row.querySelector('[title="تعديل الاسم"]').onclick = () => {
          startInlineRename(row.querySelector('.grow'), sc.name, {
            onSave: async (name) => {
              await apiCall('PUT', `/api/admin/sections/${sc.id}`, { name });
              showToast('تم تعديل الاسم');
              await refreshSections(sc.id);
            },
            onCancel: () => refreshSections().catch(e => showToast(e.message, true)),
          });
        };
        row.querySelector('[title="حذف"]').onclick = () => {
          confirmRow(row, {
            message: `حذف الشعبة «${sc.name}» يحذف معها كل طلبتها ودرجاتهم نهائياً.`,
            onConfirm: async () => {
              await apiCall('DELETE', `/api/admin/sections/${sc.id}`);
              if (state.sectionId === sc.id) state.sectionId = null;
              showToast('تم حذف الشعبة');
              await refreshSections();
            },
          });
        };
        stack.appendChild(row);
        if (sc.id === hlId) flashNew(row);
      }
      secList.appendChild(stack);
      injectIcons(secList);
    }

    /* --- المواد --- */
    const subBlock = el(`<section class="group-block">
      <h3 class="group-title">${iconHtml('book')}المواد <span class="muted">— تُطبَّق على جميع طلبة المرحلة</span></h3>
      <div class="add-row">
        <input class="input" placeholder="اسم المادة (مثل: الرياضيات)" aria-label="اسم المادة">
        <select class="input" aria-label="نوع سجل الدرجات">
          <option value="final_only">الدرجة النهائية فقط — الأسهل</option>
          <option value="full">سجل درجات كامل</option>
        </select>
        <button type="button" class="btn btn-primary">${iconHtml('plus')}إضافة مادة</button>
      </div>
      <div class="sub-list"></div>
    </section>`);
    const subInput = subBlock.querySelector('input');
    const subMode = subBlock.querySelector('select');
    const subList = subBlock.querySelector('.sub-list');
    async function addSubject() {
      const name = subInput.value.trim();
      if (!name) { showToast('اكتب اسم المادة أولاً', true); return; }
      try {
        const created = await apiCall('POST', '/api/admin/subjects', { name, stage_id: s.id, grade_mode: subMode.value });
        subInput.value = '';
        await refreshSubjects(created.id);
      } catch (e) { showToast(friendlyError(e.message), true); }
    }
    subBlock.querySelector('.add-row button').onclick = addSubject;
    subInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSubject(); } });

    async function refreshSubjects(hlId) {
      subList.innerHTML = sklRows(2);
      const subs = await apiCall('GET', `/api/admin/subjects?stage_id=${s.id}`);
      subList.innerHTML = '';
      if (subs.length === 0) {
        subList.innerHTML = emptyStateHtml('book', 'لا توجد مواد لهذه المرحلة بعد', 'أضف المادة الأولى من الحقل أعلاه، واختر نوع سجلها قبل الإضافة.');
        injectIcons(subList);
        return;
      }
      const stack = el('<div class="list-stack"></div>');
      for (const sb of subs) {
        const isFull = sb.grade_mode === 'full';
        const row = el(`<div class="list-row" data-id="${sb.id}">
          <span class="grow">${escapeHtml(sb.name)}</span>
          <span class="badge badge-mode${isFull ? ' full' : ''}">${isFull ? 'سجل كامل' : 'نهائية فقط'}</span>
          <button type="button" class="icon-btn" title="تبديل النوع" aria-label="تبديل نوع ${escapeHtml(sb.name)}">${iconHtml('refresh')}</button>
          <button type="button" class="icon-btn" title="تعديل الاسم" aria-label="تعديل اسم ${escapeHtml(sb.name)}">${iconHtml('edit')}</button>
          <button type="button" class="icon-btn danger" title="حذف" aria-label="حذف ${escapeHtml(sb.name)}">${iconHtml('trash')}</button>
        </div>`);
        row.querySelector('[title="تبديل النوع"]').onclick = () => {
          const newMode = isFull ? 'final_only' : 'full';
          const msg = newMode === 'final_only'
            ? `تبديل «${sb.name}» إلى الدرجة النهائية فقط يخفي بقية أعمدة الدرجات لهذه المادة في الإدخال وفي نتيجة الطالب.`
            : `تبديل «${sb.name}» إلى السجل الكامل يظهر بقية أعمدة الدرجات لهذه المادة في الإدخال وفي نتيجة الطالب.`;
          confirmRow(row, {
            message: msg,
            confirmLabel: 'تبديل النوع',
            neutral: true,
            onConfirm: async () => {
              await apiCall('PUT', `/api/admin/subjects/${sb.id}`, { name: sb.name, grade_mode: newMode, sort_order: sb.sort_order });
              showToast('تم تبديل نوع المادة');
              await refreshSubjects(sb.id);
            },
          });
        };
        row.querySelector('[title="تعديل الاسم"]').onclick = () => {
          startInlineRename(row.querySelector('.grow'), sb.name, {
            onSave: async (name) => {
              await apiCall('PUT', `/api/admin/subjects/${sb.id}`, { name, grade_mode: sb.grade_mode, sort_order: sb.sort_order });
              showToast('تم تعديل الاسم');
              await refreshSubjects(sb.id);
            },
            onCancel: () => refreshSubjects().catch(e => showToast(e.message, true)),
          });
        };
        row.querySelector('[title="حذف"]').onclick = () => {
          confirmRow(row, {
            message: `حذف المادة «${sb.name}» يحذف معها كل درجاتها المسجلة نهائياً.`,
            onConfirm: async () => {
              await apiCall('DELETE', `/api/admin/subjects/${sb.id}`);
              showToast('تم حذف المادة');
              await refreshSubjects();
            },
          });
        };
        stack.appendChild(row);
        if (sb.id === hlId) flashNew(row);
      }
      subList.appendChild(stack);
      injectIcons(subList);
    }

    host.appendChild(secBlock);
    host.appendChild(subBlock);
    await Promise.all([refreshSections(), refreshSubjects()]);
  }

  await paint();
}

/* ==========================================================================
   شاشة الطلبة — تصفح بالشعبة أو بحث شامل بالاسم أو الرقم الامتحاني
   ========================================================================== */
async function renderStudentsView() {
  view.innerHTML = '';
  const root = el(`<div class="rise">
    <h2 class="view-title">الطلبة</h2>
    <p class="view-sub">اختر الشعبة لعرض طلبتها وإضافة طلبة جدد، أو ابحث مباشرة باسم الطالب أو رقمه الامتحاني.</p>
    <div class="card">
      <div class="toolbar">
        <div class="search-box">
          ${iconHtml('search')}
          <input class="input" id="stSearch" placeholder="ابحث باسم الطالب أو الرقم الامتحاني" aria-label="بحث عن طالب">
        </div>
      </div>
      <div class="toolbar" id="stPickers">
        <select class="input" id="deptSel" aria-label="القسم"><option value="">اختر القسم</option></select>
        <select class="input" id="stageSel" disabled aria-label="المرحلة"><option value="">اختر المرحلة</option></select>
        <select class="input" id="secSel" disabled aria-label="الشعبة"><option value="">اختر الشعبة</option></select>
      </div>
      <div class="add-row" id="addBar" hidden>
        <input class="input" id="newStudent" placeholder="اسم الطالب الثلاثي" aria-label="اسم الطالب الثلاثي">
        <button type="button" class="btn btn-primary" id="addStudent">${iconHtml('plus')}إضافة طالب</button>
      </div>
      <div id="stConfirm"></div>
      <div id="studentList"></div>
    </div>
  </div>`);
  view.appendChild(root);
  injectIcons(root);

  const searchInput = root.querySelector('#stSearch');
  const pickersBar = root.querySelector('#stPickers');
  const deptSel = root.querySelector('#deptSel');
  const stageSel = root.querySelector('#stageSel');
  const secSel = root.querySelector('#secSel');
  const addBar = root.querySelector('#addBar');
  const confirmHost = root.querySelector('#stConfirm');
  const listHost = root.querySelector('#studentList');

  listHost.innerHTML = emptyStateHtml('users', 'اختر الشعبة من القوائم أعلاه', 'أو اكتب اسم طالب أو رقمه الامتحاني في حقل البحث.');
  injectIcons(listHost);

  /* --- فهرس البحث الشامل (يُبنى عند أول بحث ويُبطل بعد أي تعديل) --- */
  let index = null;
  async function ensureIndex() {
    if (index) return index;
    const [depts, stages, sections, students] = await Promise.all([
      apiCall('GET', '/api/admin/departments'),
      apiCall('GET', '/api/admin/stages'),
      apiCall('GET', '/api/admin/sections'),
      apiCall('GET', '/api/admin/students'),
    ]);
    const deptById = new Map(depts.map(d => [d.id, d]));
    const stageById = new Map(stages.map(s => [s.id, s]));
    const secById = new Map(sections.map(s => [s.id, s]));
    index = students.map(st => {
      const sec = secById.get(st.section_id);
      const stg = sec ? stageById.get(sec.stage_id) : null;
      const dep = stg ? deptById.get(stg.department_id) : null;
      return { ...st, context: [dep && dep.name, stg && stg.name, sec && sec.name].filter(Boolean).join(' — ') };
    });
    return index;
  }
  function invalidateIndex() { index = null; }

  function studentRow(st, { context } = {}) {
    const row = el(`<div class="list-row" data-id="${st.id}">
      <span class="grow student-name">${escapeHtml(st.name)}${context ? `<br><span class="muted">${escapeHtml(context)}</span>` : ''}</span>
      <span class="exam-chip">${escapeHtml(st.exam_number)}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-copy>${iconHtml('copy')}نسخ</button>
      <button type="button" class="icon-btn" title="تعديل الاسم" aria-label="تعديل اسم ${escapeHtml(st.name)}">${iconHtml('edit')}</button>
      <button type="button" class="icon-btn danger" title="حذف" aria-label="حذف ${escapeHtml(st.name)}">${iconHtml('trash')}</button>
    </div>`);
    wireCopyButton(row.querySelector('[data-copy]'), st.exam_number);
    row.querySelector('[title="تعديل الاسم"]').onclick = () => {
      startInlineRename(row.querySelector('.student-name'), st.name, {
        onSave: async (name) => {
          await apiCall('PUT', `/api/admin/students/${st.id}`, { name, section_id: st.section_id });
          showToast('تم تعديل الاسم');
          invalidateIndex();
          await repaintCurrent();
        },
        onCancel: () => repaintCurrent(),
      });
    };
    row.querySelector('[title="حذف"]').onclick = () => {
      confirmRow(row, {
        message: `حذف الطالب «${st.name}» يحذف معه درجاته المسجلة نهائياً.`,
        onConfirm: async () => {
          await apiCall('DELETE', `/api/admin/students/${st.id}`);
          showToast('تم حذف الطالب');
          invalidateIndex();
          await repaintCurrent();
        },
      });
    };
    return row;
  }

  async function repaintCurrent() {
    const q = searchInput.value.trim();
    if (q) await paintSearch(q);
    else if (secSel.value) await paintSection();
    else {
      listHost.innerHTML = emptyStateHtml('users', 'اختر الشعبة من القوائم أعلاه', 'أو اكتب اسم طالب أو رقمه الامتحاني في حقل البحث.');
      injectIcons(listHost);
    }
  }

  /* --- وضع التصفح بالشعبة --- */
  async function paintSection(highlightId) {
    listHost.innerHTML = sklRows(3);
    const students = await apiCall('GET', `/api/admin/students?section_id=${secSel.value}`);
    listHost.innerHTML = '';
    if (students.length === 0) {
      listHost.innerHTML = emptyStateHtml('users', 'لا يوجد طلبة في هذه الشعبة بعد', 'اكتب اسم الطالب الثلاثي في الحقل أعلاه واضغط «إضافة طالب».');
      injectIcons(listHost);
      return;
    }
    const count = el(`<p class="grades-count">${countStudents(students.length)} في هذه الشعبة</p>`);
    listHost.appendChild(count);
    const stack = el('<div class="list-stack"></div>');
    for (const st of students) {
      const row = studentRow(st);
      stack.appendChild(row);
      if (st.id === highlightId) flashNew(row);
    }
    listHost.appendChild(stack);
    injectIcons(listHost);
  }

  /* --- وضع البحث الشامل --- */
  let searchSeq = 0;
  async function paintSearch(q) {
    const seq = ++searchSeq;
    listHost.innerHTML = sklRows(3);
    let idx;
    try { idx = await ensureIndex(); }
    catch (e) { showToast(e.message, true); listHost.innerHTML = ''; return; }
    if (seq !== searchSeq) return;
    const digits = q.replace(/\D/g, '');
    const matches = idx.filter(st =>
      st.name.includes(q) || (digits.length > 0 && st.exam_number.startsWith(digits))
    );
    listHost.innerHTML = '';
    if (matches.length === 0) {
      listHost.innerHTML = emptyStateHtml('search', 'لا توجد نتائج مطابقة', 'تأكد من كتابة الاسم أو الرقم الامتحاني بدقة.');
      injectIcons(listHost);
      return;
    }
    const shown = matches.slice(0, 30);
    listHost.appendChild(el(`<p class="grades-count">${countResults(matches.length)}${matches.length > 30 ? ` — تُعرض أول ${arDigits(30)}، دقّق البحث لتضييقها` : ''}</p>`));
    const stack = el('<div class="list-stack"></div>');
    for (const st of shown) stack.appendChild(studentRow(st, { context: st.context }));
    listHost.appendChild(stack);
    injectIcons(listHost);
  }

  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = searchInput.value.trim();
      pickersBar.style.display = q ? 'none' : '';
      addBar.hidden = q ? true : !secSel.value;
      confirmHost.innerHTML = '';
      repaintCurrent().catch(e => showToast(e.message, true));
    }, 220);
  });

  /* --- القوائم المتسلسلة --- */
  const depts = await apiCall('GET', '/api/admin/departments');
  for (const d of depts) deptSel.appendChild(el(`<option value="${d.id}">${escapeHtml(d.name)}</option>`));

  deptSel.onchange = async () => {
    stageSel.innerHTML = '<option value="">اختر المرحلة</option>';
    secSel.innerHTML = '<option value="">اختر الشعبة</option>';
    secSel.disabled = true; addBar.hidden = true;
    confirmHost.innerHTML = '';
    await repaintCurrent();
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
    confirmHost.innerHTML = '';
    await repaintCurrent();
    if (!stageSel.value) { secSel.disabled = true; return; }
    try {
      const secs = await apiCall('GET', `/api/admin/sections?stage_id=${stageSel.value}`);
      for (const s of secs) secSel.appendChild(el(`<option value="${s.id}">${escapeHtml(s.name)}</option>`));
      secSel.disabled = false;
    } catch (e) { showToast(e.message, true); }
  };

  secSel.onchange = () => {
    addBar.hidden = !secSel.value;
    confirmHost.innerHTML = '';
    if (secSel.value) paintSection().catch(e => showToast(e.message, true));
    else repaintCurrent();
  };

  /* --- إضافة طالب --- */
  const newStudentInput = root.querySelector('#newStudent');
  async function addStudent() {
    const name = newStudentInput.value.trim();
    if (!name) { showToast('اكتب اسم الطالب أولاً', true); return; }
    try {
      const created = await apiCall('POST', '/api/admin/students', { name, section_id: Number(secSel.value) });
      newStudentInput.value = '';
      newStudentInput.focus();
      notify(`تمت إضافة الطالب «${created.name}»`);
      invalidateIndex();
      confirmHost.innerHTML = '';
      const note = el(`<div class="inline-note ok" role="status">${iconHtml('checkCircle')}
        <span>تمت إضافة <b>${escapeHtml(created.name)}</b> — الرقم الامتحاني: <span class="exam-chip">${escapeHtml(created.exam_number)}</span></span>
        <button type="button" class="btn btn-ghost btn-sm">${iconHtml('copy')}نسخ الرقم</button>
      </div>`);
      wireCopyButton(note.querySelector('button'), created.exam_number);
      confirmHost.appendChild(note);
      injectIcons(confirmHost);
      await paintSection(created.id);
    } catch (e) { showToast(friendlyError(e.message), true); }
  }
  root.querySelector('#addStudent').onclick = addStudent;
  newStudentInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addStudent(); } });
}

/* ==========================================================================
   شاشة الدرجات
   ========================================================================== */
const GRADE_COLS = [
  ['first_term_avg', 'معدل النصف الأول'],
  ['midyear', 'درجة نصف السنة'],
  ['second_term_avg', 'معدل النصف الثاني'],
  ['annual_effort', 'معدل السعي السنوي'],
  ['final_exam', 'درجة الامتحان النهائي'],
  ['final_grade', 'الدرجة النهائية'],
];

// الحقلان المحسوبان تلقائياً من بقية الحقول.
const DERIVED = ['annual_effort', 'final_grade'];

// هل القيمة المحفوظة لحقل مشتق تساوي ناتج معادلته؟ تُستعمل عند رسم الشبكة
// للتمييز بين «محسوب تلقائياً» و«تجاوز يدوي وضعه مدرّس» — فالقيمة وحدها لا
// تكفي للحكم. عند غياب وحدة الحساب نفترض «يدوي» تحفّظاً: الافتراض الآمن هو
// عدم دهس رقم كتبه إنسان.
function matchesCanonical(row, field) {
  const calc = window.RafidainGradeCalc;
  if (!calc) return false;
  const computed = field === 'annual_effort'
    ? calc.computeAnnualEffort(row).value
    : calc.computeFinalGrade({ annual_effort: row.annual_effort, final_exam: row.final_exam }).value;
  return computed !== null && Math.abs(Number(row[field]) - computed) <= calc.CONSISTENCY_EPSILON;
}

// true عندما تكون في شبكة الدرجات تعديلات غير محفوظة؛ يفحصها الموجّه
// وزر الخروج وbeforeunload كي لا يضيع عمل المدرس دون تنبيه.
let gradesDirty = false;
// تسجلها شاشة الدرجات ليستدعيها الموجّه: تعرض شريط «تغييرات غير محفوظة».
let gradesPrompt = null;

async function renderGradesView() {
  view.innerHTML = '';
  const root = el(`<div class="rise">
    <h2 class="view-title">إدخال الدرجات</h2>
    <p class="view-sub">اختر الشعبة والمادة ليظهر جدول الطلبة، وكل الدرجات من ٠ إلى ١٠٠.</p>
    <div class="card">
      <div class="status-line">${iconHtml('arrowRight')}<span id="gStatus" aria-live="polite"></span></div>
      <div id="gUnsaved"></div>
      <div class="toolbar">
        <select class="input" id="gDept" aria-label="القسم"><option value="">القسم</option></select>
        <select class="input" id="gStage" disabled aria-label="المرحلة"><option value="">المرحلة</option></select>
        <select class="input" id="gSec" disabled aria-label="الشعبة"><option value="">الشعبة</option></select>
        <select class="input" id="gSub" disabled aria-label="المادة"><option value="">المادة</option></select>
      </div>
      <div id="gridWrap"></div>
    </div>
  </div>`);
  view.appendChild(root);
  injectIcons(root);

  const gDept = root.querySelector('#gDept');
  const gStage = root.querySelector('#gStage');
  const gSec = root.querySelector('#gSec');
  const gSub = root.querySelector('#gSub');
  const statusEl = root.querySelector('#gStatus');
  const unsavedHost = root.querySelector('#gUnsaved');
  const gridWrap = root.querySelector('#gridWrap');
  let subjects = [];
  let currentMode = null;
  let gridCounts = { total: 0, filled: 0 };
  gradesDirty = false;

  function selectedText(select) {
    const opt = select.options[select.selectedIndex];
    return opt ? opt.textContent : '';
  }

  /* شريط «تغييرات غير محفوظة» — بديل نافذة confirm للموجّه والقوائم */
  function showUnsavedStrip(onProceed) {
    unsavedHost.innerHTML = '';
    const strip = el(`<div class="unsaved-strip" role="group" aria-label="تغييرات غير محفوظة">
      <span class="confirm-msg">توجد درجات غير محفوظة — احفظها أولاً من زر «حفظ الدرجات»، أو تابع وستضيع التعديلات.</span>
      <button type="button" class="btn btn-danger btn-sm" data-go>المتابعة دون حفظ</button>
      <button type="button" class="btn btn-primary btn-sm" data-stay>البقاء هنا</button>
    </div>`);
    strip.querySelector('[data-go]').onclick = () => {
      gradesDirty = false;
      unsavedHost.innerHTML = '';
      onProceed();
    };
    strip.querySelector('[data-stay]').onclick = () => { unsavedHost.innerHTML = ''; };
    unsavedHost.appendChild(strip);
    strip.querySelector('[data-stay]').focus();
    strip.scrollIntoView({ block: 'nearest' });
  }
  gradesPrompt = showUnsavedStrip;

  // تغيير قائمة أثناء وجود تعديلات: تُرجَع القائمة لقيمتها ويُعرض الشريط،
  // وعند «المتابعة دون حفظ» يُطبَّق الاختيار الذي حاوله المدرس.
  function guardedChange(select, apply) {
    select.onchange = () => {
      if (!gradesDirty) {
        select.dataset.prev = select.value;
        apply();
        return;
      }
      const attempted = select.value;
      select.value = select.dataset.prev || '';
      showUnsavedStrip(() => {
        select.value = attempted;
        select.dataset.prev = attempted;
        apply();
      });
    };
  }

  function updatePointer() {
    const mark = (elm) => {
      root.querySelectorAll('.next-target').forEach(n => n.classList.remove('next-target'));
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
    const actions = gridWrap.querySelector('.grades-actions');
    if (actions) actions.classList.toggle('is-dirty', gradesDirty);
    if (gradesDirty) { statusEl.textContent = 'توجد درجات غير محفوظة — اضغط «حفظ الدرجات» عند الانتهاء.'; updatePointer(); return; }
    if (!gDept.value) { statusEl.textContent = 'اختر القسم أولاً.'; updatePointer(); return; }
    if (!gStage.value) { statusEl.textContent = `اخترت: ${selectedText(gDept)}. الآن اختر المرحلة.`; updatePointer(); return; }
    if (!gSec.value) { statusEl.textContent = `اخترت: ${selectedText(gStage)}. الآن اختر الشعبة.`; updatePointer(); return; }
    if (!gSub.value) { statusEl.textContent = 'اخترت الشعبة. الآن اختر المادة.'; updatePointer(); return; }
    if (currentMode === 'final_only') {
      const remaining = gridCounts.total - gridCounts.filled;
      statusEl.textContent = remaining === 0
        ? 'تم إدخال درجات جميع الطلبة — اضغط «حفظ».'
        : `أدخل الدرجة النهائية لكل طالب ثم اضغط «حفظ» — بقي ${arDigits(remaining)} من ${arDigits(gridCounts.total)}.`;
      updatePointer();
      return;
    }
    statusEl.textContent = 'أدخل الدرجات ثم اضغط «حفظ الدرجات» أسفل الجدول.';
    updatePointer();
  }
  updateStatus();

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
    if (subjects.length === 0) {
      gSub.disabled = true;
      gridWrap.innerHTML = emptyStateHtml('book', 'لا توجد مواد لهذه المرحلة بعد', 'أضف المواد من شاشة «الأقسام والمراحل» أو من «الإضافة السريعة» ثم عد إلى هنا.');
      injectIcons(gridWrap);
      updateStatus();
      return;
    }
    for (const s of subjects) {
      const modeLabel = s.grade_mode === 'full' ? 'سجل كامل' : 'نهائية فقط';
      gSub.appendChild(el(`<option value="${s.id}">${escapeHtml(s.name)} — ${modeLabel}</option>`));
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

  guardedChange(gDept, () => { loadStages().catch(e => showToast(e.message, true)); });
  guardedChange(gStage, () => { loadSections().catch(e => showToast(e.message, true)); });
  guardedChange(gSec, () => { loadSubjectsIntoSelect(); });
  guardedChange(gSub, () => {
    if (gSub.value) loadGrid().catch(e => showToast(e.message, true));
    else { gridWrap.innerHTML = ''; updateStatus(); }
  });

  async function loadGrid() {
    gradesDirty = false;
    unsavedHost.innerHTML = '';
    const subject = subjects.find(s => s.id === Number(gSub.value));
    currentMode = subject.grade_mode;
    gridWrap.innerHTML = sklRows(4);
    const rows = await apiCall('GET', `/api/admin/grades?section_id=${gSec.value}&subject_id=${gSub.value}`);
    gridWrap.innerHTML = '';
    if (rows.length === 0) {
      gridWrap.innerHTML = emptyStateHtml('users', 'لا يوجد طلبة في هذه الشعبة', 'أضف الطلبة من شاشة «الطلبة» أو من «الإضافة السريعة» ثم عد إلى هنا.');
      injectIcons(gridWrap);
      updateStatus();
      return;
    }

    if (currentMode === 'final_only') renderFinalOnlyGrid(rows);
    else renderFullGrid(rows);
    injectIcons(gridWrap);
    updateStatus();
  }

  function saveNote(saved) {
    const host = gridWrap.querySelector('.grades-actions');
    if (!host) return;
    const prev = host.querySelector('.inline-note');
    if (prev) prev.remove();
    const note = el(`<div class="inline-note ok" style="margin:0" role="status">${iconHtml('checkCircle')}<span>تم حفظ درجات ${countStudents(saved)} بنجاح.</span></div>`);
    host.appendChild(note);
    injectIcons(note);
  }

  /* ---- السجل الكامل: ستة أعمدة بالسلوك المعهود (حساب تلقائي وتنقّل لوحة مفاتيح) ---- */
  function renderFullGrid(rows) {
    const cols = GRADE_COLS;
    const box = el(`<div>
      <p class="grades-count" id="gRemaining" aria-live="polite"></p>
      <p class="grade-rule-hint">${iconHtml('info')}كل الدرجات من ٠ إلى ١٠٠. معدل السعي والدرجة النهائية يُحسبان تلقائياً — اكتب فوق أيّهما لتثبيت قيمة يدوية، وزر الإرجاع يعيده للحساب التلقائي.</p>
      <p class="grade-rule-hint">${iconHtml('zap')}اضغط Enter للانتقال إلى الحقل التالي، وعند آخر حقل ينتقل تلقائياً إلى الطالب التالي. الحفظ يجري تلقائياً بعد لحظة من التوقف عن الكتابة.</p>
      <div class="table-wrap"><table class="grades">
        <thead><tr><th>الطالب</th>${cols.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead>
        <tbody></tbody>
      </table></div>
    </div>`);
    const tbody = box.querySelector('tbody');

    for (const r of rows) {
      const tr = el(`<tr data-student="${r.student_id}">
        <td class="subject-name">${escapeHtml(r.student_name)}<br><span class="exam-chip">${escapeHtml(r.exam_number)}</span></td>
        ${cols.map(([k, label]) => {
          const derived = DERIVED.includes(k);
          const val = r[k] ?? '';
          // حقل مشتق محفوظ سابقاً لا يُفترَض يدوياً لمجرد أنه يحمل قيمة: نقارنه
          // بناتج معادلته؛ إن طابقه فهو محسوب تلقائياً ويبقى متزامناً، وإن خالفه
          // فهو تجاوز يدوي حقيقي وضعه مدرّس ولا يجوز أن يدهسه الحساب التلقائي.
          const isManual = derived && val !== '' && !matchesCanonical(r, k);
          return `<td class="${derived ? 'is-derived' : ''}">
            <input class="input grade-in${derived ? ' derived-in' : ''}" data-field="${k}" inputmode="decimal"
                   aria-label="${escapeHtml(label)} — ${escapeHtml(r.student_name)}"
                   value="${val}" data-prev="${val}"${isManual ? ' data-manual="1"' : ''}>
            ${derived ? `<button type="button" class="restore-auto" data-restore="${k}" tabindex="-1"
                   title="إرجاع الحساب التلقائي" aria-label="إرجاع الحساب التلقائي لحقل ${escapeHtml(label)}">${iconHtml('refresh')}</button>` : ''}
          </td>`;
        }).join('')}
      </tr>`);
      tbody.appendChild(tr);
    }
    gridWrap.appendChild(box);

    const actions = el(`<div class="grades-actions">
      <button type="button" class="btn btn-primary">${iconHtml('save')}حفظ الدرجات</button>
      <span class="dirty-flag">${iconHtml('alertTriangle')}تغييرات غير محفوظة</span>
    </div>`);
    gridWrap.appendChild(actions);
    const saveBtn = actions.querySelector('button');

    /* ---- تنقّل لوحة المفاتيح، الحساب الحيّ، والحفظ التلقائي ----
       التنقّل مصمَّم ليد واحدة لا تغادر لوحة المفاتيح: Enter يتقدّم حقلاً حقلاً
       داخل الطالب، وعند آخر حقل يقفز إلى أول حقل عند الطالب التالي. الأسهم
       تتحرك مكانياً (والاتجاه أفقياً معكوس لأن الجدول RTL). */
    const inputsOf = (tr) => [...tr.querySelectorAll('input[data-field]')];
    const rowsList = () => [...tbody.querySelectorAll('tr')];

    function focusInput(inp) {
      if (!inp) return;
      inp.focus();
      inp.select();
      inp.closest('tr').scrollIntoView({ block: 'nearest' });
    }

    // الحقل التالي في ترتيب الإدخال: داخل الطالب أولاً، ثم أول حقل عند التالي.
    function advance(input, back) {
      const tr = input.closest('tr');
      const fields = inputsOf(tr);
      const i = fields.indexOf(input);
      if (!back && i < fields.length - 1) return fields[i + 1];
      if (back && i > 0) return fields[i - 1];
      const rows = rowsList();
      const ri = rows.indexOf(tr);
      const nextRow = back ? rows[ri - 1] : rows[ri + 1];
      if (!nextRow) return null;
      const nf = inputsOf(nextRow);
      return back ? nf[nf.length - 1] : nf[0];
    }

    function sameFieldInRow(input, dir) {
      const tr = input.closest('tr');
      const target = dir < 0 ? tr.previousElementSibling : tr.nextElementSibling;
      return target ? target.querySelector(`input[data-field="${input.dataset.field}"]`) : null;
    }

    box.querySelectorAll('input[data-field]').forEach(input => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
        if (parseFloat(input.value) > 100) input.value = '100';
        // الكتابة في حقل مشتق تعني تجاوزاً يدوياً مقصوداً — يُعلَن للخادم.
        if (DERIVED.includes(input.dataset.field)) input.dataset.manual = '1';
        autoCompute(input.closest('tr'));
        markRowDirty(input.closest('tr'));
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          input.value = input.dataset.prev || '';
          if (DERIVED.includes(input.dataset.field)) delete input.dataset.manual;
          autoCompute(input.closest('tr'));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          flushRow(input.closest('tr'));
          focusInput(advance(input, e.shiftKey));
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          focusInput(sameFieldInRow(input, e.key === 'ArrowDown' ? 1 : -1));
          return;
        }
        // الجدول RTL: العمود التالي يقع بصرياً إلى اليسار.
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          if (input.selectionStart !== input.selectionEnd || input.value.length > 0) {
            const atEdge = e.key === 'ArrowLeft'
              ? input.selectionStart === input.value.length
              : input.selectionStart === 0;
            if (!atEdge) return; // اترك السهم يحرّك المؤشر داخل النص
          }
          e.preventDefault();
          const fields = inputsOf(input.closest('tr'));
          const i = fields.indexOf(input);
          focusInput(e.key === 'ArrowLeft' ? fields[i + 1] : fields[i - 1]);
        }
      });
    });

    // زر «إرجاع الحساب التلقائي» على الحقلين المشتقّين.
    box.querySelectorAll('[data-restore]').forEach(btn => {
      btn.onclick = () => {
        const tr = btn.closest('tr');
        const inp = tr.querySelector(`input[data-field="${btn.dataset.restore}"]`);
        delete inp.dataset.manual;
        autoCompute(tr);
        markRowDirty(tr);
        focusInput(inp);
      };
    });

    /* الحساب الحيّ يستعمل وحدة الخادم نفسها (src/grades/calc.js تُقدَّم على
       /js/grade-calc.js)، فلا يمكن أن يختلف رقم يراه المدرّس عن رقم يخزّنه
       الخادم. إن تعذّر تحميلها لأي سبب نمتنع عن الحساب بدل التخمين بمعادلة
       ثانية قد تنحرف — الخادم يبقى المرجع ويملأ الحقلين عند الحفظ. */
    function autoCompute(tr) {
      const calc = window.RafidainGradeCalc;
      if (!calc) return;
      const get = f => { const i = tr.querySelector(`[data-field="${f}"]`); return i && i.value !== '' ? parseFloat(i.value) : null; };
      const set = (f, v) => {
        const i = tr.querySelector(`[data-field="${f}"]`);
        if (i && i.dataset.manual !== '1') i.value = (v === null ? '' : v);
      };
      set('annual_effort', calc.computeAnnualEffort({
        first_term_avg: get('first_term_avg'), midyear: get('midyear'), second_term_avg: get('second_term_avg'),
      }).value);
      set('final_grade', calc.computeFinalGrade({
        annual_effort: get('annual_effort'), final_exam: get('final_exam'),
      }).value);
      tr.querySelectorAll('input[data-field]').forEach(i => {
        i.classList.toggle('is-auto', DERIVED.includes(i.dataset.field) && i.dataset.manual !== '1' && i.value !== '');
      });
    }

    function entryOf(tr) {
      const entry = { student_id: Number(tr.dataset.student), manual_fields: [] };
      for (const [k] of cols) {
        const i = tr.querySelector(`[data-field="${k}"]`);
        entry[k] = i.value !== '' ? parseFloat(i.value) : null;
        if (DERIVED.includes(k) && i.dataset.manual === '1') entry.manual_fields.push(k);
      }
      return entry;
    }

    /* ---- الحفظ التلقائي: يبدأ بعد سكون قصير، ولا يفقد إدخالاً أبداً.
       الفشل يُبقي القيم على الشاشة ويُعلن نفسه بصوت عالٍ بدل أن يبتلعه. ---- */
    const AUTOSAVE_MS = 1100;
    const timers = new Map();
    const dirtyRows = new Set();

    function setRowState(tr, state, msg) {
      let flag = tr.querySelector('.row-state');
      if (!flag) {
        flag = el('<span class="row-state"></span>');
        tr.querySelector('td').appendChild(flag);
      }
      flag.className = `row-state ${state}`;
      flag.textContent = msg;
    }

    function markRowDirty(tr) {
      dirtyRows.add(tr);
      gradesDirty = true;
      updateStatus();
      setRowState(tr, 'pending', 'لم يُحفظ بعد');
      clearTimeout(timers.get(tr));
      timers.set(tr, setTimeout(() => saveRow(tr), AUTOSAVE_MS));
    }

    function flushRow(tr) {
      if (!dirtyRows.has(tr)) return;
      clearTimeout(timers.get(tr));
      saveRow(tr);
    }

    async function saveRow(tr) {
      if (!dirtyRows.has(tr)) return;
      clearTimeout(timers.get(tr));
      const entry = entryOf(tr);
      setRowState(tr, 'saving', 'يُحفظ…');
      try {
        await apiCall('PUT', '/api/admin/grades', { subject_id: Number(gSub.value), entries: [entry] });
        dirtyRows.delete(tr);
        // القيم المحفوظة تصبح مرجع التراجع بـ Escape.
        tr.querySelectorAll('input[data-field]').forEach(i => { i.dataset.prev = i.value; });
        setRowState(tr, 'saved', 'محفوظ');
        setTimeout(() => { if (!dirtyRows.has(tr)) { const f = tr.querySelector('.row-state'); if (f) f.remove(); } }, 2200);
        if (dirtyRows.size === 0) { gradesDirty = false; unsavedHost.innerHTML = ''; }
        refreshCounts();
        updateStatus();
      } catch (e) {
        // لا تُمسح القيم ولا يُزال وسم «غير محفوظ» — الإدخال يبقى ملك المدرّس.
        setRowState(tr, 'failed', 'تعذّر الحفظ');
        showToast(e.message, true);
      }
    }

    function refreshCounts() {
      const rows = rowsList();
      gridCounts.total = rows.length;
      gridCounts.filled = rows.filter(tr => {
        const fg = tr.querySelector('[data-field="final_grade"]');
        return fg && fg.value !== '';
      }).length;
      const c = gridWrap.querySelector('#gRemaining');
      if (c) {
        const left = gridCounts.total - gridCounts.filled;
        c.textContent = left === 0
          ? `اكتملت درجات ${countStudents(gridCounts.total)}.`
          : `بقي ${countStudents(left)} بلا درجة نهائية من أصل ${gridCounts.total}.`;
      }
    }
    refreshCounts();

    // الحفظ اليدوي يبقى موجوداً لمن يفضّل زراً صريحاً — يحفظ كل ما لم يُحفظ.
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      try {
        const pending = [...dirtyRows];
        if (pending.length === 0) { showToast('لا توجد تغييرات غير محفوظة'); return; }
        for (const tr of pending) await saveRow(tr);
        if (dirtyRows.size === 0) { saveNote(pending.length); showToast(`تم حفظ درجات ${countStudents(pending.length)}`); }
      } finally { saveBtn.disabled = false; }
    };
  }

  /* ---- «النهائية فقط»: صندوق واحد لكل طالب — المسار الأسهل.
     مهم: كل مدخلة تحمل مفتاح final_grade فقط؛ الخادم لا يمس إلا الحقول
     الموجودة في الحمولة (نمط has_<field>)، فلا تُصفَّر أعمدة التفاصيل. ---- */
  function renderFinalOnlyGrid(rows) {
    const wrap = el(`<div>
      <p class="grades-count" id="gCount" aria-live="polite"></p>
      <div class="fo-list"></div>
      <div class="grades-actions">
        <button type="button" class="btn btn-primary" id="gFoSave">${iconHtml('save')}حفظ</button>
        <span class="dirty-flag">${iconHtml('alertTriangle')}تغييرات غير محفوظة</span>
      </div>
    </div>`);
    const list = wrap.querySelector('.fo-list');
    const countEl = wrap.querySelector('#gCount');

    function updateCount() {
      const inputs = [...list.querySelectorAll('input.fo-grade')];
      gridCounts.total = inputs.length;
      gridCounts.filled = inputs.filter(i => i.value !== '').length;
      countEl.textContent = `تم إدخال ${arDigits(gridCounts.filled)} من ${arDigits(gridCounts.total)}`;
    }

    for (const r of rows) {
      // القيم المحملة غير الفارغة تحمل data-manual كي لا يكتب الحساب
      // التلقائي فوقها إذا بُدّلت المادة لاحقاً إلى السجل الكامل.
      const isManual = r.final_grade !== null && r.final_grade !== undefined && r.final_grade !== '';
      const row = el(`<div class="fo-row" data-student="${r.student_id}">
        <span class="fo-name">${escapeHtml(r.student_name)} <span class="exam-chip">${escapeHtml(r.exam_number)}</span></span>
        <span class="fo-grade-wrap">
          <input class="input fo-grade" data-field="final_grade" inputmode="numeric" aria-label="الدرجة النهائية للطالب ${escapeHtml(r.student_name)}" value="${r.final_grade ?? ''}"${isManual ? ' data-manual="1"' : ''}>
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
      // final_grade فقط في كل مدخلة — أعمدة التفاصيل لا تُرسل إطلاقاً.
      const entries = [...list.querySelectorAll('.fo-row')].map(row => {
        const input = row.querySelector('input.fo-grade');
        return {
          student_id: Number(row.dataset.student),
          final_grade: input.value !== '' ? parseFloat(input.value) : null,
        };
      });
      const saveBtn = wrap.querySelector('#gFoSave');
      saveBtn.disabled = true;
      try {
        const r = await apiCall('PUT', '/api/admin/grades', { subject_id: Number(gSub.value), entries });
        gradesDirty = false;
        unsavedHost.innerHTML = '';
        saveNote(r.saved);
        showToast(`تم حفظ درجات ${countStudents(r.saved)}`);
        updateStatus();
      } catch (e) { showToast(e.message, true); }
      finally { saveBtn.disabled = false; }
    };
  }

  /* ---- استكمال السياق من الإضافة السريعة أو زيارة سابقة —
     لا يُعاد اختيار القسم والمرحلة والشعبة هنا أبداً ---- */
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

/* ==========================================================================
   شاشة كلمة المرور
   ========================================================================== */
async function renderPasswordView() {
  view.innerHTML = '';
  const root = el(`<div class="rise" style="max-width:480px">
    <h2 class="view-title">كلمة المرور</h2>
    <p class="view-sub">غيّر كلمة مرور لوحة الإدارة. يجب ألا تقل الجديدة عن ٨ أحرف.</p>
    <div class="card">
      <div class="field" style="margin-bottom:var(--space-4)">
        <label for="curPass">كلمة المرور الحالية</label>
        <input class="input" type="password" id="curPass" autocomplete="current-password">
      </div>
      <div class="field" style="margin-bottom:var(--space-4)">
        <label for="newPass">كلمة المرور الجديدة</label>
        <input class="input" type="password" id="newPass" autocomplete="new-password">
        <span class="field-hint">٨ أحرف على الأقل — يُفضَّل مزج حروف وأرقام.</span>
      </div>
      <div class="field" style="margin-bottom:var(--space-4)">
        <label for="confPass">تأكيد كلمة المرور الجديدة</label>
        <input class="input" type="password" id="confPass" autocomplete="new-password">
      </div>
      <div id="passMsg"></div>
      <button type="button" class="btn btn-primary btn-block" id="savePass">${iconHtml('save')}حفظ كلمة المرور</button>
    </div>
  </div>`);
  view.appendChild(root);
  injectIcons(root);

  const curPass = root.querySelector('#curPass');
  const newPass = root.querySelector('#newPass');
  const confPass = root.querySelector('#confPass');
  const msgHost = root.querySelector('#passMsg');
  const saveBtn = root.querySelector('#savePass');

  function showMsg(type, text) {
    msgHost.innerHTML = `<div class="inline-note ${type}" role="status">${iconHtml(type === 'ok' ? 'checkCircle' : 'alert')}<span>${escapeHtml(text)}</span></div>`;
    injectIcons(msgHost);
  }

  async function save() {
    msgHost.innerHTML = '';
    if (!curPass.value) { showMsg('danger', 'اكتب كلمة المرور الحالية أولاً.'); curPass.focus(); return; }
    if (newPass.value.length < 8) { showMsg('danger', 'كلمة المرور الجديدة يجب أن تكون ٨ أحرف على الأقل.'); newPass.focus(); return; }
    if (newPass.value !== confPass.value) { showMsg('danger', 'كلمتا المرور غير متطابقتين — أعد كتابة التأكيد.'); confPass.focus(); return; }
    saveBtn.disabled = true;
    try {
      await apiCall('POST', '/api/admin/password', { current_password: curPass.value, new_password: newPass.value });
      curPass.value = ''; newPass.value = ''; confPass.value = '';
      showMsg('ok', 'تم تغيير كلمة المرور بنجاح.');
      showToast('تم تغيير كلمة المرور');
    } catch (e) { showMsg('danger', e.message); }
    finally { saveBtn.disabled = false; }
  }
  saveBtn.onclick = save;
  [curPass, newPass, confPass].forEach(inp =>
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }));
}

/* ==========================================================================
   الموجّه والتمهيد
   ========================================================================== */
const routes = {
  quick: renderQuickView,
  catalog: renderCatalogView,
  students: renderStudentsView,
  grades: renderGradesView,
  import: renderImportView,
  password: renderPasswordView,
};

function doRoute(name) {
  document.querySelectorAll('.nav-btn[data-route]').forEach(b => {
    const active = b.dataset.route === name;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  Promise.resolve((routes[name] || renderQuickView)())
    .catch(e => showToast(e.message, true));
}

function route(name) {
  if (gradesDirty && typeof gradesPrompt === 'function') {
    gradesPrompt(() => doRoute(name));
    return;
  }
  doRoute(name);
}

document.querySelectorAll('.nav-btn[data-route]').forEach(b =>
  b.addEventListener('click', () => route(b.dataset.route)));

document.getElementById('logoutBtn').addEventListener('click', () => {
  const doLogout = async () => {
    try {
      await apiCall('POST', '/api/admin/logout');
      location.href = '/admin-login.html';
    } catch (e) { showToast(e.message, true); }
  };
  if (gradesDirty && typeof gradesPrompt === 'function') {
    gradesPrompt(doLogout);
    return;
  }
  doLogout();
});

window.addEventListener('beforeunload', (e) => {
  if (!gradesDirty) return;
  e.preventDefault();
  e.returnValue = '';
});

/* جرس الإشعارات في الترويسة */
(function wireNotifBell() {
  const bell = document.getElementById('notifBell');
  if (!bell) return;
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    if (notifCenter.panelOpen) closeNotifPanel();
    else openNotifPanel();
  });
  document.addEventListener('click', (e) => {
    if (notifCenter.panelOpen && !e.target.closest('.bell-wrap')) closeNotifPanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notifCenter.panelOpen) closeNotifPanel();
  });
})();

function renderBootError() {
  view.innerHTML = '';
  const box = el(`<div class="boot-error card">
    ${iconHtml('alert')}
    <h2>تعذر فتح لوحة الإدارة</h2>
    <p>${escapeHtml(NET_ERR)}</p>
    <button type="button" class="btn btn-primary">${iconHtml('refresh')}إعادة المحاولة</button>
  </div>`);
  box.querySelector('button').onclick = boot;
  view.appendChild(box);
  injectIcons(box);
}

function boot() {
  injectIcons();
  apiCall('GET', '/api/admin/me')
    .then(() => route('quick'))
    .catch((e) => {
      // فشل 401 يعيد التوجيه من داخل apiCall؛ ما يصل هنا فشل شبكة.
      if (e && e.message === NET_ERR) renderBootError();
    });
}

boot();
