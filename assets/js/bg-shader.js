/* 动态背景 v2（双主题）：全屏 WebGL fragment shader — 极光 + 星野，缓慢流动、无交互。
 *
 * 与 v1（bg-shader.js，实验原型、报告里的「出货配置」）的唯一区别：**浅色主题配色**。
 * v1 只有一套深色极光；实测把它放在浅色主题下会把正文最坏对比度从 4.82 压到 4.30
 * （AA 线 4.5，见 lab/结果/bg-shader-contrast/）—— 浅色主题是深字，底色变暗就崩。
 * v2 按 data-theme 切两套配色：深色用原样的深空极光，浅色用亮紫白的白昼天光
 * （深色那套是「加色」：glow 只提亮、不提暗，对比度方向安全。浅色那套是「按 glow 插值上色」，
 *  并且对光带色做**亮度中性提饱和**（c' = luma + (c-luma)*k）—— 彩度放开提、对比度一分不掉）。
 *
 * 挂载点：document.documentElement 的第一个子节点。
 *   理由：body::before（壁纸 + 文字对比蒙版）与 body::after（玻璃质感层）同为负 z-index，
 *   它们在根层叠上下文里**按树序**绘制。canvas 挂在 <html> 下、排在 <body> 之前，
 *   于是绘制顺序是 <html> 底色 → canvas → body::before → body::after → 正文。
 *   即：它天然垫在壁纸蒙版与玻璃层之下，只顶掉 --bg-image-*，蒙版与质感层照旧生效。
 *
 * **必须在 whenRoot 里初始化**：注入时机早于 documentElement 出现时，直接
 * insertBefore 会抛 TypeError，整支脚本静默死掉。
 *
 * 可调：注入前设 window.__bgOpts = {id, fallback, scale, oct, fps, once, theme}
 *   id = data-bg 里表示「动态背景」的那个值（模板传 '__shader'）；fallback = GL 起不来时换回哪一套静态套。
 *   两者都只影响「我该不该跑 / 起不来时谁顶上」，与 canvas 自身无关（canvas 的 id 固定 __bgshader）。
 *   scale —— 渲染分辨率倍率（1 = 每 CSS 像素按 devicePixelRatio 出像素；0.5 = 缩一半再拉伸）
 *   oct   —— fbm 噪声层数（3 = 出厂，2 = 低保真）
 *   fps   —— 重绘上限（不设 = 每个 rAF 都画；30 = 每 33ms 才画一次）
 *   once  —— 只画一帧就停 rAF（静态 shader 背景）
 *   theme —— 'auto'（默认，读 data-theme）| 'light' | 'dark'
 * 对外：window.__bg = {ok, stats(), stop(), start(), canvas}，stats() 里 cpuMs 是主线程侧
 *       drawArrays 的累计耗时（判断瓶颈在主线程还是在 GPU 的直接证据）。
 */
