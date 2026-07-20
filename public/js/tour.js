/*
 * جولة تعريفية قابلة للتخطي — للوحة الإدارة فقط.
 * منصة الرافدين — إعدادية الرافدين المهنية
 *
 * تعمل هذه الجولة بشكل مستقل تماماً على جهاز المتصفح (localStorage فقط).
 * لا تتصل بأي خادم ولا تغيّر أي بيانات. مصممة لتُحمَّل حصراً داخل admin.html.
 *
 * عقد العناصر المستهدفة (يوفرها زميل يبني شاشة الإضافة السريعة):
 *   [data-tour="nav-quick"]      زر الإضافة السريعة في الشريط الجانبي
 *   [data-tour="status-line"]   سطر الحالة أعلى شاشة الإضافة السريعة
 *   [data-tour="quick-where"]   خطوة القسم / المرحلة / الشعبة
 *   [data-tour="quick-subjects"] خطوة المواد
 *   [data-tour="quick-students"] خطوة الطلبة
 *   [data-tour="quick-grades"]   خطوة الدرجات
 *
 * إذا لم يوجد عنصر مستهدف لخطوة ما، تُتخطى تلك الخطوة بصمت (لا خطأ، لا حجب للواجهة).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'tourSeen';

  var STEPS = [
    {
      selector: '[data-tour="nav-quick"]',
      text: 'هذا الزر يفتح شاشة واحدة تضيف منها الطلبة والمواد والدرجات. يمكنك العودة إليها من هنا في أي وقت.'
    },
    {
      selector: '[data-tour="status-line"]',
      text: 'هذا السطر يخبرك دائماً بما يجب فعله الآن. اقرأه كلما احتجت إلى معرفة الخطوة التالية.'
    },
    {
      selector: '[data-tour="quick-where"]',
      text: 'ابدأ من هنا باختيار القسم والمرحلة والشعبة. إذا لم يكن الاسم موجوداً في القائمة، اكتبه واحفظه من نفس المكان.'
    },
    {
      selector: '[data-tour="quick-subjects"]',
      text: 'هذه هي المواد الدراسية الخاصة بهذه المرحلة. يمكن إضافة مادة جديدة من هنا عند الحاجة.'
    },
    {
      selector: '[data-tour="quick-students"]',
      text: 'اكتب اسم الطالب ثم اضغط زر الإضافة أو مفتاح الإدخال، ليظهر اسمه ورقمه الامتحاني مباشرة.'
    },
    {
      selector: '[data-tour="quick-grades"]',
      text: 'بعد إضافة الطلبة، اضغط هذا الزر لإدخال درجاتهم.'
    }
  ];

  var EASTERN_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  function toEasternDigits(n) {
    return String(n).replace(/[0-9]/g, function (d) { return EASTERN_DIGITS[+d]; });
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  var dom = null;   // overlay DOM references, built lazily
  var current = -1; // index of active step, -1 when tour is not running
  var running = false;

  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'شرح الاستخدام');

    var spotlight = document.createElement('div');
    spotlight.className = 'tour-spotlight';

    var bubble = document.createElement('div');
    bubble.className = 'tour-bubble';
    bubble.innerHTML =
      '<div class="tour-bubble-step"></div>' +
      '<p class="tour-bubble-text"></p>' +
      '<div class="tour-bubble-actions">' +
        '<button type="button" class="tour-btn tour-btn-skip">تخطي</button>' +
        '<button type="button" class="tour-btn tour-btn-next"></button>' +
      '</div>';

    overlay.appendChild(spotlight);
    overlay.appendChild(bubble);

    var refs = {
      overlay: overlay,
      spotlight: spotlight,
      bubble: bubble,
      stepLabel: bubble.querySelector('.tour-bubble-step'),
      text: bubble.querySelector('.tour-bubble-text'),
      skipBtn: bubble.querySelector('.tour-btn-skip'),
      nextBtn: bubble.querySelector('.tour-btn-next')
    };

    refs.skipBtn.addEventListener('click', endTour);
    refs.nextBtn.addEventListener('click', function () { advance(current + 1); });

    document.body.appendChild(overlay);
    return refs;
  }

  function teardown() {
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('resize', onReposition);
    window.removeEventListener('scroll', onReposition, true);
    if (dom && dom.overlay && dom.overlay.parentNode) {
      dom.overlay.parentNode.removeChild(dom.overlay);
    }
    dom = null;
    current = -1;
    running = false;
  }

  function endTour() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* storage unavailable — nothing to persist, safe to ignore */ }
    teardown();
  }

  function onKeydown(ev) {
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      ev.preventDefault();
      endTour();
    }
  }

  var repositionTimer = null;
  function onReposition() {
    if (!running || current < 0) return;
    clearTimeout(repositionTimer);
    repositionTimer = setTimeout(function () { positionOn(STEPS[current].selector); }, 60);
  }

  function positionOn(selector) {
    var target = document.querySelector(selector);
    if (!target || !dom) return false;
    var rect = target.getBoundingClientRect();
    var pad = 8;

    var top = Math.max(rect.top - pad, 0);
    var left = Math.max(rect.left - pad, 0);
    var width = rect.width + pad * 2;
    var height = rect.height + pad * 2;

    dom.spotlight.style.top = top + 'px';
    dom.spotlight.style.left = left + 'px';
    dom.spotlight.style.width = width + 'px';
    dom.spotlight.style.height = height + 'px';

    // Prefer placing the caption bubble below the target; flip above if there
    // is not enough room; always clamp horizontally so it never runs off a
    // narrow screen (this is why we compute in physical viewport pixels
    // rather than relying on CSS alone).
    var bubble = dom.bubble;
    bubble.style.visibility = 'hidden';
    bubble.style.top = '0px';
    bubble.style.left = '0px';
    var bw = bubble.offsetWidth;
    var bh = bubble.offsetHeight;
    var margin = 12;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var bubbleTop = rect.bottom + pad + margin;
    if (bubbleTop + bh > vh - margin) {
      var above = rect.top - pad - margin - bh;
      bubbleTop = above >= margin ? above : Math.max(margin, vh - bh - margin);
    }

    var bubbleLeft = rect.left + rect.width / 2 - bw / 2;
    bubbleLeft = Math.min(Math.max(bubbleLeft, margin), Math.max(margin, vw - bw - margin));

    bubble.style.top = bubbleTop + 'px';
    bubble.style.left = bubbleLeft + 'px';
    bubble.style.visibility = 'visible';
    return true;
  }

  function showStep(index) {
    if (index >= STEPS.length) { endTour(); return; }
    var step = STEPS[index];
    var target = document.querySelector(step.selector);
    if (!target) {
      // Graceful degradation: no such element right now, skip to the next step.
      showStep(index + 1);
      return;
    }

    current = index;
    dom.stepLabel.textContent = 'الخطوة ' + toEasternDigits(index + 1) + ' من ' + toEasternDigits(STEPS.length);
    dom.text.textContent = step.text;
    dom.nextBtn.textContent = (index === STEPS.length - 1) ? 'إنهاء' : 'التالي';

    try {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    } catch (e) {
      target.scrollIntoView();
    }

    var settle = reducedMotion() ? 0 : 320;
    setTimeout(function () {
      if (current !== index) return; // tour moved on/ended while we waited
      if (!positionOn(step.selector)) { showStep(index + 1); return; }
      dom.nextBtn.focus();
    }, settle);
  }

  function advance(index) {
    showStep(index);
  }

  function start() {
    if (running) return;
    running = true;
    dom = buildOverlay();
    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    showStep(0);
  }

  // Exposed so the sidebar "شرح الاستخدام" replay button can call it directly,
  // regardless of whether the tour has already been seen.
  window.startTour = function () { start(); };

  function autoStartIfUnseen() {
    var seen;
    try { seen = localStorage.getItem(STORAGE_KEY); } catch (e) { seen = null; }
    if (seen) return;

    // The quick-add view (and its data-tour targets) render asynchronously
    // after the admin panel confirms the session. Poll briefly for the main
    // content area to be populated instead of coupling to admin.js internals;
    // if nothing ever appears (e.g. login failed and the page redirected,
    // or none of the target elements exist), give up quietly.
    var attempts = 0;
    var MAX_ATTEMPTS = 40; // ~10s at 250ms
    (function poll() {
      attempts++;
      var view = document.getElementById('view');
      if (view && view.children.length > 0) { start(); return; }
      if (attempts < MAX_ATTEMPTS) setTimeout(poll, 250);
    })();
  }

  function wireReplayButton() {
    var btn = document.getElementById('tourReplayBtn');
    if (btn) btn.addEventListener('click', function () { window.startTour(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireReplayButton();
    setTimeout(autoStartIfUnseen, 300);
  });
})();
