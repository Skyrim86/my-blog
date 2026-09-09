// 返回顶部按钮：滚动超过 400px 显示，requestAnimationFrame 节流
// 由 layouts/_partials/extend_head.html 以 defer 方式加载（执行时 DOM 已就绪）
(function () {
  'use strict';

  var btn = document.getElementById('back-to-top');
  if (btn) return; // 防止重复创建

  btn = document.createElement('button');
  btn.id = 'back-to-top';
  btn.setAttribute('aria-label', '返回顶部');
  btn.setAttribute('title', '返回顶部');
  btn.textContent = '↑';
  document.body.appendChild(btn);

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      btn.classList.toggle('visible', window.scrollY > 400);
      ticking = false;
    });
  }, { passive: true });

  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
