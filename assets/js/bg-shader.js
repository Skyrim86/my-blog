/* 动态背景引擎（**多套**共用一个 canvas 与一个 GL 上下文）。
 *
 * 与 2026-09-22 那版（单一极光 + 星野、单一 data-bg 值 `__shader`）的三处区别：
 *
 *   1. **多套**：套清单在 hugo.toml 的 `[[params.appearance.shaders]]`，模板把每套的
 *      `{kind, scale, oct, fps}` 经 `window.__bgOpts.sets` 传进来。程序按 `kind|oct` 缓存 ——
 *      切套时只有换 kind 或改 oct 才重新编译着色器，同 kind 之间切只是改 uniform 与分辨率。
 *   2. **data-bg 的前缀就是判据**：动态套的 id 一律形如 `__dyn-xxx`（模板默认前缀，可改），
 *      「我该不该跑」= data-bg 是不是已知的动态套。CSS 那边一条
 *      `:root[data-bg^="__dyn-"]{--bg-image-*:none}` 覆盖**全部**动态套，所以加第二套不必再写 CSS，
 *      也不必让切换脚本认识「动态」这个概念 —— 它只改 data-bg，然后调 refresh()。
 *   3. **不猜意图**：静态壁纸按钮与动态背景按钮各存各的偏好、各改 data-bg，谁改完谁调
 *      `refresh()`。这个文件只读属性决定跑谁、停谁（原来那版是切换脚本直接调 start()/stop()，
 *      两处状态容易对不上）。
 *
 * 挂载点：`document.documentElement` 的第一个子节点 —— body::before（壁纸 + 对比蒙版）与
 *   body::after（玻璃质感层）同为负 z-index，在根层叠上下文里按树序绘制，canvas 排在 <body>
 *   之前，于是绘制顺序是 <html> 底色 → canvas → body::before 蒙版 → body::after 质感 → 正文。
 *   注意这个顺序的另一面：**只要 body::before 有图，画布就被它盖住** —— 所以「动态 → 壁纸」
 *   那一步画布是淡不出来的，交叉淡入只能由壁纸侧从上面盖（见 assets/js/bg-switch.js 的 fadeInNew）。
 *
 * **必须在 whenRoot 里初始化**：注入时机早于 documentElement 出现时直接 insertBefore 会抛
 *   TypeError，整支脚本静默死掉（`window.__bg` 始终 undefined，页面上什么也看不出来）。
 *
 * 可调（模板经 `<script data-opts="…">` 注入，**不是** window.__bgOpts）：prefix / sets / statics / fallback。
 *   为什么不用内联 `window.__bgOpts={sets:{{ jsonify }}}`：html/template 在 <script> 上下文里会把
 *   jsonify 的结果再转义一次，出来是**字符串** `'{"a":1}'` 而不是对象 —— `SETS[id]` 恒 undefined，
 *   整套动态背景静默不挂、构建也不报错（踩过）。属性值由 HTML 解析器解码，没有这层转义；
 *   读取方式是 document.currentScript.dataset.opts（与 bg-switch.js 读自己的 data-* 同一招）。
 *   `statics` = 静态套 id 清单（校验兜底套用），`fallback` = GL 起不来或系统要求减少动态时把 data-bg
 *   换回哪一套**静态**套（否则那一套没图、shader 又没跑，页面就是「没有背景」）；优先换回访客自己
 *   选过的那张（localStorage['pref-bg']），够不着才用 `fallback` —— 两个按钮的偏好互相独立，
 *   兜回构建期默认套等于把静态侧的选择悄悄改掉。
 * 对外：`window.__bg = {ok, why, refresh(), start(), stop(), stats(), canvas}`。
 *   `refresh()` 读 data-bg 决定跑谁（切换脚本改完属性后调它）；`start()/stop()` 是给
 *   弹层暂停用的（home-deck.js 开弹层时 stop、关闭时 start）。
 *   `stats()` 里 cpuMs 是主线程侧 drawArrays 的累计耗时、gpu 是 GPU 计时器分布（有 webgl2 时）。
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var O = {};
  try { O = JSON.parse((script && script.dataset.opts) || '{}') || {}; } catch (e) { O = {}; }
  var PREFIX = O.prefix || '__dyn-';
  var SETS = O.sets || {};                 // { '<data-bg 值>': {kind, scale, oct, fps} }
  var STATICS = O.statics || [];           // 静态套的 id 清单（只为下面 resolveFallback 校验用）
  var FALLBACK = O.fallback || '';         // 起不来时换回哪一套静态套

  var CANVAS_ID = '__bgshader';
  window.__bg = { ok: false, why: 'not-mounted' };

  function dynCfg(id) {
    return (id && id.indexOf(PREFIX) === 0 && SETS[id]) ? SETS[id] : null;
  }

  /* 起不来时换回**访客自己选的那张**壁纸，而不是构建期写死的那套。
     两个按钮的偏好是互相独立的（bg-switch.js 的文件头），所以兜回默认套等于把静态侧的选择
     悄悄改掉 —— 访客看到的是「背景自己变了」。读 localStorage 有点越权，但这里只有它知道
     静态侧选了谁；读不到/存的值已被删除时才落到 FALLBACK。 */
  function resolveFallback() {
    try {
      var p = localStorage.getItem('pref-bg');
      if (p && (!STATICS.length || STATICS.indexOf(p) >= 0)) return p;
    } catch (e) { /* 隐私模式：照旧用构建期默认 */ }
    return FALLBACK;
  }

  /* 三条早退路径（减少动态 / 无 WebGL / GLSL 编译失败）都必须把 data-bg 换回静态套：
     选中的是动态套而 shader 没跑 = 页面没有背景。**这不是「摘图」而是「换套」** ——
     壁纸的下发与否由生成的 CSS 决定（:root[data-bg^="__dyn-"] 那条），这里只动属性。 */
  function standDown() {
    try {
      var root = document.documentElement;
      var fb = resolveFallback();
      if (root && fb && dynCfg(root.getAttribute('data-bg'))) {
        root.setAttribute('data-bg', fb);
      }
    } catch (e) { /* 改不动属性也不该让脚本炸掉 */ }
  }

  // 系统要求减少动态：整支脚本不落地（站点其它动效走的是同一条判据）。
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

  /* ---------- fragment shader 清单 ----------
     每个 kind 是一个函数：oct（fbm 层数）→ 源码字符串。
     新增一套「画法」= 在这里加一个 kind，再在 hugo.toml 的 shaders 里指过去
     （模板会校验 kind 在这个清单里，写错名是构建期错误而不是上线后的黑屏）。
     所有 kind 共用同一份顶点着色器与同一组 uniform：u_res / u_t / u_light。 */
  var KINDS = {
    // 极光 + 星野：抽象、无形状，靠渐变与噪声。浅色主题那套是亮底白昼天光。
    aurora: function (oct) {
      return [
        'precision highp float;',
        'uniform vec2 u_res; uniform float u_t; uniform float u_light;',
        '#define OCT ' + oct,
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
    },

    /* 夜樱：**有形状**的二次元夜景。极光那套是「氛围」，这套要能认出画的是什么 ——
       平滑三段夜空渐变 + 地平线天光 + 月（月海、边缘压暗、月晕；**它同时是整幅的光方向**）+
       两层硬边云（云体两档 + 朝月侧边缘的亮圈）+ 星（格内抖动，被云挡住）+
       飘落花瓣（椭圆 + 尖端缺口 + 翻面压扁）+ 三层远山剪影与脊线轮廓光。
       浅色主题是同一构图的白昼版：亮底、白云、淡粉花瓣。

       两条设计约束（都被实测打回过，别再放宽）：
         · **浅色主题必须亮**（深色字）：天空与三层远山都停在 luma≥0.70 —— 页脚一带的
           `--secondary` 灰字压在近山上（对比度实测见 docs/features.md ⑫）。
         · **亮盘不放中间**：月亮固定在左上角（正文栏在 `uv.x .2~.8`）。正文矩形里出现一块高亮度
           像素才是对比度的真风险面，放在左边缘之外就不进任何文字矩形。

       三版返工记（都是 vision 逐版看出来的，别把结论倒回去）：
         · v1 每个元素都挤在同一档明度 → 整幅一片紫雾。**改法是拉开明度差 + 把亮的赶到版面外，
           不是统一压暗。**
         · v2 用色带量化装「赛璐璐」→ 几条水平硬缝横切过云，最假的一处。天空回到平滑渐变，
           硬边交给云自己的轮廓。
         · v3 花瓣是「椭圆 + 线性项」，读成两圆并排的粉色药丸。现在改成：椭圆体 + 尖端中心一道
           缺口（花瓣的识别特征）+ 按自转相位把横向压扁（翻面），这才有「飘」的样子。 */
    anime: function (oct) {
      return [
        'precision highp float;',
        'uniform vec2 u_res; uniform float u_t; uniform float u_light;',
        '#define OCT ' + oct,
        'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
        'float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
        ' return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}',
        'float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<OCT;i++){s+=a*noise(p);p=p*2.03+17.1;a*=.5;}return s;}',
        'void main(){',
        ' vec2 uv=gl_FragCoord.xy/u_res;',
        ' float asp=u_res.x/u_res.y;',
        ' float L=u_light;',
        ' float t=u_t*.05;',
        ' vec2 pc=vec2((uv.x-.5)*asp,uv.y-.5);',
        // 天空：平滑三段渐变（天顶近黑蓝 → 中段紫 → 地平线暖紫），不做色带量化
        ' vec3 skyD=mix(vec3(.40,.21,.31),vec3(.028,.034,.092),smoothstep(.02,1.,uv.y));',
        ' vec3 skyL=mix(vec3(1.,.90,.85),vec3(.56,.76,.98),smoothstep(.02,1.,uv.y));',
        ' vec3 col=mix(skyD,skyL,L);',
        ' col+=mix(vec3(.010,.006,.014),vec3(.008,.008,.006),L)*(noise(uv*vec2(asp,1.)*7.+13.7)-.5);',
        // 地平线天光：远山后面垫一层暖光（极光那套的「光带」在这里换成「黄昏天光」）
        ' float hg=exp(-max(uv.y-.16,0.)*10.0);',
        ' col+=mix(vec3(.70,.26,.44),vec3(1.,.88,.76),L)*hg*mix(.24,.14,L);',
        // 月的位置先算出来：它同时是整幅的**光方向**（云与山的受光都用 lit）
        ' vec2 mn=vec2((.135-.5)*asp,.845-.5);',
        ' float md=length(pc-mn);',
        ' float lit=clamp(1.-md*1.25,0.,1.);',
        // 云：两层硬边 fbm；云体两档（厚处受光更亮）+ 朝月那侧边缘一圈亮
        ' float n1=fbm(vec2(uv.x*asp*1.6+t*.50,uv.y*2.4-t*.10));',
        ' float n2=fbm(vec2(uv.x*asp*3.0-t*.30+5.2,uv.y*4.2+t*.07+2.7));',
        ' float thr=.545;',
        ' float m1=smoothstep(thr-.006,thr+.006,n1)*smoothstep(.40,.56,uv.y)*smoothstep(.95,.68,uv.y);',
        ' float m2=smoothstep(thr-.006,thr+.006,n2)*smoothstep(.26,.44,uv.y)*smoothstep(.64,.42,uv.y)*.9;',
        ' float cloud=clamp(m1+m2,0.,1.);',
        ' float edge=exp(-abs(n1-thr)*85.);',
        ' float core=smoothstep(thr+.05,thr+.17,n1)*smoothstep(.40,.56,uv.y)*smoothstep(.95,.68,uv.y);',
        ' vec3 clBase=mix(mix(vec3(.075,.068,.14),vec3(.50,.40,.56),uv.y*.8),',
        '                 mix(vec3(.90,.90,.98),vec3(1.,1.,1.),uv.y*.6),L);',
        ' vec3 clLit=mix(vec3(.36,.32,.44),vec3(1.,1.,1.),L);',
        ' vec3 cl=clBase+clLit*core*(.10+.90*lit)*.75',
        ' +mix(vec3(.30,.27,.34),vec3(.10,.10,.12),L)*exp(-abs(n1-thr)*40.)*lit*1.15;',
        // 网点：只进云的暗部（旧版印在月盘上，是 bug）
        ' vec2 hp=fract(gl_FragCoord.xy/6.)-.5;',
        ' float dots=smoothstep(.42,.24,length(hp));',
        ' cl=mix(cl,cl*.80,dots*.40*(1.-lit)*(1.-L));',
        ' col=mix(col,cl,cloud);',
        // 云外的亮圈：朝月那一侧的边缘把天空照亮一点 —— 受光方向靠这一圈读出来
        ' col+=mix(vec3(.30,.25,.34),vec3(.05,.05,.07),L)*edge*max(0.,lit-.15)*1.1*(1.-cloud);',
        // 星：格内再抖一次位置，半径/亮度各自随机，乘 (1-cloud) 让云挡住它们
        ' vec2 g=gl_FragCoord.xy/3.0;',
        ' vec2 id=floor(g), fr=fract(g);',
        ' vec2 jit=vec2(.25+.5*hash(id+1.3),.25+.5*hash(id+7.7));',
        ' float sd=length(fr-jit);',
        ' float on=step(.982,hash(id+13.1));',
        ' float rad=.05+.26*hash(id+3.9);',
        ' float tw=.70+.30*sin(u_t*1.6+hash(id+21.3)*6.2831);',
        ' col+=on*smoothstep(rad,rad*.35,sd)*tw*(.35+.75*hash(id+5.1))',
        ' *mix(vec3(.86,.90,1.),vec3(1.,.96,.88),hash(id+41.3))',
        '      *smoothstep(.30,1.,uv.y)*(1.-L)*(1.-cloud);',
        ' float big=step(.9986,hash(id+29.7));',
        ' col+=big*smoothstep(.06,0.,max(abs(fr.x-jit.x),abs(fr.y-jit.y)))*vec3(1.,.98,.95)*(1.-L)*(1.-cloud);',
        // 月：硬边圆 + 边缘压暗 + 两块月海 + 月晕；放在云之后 —— 云不该压住月、网点也不该印在月上
        ' float disc=1.-smoothstep(.058,.0615,md);',
        ' float limb=smoothstep(0.,.055,md)*.45;',
        ' float maria=smoothstep(.038,.046,length(pc-mn-vec2(.022,-.014)))*.7',
        '            +smoothstep(.024,.030,length(pc-mn-vec2(-.026,.012)))*.6',
        '            +smoothstep(.010,.015,length(pc-mn-vec2(.004,.030)))*.5',
        ' +smoothstep(.012,.017,length(pc-mn-vec2(-.010,-.030)))*.45;',
        ' vec3 mo=mix(mix(vec3(.96,.94,.86),vec3(.70,.68,.64),clamp(maria,0.,.8)),vec3(1.,1.,.98),L);',
        ' mo*=1.-limb*.30;',
        ' float halo=exp(-md*20.)*.42+.14*exp(-md*4.5);',
        ' col=mix(col,mo,clamp(disc+halo*(1.-disc),0.,1.)*(1.-.08*(1.-L)));',
        // 花瓣：椭圆体 + 尖端一道缺口（樱瓣的识别特征）+ 按自转相位横向压扁（翻面）
        ' float pet=0., petS=0.;',
        ' for(int i=0;i<16;i++){',
        '   float fi=float(i);',
        '   float sx=hash(vec2(fi,7.3));',
        '   float sc=.95+1.05*hash(vec2(fi,13.1));',
        '   float spd=.014+.024*hash(vec2(fi,3.1));',
        '   float ph=fract(hash(vec2(fi,9.7))+u_t*spd);',
        '   float py=1.24-ph*1.48;',
        '   float px=sx+.06*sin(ph*6.2831*(1.+hash(vec2(fi,5.5)))+fi*1.7);',
        '   vec2 q=vec2((uv.x-px)*asp,uv.y-py);',
        '   float a=ph*7.4+fi*2.4;',
        '   vec2 rp=vec2(q.x*cos(a)-q.y*sin(a),q.x*sin(a)+q.y*cos(a));',
        '   float flip=.32+.68*abs(sin(ph*9.0+fi));',
        '   vec2 e=vec2(rp.x/(.0088*sc*flip),rp.y/(.0170*sc));',
        '   float w=sqrt(max(0.,1.-e.y*e.y));',
        '   float body=1.-smoothstep(w*.92,w*1.06,abs(e.x));',
        '   float m=body*(1.-(1.-smoothstep(.10,.30,abs(e.x)))*smoothstep(.28,.70,e.y));',
        ' petS+=m*(.86+.28*hash(vec2(fi,41.3)));',
        '   pet=max(pet,m);',
        ' }',
        ' vec3 petC=mix(vec3(1.,.72,.84),vec3(1.,.62,.76),L)*clamp(petS/max(pet,.0001),.80,1.18);',
        ' col=mix(col,petC,pet*(.60+.40*L));',
        // 远山三层（远山带雾、近山近黑）；最远那条脊线下面加一线轮廓光
        ' float r1=.215+.050*sin(uv.x*2.6+1.3)+.020*sin(uv.x*6.7+2.2)+.008*sin(uv.x*13.3+.4)',
        ' +.009*noise(vec2(uv.x*44.,7.1));',
        ' float r2=.150+.045*sin(uv.x*1.9-.7)+.018*sin(uv.x*5.3+1.1)+.007*sin(uv.x*11.7+2.6)',
        ' +.010*noise(vec2(uv.x*52.,2.9));',
        ' float r3=.075+.055*sin(uv.x*1.4+2.4)+.030*sin(uv.x*4.1-.9)+.014*sin(uv.x*9.7+1.7)',
        '          +.012*noise(vec2(uv.x*38.,3.3));',
        ' float f1=1.-smoothstep(r1-.002,r1+.002,uv.y);',
        ' float f2=1.-smoothstep(r2-.002,r2+.002,uv.y);',
        ' float f3=1.-smoothstep(r3-.004,r3+.004,uv.y);',
        ' vec3 hA=mix(vec3(.24,.19,.33),vec3(.82,.85,.93),L);',
        ' vec3 hB=mix(vec3(.12,.10,.19),vec3(.74,.79,.90),L);',
        ' vec3 hC=mix(vec3(.035,.032,.070),vec3(.66,.72,.86),L);',
        ' col+=mix(vec3(.36,.26,.40),vec3(.05,.05,.07),L)*exp(-abs(uv.y-r1)*140.)*f1;',
        ' col+=mix(vec3(.22,.17,.26),vec3(.04,.04,.06),L)*exp(-abs(uv.y-r2)*150.)*f2*lit;',
        ' col=mix(col,hA,f1);',
        ' col=mix(col,hB,f2);',
        ' col=mix(col,hC,f3);',
        // 抖动 ±0.005：把 8bit 量化的台阶打散，否则平滑渐变上会看见一条条硬边
        ' col+=(hash(gl_FragCoord.xy)-.5)*.010;',
        ' gl_FragColor=vec4(col,1.);',
        '}'
      ].join('\n');
    }
  };

  whenRoot(function () {
    var canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;' +
      'opacity:1;transition:opacity 250ms ease';
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

    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }

    var cache = {};       // 'kind|oct' → {key, prog, uRes, uT, uLight}
    var cur = null;       // 正在生效的那一项（含 scale/fps/id）
    var lastKind = null;  // 上一套跑的是哪个 kind：kind 变了要压一下画布（切套的「跳」）
    var paused = false;   // 弹层暂停（home-deck 调的 stop()），与「不在动态套」是两件事

    function build(kind, oct) {
      var src = KINDS[kind];
      if (!src) throw new Error('unknown kind: ' + kind);
      var prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, src(oct)));
      // 属性位置钉死 0：两个 program 的 linker 分配可以不同，钉住就不必每次切套重设指针
      gl.bindAttribLocation(prog, 0, 'a');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      var it = {
        key: kind + '|' + oct, kind: kind, oct: oct, prog: prog,
        uRes: gl.getUniformLocation(prog, 'u_res'), uT: gl.getUniformLocation(prog, 'u_t'),
        uLight: gl.getUniformLocation(prog, 'u_light')
      };
      cache[it.key] = it;
      return it;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // 主题：站点把主题写在 <html data-theme="…">，没写就是默认主题（深色）。
    function lightNow() {
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
      var scale = cur ? cur.scale : 1;
      var dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
      var w = Math.max(2, Math.round(canvas.clientWidth * dpr));
      var h = Math.max(2, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }
    function draw(t) {
      size();
      pollQueries();
      gl.useProgram(cur.prog);
      gl.uniform2f(cur.uRes, canvas.width, canvas.height);
      gl.uniform1f(cur.uT, (t - t0) / 1000);
      gl.uniform1f(cur.uLight, lightNow());      // 每帧设一次：主题切换下一帧就生效，不需要监听
      var q = TQ ? gl.createQuery() : null;
      if (q) gl.beginQuery(TQ.TIME_ELAPSED_EXT, q);
      var a = performance.now();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      cpuMs += performance.now() - a;            // 主线程侧提交耗时（不等 GPU）
      if (q) { gl.endQuery(TQ.TIME_ELAPSED_EXT); pending.push({ q: q }); }
      draws++;
    }
    function loop(t) {
      raf = 0;
      if (!t0) t0 = t;
      if (!cur.fps || t - lastDraw >= 1000 / cur.fps - 1) { draw(t); lastDraw = t; }
      frames++;
      if (!cur.once) raf = requestAnimationFrame(loop);
    }
    function stopRaf() { if (raf) { cancelAnimationFrame(raf); raf = 0; } lastStop = performance.now(); }
    function start() {          // 对外：恢复（弹层关闭）
      paused = false;
      if (cur && !raf && !document.hidden && isActive()) { t0 = 0; raf = requestAnimationFrame(loop); }
    }
    function stop() {           // 对外：暂停（弹层打开）
      paused = true;
      stopRaf();
    }

    function isActive() {
      var id = document.documentElement.getAttribute('data-bg');
      return !!(cur && cur.id === id);
    }

    function activate(id, cfg) {
      var kind = cfg.kind || 'aurora';
      var oct = Math.max(1, cfg.oct || 3);
      var item = cache[kind + '|' + oct];
      if (!item) item = build(kind, oct);
      cur = item;
      cur.id = id; cur.scale = cfg.scale || 1; cur.fps = cfg.fps || 0; cur.once = !!cfg.once;
      // 动态套之间切换（kind 变了）没有图可以淡：画布**在壁纸层之下**，能做的只有把自己压一下，
      // 让「换画法」这一跳看起来像一次过渡。首次挂载（lastKind === null）压一次也无害。
      if (lastKind !== null && lastKind !== kind) {
        canvas.style.opacity = '0';
        window.setTimeout(function () { canvas.style.opacity = '1'; }, 60);
      }
      lastKind = kind;
      canvas.style.display = 'block';
      canvas.style.opacity = '1';
      size();
      if (!paused && !document.hidden) { t0 = 0; if (!raf) raf = requestAnimationFrame(loop); }
    }

    function deactivate() {
      stopRaf();
      lastKind = null;
      // 画布在壁纸层之下：停下来之后留着最后一帧没有意义（壁纸不透明时看不见，壁纸缺图时就露馅），
      // 直接撤掉显示层。
      canvas.style.display = 'none';
    }

    /* 唯一的状态入口：读 data-bg 决定跑谁。切换脚本改完属性调它；这里不猜任何意图。 */
    function refresh() {
      var id = document.documentElement.getAttribute('data-bg');
      var cfg = dynCfg(id);
      if (!cfg) { deactivate(); return; }
      if (!cur || cur.id !== id) {
        try {
          activate(id, cfg);
        } catch (e) {                       // 某一套的 GLSL 编译失败：整支引擎退场，壁纸回来
          canvas.remove(); standDown();
          window.__bg = { ok: false, why: 'glsl', err: String(e) };
        }
        return;
      }
      if (!paused && !document.hidden) { t0 = 0; if (!raf) raf = requestAnimationFrame(loop); }
    }

    // 页面不可见就停 rAF：不给后台标签页白烧 GPU。切回来由 refresh 的思路重挂（停止不算暂停）。
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopRaf();
      else if (!paused) refresh();
    });
    window.addEventListener('resize', function () { if (cur) size(); });

    window.__bg = {
      ok: true,
      canvas: canvas,
      refresh: refresh,
      stop: stop,
      start: start,
      standDown: standDown,
      stats: function () {
        // kind/oct/scale/fps 只在**当前 data-bg 就是这一套**时给值。切回静态壁纸后 cur 仍然指着
        // 上一次编译好的那套（程序缓存在 cache 里，撤不掉），照直报会让「现在跑的是谁」读错 ——
        // 联调时被这个骗过一次：探针说 kind=anime，页面其实在看壁纸。想查缓存里留着谁看 loaded。
        var want = dynCfg(document.documentElement.getAttribute('data-bg')) ? cur : null;
        return {
          ok: true, frames: frames, draws: draws, running: !!raf, paused: paused,
          cpuMs: Math.round(cpuMs * 10) / 10,
          msPerDraw: draws ? Math.round(cpuMs / draws * 1000) / 1000 : null,
          cw: canvas.width, ch: canvas.height, css: [canvas.clientWidth, canvas.clientHeight],
          dpr: window.devicePixelRatio || 1,
          kind: want ? want.kind : null, loaded: cur ? cur.kind : null,
          oct: want ? want.oct : null, scale: want ? want.scale : null, fps: want ? want.fps : null,
          light: lightNow(),
          dataBg: document.documentElement.getAttribute('data-bg'),
          active: isActive(), prefix: PREFIX, sets: Object.keys(SETS),
          gl2: isGL2, timerQuery: !!TQ, gpu: gpuStats(),
          lastStop: lastStop
        };
      }
    };

    // 首屏：模板已经把 data-bg 写好了（含访客存的偏好），这里照它决定跑不跑。
    refresh();
  });
})();
