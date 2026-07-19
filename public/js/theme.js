(function () {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') document.documentElement.dataset.theme = 'dark';
  window.toggleTheme = function () {
    const isDark = document.documentElement.dataset.theme === 'dark';
    if (isDark) { delete document.documentElement.dataset.theme; localStorage.setItem('theme', 'light'); }
    else { document.documentElement.dataset.theme = 'dark'; localStorage.setItem('theme', 'dark'); }
    document.querySelectorAll('[data-theme-icon]').forEach(el => {
      el.innerHTML = document.documentElement.dataset.theme === 'dark' ? window.icons.sun : window.icons.moon;
    });
  };
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-icon]').forEach(el => {
      el.innerHTML = document.documentElement.dataset.theme === 'dark' ? window.icons.sun : window.icons.moon;
    });
  });
})();
