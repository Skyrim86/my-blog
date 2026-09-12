/* 管理页主题开关。
   本文件在 <head> 里同步加载（不能加 defer），属性要在首屏绘制前就写进 <html>，否则会闪一下。
   没存过偏好时跟随系统，手动切换过就以手动选择为准。
   偏好 key 是 admin-theme，与站点主题的 pref-theme 无关：预览走另一个端口（另一个 origin），
   两份 localStorage 本来就不互通。 */
(function () {
  'use strict';

  var KEY = 'admin-theme';
  var root = document.documentElement;
  var media = window.matchMedia('(prefers-color-scheme: dark)');

  function saved() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'dark' || v === 'light' ? v : null;
    } catch (err) {
      return null; // 隐私模式下 localStorage 会抛错，退回只跟随系统
    }
  }

  function apply(theme) {
    root.dataset.theme = theme;
  }

  function next() {
    return root.dataset.theme === 'dark' ? 'light' : 'dark';
  }

  function name(theme) {
    return theme === 'dark' ? '夜间' : '日间';
  }

  apply(saved() || (media.matches ? 'dark' : 'light'));

  // 没选过就跟着系统实时变；选过之后系统再变也与本页无关
  if (media.addEventListener) {
    media.addEventListener('change', function () {
      if (!saved()) apply(media.matches ? 'dark' : 'light');
    });
  }

  function sync(btn) {
    btn.textContent = name(next());
    btn.title = '切换到' + name(next()) + '模式';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.setAttribute('aria-label', '切换夜间模式');
    sync(btn);
    btn.addEventListener('click', function () {
      var theme = next();
      apply(theme);
      try {
        localStorage.setItem(KEY, theme);
      } catch (err) {
        // 存不下就只在本次会话生效
      }
      sync(btn);
    });
  });
})();
