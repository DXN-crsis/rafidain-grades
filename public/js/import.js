/* ==========================================================================
   استيراد الطلبة من ملف — يبني فوق العقد الثابت في src/routes/import.js
   (POST /api/admin/import/preview متعدد الأجزاء، POST /api/admin/import/commit
   JSON). تدفّق واحد موجّه: الشعبة ← الملف ← المعاينة والتأكيد ← النتيجة.
   يعيد استخدام مكوّن .q-step من الإضافة السريعة ليبقى شكل الخطوات واحداً في
   كل الشاشة، ويمرّ كل نجاح وفشل عبر مركز الإشعارات (notify) في admin.js.

   قواعد ثابتة من admin.js تُتَّبع هنا حرفياً:
   - كل نص قادم من الملف المرفوع أو من استجابة الخادم يمر عبر escapeHtml.
   - لا window.prompt ولا alert ولا confirm.
   - مؤشرات التحميل حقيقية (تقدّم رفع فعلي عبر XMLHttpRequest)، لا وهمية.
   ========================================================================== */
(function () {
  'use strict';

  const ACCEPT = '.xlsx,.xls,.csv,.docx';
  const MAX_BYTES = 5 * 1024 * 1024;
  const ERR_TOO_BIG = 'حجم الملف يتجاوز الحد المسموح (٥ ميغابايت)';
  const ERR_TOKEN_RE = /انتهت صلاحية/;

  const BUCKET_LABEL = {
    valid: 'سيُضاف',
    duplicate_in_file: 'مكرر في الملف',
    duplicate_in_db: 'مسجل مسبقاً',
    skipped: 'متجاوز',
    invalid: 'غير صالح',
  };
  const BUCKET_CLASS = {
    valid: 'is-valid',
    duplicate_in_file: 'is-dup',
    duplicate_in_db: 'is-dup',
    skipped: 'is-skip',
    invalid: 'is-invalid',
  };
  const BUCKET_ORDER = ['valid', 'duplicate_in_file', 'duplicate_in_db', 'skipped', 'invalid'];
  const CONF_LABEL = { high: 'ثقة عالية', medium: 'ثقة متوسطة', low: 'ثقة منخفضة' };
  const CONF_BADGE = { high: 'badge-mode full', medium: 'badge-mode', low: 'badge-fail' };

  let prefill = null; // {id, name, path} مضبوطة من openImportFlow()، تُستهلك عند أول رسم

  // نقطة الدخول الوحيدة من باقي admin.js: تمرّر الشعبة الحالية إن وُجدت
  // (أو null فتُعرض خطوة اختيار الشعبة) ثم تنتقل عبر الموجّه القائم أصلاً،
  // فتستفيد مجاناً من حارس «درجات غير محفوظة» في route().
  function openImportFlow(section) {
    prefill = section || null;
    route('import');
  }
  window.openImportFlow = openImportFlow;

  /* ---- مساعد الرفع متعدد الأجزاء — يطابق معالجة أخطاء apiCall حرفياً
     (فشل شبكة عربي موحّد، تحويل عند 401، رسالة الخادم عند فشل غير ناجح)،
     لكن عبر XMLHttpRequest كي يتيح تقدّم رفع حقيقياً — لا وهمياً — لملف
     قد يبلغ ٥ ميغابايت ويستغرق وقتاً فعلياً. ---- */
  function apiUpload(url, formData, { onProgress, onXhr } = {}) {
    return new Promise((resolve, reject) => {
      let xhr;
      try { xhr = new XMLHttpRequest(); } catch { reject(new Error(NET_ERR)); return; }
      if (onXhr) onXhr(xhr);
      xhr.open('POST', url);
      xhr.responseType = 'json';
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); });
      }
      xhr.addEventListener('error', () => reject(new Error(NET_ERR)));
      xhr.addEventListener('timeout', () => reject(new Error(NET_ERR)));
      xhr.addEventListener('abort', () => reject(new Error(NET_ERR)));
      xhr.addEventListener('load', () => {
        if (xhr.status === 401) {
          location.href = '/admin-login.html';
          reject(new Error('انتهت الجلسة — يجري تحويلك لتسجيل الدخول'));
          return;
        }
        let data = xhr.response;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch { data = null; }
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error((data && data.error) || 'حدث خطأ'));
          return;
        }
        resolve(data);
      });
      xhr.send(formData);
    });
  }

  function fileSizeLabel(bytes) {
    if (bytes < 1024) return `${arDigits(bytes)} بايت`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${arDigits(Math.round(kb))} كيلوبايت`;
    return `${arDigits(Math.round((kb / 1024) * 10) / 10)} ميغابايت`;
  }

  // تاريخ اليوم لورقة الطباعة فقط — أرقام عربية-هندية مثل بقية نصوص الحالة.
  function todayLabel() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return arDigits(`${y}/${m}/${day}`);
  }

  function pctLabel(fraction) {
    return `${arDigits(Math.round(fraction * 100))}٪`;
  }

  /* ========================================================================
     الشاشة — routes.import (مُسجَّلة إضافياً في admin.js)
     ======================================================================== */
  async function renderImportView() {
    view.innerHTML = '';

    const ui = {
      section: prefill,           // {id, name, path} | null
      file: null,                 // كائن File المختار حالياً
      phase: 'idle',              // idle | uploading | parsing
      progress: 0,
      preview: null,              // استجابة المعاينة كاملة كما وصلت من الخادم
      rowChecked: new Map(),      // row_number -> boolean
      filter: null,               // تصفية جدول الصفوف حسب الفئة
      overrideOpen: false,
      overrideCol: null,
      committing: false,
      tokenExpired: false,
      result: null,               // {imported, students, rejected}
    };
    prefill = null;

    const root = el(`<div class="import-flow rise">
      <h2 class="view-title">استيراد الطلبة من ملف</h2>
      <p class="view-sub">استورد كشفاً كاملاً بالطلبة من ملف Excel أو Word أو CSV دفعة واحدة، بدل إدخالهم واحداً واحداً.</p>
      <div class="status-line">${iconHtml('arrowRight')}<span id="impStatus" aria-live="polite"></span></div>
      <div id="impSteps"></div>
    </div>`);
    view.appendChild(root);
    injectIcons(root);
    const stepsHost = root.querySelector('#impSteps');
    const statusEl = root.querySelector('#impStatus');

    function setStatus(t) { statusEl.textContent = t; }

    /* ---- لبنة خطوة مطابقة لمكوّن q-step في الإضافة السريعة، لنفس الهوية البصرية ---- */
    function stepShell(num, key, title, stateName, { summary, waitReason, collapsed } = {}) {
      const doneNum = stateName === 'done' ? iconHtml('check') : arDigits(num);
      return el(`<section class="q-step" data-state="${stateName}" data-step="${key}" aria-label="${escapeHtml(title)}">
        <div class="q-head">
          <span class="q-num">${doneNum}</span>
          <span class="q-title">${escapeHtml(title)}</span>
          ${collapsed && summary ? `<span class="q-summary">${summary}</span>` : ''}
          ${collapsed ? `<button type="button" class="btn btn-ghost btn-sm q-edit-btn" data-edit>${iconHtml('edit')}<span class="label">تغيير</span></button>` : ''}
        </div>
        ${stateName === 'waiting' ? `<p class="q-wait">${iconHtml('lock')}${escapeHtml(waitReason || '')}</p>` : ''}
        <div class="q-body" ${collapsed || stateName === 'waiting' ? 'hidden' : ''}></div>
      </section>`);
    }

    /* ====================================================================
       الخطوة ١ — الشعبة (تُتخطى بصرياً إن وصلت مُهيّأة من شاشة الطلبة)
       ==================================================================== */
    let deptCache = null;

    async function paintSectionBody(body) {
      if (!deptCache) {
        body.innerHTML = sklRows(2);
        try {
          const depts = await apiCall('GET', '/api/admin/departments');
          deptCache = { depts };
        } catch (e) {
          body.innerHTML = `<div class="inline-note danger">${iconHtml('alert')}<span>${escapeHtml(e.message)}</span></div>`;
          injectIcons(body); // استدعاء ضروري هنا: يقع خارج التزامن مع الرسم الرئيسي
          return;
        }
      }
      body.innerHTML = '';
      if (deptCache.depts.length === 0) {
        body.innerHTML = emptyStateHtml('layers', 'لا توجد أقسام أو شعب بعد', 'أنشئ قسماً ومرحلة وشعبة أولاً من شاشة «الأقسام والمراحل».');
        const goBtn = el(`<button type="button" class="btn btn-soft" style="margin-top:var(--space-3)">${iconHtml('layers')}الذهاب إلى الأقسام والمراحل</button>`);
        goBtn.onclick = () => route('catalog');
        body.appendChild(goBtn);
        injectIcons(body);
        return;
      }
      const row = el(`<div class="import-section-picker">
        <select class="input" id="impDept" aria-label="القسم"><option value="">اختر القسم</option></select>
        <select class="input" id="impStage" disabled aria-label="المرحلة"><option value="">اختر المرحلة</option></select>
        <select class="input" id="impSec" disabled aria-label="الشعبة"><option value="">اختر الشعبة</option></select>
      </div>`);
      body.appendChild(row);
      const dSel = row.querySelector('#impDept');
      const stSel = row.querySelector('#impStage');
      const seSel = row.querySelector('#impSec');
      for (const d of deptCache.depts) dSel.appendChild(el(`<option value="${d.id}">${escapeHtml(d.name)}</option>`));

      function fillSelect(sel, items, placeholder) {
        sel.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
        for (const it of items) sel.appendChild(el(`<option value="${it.id}">${escapeHtml(it.name)}</option>`));
      }

      dSel.onchange = async () => {
        stSel.disabled = true; seSel.disabled = true;
        fillSelect(stSel, [], 'اختر المرحلة'); fillSelect(seSel, [], 'اختر الشعبة');
        if (!dSel.value) return;
        try {
          const stages = await apiCall('GET', `/api/admin/stages?department_id=${dSel.value}`);
          fillSelect(stSel, stages, 'اختر المرحلة');
          stSel.disabled = false;
          if (stages.length === 1) { stSel.value = String(stages[0].id); stSel.onchange(); }
        } catch (e) { notify(e.message, 'danger'); }
      };
      stSel.onchange = async () => {
        seSel.disabled = true;
        fillSelect(seSel, [], 'اختر الشعبة');
        if (!stSel.value) return;
        try {
          const sections = await apiCall('GET', `/api/admin/sections?stage_id=${stSel.value}`);
          fillSelect(seSel, sections, 'اختر الشعبة');
          seSel.disabled = false;
          if (sections.length === 1) { seSel.value = String(sections[0].id); seSel.onchange(); }
        } catch (e) { notify(e.message, 'danger'); }
      };
      seSel.onchange = () => {
        if (!seSel.value) return;
        const path = [dSel, stSel, seSel]
          .map((s) => s.options[s.selectedIndex] && s.options[s.selectedIndex].textContent)
          .filter(Boolean).join(' — ');
        ui.section = { id: Number(seSel.value), name: seSel.options[seSel.selectedIndex].textContent, path };
        paint();
      };

      if (dSel.options.length === 2) { dSel.value = dSel.options[1].value; dSel.onchange(); }
    }

    /* ====================================================================
       الخطوة ٢ — الملف
       ==================================================================== */
    function resetFileState() {
      ui.file = null; ui.progress = 0; ui.phase = 'idle';
      ui.preview = null; ui.rowChecked = new Map(); ui.filter = null;
      ui.overrideOpen = false; ui.overrideCol = null; ui.tokenExpired = false;
    }

    function initRowChecked(preview) {
      const map = new Map();
      for (const r of preview.rows) map.set(r.row_number, r.status === 'valid');
      return map;
    }

    async function doUpload(file, nameColumnOverride) {
      if (file.size > MAX_BYTES) { notify(ERR_TOO_BIG, 'danger'); return false; }
      ui.file = file;
      ui.phase = 'uploading';
      ui.progress = 0;
      ui.tokenExpired = false;
      paint();
      const fd = new FormData();
      fd.append('section_id', String(ui.section.id));
      if (nameColumnOverride !== undefined && nameColumnOverride !== null) fd.append('name_column', String(nameColumnOverride));
      fd.append('file', file, file.name);
      try {
        const prevChecked = ui.rowChecked;
        const data = await apiUpload('/api/admin/import/preview', fd, {
          onProgress: (frac) => {
            ui.progress = frac;
            if (frac >= 1) ui.phase = 'parsing';
            updateUploadProgress();
          },
        });
        ui.phase = 'idle';
        ui.preview = data;
        ui.rowChecked = initRowChecked(data);
        // عند إعادة المعاينة بعمود مختلف على الملف نفسه، حافظ على أي تبديل
        // يدوي للمدرّس إن بقي رقم السطر نفسه ظاهراً في النتيجة الجديدة.
        if (nameColumnOverride !== undefined && prevChecked.size > 0) {
          for (const [rn, checked] of prevChecked) if (ui.rowChecked.has(rn)) ui.rowChecked.set(rn, checked);
        }
        ui.filter = null;
        paint();
        return true;
      } catch (e) {
        ui.phase = 'idle';
        if (nameColumnOverride === undefined) ui.file = null;
        notify(e.message, 'danger');
        paint();
        return false;
      }
    }

    function updateUploadProgress() {
      const bar = stepsHost.querySelector('.import-progress-fill');
      const label = stepsHost.querySelector('#impUploadLabel');
      const text = ui.phase === 'parsing' ? 'أراجع محتوى الملف…' : `أرفع الملف… ${pctLabel(ui.progress)}`;
      if (bar) bar.style.width = `${Math.min(ui.progress, 1) * 100}%`;
      if (label) label.textContent = text;
      setStatus(text);
    }

    function wireDropZone(dropEl, inputEl) {
      const openPicker = () => inputEl.click();
      dropEl.addEventListener('click', openPicker);
      dropEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
      });
      let dragDepth = 0;
      dropEl.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth += 1; dropEl.classList.add('is-drag'); });
      dropEl.addEventListener('dragover', (e) => { e.preventDefault(); });
      dropEl.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (dragDepth === 0) dropEl.classList.remove('is-drag'); });
      dropEl.addEventListener('drop', (e) => {
        e.preventDefault();
        dragDepth = 0;
        dropEl.classList.remove('is-drag');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) doUpload(f);
      });
      inputEl.addEventListener('change', () => {
        const f = inputEl.files && inputEl.files[0];
        inputEl.value = '';
        if (f) doUpload(f);
      });
    }

    /* ====================================================================
       الخطوة ٣ — المعاينة والتأكيد
       ==================================================================== */
    function checkedCount() {
      let n = 0;
      for (const v of ui.rowChecked.values()) if (v) n += 1;
      return n;
    }

    function updateConfirmBar() {
      const bar = stepsHost.querySelector('.import-confirm-bar');
      const n = checkedCount();
      if (bar) {
        const btn = bar.querySelector('[data-commit]');
        const hint = bar.querySelector('.import-confirm-hint');
        if (btn) {
          btn.disabled = n === 0 || ui.committing;
          btn.innerHTML = `${iconHtml('check')}استيراد ${escapeHtml(countStudents(n))} إلى ${escapeHtml(ui.section.name)}`;
          injectIcons(btn);
        }
        if (hint) hint.textContent = `${arDigits(n)} من ${arDigits(ui.preview.rows.length)} صفاً محدّد للاستيراد`;
      }
      const countEl = stepsHost.querySelector('.import-rows-count');
      if (countEl) countEl.textContent = `${arDigits(ui.preview.rows.length)} صفاً — ${arDigits(n)} محدّد`;
    }

    function visibleRows() {
      return ui.filter ? ui.preview.rows.filter((r) => r.status === ui.filter) : ui.preview.rows;
    }

    function renderRowsTable(host) {
      host.innerHTML = '';
      const wrap = el(
        '<div class="import-rows-wrap"><div class="table-wrap"><table class="grades import-rows-table"><thead><tr>'
        + '<th><span class="visually-hidden">تحديد</span></th><th>#</th><th>الاسم</th><th>الحالة</th><th>السبب</th>'
        + '</tr></thead><tbody></tbody></table></div></div>'
      );
      const tbody = wrap.querySelector('tbody');
      const rows = visibleRows();
      if (rows.length === 0) {
        host.innerHTML = emptyStateHtml('search', 'لا صفوف في هذه الفئة', 'اضغط على البطاقة المحدَّدة أعلاه مجدداً لإلغاء التصفية.');
        injectIcons(host);
        return;
      }
      for (const r of rows) {
        const checked = !!ui.rowChecked.get(r.row_number);
        const disabled = !r.name;
        const tr = el(`<tr class="import-row${checked ? ' is-checked' : ''}" data-row="${r.row_number}">
          <td class="import-check-cell"><label class="import-check-label">
            <input type="checkbox" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="تضمين السطر ${arDigits(r.row_number)} في الاستيراد">
          </label></td>
          <td class="import-rownum">${r.row_number}</td>
          <td class="import-rowname">${r.name ? escapeHtml(r.name) : '<span class="muted">—</span>'}</td>
          <td><span class="import-status-pill ${BUCKET_CLASS[r.status] || ''}">${escapeHtml(BUCKET_LABEL[r.status] || r.status)}</span></td>
          <td class="import-reason">${r.reason ? escapeHtml(r.reason) : '—'}</td>
        </tr>`);
        const cb = tr.querySelector('input');
        cb.addEventListener('change', () => {
          ui.rowChecked.set(r.row_number, cb.checked);
          tr.classList.toggle('is-checked', cb.checked);
          updateConfirmBar();
        });
        tbody.appendChild(tr);
      }
      host.appendChild(wrap);
    }

    async function reprocessWithColumn(colIndex) {
      if (!ui.file) return;
      await doUpload(ui.file, colIndex);
    }

    async function commit() {
      if (ui.committing) return;
      const names = [];
      for (const r of ui.preview.rows) if (ui.rowChecked.get(r.row_number)) names.push(r.name);
      if (names.length === 0) { notify('لم تُحدَّد أي أسماء للاستيراد', 'danger'); return; }
      ui.committing = true;
      updateConfirmBar();
      setStatus('أستورد الطلبة…');
      try {
        const data = await apiCall('POST', '/api/admin/import/commit', {
          token: ui.preview.token, section_id: ui.section.id, names,
        });
        ui.committing = false;
        ui.result = data;
        notify(`تم استيراد ${countStudents(data.imported)} إلى ${ui.section.name}`);
        paint();
      } catch (e) {
        ui.committing = false;
        if (ERR_TOKEN_RE.test(e.message)) {
          notify('انتهت صلاحية المعاينة — تجري إعادة تحضيرها تلقائياً من الملف نفسه', 'danger');
          setStatus('انتهت صلاحية المعاينة — أعيد تحضيرها…');
          const ok = ui.file ? await doUpload(ui.file, ui.overrideCol === null ? undefined : ui.overrideCol) : false;
          if (ok) notify('تم إعداد معاينة جديدة — راجع الأسماء ثم اضغط استيراد مرة أخرى');
          else { ui.tokenExpired = true; paint(); }
        } else {
          notify(e.message, 'danger');
          paint();
        }
      }
    }

    /* ====================================================================
       الخطوة ٤ — النتيجة
       ==================================================================== */
    function buildPrintSheet(result) {
      const rowsHtml = result.students.map((s, i) => `<tr><td>${arDigits(i + 1)}</td><td>${escapeHtml(s.name)}</td><td class="import-print-examno">${escapeHtml(s.exam_number)}</td></tr>`).join('');
      return el(`<div class="import-print-sheet" aria-hidden="true">
        <h2>إعدادية الرافدين المهنية</h2>
        <p class="import-print-meta">كشف الأرقام الامتحانية — ${escapeHtml(ui.section.name)} — ${todayLabel()}</p>
        <table>
          <thead><tr><th>#</th><th>الاسم</th><th>الرقم الامتحاني</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`);
    }

    async function copyAllResults() {
      const text = ui.result.students.map((s) => `${s.name} — ${s.exam_number}`).join('\n');
      const ok = await copyToClipboard(text);
      if (ok) notify('تم نسخ القائمة الكاملة');
      else notify('تعذر النسخ — انسخ القائمة يدوياً', 'danger');
    }

    /* ====================================================================
       الرسم الكامل — يُستدعى كاملاً عند كل تحول رئيسي في الحالة.
       تبديل صندوق تحديد صف واحد لا يستدعي هذه الدالة (يحدّث الصف والشريط
       مباشرة) كي لا يفقد المدرّس موضع التمرير داخل جدول طويل.
       ==================================================================== */
    function paint() {
      stepsHost.innerHTML = '';

      /* ---- النتيجة تحلّ محل كل الخطوات بعد نجاح الاستيراد ---- */
      if (ui.result) {
        setStatus(`تم استيراد ${countStudents(ui.result.imported)} بنجاح.`);
        const card = el(`<div class="card rise">
          <div class="inline-note ok" role="status">${iconHtml('checkCircle')}<span>تم استيراد <b>${escapeHtml(countStudents(ui.result.imported))}</b> إلى <b>${escapeHtml(ui.section.name)}</b> بنجاح.</span></div>
          <div class="import-result-actions">
            <button type="button" class="btn btn-primary" data-print>${iconHtml('printer')}طباعة القائمة</button>
            <button type="button" class="btn btn-soft" data-copyall>${iconHtml('copy')}نسخ الكل</button>
            <button type="button" class="btn btn-ghost" data-again>${iconHtml('upload')}استيراد ملف آخر</button>
            <button type="button" class="btn btn-ghost" data-back>${iconHtml('users')}العودة إلى الطلبة</button>
          </div>
          <div class="table-wrap"><table class="grades">
            <thead><tr><th>الاسم</th><th>الرقم الامتحاني</th><th></th></tr></thead>
            <tbody></tbody>
          </table></div>
        </div>`);
        const tbody = card.querySelector('tbody');
        for (const s of ui.result.students) {
          const tr = el(`<tr>
            <td class="subject-name">${escapeHtml(s.name)}</td>
            <td><span class="exam-chip">${escapeHtml(s.exam_number)}</span></td>
            <td><button type="button" class="btn btn-ghost btn-sm" data-copy-one>${iconHtml('copy')}نسخ</button></td>
          </tr>`);
          wireCopyButton(tr.querySelector('[data-copy-one]'), s.exam_number);
          tbody.appendChild(tr);
        }
        if (ui.result.rejected && ui.result.rejected.length > 0) {
          card.appendChild(el(`<h3 class="import-rejected-title">${iconHtml('alertTriangle')}لم يُستورد (${arDigits(ui.result.rejected.length)})</h3>`));
          const list = el('<div class="list-stack import-rejected-list"></div>');
          for (const r of ui.result.rejected) {
            list.appendChild(el(`<div class="list-row">
              <span class="grow">${escapeHtml(r.name)}</span>
              <span class="import-reject-reason">${escapeHtml(r.reason)}</span>
            </div>`));
          }
          card.appendChild(list);
        }
        card.appendChild(buildPrintSheet(ui.result));
        card.querySelector('[data-print]').onclick = () => window.print();
        card.querySelector('[data-copyall]').onclick = copyAllResults;
        card.querySelector('[data-again]').onclick = () => { resetFileState(); ui.result = null; paint(); };
        card.querySelector('[data-back]').onclick = () => route('students');
        stepsHost.appendChild(card);
        injectIcons(stepsHost);
        return;
      }

      const secDone = !!ui.section;

      /* ---- الخطوة ١: الشعبة ---- */
      const stepSec = stepShell(1, 'section', 'الشعبة', secDone ? 'done' : 'active', {
        collapsed: secDone,
        summary: ui.section ? `<b>${escapeHtml(ui.section.path || ui.section.name)}</b>` : '',
      });
      if (!secDone) paintSectionBody(stepSec.querySelector('.q-body')).catch((e) => notify(e.message, 'danger'));
      stepsHost.appendChild(stepSec);

      /* ---- الخطوة ٢: الملف ---- */
      const fileDone = !!ui.preview;
      const stepFile = stepShell(2, 'file', 'الملف', !secDone ? 'waiting' : (fileDone ? 'done' : 'active'), {
        collapsed: fileDone,
        summary: ui.file ? `<b>${escapeHtml(ui.file.name)}</b>` : '',
        waitReason: 'اختر الشعبة أولاً',
      });
      if (secDone && !fileDone) {
        const body = stepFile.querySelector('.q-body');
        if (ui.phase === 'uploading' || ui.phase === 'parsing') {
          body.appendChild(el(`<div class="import-file-chip">
            <span class="import-file-chip-icon">${iconHtml('file')}</span>
            <span class="import-file-chip-text">
              <span class="import-file-chip-name">${escapeHtml(ui.file.name)}</span>
              <span class="import-file-chip-sub" id="impUploadLabel">${ui.phase === 'parsing' ? 'أراجع محتوى الملف…' : `أرفع الملف… ${pctLabel(ui.progress)}`}</span>
              <div class="import-progress"><div class="import-progress-fill" style="width:${Math.min(ui.progress, 1) * 100}%"></div></div>
            </span>
          </div>`));
        } else {
          const drop = el(`<div class="import-drop" tabindex="0" role="button" aria-label="اسحب الملف هنا أو اضغط لاختيار ملف">
            <span class="import-drop-icon">${iconHtml('upload')}</span>
            <span class="import-drop-title">اسحب الملف هنا</span>
            <span class="import-drop-sub">أو اضغط لاختيار ملف من جهازك</span>
            <span class="btn btn-soft">${iconHtml('upload')}اختيار ملف</span>
            <span class="import-drop-hint">Excel (‎.xlsx أو ‎.xls) أو Word (‎.docx) أو CSV — بحد أقصى ٥ ميغابايت</span>
          </div>`);
          const input = el(`<input type="file" class="visually-hidden" accept="${ACCEPT}" aria-hidden="true" tabindex="-1">`);
          body.appendChild(drop);
          body.appendChild(input);
          wireDropZone(drop, input);
        }
      }
      stepsHost.appendChild(stepFile);

      /* ---- الخطوة ٣: المعاينة والتأكيد ---- */
      const stepPrev = stepShell(3, 'preview', 'المعاينة والتأكيد', !fileDone ? 'waiting' : 'active', {
        waitReason: 'ارفع الملف أولاً',
      });
      if (fileDone) {
        const body = stepPrev.querySelector('.q-body');
        const p = ui.preview;

        if (ui.tokenExpired) {
          body.appendChild(el(`<div class="inline-note danger" role="alert">${iconHtml('alertTriangle')}
            <span>انتهت صلاحية المعاينة (١٥ دقيقة) ولم يمكن تحضيرها تلقائياً. أعد المعاينة للمتابعة.</span>
          </div>`));
          const actions = el(`<div class="import-expired-actions">
            <button type="button" class="btn btn-primary" data-retry>${iconHtml('refresh')}إعادة المعاينة</button>
          </div>`);
          actions.querySelector('[data-retry]').onclick = () => { if (ui.file) doUpload(ui.file, ui.overrideCol === null ? undefined : ui.overrideCol); };
          body.appendChild(actions);
          setStatus('انتهت صلاحية المعاينة — اضغط «إعادة المعاينة» للمتابعة دون فقدان أي شيء.');
        } else {
          // سطر ما فهمه النظام
          const sourceBits = [`قرأت الملف: <b>${escapeHtml(p.source.filename)}</b>`];
          if (p.source.sheet) sourceBits.push(`ورقة «${escapeHtml(p.source.sheet)}»`);
          sourceBits.push(`عمود الأسماء: «${escapeHtml(p.detection.name_header || (`العمود ${arDigits(p.detection.name_column + 1)}`))}»`);
          body.appendChild(el(`<p class="import-detect-source">${sourceBits.join(' — ')}</p>`));
          body.appendChild(el(`<p class="import-detect-reason">
            <span class="badge ${CONF_BADGE[p.detection.confidence] || 'badge-mode'}">${escapeHtml(CONF_LABEL[p.detection.confidence] || p.detection.confidence)}</span>
            — ${escapeHtml(p.detection.reason)}
          </p>`));

          // التحكم بعمود الأسماء — بارز وجوباً عندما لا تكون الثقة عالية
          const prominent = p.detection.confidence !== 'high';
          const ov = el(`<div class="import-override${prominent ? ' is-prominent' : ''}"></div>`);
          if (prominent) {
            ov.appendChild(el(`<div class="inline-note info">${iconHtml('info')}<span>الثقة بعمود الأسماء ${escapeHtml(CONF_LABEL[p.detection.confidence] || '')} — تحقّق من العمود الصحيح أدناه قبل المتابعة.</span></div>`));
          }
          const ovBody = el(`<div class="import-override-body" ${prominent || ui.overrideOpen ? '' : 'hidden'}>
            <label for="impOvSel">عمود الأسماء</label>
            <select class="input" id="impOvSel"></select>
            <div class="override-samples"></div>
            <button type="button" class="btn btn-primary btn-sm" data-ov-apply>${iconHtml('refresh')}إعادة المعاينة بهذا العمود</button>
          </div>`);
          if (!prominent) {
            const toggle = el(`<button type="button" class="btn btn-ghost btn-sm">${iconHtml('edit')}تغيير عمود الأسماء</button>`);
            toggle.onclick = () => { ui.overrideOpen = !ui.overrideOpen; ovBody.hidden = !ui.overrideOpen; };
            ov.appendChild(toggle);
          }
          ov.appendChild(ovBody);
          const ovSel = ovBody.querySelector('#impOvSel');
          const ovSamples = ovBody.querySelector('.override-samples');
          for (const c of p.columns) {
            const label = c.header ? `${arDigits(c.index + 1)}. ${c.header}` : `العمود ${arDigits(c.index + 1)}`;
            ovSel.appendChild(el(`<option value="${c.index}"${c.index === p.detection.name_column ? ' selected' : ''}>${escapeHtml(label)}</option>`));
          }
          function paintSamples() {
            const col = p.columns[Number(ovSel.value)];
            ovSamples.innerHTML = '';
            if (col && col.sample.length > 0) {
              for (const s of col.sample) ovSamples.appendChild(el(`<span class="badge badge-mode">${escapeHtml(s)}</span>`));
            } else {
              ovSamples.appendChild(el('<span class="muted" style="font-size:var(--fs-xs)">لا قيم نموذجية لهذا العمود</span>'));
            }
          }
          paintSamples();
          ovSel.addEventListener('change', paintSamples);
          ovBody.querySelector('[data-ov-apply]').onclick = () => { ui.overrideCol = Number(ovSel.value); reprocessWithColumn(ui.overrideCol); };
          body.appendChild(ov);

          // بطاقات الملخص الخمس — تصفية الجدول بالضغط، وتُلغى بضغطة ثانية
          const stats = el('<div class="import-stats"></div>');
          for (const key of BUCKET_ORDER) {
            const n = p.summary[key];
            const btn = el(`<button type="button" class="import-stat ${BUCKET_CLASS[key]}${ui.filter === key ? ' is-active' : ''}" ${n === 0 ? 'disabled' : ''}>
              <span class="import-stat-num">${arDigits(n)}</span>
              <span class="import-stat-label">${BUCKET_LABEL[key]}</span>
            </button>`);
            btn.onclick = () => { ui.filter = ui.filter === key ? null : key; paint(); };
            stats.appendChild(btn);
          }
          body.appendChild(stats);

          // شريط أدوات الجدول
          const toolbar = el(`<div class="import-rows-toolbar">
            <span class="import-rows-count">${arDigits(p.rows.length)} صفاً — ${arDigits(checkedCount())} محدّد</span>
            <span class="import-bulk-links">
              <button type="button" data-check-valid>تحديد كل الصالح</button>
              <button type="button" data-uncheck-all>إلغاء تحديد الكل</button>
            </span>
          </div>`);
          body.appendChild(toolbar);

          const rowsHost = el('<div></div>');
          body.appendChild(rowsHost);
          renderRowsTable(rowsHost);

          toolbar.querySelector('[data-check-valid]').onclick = () => {
            for (const r of p.rows) if (r.status === 'valid') ui.rowChecked.set(r.row_number, true);
            renderRowsTable(rowsHost);
            updateConfirmBar();
          };
          toolbar.querySelector('[data-uncheck-all]').onclick = () => {
            for (const r of p.rows) ui.rowChecked.set(r.row_number, false);
            renderRowsTable(rowsHost);
            updateConfirmBar();
          };

          const bar = el(`<div class="grades-actions import-confirm-bar">
            <span class="import-confirm-hint">${arDigits(checkedCount())} من ${arDigits(p.rows.length)} صفاً محدّد للاستيراد</span>
            <button type="button" class="btn btn-primary btn-lg" data-commit${checkedCount() === 0 ? ' disabled' : ''}>${iconHtml('check')}استيراد ${escapeHtml(countStudents(checkedCount()))} إلى ${escapeHtml(ui.section.name)}</button>
          </div>`);
          bar.querySelector('[data-commit]').onclick = commit;
          body.appendChild(bar);

          setStatus(prominent
            ? 'تحقّق من عمود الأسماء أدناه، ثم راجع الأسماء واضغط استيراد.'
            : 'راجع الأسماء ثم اضغط استيراد.');
        }
      }
      stepsHost.appendChild(stepPrev);

      /* أزرار «تغيير» للخطوات المطوية */
      stepsHost.querySelectorAll('.q-step [data-edit]').forEach((btn) => {
        btn.onclick = () => {
          const key = btn.closest('.q-step').dataset.step;
          if (key === 'section') { ui.section = null; deptCache = null; resetFileState(); }
          if (key === 'file') { resetFileState(); }
          paint();
        };
      });

      if (!secDone) setStatus('اختر الشعبة التي تريد استيراد الطلبة إليها.');
      else if (!fileDone) setStatus(`الشعبة: ${ui.section.name}. اسحب الملف هنا أو اضغط للاختيار.`);

      injectIcons(stepsHost);
    }

    paint();
  }
  window.renderImportView = renderImportView;
})();