(function () {
  'use strict';
  var O = window.__bgOpts || {};
  var SCALE = O.scale || 1;
  var OCT = O.oct || 3;
  var ID = '__bgshader';               // canvas 的 DOM id（固定，与 data-bg 的套 id 无关）
  var BID = O.id || '__shader';        // data-bg 里表示「动态背景」的那个值（由模板传进来）
  var FALLBACK = O.fallback || '';     // GL 起不来时把 data-bg 换回哪一套静态套

  /* GL 起不来 / 系统要求减少动态时，**这个套不能继续占着 data-bg** —— 占着就是「页面没有背景」
     （选中的套没有图、shader 又没起来）。换回静态兜底套，壁纸自然回来。
     注意这不是「摘图」，是「换套」：图的下载与不下发由生成的 CSS 决定，这里只动属性。 */
  function standDown() {
    try {
      if (FALLBACK && document.documentElement.getAttribute('data-bg') === BID) {
        document.documentElement.setAttribute('data-bg', FALLBACK);
      }
    } catch (e) { /* 改不动属性也不该让脚本炸掉 */ }
  }
  var FPS = O.fps || 0;
  var ONCE = !!O.once;
  var THEME = O.theme || 'auto';
  window.__bg = { ok: false, why: 'not-mounted' };

  // 系统要求减少动态：整支脚本不落地（站点 bg-switch.js 对交叉淡入走的是同一条判据）。
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.__bg = { ok: false, why: 'reduced-motion' };
    standDown();
    return;
  }

  function whenRoot(fn) {
    if (document.documentElement) return fn();
    var mo = new MutationObserver(function () {
      if (document.documentElement) { mo.disconnect(); fn(); }
    });
    mo.observe(document, { childList: true });
  }

  whenRoot(function () {
    var canvas = document.createElement('canvas');
    canvas.id = ID;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block';
    document.documentElement.insertBefore(canvas, document.documentElement.firstChild);

    var glOpts = {
      alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false
    };
    // gpuQuery 走 WebGL2：只有 webgl2 上下文能开 EXT_disjoint_timer_query_webgl2，
    // 那是**直接量这一帧 shader 占了多少 GPU 时间**的唯一手段（否则只能靠过载外推）。
    var gl = O.gpuQuery ? canvas.getContext('webgl2', glOpts) : null;
    var isGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', glOpts);
    if (!gl) { canvas.remove(); standDown(); window.__bg = { ok: false, why: 'no-webgl' }; return; }

    var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
    var FS = [
      'precision highp float;',
      'uniform vec2 u_res; uniform float u_t; uniform float u_light;',
      '#define OCT ' + OCT,
      'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
      'float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
      ' return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}',
      'float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<OCT;i++){s+=a*noise(p);p=p*2.03+17.1;a*=.5;}return s;}',
      'void main(){',
      ' vec2 uv=gl_FragCoord.xy/u_res;',
      ' vec2 p=vec2(uv.x*1.6,uv.y-.55); float t=u_t*.03;',
      ' float band=0.;',
      ' for(int i=0;i<3;i++){float fi=float(i);',
      '   float y=.30-fi*.11+.09*sin(p.x*1.7+t*3.+fi*2.1);',
      '   float d=abs(p.y-y); float w=.05+.02*sin(p.x*2.3+t*2.);',
      '   band+=(1.-smoothstep(0.,w,d))*(.55-fi*.13);}',
      ' float n=fbm(p*2.4+vec2(t*.6,-t*.9));',
      // glow 的强度：浅色下收到约一半（天光不该像极光那样硬）
      ' float glow=band*(.45+.75*n)*(1.-.22*u_light);',
      ' vec3 baseD=mix(vec3(.043,.039,.058),vec3(.078,.071,.12),uv.y);',
      // 浅色底：压到 luma≈0.86~0.92 并带一点冷紫。**不再逼近纯白** —— 白底上没有位置放光带
      ' vec3 baseL=mix(vec3(.872,.866,.906),vec3(.756,.748,.842),uv.y);',
      ' vec3 base=mix(baseD,baseL,u_light);',
      ' vec3 aurD=mix(vec3(.18,.75,.62),vec3(.42,.35,.85),uv.y*1.3);',
      ' vec3 aurL=mix(vec3(.36,.88,.82),vec3(.70,.56,.98),uv.y*1.3);',
      // 浅色那套的关键：**亮度中性提饱和** —— WCAG 只看亮度，而 c' = luma + (c-luma)*k 保证
      // luma 不变、只把与灰轴的距离放大，所以彩度可以放开提而对比度一分不掉（余量见 features.md ⑫）。
      // 同时把上色方式从「压暗一层」改成「按 glow 在底与极光色之间插值」：压暗得到的是灰雾，
      // 插值得到的才是带颜色的光带。
      ' float lA=dot(aurL,vec3(.2126,.7152,.0722));',
      ' aurL=lA+(aurL-lA)*2.30;',
      ' vec3 aur=mix(aurD,aurL,u_light);',
      ' vec3 col=base+aur*glow*(1.-u_light);',
      ' col=mix(col,mix(baseL,aurL,clamp(glow*2.30,0.,1.)),u_light);',
      ' vec2 sp=floor(gl_FragCoord.xy/2.); float h=hash(sp);',
      ' col+=step(.9985,h)*(.35+.65*hash(sp+3.7))*vec3(.9,.94,1.)*(1.-uv.y)*(1.-u_light);',
      ' gl_FragColor=vec4(col,1.);',
      '}'
    ].join('\n');

    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { canvas.remove(); standDown(); window.__bg = { ok: false, why: 'glsl', err: String(e) }; return; }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var locA = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(locA);
    gl.vertexAttribPointer(locA, 2, gl.FLOAT, false, 0, 0);
    var uRes = gl.getUniformLocation(prog, 'u_res'), uT = gl.getUniformLocation(prog, 'u_t');
    var uLight = gl.getUniformLocation(prog, 'u_light');

    // 主题：站点把主题写在 <html data-theme="…">，没写就是默认主题（深色）。
    function lightNow() {
      if (THEME === 'light') return 1;
      if (THEME === 'dark') return 0;
      var a = document.documentElement.getAttribute('data-theme');
      return a === 'light' ? 1 : 0;
    }

    var frames = 0, raf = 0, t0 = 0, lastStop = null, lastDraw = 0, cpuMs = 0, draws = 0;
    // GPU 侧计时：每帧一个 query 对象，池里轮转；结果要等 GPU 回读，所以读的是「已完成」的那些。
    var TQ = (isGL2 && gl.getExtension('EXT_disjoint_timer_query_webgl2')) || null;
    var pending = [], gpu = [];
    function pollQueries() {
      if (!TQ) return;
      if (gl.getParameter(TQ.GPU_DISJOINT_EXT)) {            // 时钟错乱（切 GPU/降频）：这一批采样全丢
        for (var i = 0; i < pending.length; i++) gl.deleteQuery(pending[i].q);
        pending.length = 0; return;
      }
      for (var i = pending.length - 1; i >= 0; i--) {
        var it = pending[i];
        if (gl.getQueryParameter(it.q, gl.QUERY_RESULT_AVAILABLE)) {
          gpu.push(gl.getQueryParameter(it.q, gl.QUERY_RESULT) / 1e6);   // ms
          gl.deleteQuery(it.q);
          pending.splice(i, 1);
        }
      }
      if (gpu.length > 300) gpu.splice(0, gpu.length - 300);
    }
    function pct(a, p) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; });
      return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 1000) / 1000; }
    // 最近 60 帧（约 0.36s）的分布：直接读就是「这一帧背景占了多少 ms」
    function gpuStats() {
      var w = gpu.slice(-60);
      if (!w.length) return { n: 0 };
      return { n: w.length, p50: pct(w, .5), p90: pct(w, .9), max: Math.round(Math.max.apply(null, w) * 1000) / 1000,
               mean: Math.round(w.reduce(function (a, b) { return a + b; }, 0) / w.length * 1000) / 1000 };
    }
    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2) * SCALE;
      var w = Math.max(2, Math.round(canvas.clientWidth * dpr));
      var h = Math.max(2, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h); gl.uniform2f(uRes, w, h);
      }
    }
    function draw(t) {
      size();
      pollQueries();
      gl.uniform1f(uT, (t - t0) / 1000);
      gl.uniform1f(uLight, lightNow());          // 每帧设一次：主题切换下一帧就生效，不需要监听
      var q = TQ ? gl.createQuery() : null;
      if (q) gl.beginQuery(TQ.TIME_ELAPSED_EXT, q);
      var a = performance.now();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      cpuMs += performance.now() - a;      // 主线程侧提交耗时（不等 GPU）
      if (q) { gl.endQuery(TQ.TIME_ELAPSED_EXT); pending.push({ q: q }); }
      draws++;
    }
    function loop(t) {
      raf = 0;
      if (!t0) t0 = t;
      if (!FPS || t - lastDraw >= 1000 / FPS - 1) { draw(t); lastDraw = t; }
      frames++;
      if (!ONCE) raf = requestAnimationFrame(loop);
    }
    function start() { if (!raf && !document.hidden) raf = requestAnimationFrame(loop); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } lastStop = performance.now(); }

    // 页面不可见就停 rAF：不给后台标签页白烧 GPU（与 bg-switch.js 不做后台预取同一条道理）。
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stop(); } else { t0 = 0; start(); }
    });
    window.addEventListener('resize', function () { size(); });

    size();
    // 挂载成功，但**跑不跑由当前选中的套决定**：访客选的是静态套时 rAF 一次都不启动（GPU 一秒不花），
    // 切到动态背景时由 bg-switch.js 调 start()。
    //
    // 这里不再自己去摘静态壁纸：「选中动态背景这一套就不下发壁纸」写在**生成的 CSS**里
    // （:root[data-bg="__shader"]{--bg-image-*:none}）—— 比 JS 改行内变量早一整步，
    // 首屏连请求都不会发出去。三条早退路径则由 standDown() 换回静态套。
    if (document.documentElement.getAttribute('data-bg') === BID) start();
    window.__bg = {
      ok: true,
      canvas: canvas,
      stop: stop, start: start,
      stats: function () {
        return {
          ok: true, frames: frames, draws: draws, running: !!raf,
          cpuMs: Math.round(cpuMs * 10) / 10,
          msPerDraw: draws ? Math.round(cpuMs / draws * 1000) / 1000 : null,
          cw: canvas.width, ch: canvas.height, css: [canvas.clientWidth, canvas.clientHeight],
          dpr: window.devicePixelRatio || 1, scale: SCALE, oct: OCT, fps: FPS, once: ONCE,
          light: lightNow(),
          active: document.documentElement.getAttribute('data-bg') === BID, shaderId: BID,
          gl2: isGL2, timerQuery: !!TQ, gpu: gpuStats(),
          lastStop: lastStop
        };
      }
    };
  });
})();
