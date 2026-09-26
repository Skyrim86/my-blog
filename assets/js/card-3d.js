// 首页卡片组的 3D 查看器：弹层里那颗 ⤢ 打开的是一张**能自由转动的真卡**（有厚度的卡体、
// 正面主体凸起的浮雕、随角度流动的箔膜、转到背面是这张卡自己的信息面）。
//
// 为什么是裸 WebGL 而不是 three.js / 现成的卡牌库（2026-09-20 定的）：
//   · 这个场景**只有一个物体**。three.js 提供的那套（场景图、材质、加载器）我们一样都用不到，
//     真正干活的是片元着色器 —— 而着色器代码用不用 three.js 一字不差。
//   · 实测代价：three 0.180 的 two-file 构建 330 + 372 KB = **176 KB gzip**；而且
//     `three.module.min.js` 内部是 `import "./three.core.min.js"`，Hugo 的 `fingerprint`
//     只改入口文件名、不改写相对 import → **静默 404**。绕开它要么放弃指纹与 SRI 放进
//     static/，要么上 import map，要么加打包步骤 —— 这个仓库没有打包链。
//   · 自写这份约 14 KB、零依赖，继续走全站统一的 `defer` + SRI 装载方式。
//
// 为什么不用 liquid-glass / frostpane 那类玻璃库：它们的 `backdrop-filter` 折射的是**卡片
// 身后的页面背景**，而这里要的是「玻璃/亮膜盖在卡面的画上、折射画本身」—— 语义不同，
// 而且 backdrop-filter 配 SVG 滤镜在 Safari/Firefox 上支持不稳。它们的技术（毛玻璃底、
// 镜面高光、边缘色散、位移扰动）全部在本文件与 21-card-deck.css 里自己实现。
//
// 六条刻意的取舍：
//   1. **卡体是几何，不是贴图**：圆角矩形挤出一个有厚度的盒子（正/背两片圆角面 + 一圈侧面）。
//      转到 90° 时看到的是一条**真实的卡边**，不是「零厚度薄片消失成一条线」。
//      隐藏面靠深度测试解决（**不做背面剔除**）：剔除要求手工保证绕序，而绕序写反不会报错，
//      只会让某些角度下的卡面凭空消失 —— 宁可多画一半的片元。
//   2. **大尺度起伏在顶点着色器、细部在片元着色器**：主体凸起（网格位移）由顶点着色器采样
//      高度图完成，法线由同一处的高度梯度重建 —— 所以人物的肩线、发梢会真的把光挡出明暗；
//      POM（光线步进）只负责**比一个网格格子更细**的皱褶。两者共用同一张图、不同尺度。
//   3. **空闲时完全停掉动画循环**。这是博客首页的一个弹层，不该在没人动的时候一直烧 GPU。
//      拖拽中、惯性中、回弹中、指针悬在卡上时才 requestAnimationFrame；一旦静止就停，
//      下次输入再起。`stats().running` 就是给这个断言用的（lab/工具/shots.py 会读它）。
//   4. **失败不静默**：没有 WebGL、或着色器编译/链接失败时，回退到原来的平面大图、
//      在 console 明确报错、并在容器上写 `data-gl="error"`。黑屏是最糟的结果，
//      因为它看起来像「这张卡本来就长这样」。
//   5. **卡背文字是画在 canvas 上的，所以它必须有等价的 DOM 文本**。对比度脚本只遍历可见的
//      DOM 元素，canvas 里的字它看不见 —— 弹层里那条现有的名字/系列/序号/出处留着不动，
//      卡背只是把同一份信息做成了卡的样子。颜色全部取自 CSS 变量（21-card-deck.css 里
//      按明暗主题各给一套），这样卡背的配色仍然归主题管。
//   6. **背面纹理水平镜像**（见 uvOf）：卡背是印在卡的**反面**，翻过来时文字要正着读。
//      不镜像的话名字会是反的 —— 而那种错在只看正面时完全看不出来。
//
//   7. **只有按住左键拖动才让卡动**（2026-09-20 用户明确要求）：没有「跟着指针走」的悬停效果、
//      双击也不翻面 —— 翻面只走按钮与键盘两条路。鼠标划过卡片不会让它动，
//      而读屏/键盘用户也没有因此少掉任何一条操作路径。
//
// 对外接口（home-deck.js 用）：window.card3d = { supported, attach, setItem, setOpen,
//                                             setTheme, flip, isBack, reset, stats, setAngle,
//                                             setInspect, isInspect }
(function () {
  'use strict';

  /* ============================================================
     0. 卡体尺寸、风格参数、手感参数
     ============================================================ */

  // 卡体的**模型空间**尺寸：宽 1，高 1.4（5:7，与卡面一致），厚 0.016。
  // 厚度取 1.6% 是量出来的：真卡 63×88mm、约 0.3mm 厚 ≈ 0.5%，那样转到 90° 只有 2px 的边，
  // 看不出「有厚度」；1.6% 在 430px 的显示宽度上约 7px，既像卡又不像砖
  // （台面 2026-09-21 放大到 600px 之后，同一句话在这里是约 9.6px）。
  var CARD_W = 1.0, CARD_H = 1.4, CARD_T = 0.016, CARD_R = 0.06;
  // 角的**形状**指数（2026-09-21 第三轮）：|x/r|^n + |y/r|^n = 1。n = 2 是圆角弧（原来的样子），
  // n → ∞ 是直角。取 4 与 CSS 的 `corner-shape: superellipse(4)`（21-card-deck.css 的 --cshape）
  // **必须一致** —— 平面卡与 3D 卡是同一张卡的两种呈现，角不一样就是两种卡。
  // 几何（perimeter）与着色器（cardSdf）都由这一个常量驱动，着色器那边经 #define 注入。
  var CARD_N = 4.0;
  // 主体凸起的高度**基准**（模型空间单位，卡宽的比例）；每一档再乘 RANK_3D.relief。
  //
  // 历史（两句话都得留着，否则会有人把它调回 0.032 再踩一遍）：
  //   · 第一版取 5%，结果整张卡像一块立起来的纸板剪影 —— 因为高度图在人物轮廓处是从 0 直接
  //     跳到 0.5 的**断崖**，5% 的断崖就是一道 9px 高的墙，侧壁还是拉伸的纹理。
  //   · 于是退到 2.2%，靠法线光照去表达「凸」。
  // 2026-09-21 把根因修掉了：深度图先**倒角**（断崖变成 16px 的 sin 坡，见 make-depth.py），
  // 着色器再给陡坡一层**切边**（压暗 + 一道窄光，替掉拉伸的纹理）。坡不陡了、侧壁也有了材质，
  // 位移才敢往上加 —— 现在收藏档 3.2%、奇迹档 7.4%（3.2% × 2.3）。
  // **别把这两个前提拆开用**：只加位移不倒角+切边，就回到「纸板剪影」。
  var RELIEF = 0.040;
  var POM_STRENGTH = 0.45;
  // 网格密度与 POM 步数：按设备能力降级（见 pickQuality）。必须在建网格**之前**定。
  var GRID = { nx: 56, ny: 78, corner: 14 };
  // POM 步数的**编译期上限**（GLSL ES 要求循环边界是常量）；每档实际走几步由 RANK_3D.steps 给、
  // 运行期经 uSteps 早退，**再按视角乘一个 0.60~1.15 的系数**（见片元里那段：掠射角才需要多步）。
  // 所以上限要装得下 max(档位步数) × 1.15 —— 24 × 1.15 = 27.6，取 32 留余量。
  // **写小了是静默降质**：掠射角那一档会被悄悄截到上限，页面上只表现为「高档在侧面看还是有条纹」，
  // check-deck.mjs 有一条守卫核这个不等式。
  var POM_STEPS_MAX = 32;
  var POM_GRAZE_MAX = 1.15;        // 与片元里那个系数同一份口径（守卫要用它算上限）
  // 松手后的**余韵**：时间驱动的效果（星屑闪、彩虹流光）只在这段时间里继续演，之后连循环一起停。
  // 为什么不是「一直动」：这个弹层挂在博客首页上，「静止时零帧」是这个文件的一条铁律（文件头第 3 条）。
  // 2.5s 是「看着它回弹、星光还在流」的长度；验收读数从「空闲 900ms 内 0 帧」改成「松开 3s 后 0 帧」。
  var FX_TAIL_MS = 2500;
  var qualityPicked = false;
  // ---------- 帧时间调速器（2026-09-21）----------
  // 原来只有 pickQuality() 那一次性静态判断（看核数与视口），**没有任何基于实测帧时间的反馈**：
  // 6 核配弱核显的笔记本、或者任何我没法测的设备，要么白降质、要么掉帧。这里补上反馈回路。
  //
  // 三条口径：
  //   · **预算不写死**：刷新率靠实测（`refreshMs = min(样本 p10, 16.7)`）推出来 —— 165Hz 屏得到 6.1、
  //     60Hz 屏得到 16.7；而「一台从头就吃力的 60Hz 机器」因为那个 min() 仍会被判超预算。
  //   · 只在**动画循环活着**时采样（不碰「静止即停帧」），并且每次换卡后跳过前 GOV_WARM 帧 ——
  //     贴图上传与解码的尖峰不是渲染成本，算进去会让每张卡都「降一档」。
  //   · 降档要**出声**（console.info + stats().q），与「失败不静默」同一条口径。
  var GOV_WARM = 24;             // 换卡/开弹层后跳过的帧数
  var GOV_WIN = 30;              // 一个判定窗口多少帧
  var GOV = [
    { stepsCap: 32, fx: 1.00, lid: 1, pix: 1.00 },   // 0 = 全开
    { stepsCap: 20, fx: 0.85, lid: 1, pix: 1.00 },   // 1 = 中
    { stepsCap: 12, fx: 0.60, lid: 0, pix: 0.75 }    // 2 = 低（盖子整个关掉，画布也缩）
  ];
  // govBase = 这台设备的**档位上限**（弱设备从 1 起步、最多也就回到 1）；govTier 在 [0,2] 里动。
  var govTier = 0, govBase = 0, govWarm = GOV_WARM, govSamples = [], govOver = 0, govUnder = 0;
  var govRefresh = 16.7, govP75 = 0;

  // 每种卡面风格在 3D 里的一组着色器参数。**这张表是 YAML 里 style 字段的第二处消费点**：
  // 首页那张卡用 CSS 类（home-card--<style>），弹层里的 3D 卡用这里的参数。
  // 少写一种风格不会报错、只会静默套用兜底（foil）—— 所以 scripts/check-deck.mjs 里有一条
  // 守卫专门核这两边的键是否一一对应。
  //   foil 箔膜强度（虹彩可见度）  scale 虹彩带密度   tint 箔膜色相
  //   spec 镜面高光强度           relief 浮雕倍率    edge 卡边材质色（纸白/烫金/黑卡）
  //   sparkle 星屑闪点的加成（星点本来就是这两种工艺的纹样，所以它归工艺、不归等级）
  //
  // **八种**（2026-09-24 收敛：十六 → 八，见 data/card-styles.yaml 文件头）：这张表与 YAML 的 style 字段必须
  // 一一对应，少一种就会静默套用兜底参数（首页看着是它、转起来不是它），check-deck.mjs 有守卫。
  var STYLE_3D = {
    // ↓ 以下条目由 data/card-styles.yaml 生成（tools/cards/render-styles.mjs）—— 不要手改，check-deck.mjs 会核
    'holo-prism': { foil: 0.72, scale: 4.6, tint: [1.00, 0.97, 1.00], spec: 0.50, relief: 1.00, sparkle: 1.30, edge: [0.95, 0.93, 0.88] },
    silver:       { foil: 0.38, scale: 1.6, tint: [0.94, 0.96, 1.00], spec: 0.95, relief: 0.95, sparkle: 0.90, edge: [0.88, 0.91, 0.95] },
    starnight:    { foil: 0.26, scale: 3.4, tint: [0.78, 0.84, 1.00], spec: 0.45, relief: 1.00, sparkle: 1.45, edge: [0.30, 0.34, 0.66] },
    emboss:       { foil: 0.08, scale: 1.2, tint: [1.00, 0.99, 0.96], spec: 0.30, relief: 1.30, sparkle: 0.30, edge: [0.93, 0.91, 0.87] },
    pearl:        { foil: 0.26, scale: 1.8, tint: [1.00, 0.97, 0.92], spec: 0.78, relief: 0.85, sparkle: 1.05, edge: [0.95, 0.92, 0.86] },
    goldfoil:     { foil: 0.34, scale: 1.5, tint: [1.00, 0.84, 0.45], spec: 0.90, relief: 0.90, sparkle: 1.00, edge: [0.90, 0.75, 0.40] },
    inkwash:      { foil: 0.18, scale: 1.9, tint: [0.70, 0.70, 0.82], spec: 0.35, relief: 1.00, sparkle: 1.00, edge: [0.28, 0.28, 0.34] },
    foil:         { foil: 0.50, scale: 2.2, tint: [1.00, 1.00, 1.00], spec: 0.55, relief: 1.00, sparkle: 1.00, edge: [0.95, 0.93, 0.88] },
    // 2026-09-24：工艺层收敛到八种，汰掉的十种（和纸 / 雪华 / 冰裂 / 珍珠母贝 / 绸缎 / 玻璃 /
    // 金继 / 雕花金 / 珐琅彩 / 极光）的 3D 行连同它们的 CSS 块一起删了 —— 逐张卡的映射写在
    // data/home-cards.yaml 的组注释里，别在这里补回已汰除的行。
  };
  var STYLE_FALLBACK = 'foil';

  // 等级（rank）在 3D 里的参数。与 STYLE_3D 正交：**风格管纹样、等级管材质与立体强度**。
  //   metal 卡边金属度（0 纸白 / 1 烫金）—— 它同时抬高高光强度并给高光上色
  //   emis  卡边自发光（光刃）
  //   diff  卡边衍射（镭射：随视角变化的色相）
  //   back  卡背的档位序号 0~5（素背 → 单细环 → 单环 → 加粗 → 双环 + 等级带 → 再加背光），
  //         由 drawBack 按序号取值，见下面 BACK_RING_* 两张表
  //   relief 浮雕倍率（越高主体抬得越明显）  shadow 投影强度  sweep 转动时那道亮带的强度
  //
  // 后面七项是 2026-09-21 照 holo3D-card 那套加进来的**立体通道**，全部**单调不减**、
  // 收藏档一律为 0（于是低档卡与加这些之前一模一样，往上才逐级长出来）：
  //   steps   POM 步数（掠射角下的步进精度；上限是编译期的 POM_STEPS_MAX）
  //   sparkle 星屑闪点强度（再乘工艺的 sparkle）
  //   holo    随时间平移的彩虹流光强度
  //   halo    深度背光晕（光只出现在凸起处）
  //   cliff   陡坡切边（压暗侧壁 + 一道窄光，替掉拉伸的纹理）
  //   glint   拖拽时跟手的高光斑（不拖时为 0，由 draw 现算）
  //   bgZoom  画面放大倍率（背景视差的前提：不放大会采到画面外）
  //   bgPar   背景视差的最大位移（UV 单位；必须 ≤ 0.5 − 0.5/(1+bgZoom)，否则会采出边界 ——
  //           JS 里夹了一道，表也不能写超）
  // **六档**（2026-09-21 从四档扩到六档：加了 rare 珍稀 / arcane 秘藏）。这张表与 CSS 的
  // `.home-card-rank--*` 必须一一对应 —— 少一档会静默套用兜底（首页看着是它、转起来不是它），
  // check-deck.mjs 里有守卫核这个，另有一条核「每档每个通道都得写、且六档单调不减」。
  // **奇迹在显形前拿的是收藏那一套**：隐藏等级的定义就是看不出来（见 selectRank / rankOf）。
  var RANK_3D = {
    collector: { metal: 0.05, emis: 0.00, diff: 0.00, relief: 1.00, back: 0, shadow: 0.35, sweep: 0.25,
                 steps: 8,  sparkle: 0.00, holo: 0.00, halo: 0.00, cliff: 0.00, glint: 0.00, bgZoom: 0.016, bgPar: 0.006,
                 wall: 0.00, cast: 0.00, lid: 0.00, cone: 0.00, drift: 0.18, coneC: 0.00, holoC: 0.00, disp: 0.00, sharp: 0.00 },
    rare:      { metal: 0.30, emis: 0.01, diff: 0.05, relief: 1.15, back: 1, shadow: 0.48, sweep: 0.38,
                 steps: 10, sparkle: 0.10, holo: 0.08, halo: 0.05, cliff: 0.15, glint: 0.10, bgZoom: 0.024, bgPar: 0.008,
                 wall: 0.00, cast: 0.00, lid: 0.00, cone: 0.00, drift: 0.26, coneC: 0.00, holoC: 0.20, disp: 0.00, sharp: 0.00 },
    epic:      { metal: 0.55, emis: 0.02, diff: 0.12, relief: 1.30, back: 2, shadow: 0.62, sweep: 0.50,
                 steps: 12, sparkle: 0.28, holo: 0.22, halo: 0.16, cliff: 0.32, glint: 0.25, bgZoom: 0.032, bgPar: 0.0105,
                 wall: 0.00, cast: 0.00, lid: 0.00, cone: 0.00, drift: 0.34, coneC: 0.00, holoC: 0.40, disp: 0.00, sharp: 0.12 },
    arcane:    { metal: 0.72, emis: 0.03, diff: 0.30, relief: 1.50, back: 3, shadow: 0.82, sweep: 0.68,
                 steps: 16, sparkle: 0.48, holo: 0.40, halo: 0.34, cliff: 0.52, glint: 0.40, bgZoom: 0.042, bgPar: 0.014,
                 wall: 0.00, cast: 0.00, lid: 0.00, cone: 0.00, drift: 0.44, coneC: 0.00, holoC: 0.60, disp: 0.12, sharp: 0.18 },
    // relief 1.90 → **1.60**、cast 0.65 → **0.00**：2026-09-25 用户按对照图拍板（见 docs/pending.md
    // 「3D 取值拍板」）。cast 是**实测零效应**的旋钮（关掉它逐像素 0.00 差异），留着只会让人以为
    // 调它有用 —— 置 0 并在守卫的单调性检查里保持「不减」。
    // 同理 epic/arcane 的 coneC（.20/.45）→ 0：这两档 cone=0，coneC 乘在 0 上 = 空转。
    // 置 0 前已拍基线对拍确认逐像素 0.00（把 holo/sparkle 钉住），见 docs/pending.md。
    legend:    { metal: 0.85, emis: 0.05, diff: 0.48, relief: 1.60, back: 4, shadow: 1.00, sweep: 0.85,
                 steps: 20, sparkle: 0.78, holo: 0.70, halo: 0.70, cliff: 0.78, glint: 0.60, bgZoom: 0.050, bgPar: 0.022,
                 wall: 0.70, cast: 0.00, lid: 0.75, cone: 0.70, drift: 0.60, coneC: 0.75, holoC: 0.82, disp: 0.26, sharp: 0.24 },
    // 同上：relief 2.20 → **1.90**、cast 1.00 → **0.00**（2026-09-25 拍板）。
    miracle:   { metal: 0.90, emis: 0.18, diff: 0.72, relief: 1.90, back: 5, shadow: 1.15, sweep: 1.00,
                 steps: 24, sparkle: 1.00, holo: 1.00, halo: 1.00, cliff: 1.00, glint: 0.80, bgZoom: 0.075, bgPar: 0.030,
                 wall: 1.00, cast: 0.00, lid: 1.00, cone: 1.00, drift: 1.00, coneC: 1.00, holoC: 1.00, disp: 0.35, sharp: 0.30 },
  };
  // 卡背徽记那圈环：按档位序号取不透明度与线宽（下标 0 是素背，用不到）。以前这两张表
  // 是卡背「由素到华丽」的全部依据；2026-09-25 升级后它们只负责**外圈等级环**这一条
  // 通道，金轴的主表是下面的 BACK_ART（底色调/纹样密度/发光/角饰金/覆膜）。
  var BACK_RING_A = [0, 0.38, 0.55, 0.75, 0.88, 1.00];
  var BACK_RING_W = [0, 3, 6, 9, 12, 15];

  /* ---------- 卡背升级（2026-09-25，brief §三十六–§四十一）----------
     六档短名（星象套）+ 金轴取值。规则：① 短名**只在卡背**出现，rankLabel / 筛选条 /
     meta 一律保持原档名（与 `rankNo` 不进 i18n 同一条口径）；② 环宽是**纹理 px**，
     落到 430px 显示要乘 0.54 —— 所以这几个数比看上去的大（见 §四十一 那条「通道按显示
     px 定值」）；③ 奇迹走轴外：彩虹环 + 六角星专属底纹 + 四角星徽，不参与金量递增。 */
  var BACK_SHORT = { collector: '落尘', rare: '流萤', epic: '星座',
                     arcane: '月轮', legend: '日冕', miracle: '蚀' };
  var BACK_RN = { collector: 'Ⅰ', rare: 'Ⅱ', epic: 'Ⅲ', arcane: 'Ⅳ', legend: 'Ⅴ', miracle: 'Ⅵ' };
  var BACK_RANK_ORDER = ['collector', 'rare', 'epic', 'arcane', 'legend', 'miracle'];
  var BACK_ART = {
    collector: { gold: '#a8adba', goldLo: '#7d8494', tint: '#232733', dens: 0.08, glow: 0.00,
                 line: '#a8adba', name: '#f4f5f9', holo: 0.00, corgold: 0 },
    rare:      { gold: '#9d9078', goldLo: '#6f6553', tint: '#1d4033', dens: 0.11, glow: 0.14,
                 line: '#9aa1b2', name: '#f4f0e6', holo: 0.05, corgold: 0 },
    epic:      { gold: '#b09a6a', goldLo: '#7d6c48', tint: '#21305a', dens: 0.22, glow: 0.34,
                 line: '#c8ab72', name: '#f4f5f9', holo: 0.30, corgold: 0 },
    arcane:    { gold: '#c8ab72', goldLo: '#8f7846', tint: '#2a1a45', dens: 0.30, glow: 0.52,
                 line: '#d5bb84', name: '#f4f5f9', holo: 0.48, corgold: 1 },
    legend:    { gold: '#e2c488', goldLo: '#a1854c', tint: '#3e3011', dens: 0.38, glow: 0.78,
                 line: '#e8d29a', name: '#f0dfae', holo: 0.70, corgold: 1 },
    miracle:   { gold: '#fff4d2', goldLo: '#b9a26a', tint: '#2a1638', dens: 0.46, glow: 1.00,
                 line: '#fff4d2', name: '#fff6d8', holo: 1.00, corgold: 1 },
  };
  var BACK_IRID = ['#ffd98a', '#ff9ecd', '#8ab8ff', '#8affd0', '#d18aff', '#ffd98a'];

  function mixHex(a, b, t) {
    function p(h) {
      return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); });
    }
    var x = p(a), y = p(b), o = [];
    for (var i = 0; i < 3; i++) o.push(Math.round(x[i] + (y[i] - x[i]) * t));
    return 'rgb(' + o.join(',') + ')';
  }
  // 确定性伪随机：卡背纹理按 key 缓存，用 Math.random 会让同一张卡每次重画都不一样
  function rnd(seed) {
    var s = seed;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }
  function sArc(cx, cy, r, a0, a1, n) {
    var p = [];
    for (var i = 0; i <= n; i++) {
      var a = a0 + (a1 - a0) * i / n;
      p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return p;
  }
  function sQuad(p0, p1, p2, n) {
    var p = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      p.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
              u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
    }
    return p;
  }
  /* 收锋笔画：填充带（起笔粗、收笔尖）。**两点直线必须先重采样** —— 用 i/(len-2) 归一化时
     只有端点的笔画只画一段、宽度恒为首值，收锋根本不发生（2026-09-25 踩过一轮）。 */
  function taper(g, pts, w0, w1, a) {
    if (pts.length < 12) {
      var src = pts, n = 14, out = [];
      for (var k = 0; k <= n; k++) {
        var t0 = k / n * (src.length - 1), i0 = Math.min(src.length - 2, Math.floor(t0)), f = t0 - i0;
        out.push([src[i0][0] + (src[i0 + 1][0] - src[i0][0]) * f,
                  src[i0][1] + (src[i0 + 1][1] - src[i0][1]) * f]);
      }
      pts = out;
    }
    var saveA = g.globalAlpha;
    g.save();
    g.globalAlpha = a == null ? saveA : a;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (var i = 0; i < pts.length - 1; i++) {
      var t = i / Math.max(1, pts.length - 1);
      g.lineWidth = Math.max(0.4, w0 + (w1 - w0) * t);
      g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke();
    }
    g.restore();
  }
  function hexStar(g, x, y, r) {
    g.beginPath();
    for (var i = 0; i < 12; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 6, rr = (i % 2) ? r * 0.42 : r;
      if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  }
  /* 六种意象件（收锋版）：等级标的负形、满幅纹样的偶发件用**同一份**图形 —— 一处两用。 */
  var PIECE = {
    collector: function (g, cx, cy, s, a) {          // 落尘：一道收锋弧 + 三点递减
      taper(g, sQuad([cx - s * .34, cy + s * .30], [cx - s * .02, cy + s * .42], [cx + s * .34, cy - s * .06], 22),
            s * .085, s * .004, a);
      g.globalAlpha = a;
      [[-0.26, 0.16, 0.095], [-0.02, -0.02, 0.072], [0.26, -0.26, 0.050]].forEach(function (p) {
        g.beginPath(); g.arc(cx + p[0] * s, cy + p[1] * s, p[2] * s, 0, 7); g.fill();
      });
      g.globalAlpha = 1;
    },
    rare: function (g, cx, cy, s, a) {               // 流萤：三枚收锋泪滴
      [[-0.30, 0.22], [-0.02, 0.02], [0.26, -0.22]].forEach(function (p) {
        taper(g, sQuad([cx + p[0] * s, cy + p[1] * s], [cx + (p[0] + .10) * s, cy + (p[1] - .04) * s],
                       [cx + (p[0] + .20) * s, cy + (p[1] - .16) * s], 18), s * .085, s * .004, a);
        g.globalAlpha = a;
        g.beginPath(); g.arc(cx + p[0] * s, cy + p[1] * s, s * .066, 0, 7); g.fill();
      });
      g.globalAlpha = 1;
    },
    epic: function (g, cx, cy, s, a) {               // 星座：两条弧线 + 三颗星压在端点上
      var A = [cx - s * .50, cy + s * .36], B = [cx + s * .02, cy - s * .28], C = [cx + s * .14, cy + s * .04],
          D = [cx + s * .32, cy + s * .22], E = [cx + s * .52, cy - s * .38];
      taper(g, sQuad(A, B, C, 26), s * .090, s * .003, a);
      taper(g, sQuad(C, D, E, 26), s * .062, s * .0025, a);
      g.globalAlpha = a;
      [[A, 0.048], [C, 0.036], [E, 0.054]].forEach(function (p) {
        g.beginPath(); g.arc(p[0][0], p[0][1], p[1] * s, 0, 7); g.fill();
      });
      g.globalAlpha = 1;
    },
    arcane: function (g, cx, cy, s, a) {             // 月轮：月牙 + 牙内两段收锋弧 + 三颗带锋小星
      g.save(); g.globalAlpha = a;
      g.beginPath();
      g.moveTo(cx + s * .02, cy - s * .33);
      g.arc(cx - s * .08, cy, s * .32, Math.PI * 1.54, Math.PI * 0.46, false);
      g.arc(cx + s * .16, cy, s * .34, Math.PI * 0.44, Math.PI * 1.56, true);
      g.closePath(); g.fill();
      g.restore();
      taper(g, sArc(cx - s * .06, cy, s * .24, Math.PI * 1.30, Math.PI * 1.72, 10), s * .062, s * .008, a * .85);
      taper(g, sArc(cx - s * .06, cy, s * .24, Math.PI * 1.72, Math.PI * 0.52, 16), s * .062, s * .005, a * .85);
      [[0.30, -0.26, -0.55], [0.33, 0.17, 0.30], [0.11, 0.36, 1.25]].forEach(function (p) {
        var dx = Math.cos(p[2]) * s * .085, dy = Math.sin(p[2]) * s * .085;
        taper(g, [[cx + p[0] * s, cy + p[1] * s], [cx + p[0] * s + dx, cy + p[1] * s + dy]],
              s * .048, s * .008, a);
      });
    },
    legend: function (g, cx, cy, s, a) {             // 日冕：长短差大的收锋放射 + 空心环
      for (var i = 0; i < 12; i++) {
        var ang = i * Math.PI / 6, lg = i % 2 === 0, r0 = s * .12, r1 = s * (lg ? .46 : .24);
        taper(g, [[cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0],
                  [cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1]], s * (lg ? .105 : .062), s * .002, a);
      }
      g.save(); g.globalAlpha = a; g.lineWidth = s * .035;
      g.beginPath(); g.arc(cx, cy, s * .135, 0, 7); g.stroke(); g.restore();
    },
    miracle: function (g, cx, cy, s, a) {            // 蚀：8 段笔锋环（带缺口）+ 八道收锋细芒 + 内点
      var R0 = s * .26, t0 = Math.PI * 0.24, span = Math.PI * 1.72, segs = 8, i;
      for (i = 0; i < segs; i++) {
        var a0 = t0 + i * span / segs, a1 = a0 + span / segs, mid = (a0 + a1) / 2;
        taper(g, sArc(cx, cy, R0, a0, mid, 8), s * .030, s * .096, a);
        taper(g, sArc(cx, cy, R0, mid, a1, 8), s * .096, s * .028, a);
      }
      for (i = 0; i < 8; i++) {
        var ang = i * Math.PI / 4 + Math.PI / 8;
        taper(g, [[cx + Math.cos(ang) * s * .32, cy + Math.sin(ang) * s * .32],
                  [cx + Math.cos(ang) * s * .42, cy + Math.sin(ang) * s * .42]], s * .052, s * .003, a * .85);
      }
      g.globalAlpha = a;
      g.beginPath(); g.arc(cx, cy, s * .055, 0, 7); g.fill();
      g.globalAlpha = 1;
    },
  };
  function shieldPath(g, cx, cy, w, h) {
    var r = w * 0.16, top = cy - h / 2, bot = cy + h / 2;
    g.beginPath();
    g.moveTo(cx - w / 2 + r, top);
    g.lineTo(cx + w / 2 - r, top);
    g.quadraticCurveTo(cx + w / 2, top, cx + w / 2, top + r);
    g.lineTo(cx + w / 2, bot - h * 0.30);
    g.quadraticCurveTo(cx + w / 2, bot - h * 0.04, cx, bot);
    g.quadraticCurveTo(cx - w / 2, bot - h * 0.04, cx - w / 2, bot - h * 0.30);
    g.lineTo(cx - w / 2, top + r);
    g.quadraticCurveTo(cx - w / 2, top, cx - w / 2 + r, top);
    g.closePath();
  }
  function goldGrad(g, A) {
    var gr = g.createLinearGradient(0, 0, BW, BH);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.34, A.gold); gr.addColorStop(1, A.goldLo);
    return gr;
  }
  /* 满幅纹样（精修矢量，样张 v10 定样）：斜向笔触组 + 低频成团 + 收锋 + 偶发件。
     不是等距平铺 —— 等距平铺在 1:1 上被判「撒贴纸」，密度成团 + 收锋才读成印出来的纹样。 */
  function backPattern(g, A, key) {
    var ri = BACK_RANK_ORDER.indexOf(key);
    if (ri < 0) ri = 0;
    var dens = 0.55 + ri * 0.23, r0 = rnd(700 + ri * 13), i;
    var blobs = [];
    for (i = 0; i < 26; i++) blobs.push([r0() * BW, r0() * BH, 90 + r0() * 260]);
    function density(x, y) {
      var v = 0;
      for (var j = 0; j < blobs.length; j++) {
        var d = Math.sqrt((x - blobs[j][0]) * (x - blobs[j][0]) + (y - blobs[j][1]) * (y - blobs[j][1]));
        if (d < blobs[j][2]) v += 1 - d / blobs[j][2];
      }
      return Math.min(1, v / 2.2);
    }
    var gr = goldGrad(g, A), base = 0.09 + A.dens * 0.16;
    g.save(); g.strokeStyle = gr; g.fillStyle = gr;
    var groups = [[46, 34], [-46, 46], [78, 58]];
    for (var gi = 0; gi < groups.length; gi++) {
      var ang = groups[gi][0] * Math.PI / 180, step = groups[gi][1];
      var nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
      for (var pos = -BH; pos < BW + BH; pos += step * (0.72 + r0() * 0.8)) {
        for (var t = -BH * 0.2; t < BH * 1.1;) {
          var seg = 60 + r0() * 150;
          var x0 = nx * pos + Math.cos(ang) * t, y0 = ny * pos + Math.sin(ang) * t;
          var x1 = x0 + Math.cos(ang) * seg, y1 = y0 + Math.sin(ang) * seg;
          t += seg * (1.15 + r0() * 0.9);
          var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
          if (mx < -40 || mx > BW + 40 || my < -40 || my > BH + 40) continue;
          var dn = density(mx, my);
          if (dn * dens < 0.34) continue;
          var w0 = 2.2 + r0() * 3.0, w1 = Math.max(0.5, w0 * (0.06 + r0() * 0.25));
          taper(g, sQuad([x0, y0], [mx + (r0() - 0.5) * 46, my - seg * 0.28], [x1, y1], 14),
                w0, w1, base * (0.55 + dn * 0.75));
          if (r0() < 0.18 * dens) {
            if (key === 'miracle') { g.globalAlpha = base * 1.25; hexStar(g, x1, y1, 9 + r0() * 9); g.globalAlpha = 1; }
            else PIECE[key](g, x1, y1, 22 + r0() * 22, base * 1.15);
          }
        }
      }
    }
    g.restore();
  }
  // 奇迹触发显形的两个入口：转满一圈、或在背面停留。360° 是「你真的把它翻过一遍」，
  // 停留是给不想转的人一条路（也照顾了触屏上不便连续划圈的情况）。
  var REVEAL_TURN = Math.PI * 2;
  var REVEAL_DWELL_MS = 1500;

  // ---------- 分层浮起 / 收平（2026-09-24，brief 四.3-4）----------
  // 「基础（全部档位）：2 层（主体 + 背景）」= 已有的卡内背景视差（uBgPar + uDrift）：卡片转动时
  // **远处（低高度）的像素先走、主体慢半拍**，于是画面读成「主体浮在背景之上」的两层。
  // 它由 RANK_3D 的 bgZoom/bgPar/drift 三条给 —— 本轮把这三条**从「只有传世/奇迹」放开到全档位**
  // （brief 明写「全部档位」），所以低四档不再与加这批之前逐像素一致。**只有那 13 条光效通道
  // （sparkle/holo/halo/cliff/disp/sharp…）继续守「低档为 0」**：2 层是手感，不是光效，这是用户拍的例外。
  var FLAT_NEAR = 0.62, FLAT_FAR = 1.35;   // 收平斜坡（弧度）：|转角| 过 NEAR 开始收、到 FAR 归零
  // 展示台的投影：卡片悬浮在台面上方，投影落在卡下面（一条软椭圆）。宽窄/浓淡/位移全由**当前转角**给，
  // 见 syncStand()。它是 DOM 元素而不是一遍 GL 绘制 —— 一遍额外的全屏混合填充实测要 6.1 → 8.3 ms
  // （见 docs/traps.md「多一整遍全屏填充的代价」），而这张影子只需要一个合成层的 transform。
  var STAND_SHADOW_K = 0.22;   // 转到侧面时影子收到多窄（0.22 = 正面宽度的 22%）
  var STAND_X_K = 4.6;         // 卡片转开时影子往反方向让多少（台面宽度的百分数）

  // 拖拽灵敏度（弧度/像素）与俯仰限位。俯仰限 ±34°：再大就看到卡背的背面了；
  // 水平不限位，因为要能一路翻到背面。
  var YAW_GAIN = 0.0092, PITCH_GAIN = 0.0072, PITCH_MAX = 0.60;
  // 「看工艺」近观（2026-09-25）：固定斜角 + 拉近机位，让浮雕、箔纹、珠光这些**材料**看得见。
  // 角度 0.40 rad（≈23°）：再大就只看得到卡的侧边、看不到面；1.8× 是「卡占满画布、四边略出框」
  // 的那个倍数 —— 台面本来留了 11.5% 余量，除完 1.8 之后卡是画布的 1.38 倍宽。
  var INSPECT_YAW = 0.40, INSPECT_ZOOM = 1.8;
  var SPRING_K = 190, SPRING_C = 26;          // 临界阻尼附近：2√K ≈ 27.6
  // 惯性：**速度要限幅**。第一版不限幅、衰减 0.94，结果「轻甩一下」的总行程是
  // vy/(1-0.94) ≈ 7 弧度 —— 卡片会自己转一整圈多，而且回弹要 1.7 秒才停。
  // 0.085 rad/帧 + 衰减 0.90 → 总行程约 0.85 弧度（49°），一次快甩刚好翻到下一个面附近。
  var INERTIA_DECAY = 0.90, INERTIA_STOP = 0.0012, INERTIA_MAX = 0.085;
  // （这里曾有一组「悬停微倾」参数：指针悬在卡上就跟着轻微转动。用户 2026-09-20 明确要求
  //  **只有按住左键拖动才能让卡动，其他时候鼠标不能移动它** —— 所以整组悬停逻辑都删了：
  //  常量、update 里的分支、pointermove 里的悬停路径、以及双击翻面（那也是一次不按住的鼠标动作）。
  //  翻面仍然有按钮与键盘两条路，见文件头第 7 条。）

  /* ============================================================
     1. 小工具：mat4 / 能力探测
     ============================================================ */

  function mat4() { return new Float32Array(16); }
  function identity(m) {
    m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0;
    m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0;
    m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
    m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
    return m;
  }
  function perspective(out, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    identity(out);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1;
    out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }
  function multiply(out, a, b) {              // out = a · b（列主序）
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
          + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }
  // Ry = [[c,0,s],[0,1,0],[-s,0,c]]，Rx = [[1,0,0],[0,c,-s],[0,s,c]]（行主序写法，便于核对）
  function rotY(out, a) {
    var s = Math.sin(a), c = Math.cos(a);
    identity(out); out[0] = c; out[2] = -s; out[8] = s; out[10] = c;
    return out;
  }
  function rotX(out, a) {
    var s = Math.sin(a), c = Math.cos(a);
    identity(out); out[5] = c; out[6] = s; out[9] = -s; out[10] = c;
    return out;
  }
  function glAvailable() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }

  /* ============================================================
     2. 几何：圆角长方体
     ============================================================ */

  // 正/背面：内矩形格点 + 4 条边带 + 4 个角扇。**不用「矩形网格 + 圆角裁切」**：那样角落的
  // 三角形会退化、圆弧还会变成多边形。这里角是真正的圆弧采样。
  // uv 在着色器里由**位置**仿射求出（不是逐顶点传），所以任何三角剖分都不会有 UV 扭曲 ——
  // 圆角处的效果就是「画面被切掉一个角」，与真卡切角一致。
  function buildFace(out, z, face) {
    var hw = CARD_W / 2, hh = CARD_H / 2, r = CARD_R;
    var bx = hw - r, by = hh - r;
    var nx = GRID.nx, ny = GRID.ny, k = GRID.corner;
    var base = out.verts.length / 4;

    function v(x, y) { out.verts.push(x, y, z, face); return out.verts.length / 4 - 1; }
    function tri(a, b, c) { out.idx.push(a, b, c); }

    var i, j, s, t, a, b, c, d;
    // 内矩形：x 方向 nx 格、y 方向 ny 格
    for (j = 0; j <= ny; j++) {
      for (i = 0; i <= nx; i++) v(-bx + 2 * bx * (i / nx), by - 2 * by * (j / ny));
    }
    for (j = 0; j < ny; j++) {
      for (i = 0; i < nx; i++) {
        a = base + j * (nx + 1) + i; b = a + 1; c = a + nx + 1; d = c + 1;
        tri(a, c, b); tri(b, c, d);
      }
    }
    // 边带：内矩形的边 → 外边界（直线段，分 seg 段让边缘渐变更顺）
    var seg = 4;
    function edge(x0, y0, x1, y1, ox0, oy0, ox1, oy1) {
      var prev = null;
      for (s = 0; s <= seg; s++) {
        t = s / seg;
        var ia = v(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        var oa = v(ox0 + (ox1 - ox0) * t, oy0 + (oy1 - oy0) * t);
        if (prev) { tri(prev[0], prev[1], ia); tri(prev[1], oa, ia); }
        prev = [ia, oa];
      }
    }
    edge(-bx, by, bx, by, -bx, hh, bx, hh);           // 上
    edge(-bx, -by, bx, -by, -bx, -hh, bx, -hh);       // 下
    edge(-bx, -by, -bx, by, -hw, -by, -hw, by);       // 左
    edge(bx, -by, bx, by, hw, -by, hw, by);           // 右
    // 四角：圆心在内矩形的角上，半径 r 的圆弧扇
    var cx4 = [bx, -bx, -bx, bx], cy4 = [by, by, -by, -by], a04 = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    for (var ci = 0; ci < 4; ci++) {
      var center = v(cx4[ci], cy4[ci]), prev2 = null;
      for (s = 0; s <= k; s++) {
        var ang = a04[ci] + (Math.PI / 2) * (s / k);
        var cur = v(cx4[ci] + Math.cos(ang) * r, cy4[ci] + Math.sin(ang) * r);
        if (prev2 !== null) tri(center, prev2, cur);
        prev2 = cur;
      }
    }
  }

  // 圆角矩形的周长点（闭合回路，逆时针）。侧面与「卡边」的解析法线都用它。
  // **角是超椭圆**（2026-09-21）：圆角那一段从 sin/cos 换成 (sin a)^{2/n} / (cos a)^{2/n}
  // —— 超椭圆 |x/r|^n + |y/r|^n = 1 按 a 参数化就是这个形式（n = 2 时退化成原来的 sin/cos，
  // 所以这条改动对旧值是恒等的）。改成 n = 4 之后，侧面那圈不再是「直边 + 圆弧角」，
  // 而是与 CSS `corner-shape: superellipse(4)` 同一个形状。
  function perimeter(hw, hh, r, k) {
    var bx = hw - r, by = hh - r, pts = [], s, a, e = 2 / CARD_N, cs, sn;
    function corner(signX, signY, swap) {
      for (s = 1; s <= k; s++) {
        a = (Math.PI / 2) * (s / k);
        cs = Math.pow(Math.cos(a), e);
        sn = Math.pow(Math.sin(a), e);
        pts.push(swap ? [signX * bx + signX * cs * r, signY * by + signY * sn * r]
                      : [signX * bx + signX * sn * r, signY * by + signY * cs * r]);
      }
    }
    pts.push([0, hh], [bx, hh]);
    corner(1, 1, false);      // 右上：x = bx + sin^e, y = by + cos^e
    pts.push([hw, -by]);
    corner(1, -1, true);      // 右下：x = bx + cos^e, y = -by - sin^e
    pts.push([-bx, -hh]);
    corner(-1, -1, false);    // 左下
    pts.push([-hw, by]);
    corner(-1, 1, true);      // 左上
    pts.push([-bx, hh]);
    return pts;
  }

  // 侧面（卡边）：沿周长的一圈带，前 z=+T/2 到后 z=-T/2。顶点格式里 face=2。
  function buildSide(out) {
    var t = CARD_T / 2, pts = perimeter(CARD_W / 2, CARD_H / 2, CARD_R, GRID.corner);
    var front = [], back = [], i;
    for (i = 0; i < pts.length; i++) {
      out.verts.push(pts[i][0], pts[i][1], t, 2); front.push(out.verts.length / 4 - 1);
      out.verts.push(pts[i][0], pts[i][1], -t, 2); back.push(out.verts.length / 4 - 1);
    }
    for (i = 0; i < pts.length - 1; i++) {
      out.idx.push(front[i], back[i], front[i + 1]);
      out.idx.push(front[i + 1], back[i], back[i + 1]);
    }
  }

  function buildMesh() {
    var out = { verts: [], idx: [] };
    buildFace(out, CARD_T / 2, 0);
    buildFace(out, -CARD_T / 2, 1);
    buildSide(out);
    return out;
  }

  /* ============================================================
     3. 着色器
     ============================================================ */

  var VERT = [
    'attribute vec4 aPos;',                     // xyz = 模型空间位置，w = 面（0 正 / 1 背 / 2 侧）
    'uniform mat4 uProj, uView, uModel;',
    'uniform sampler2D uDepth;',
    'uniform float uRelief, uBgZoom;',
    'uniform vec2 uTexel;',
    'varying vec3 vModel;',
    'varying float vFace;',
    'float hAt(vec2 uv) { return texture2D(uDepth, clamp(uv, 0.002, 0.998)).r; }',
    'float cardSdfV(vec2 p) {',                 // 与片元里那份同式：只用来求「离卡边还有多远」
    '  vec2 b = vec2(CARD_W * 0.5, CARD_H * 0.5) - CARD_R;',
    '  vec2 d = abs(p) - b;',
    // 角部用 **p-范数** 代替欧氏距离：n = 2 时它就是 length()（原来的圆角矩形），n = 4 是超椭圆角
    // （与 CSS 的 corner-shape: superellipse(4)、与 perimeter() 三处同一个形状）。
    // 代价：p-范数不是严格距离（角附近偏小 ≈ 1% 卡宽），所以按距离算宽度的「边缘折射圈」在
    // 四个角上会比直边略宽一点点 —— 1% 卡宽上肉眼不可分，取值理由见 CARD_N 那条注释。
    '  float q = pow(pow(max(d.x, 0.0), CARD_N) + pow(max(d.y, 0.0), CARD_N), 1.0 / CARD_N);',
    '  return q + min(max(d.x, d.y), 0.0) - CARD_R;',
    '}',
    // 高度场梯度 → 法线。推导（uv → 模型空间）：
    //   uv.x = x/W + 0.5  →  ∂h/∂x = (∂h/∂u)/W
    //   uv.y = 0.5 - y/H  →  ∂h/∂y = -(∂h/∂v)/H
    //   高度场 z = h·D 的法线 ∝ (-∂z/∂x, -∂z/∂y, 1)
    // 两个分量都要除以 (2*texel) 把「差分」变成导数 —— 少了这一步法线会被一个常数放大，
    // 表现是明暗对比过强、看起来像塑料片（常数在归一化里不能约掉）。
    'vec3 reliefNormal(vec2 uv) {',
    '  float gu = (hAt(uv + vec2(uTexel.x, 0.0)) - hAt(uv - vec2(uTexel.x, 0.0))) / (2.0 * uTexel.x);',
    '  float gv = (hAt(uv + vec2(0.0, uTexel.y)) - hAt(uv - vec2(0.0, uTexel.y))) / (2.0 * uTexel.y);',
    '  return normalize(vec3(-gu * uRelief / CARD_W, gv * uRelief / CARD_H, 1.0));',
    '}',
    'void main() {',
    '  vFace = aPos.w;',
    '  vec3 p = aPos.xyz;',
    '  vec3 n = vec3(0.0, 0.0, 1.0);',
    '  vec2 uv = vec2(p.x / CARD_W + 0.5, 0.5 - p.y / CARD_H);',
    '  if (aPos.w < 0.5) {',                       // 正面：主体凸起
    '    // 位移必须在**靠近卡边处收敛到 0**（「周长上高度为 0」）。否则抬起来的部位在卡片转动时',
    '    // 会横向投影到轮廓之外 —— 实测 46°/63° 时人物的头发会戳出卡边，看起来像穿帮',
    '    // （物理上浮雕确实在卡面之前，但观感上就是错的）。这也是真压凸卡的边界条件：',
    '    // 模具在离卡边太近的地方压不出高度。',
    '    float edge = -cardSdfV(p.xy);',
    '    // 画面的放大倍率（RANK_3D.bgZoom）：卡内背景视差要把画面先放大一点才敢平移，否则会采到',
    '    // 画面外。**顶点位移必须用同一个放大后的 uv**，不然抬起来的那一块与画上的人会错位 ——',
    '    // 那是「浮雕跑到人旁边去了」，一眼就看得出来。片元那边同式，两处要一起改。',
    '    vec2 zuv = (uv - 0.5) / (1.0 + uBgZoom) + 0.5;',
    '    p.z += hAt(zuv) * uRelief * smoothstep(0.0, 0.055, edge);',
    '    n = reliefNormal(zuv);',
    '  } else if (aPos.w < 1.5) {',                // 背面：平的（信息面不需要浮雕）
    '    n = vec3(0.0, 0.0, -1.0);',
    '  }',
    '  vModel = p;',
    '  gl_Position = uProj * uView * uModel * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var FRAG_HEAD = [
    'precision highp float;',
    'varying vec3 vModel;',
    'varying float vFace;',
    'uniform sampler2D uFace;',
    'uniform sampler2D uDepth;',
    'uniform sampler2D uBack;',
    'uniform vec3 uEye;',               // 模型空间里的相机位置
    'uniform vec3 uL1, uL2;',           // 模型空间里的两盏灯
    'uniform vec3 uLp;',                // 第三盏「指针灯」：拖拽时跟手的高光斑（不拖时与 V 同向、贡献≈0）
    'uniform vec3 uFoilAxis;',
    'uniform vec2 uTexel;',
    'uniform vec2 uFaceTexel;',      // 卡面纹理的 texel（锐化的邻域步长）
    'uniform float uRelief, uPom;',
    'uniform float uDisp, uSharp;', // 主体色散 / 卡面锐化（都由 RANK_3D 给，低档为 0）
    'uniform float uFoil, uFoilScale, uSpec;',
'uniform float uEdgeMetal, uEdgeEmis, uEdgeDiff;',
'uniform float uShadow, uSweepPos, uSweepK;',
    'uniform vec3 uTint, uEdge;',
    'uniform float uDark;',
    // 2026-09-21 新增的立体通道（全部由 RANK_3D 给，收藏档为 0）：
    'uniform float uTime, uSteps, uSparkle, uHolo, uHalo, uCliff, uGlint;',
    'uniform float uBgZoom;',
    'uniform vec2 uBgPar;',
    // 2026-09-21 第二轮（透明盖 + 「好像要脱离卡面」）：
    //   uLid 盖子强度（**在卡自己的片元里合成**，不再是单独一层几何 —— 见下面那段注释）
    //   uWall 侧壁取色  uCast 卡面接触投影  uDrift 主体与背景的微视差
    'uniform float uLid, uWall, uCast, uDrift, uCone;',
    'uniform float uConeC, uHoloC;',
    // 光锥：从**上方斜射**进来的一道柔光（参考图里那一团）。卡与盖子两边都要用它 ——
    // 卡上是光落下来的提亮（caustic），盖子上是光在玻璃里的那一层。放这里两处共用一份。
    // ---------- 曲线场（2026-09-21 第三轮）----------
    // 全息流光与光锥原来都是**一条直线带**（`uv.x - 0.30 + 0.75 * uv.y`）—— 也就是说
    // 「光在卡上怎么走」与数学无关，而卡的等级体系（六档徽记）与边框（超椭圆）都是数学。
    // 换成曲线之后光沿曲线走，权重由 uHoloC / uConeC 给：**收藏/珍稀为 0 = 逐像素与加这批之前一致**
    // —— 与前面那 13 项立体通道同一条纪律（低档不许被顺手美化）。
    //
    // ⚠ **量级必须与原来那条直线带同阶**：diag 在整张卡上跨约 2.7，下面两个场都按这个量级归一。
    // 这一条是文件里早就写过的坑（系数一大，高度场的每处起伏就翻成一条彩虹线，看着像渲染坏了），
    // 所以数值不是随手取的：ln(r) 的跨度 × 系数 ≈ 1.2，θ 的跨度 (2π) × 系数 ≈ 1.6。
    'float spiralField(vec2 p) {',      // 对数螺线 r = a·e^{bθ}：同族螺线的相位 = ln r / b − θ
    '  vec2 q = p * vec2(1.0, CARD_H / CARD_W) * 1.35;',
    '  float r = max(length(q), 0.06);',
    '  float th = atan(q.y, q.x);',
    '  return (log(r) * 0.42 - th * 0.26) + 1.35;',
    '}',
    'float roseField(vec2 p, float k) {',   // 玫瑰线 r = cos kθ：等值线就是花瓣线
    '  vec2 q = p * vec2(1.9, 1.5);',
    '  float r = length(q);',
    '  float th = atan(q.y, q.x);',
    '  return abs(r - (0.16 + 0.30 * cos(k * th)));',
    '}',
    'float coneAt(vec2 uv) {',
    '  float band = exp(-pow((uv.x - 0.30 + 0.75 * uv.y) * 5.0, 2.0));',
    '  float base = band * smoothstep(0.72, 0.0, uv.y);',
    // 光斑上的花瓣结构：k = 5 与「传世」那档的徽记同一条曲线 —— 光与标同族，不是另挑一条
    '  float petal = smoothstep(0.055, 0.0, roseField(uv * 2.0 - 1.0, 5.0));',
    '  return base * (1.0 + uConeC * (0.15 + 0.85 * petal));',
    '}',
    'float hAt(vec2 uv) { return texture2D(uDepth, clamp(uv, 0.002, 0.998)).r; }',
    // 高度场自阴影：沿光的方向在高度场里采样，只要有比当前点高的就说明这一点被挡住了。
// **这才是「主体浮起来」的关键**：位移本身只是把画面抬高，而「它把光挡住了、卡面上留下
// 一道影」才是眼睛用来判断「这是一层浮在上面的东西」的依据。5 个抽样够出一道淡影，
// 而且只作用在背景那侧（凸起内部四周更低，occupancy 自然为 0）。
'float reliefShadow(vec2 uv, vec3 L, float h) {',
'  vec2 dir = L.xy / max(0.25, abs(L.z)) * 0.055;',
'  float occ = 0.0;',
'  for (int i = 1; i <= 5; i++) {',
'    float t = float(i) / 5.0;',
'    occ = max(occ, (hAt(uv + dir * t) - h) * (1.0 - t) * 5.0);',
'  }',
'  return clamp(occ, 0.0, 1.0);',
'}',
'float cardSdf(vec2 p) {',
    '  vec2 b = vec2(CARD_W * 0.5, CARD_H * 0.5) - CARD_R;',
    '  vec2 d = abs(p) - b;',
    // 角部用 **p-范数** 代替欧氏距离：n = 2 时它就是 length()（原来的圆角矩形），n = 4 是超椭圆角
    // （与 CSS 的 corner-shape: superellipse(4)、与 perimeter() 三处同一个形状）。
    // 代价：p-范数不是严格距离（角附近偏小 ≈ 1% 卡宽），所以按距离算宽度的「边缘折射圈」在
    // 四个角上会比直边略宽一点点 —— 1% 卡宽上肉眼不可分，取值理由见 CARD_N 那条注释。
    '  float q = pow(pow(max(d.x, 0.0), CARD_N) + pow(max(d.y, 0.0), CARD_N), 1.0 / CARD_N);',
    '  return q + min(max(d.x, d.y), 0.0) - CARD_R;',
    '}',
    'vec2 cardSdfGrad(vec2 p) {',
    '  vec2 b = vec2(CARD_W * 0.5, CARD_H * 0.5) - CARD_R;',
    '  vec2 d = abs(p) - b;',
    // 角部的法线同样走 p-范数的梯度方向（与上面的 SDF 同族，否则角上的折射方向会拧）
    '  if (d.x > 0.0 && d.y > 0.0) {',
    '    vec2 g = vec2(pow(d.x, CARD_N - 1.0), pow(d.y, CARD_N - 1.0));',
    '    return normalize(sign(p) * normalize(g));',
    '  }',
    '  return (d.x > d.y) ? vec2(sign(p.x), 0.0) : vec2(0.0, sign(p.y));',
    '}'
  ];
  var FRAG_BODY = [
    // 背面镜像 u：卡背印在卡的**反面**，翻过来时文字要正着读（见文件头第 6 条）
    'vec2 uvOf(vec3 p) {',
    '  float u = p.x / CARD_W + 0.5;',
    '  if (vFace > 0.5 && vFace < 1.5) u = 1.0 - u;',
    '  return vec2(u, 0.5 - p.y / CARD_H);',
    '}',
    'vec3 reliefNormalF(vec2 uv, out float slope, out vec2 grad) {',
    // 单尺度（±1 texel）梯度 —— 曾经为了防止深度图补丁网格的台阶而做过「窄窗 + 宽窗平均」，
    // 那条路的代价是整幅画面变软（细节与台阶一起被压）。**台阶最终在数据侧治掉了**
    // （生成器加了一道 3×3 中值，见 make-depth.py 的注释），所以这里保持单尺度、画面最锐。
    '  float gu = (hAt(uv + vec2(uTexel.x, 0.0)) - hAt(uv - vec2(uTexel.x, 0.0))) / (2.0 * uTexel.x);',
    '  float gv = (hAt(uv + vec2(0.0, uTexel.y)) - hAt(uv - vec2(0.0, uTexel.y))) / (2.0 * uTexel.y);',
    // 陡度 = 同一批梯度的长度（与法线倾斜同一量纲，但不带符号）—— 陡坡切边用它。
    // 复用这两个差分、不额外采样：片元着色器里每多一次纹理采样都是实打实的成本。
    '  grad = vec2(gu, gv);',
    '  slope = length(grad) * uRelief / CARD_W;',
    '  return normalize(vec3(-gu * uRelief / CARD_W, gv * uRelief / CARD_H, 1.0));',
    '}',
    // POM：沿视线在高度场里步进，找第一个「高度超过当前层」的位置。
    // 它只修**比网格更细**的起伏（大尺度已由顶点位移做掉），所以强度压得小。
    //
    // 【2026-09-25 查清的机制，写给下一个想知道「纹样能不能进 3D」的人】
    // 深度图进画面有**两条路**，敏感度差两个数量级：
    //   · 位移（POM）：总位移 ≈ `dir × uRelief`，而 `uRelief = RELIEF × S.relief × R.relief`
    //     实测这张传世/烫金箔卡只有 **0.0684**（RELIEF ≈ 0.049）→ 那个角度下约 **3px**（600px 卡）。
    //     所以「高度图里加纹样 = 让画面挪位」这条几乎读不出来，这是**机制决定**的，不是没采样。
    //   · 法线/明暗（`normalFromHeight`：`slope = length(grad) × uRelief / CARD_W`）：对**高频**
    //     极敏感 —— 一条 3px 宽的格线在高度图上就是一次陡跳，法线一歪，明暗整条线跟着变。
    // 实测（同一张卡、`setGovTier(0)`、`setAngle(0.34,0.12,true)`、卡面内口径、噪声底 0.07）：
    //     原图 → 叠 0.055 幅度 / 46px 格线 + 外框：**平均绝对差 5.99、>8 的像素 14.65%**（判读：
    //          「表面多了一层格子状起伏，线条处有高光与阴影」，无撕裂）
    //     原图 → 极端黑白棋盘（0.85 幅度）：20.44 / 48.2%，画面碎成马赛克（证明纹理确实在渲染里）
    // **注意别再用 `lab/工具/patternproto.py` 的旧结论**：它把图案写进了 `public/` 里的构建产物，
    // 而当时（和现在）8831 端口上是 hugo 开发服务器 —— 它从 `assets/` 现渲染，改 `public/` 等于
    // 改了一个没人服务的副本，量到的 0.035 是噪声。同一个图案写进源码是 5.99，差 170 倍。
    // 也就是说：**「工艺纹样做进 3D 表面」这条路是通的**（brief 里那条待办的前提已经满足），
    // 它读出来靠的是明暗而不是几何位移 —— 与 §八 那条「只改光不改色」同向。
    'vec2 parallax(vec2 uv, vec3 V) {',
    '  if (uPom < 0.01) return uv;',
    '  vec2 dir = -V.xy / max(0.25, abs(V.z)) * uPom;',
    // 步数是**运行期**的（等级阶梯给）：GLSL ES 要求循环边界是常量，所以边界写编译期上限、
    // 到步数就 break —— 与「把 POM_STEPS 写死成 24 再让低档白跑」是同一个结果、更省。
    // **再按视角缩一道**：POM 的步进误差只在掠射角显形（正视时高度场几乎不位移，粗步就够），
    // 所以正面看省约四成成本、侧面看反而更准。参考站也是这么做的（那边是 mix(32,10,|N·V|)）。
    '  float graze = clamp(1.0 - abs(V.z), 0.0, 1.0);',
    '  float steps = max(4.0, uSteps * mix(0.60, 1.15, graze));',
    '  float stepH = 1.0 / steps;',
    '  vec2 d = dir * stepH * uRelief;',
    '  float h = 1.0;',
    '  vec2 p = uv;',
    '  for (int i = 0; i < POM_STEPS_MAX; i++) {',
    '    if (float(i) >= steps) break;',
    '    if (hAt(p) >= h) break;',
    '    h -= stepH;',
    '    p += d;',
    '  }',
    '  // 二分细化一次：比起纯粹按步长命中，边缘会干净很多',
    '  float lo = h, hi = h + stepH;',
    '  for (int j = 0; j < 4; j++) {',
    '    float mid = (lo + hi) * 0.5;',
    '    vec2 q = p - d * ((mid - h) / max(1e-4, stepH));',
    '    if (hAt(q) >= mid) lo = mid; else hi = mid;',
    '  }',
    '  return clamp(p, 0.002, 0.998);',
    '}',
    'void main() {',
    '  vec2 uv0 = uvOf(vModel);',
    '  // 画面的放大倍率（与顶点着色器同式，见那边的注释）：放大后 uv 才在 [0,1] 内有平移余量',
    '  vec2 uv = (uv0 - 0.5) / (1.0 + uBgZoom) + 0.5;',
    '  vec3 V = normalize(uEye - vModel);',
    '  vec3 N;',
    '  vec3 albedo;',
    '  float ao = 0.92;',
    '  float hv = 0.5;',                 // 这个点在高度场上的高度（0 背景 / 1 最凸）
    '  float slope = 0.0;',              // 高度场陡度（陡坡切边 / 侧壁用；只有正面才算）
    '  vec2 grad = vec2(0.0);',          // 高度场梯度方向（侧壁取色沿它向下走）
    '  float foilMask = 1.0;',
    // 采样点：正面会先经 POM、再经背景视差挪动。**声明在这里而不是下面那个 if 里** ——
    // 等级效果那一段还要用它（星屑的哈希网格扎在采样点上），写在块里就出了作用域。
    '  vec2 puv = uv;',
    '  if (vFace < 1.5) {',
    '    puv = (vFace < 0.5) ? parallax(uv, V) : uv;',
    '    if (vFace < 0.5) {',
    '      // 卡内 3D 视差：**只有远处（低高度）的像素跟着角度平移**，主体立着不动 —— 于是',
    '      // 「人是从背景里立起来的」这条线索成立。位移量由 JS 按当前转角每帧算（uBgPar），',
    '      // 方向与转动相反，读作背景在卡面之后。放大倍率已经在上面统一吃掉了。',
    '      float hs = hAt(puv);',
    '      // uDrift 让**主体往反方向挪一点**：背景与主体分开走，「这一层浮在画面之上」的动感',
    '      // 才是从**相对运动**来的。位移总量仍受 JS 那道夹取约束（放大多少就只能挪多少）。',
    '      float bgW = 1.0 - smoothstep(0.10, 0.34, hs)',
    '                 - uDrift * 0.30 * smoothstep(0.40, 0.95, hs);',
    '      puv = clamp(puv + uBgPar * bgW, 0.002, 0.998);',
    '    }',
    '    if (vFace < 0.5) {',
    '      vec3 alb = texture2D(uFace, puv).rgb;',
    // 色散：**按这一像素被挪了多远**把 RGB 分开采样 —— `puv - uv` 正好是 POM 与卡内视差
    // 的合位移。参考站 holo3D-card 把这道叫次表面色散：隆起物的边缘会析出极窄的彩边，
    // 而卡的边缘本来就是凸起信息最密的地方，所以彩边长在正确的位置上。
    '      if (uDisp > 0.01) {',
    '        vec2 dsp = clamp((puv - uv) * uDisp * 0.5, vec2(-0.004), vec2(0.004));',
    '        alb.r = texture2D(uFace, clamp(puv + dsp, 0.002, 0.998)).r;',
    '        alb.b = texture2D(uFace, clamp(puv - dsp, 0.002, 0.998)).b;',
    '      }',
    // 锐化：纹理源头只有 700px 高（被放大到 840、xl 档 1064），放大的软用一层邻域找回来。
    // 一次额外采样，且只在 uSharp > 0 的档开 —— 低三档是 0，逐像素与加它之前一致。
    '      if (uSharp > 0.01) {',
    '        vec3 nb = texture2D(uFace, clamp(puv + uFaceTexel * vec2(1.0, 1.0), 0.002, 0.998)).rgb;',
    // 高光保护：锐化会把「本来就接近白」的地方推过 1.0 再被 clamp 成死白，
    // 白发 / 白衣 / 掠射角高光上那一大片纯白是这么来的（A/B 截图里看得到）。
    // 亮度越高锐化越弱，0.72 起线性收到 0.98 归零 —— 只在中间调与暗部找细节。
    '        float ksh = uSharp * (1.0 - smoothstep(0.72, 0.98, dot(alb, vec3(0.3333))));',
    '        alb = clamp(alb + (alb - nb) * ksh, 0.0, 1.0);',
    '      }',
    '      albedo = alb;',
    '    } else {',
    '      albedo = texture2D(uBack, puv).rgb;',
    '    }',
    '    N = (vFace < 0.5) ? reliefNormalF(puv, slope, grad) : vec3(0.0, 0.0, -1.0);',
    '    if (vFace < 0.5) {',
    '      hv = hAt(puv);',
    '      // 高度当环境光遮蔽：低处（背景、衣褶里）压暗、抬起来的地方亮。',
    '      // 范围不能太大 —— 第一版 mix(0.60,1.0) 把背景压得比主体暗太多，主体看着像剪贴画。',
    '      ao = mix(0.74, 1.0, hv);',
'      // 投影只压在卡面（背景）上，不压主体自己',
'      ao *= 1.0 - uShadow * 0.5 * reliefShadow(puv, uL1, hv);',
    '      // 卡面接触投影：主体外圈那一带压暗（「它把影子投在卡面上」是浮起来最强的一条线索）。',
    '      // 做法是看**隔壁**多高：四邻偏移采样取最大值，隔壁是主体、而自己是卡面 → 压暗。',
    '      // 四个额外采样，只在正面。',
    '      float nb = max(max(hAt(puv + vec2(3.0 * uTexel.x, 0.0)), hAt(puv - vec2(3.0 * uTexel.x, 0.0))),',
    '                     max(hAt(puv + vec2(0.0, 3.0 * uTexel.y)), hAt(puv - vec2(0.0, 3.0 * uTexel.y))));',
    '      float contact = smoothstep(0.30, 0.75, nb) * (1.0 - smoothstep(0.0, 0.10, hv));',
    '      ao *= 1.0 - uCast * 0.55 * contact;',
    '      foilMask = mix(0.38, 1.0, hv);',   // 箔膜压在浮雕上：抬起来的部分才亮
    '    } else {',
    '      hv = 0.5; foilMask = 0.55; ao = 0.95;',
    '    }',
    '  } else {',
    '    // 侧面（卡边）：解析法线，材质是纸 / 金属',
    '    N = normalize(vec3(cardSdfGrad(vModel.xy), 0.0));',
    '    albedo = uEdge;',
    '    hv = 0.5; foilMask = 0.22; ao = 0.90;',
    '  }',
    '  float ndl1 = max(dot(N, uL1), 0.0);',
    '  float ndl2 = max(dot(N, uL2), 0.0);',
    '  // 系数要让「正面朝相机、无起伏」时总光量≈1：那样静止时卡面看起来就是原画，',
    '  // 转动与浮雕带来的变化才是叠加在它上面的。第一版系数加起来 1.28，整张卡都是过曝的。',
    '  vec3 col = albedo * (0.22 + 0.26 * ao + 0.55 * ndl1 + 0.17 * ndl2);',
    '  vec3 H1 = normalize(uL1 + V);',
    '  // 高光的指数要**窄**（72 太宽，卡面是一大片平面，N·H 整片都很高，于是整卡泛白），',
    '  // 并且只在抬起来的部位才强：压凸的亮点本来就只出现在凸起的顶上。',
    '  col += mix(vec3(1.0, 0.99, 0.96), uEdge, uEdgeMetal) * pow(max(dot(N, H1), 0.0), 150.0) * uSpec * 0.5 * (0.25 + 0.75 * hv);',
    '  // 箔膜：虹彩由**反射向量**驱动 —— 卡片一转，色带就流过卡面。',
    '  // 这正是「全息」与「一张静态渐变贴图」的全部差别。',
    '  vec3 R = reflect(-V, N);',
    '  float f = dot(R, normalize(uFoilAxis));',
    '  vec3 irid = 0.5 + 0.5 * cos(6.28318 * (f * uFoilScale + vec3(0.0, 0.33, 0.67)));',
    '  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);',
      '  col += irid * uTint * uFoil * foilMask * (0.30 + 1.15 * fres);',
  '  // 「更烧」的两件事：第二层错频虹彩（色分离更明显）+ 一道**由角速度驱动**的亮带。',
  '  // 亮带只在转动时出现（uSweepK 由 JS 按当前角速度给），停下就消失 —— 静止的卡上',
  '  // 常驻一道亮带会像印上去的，而转动时扫过一道才像光。',
  '  vec3 irid2 = 0.5 + 0.5 * cos(6.28318 * (f * uFoilScale * 1.7 + vec3(0.15, 0.48, 0.82)));',
  "  col += irid2 * uTint * uFoil * foilMask * 0.45 * fres;",
  // ②b 卡面视角衍射（2026-09-26「diff 从卡边扩到卡面」，与卡面全息同批）：把卡边那条
  //    视角驱动的衍射彩虹（dcol，dot(N,V) 驱动）带到卡面，门控 = uEdgeDiff（等级强度）
  //    × uFoil（工艺资格）—— 收藏档 diff=0 逐像素不变，非箔工艺几乎不动。与 irid 的
  //    分工要分清：irid 由反射轴驱动、色带**流过**卡面；这条由视角驱动、**整片同相**
  //    换色 ——「整片随视角变色」说的就是它。也是治「全息静态发白」的根：静止时它是
  //    一层薄薄的有色衍射，不是白雾。
  '  vec3 fcol = 0.5 + 0.5 * cos(6.28318 * (dot(N, V) * 1.6 + vec3(0.0, 0.33, 0.67)));',
  '  col += fcol * uEdgeDiff * uFoil * foilMask * 0.55;',
  '  float sweep = exp(-pow((uvOf(vModel).x * 1.7 - uSweepPos) * 3.0, 2.0));',
  '  col += mix(vec3(1.0), uTint, 0.35) * sweep * uSweepK * foilMask * 0.55;',
  // ---------- 等级驱动的立体通道（2026-09-21，照 holo3D-card 那套搬过来）----------
  // 全部只在正面、且乘在「抬起来的地方才亮」上（foilMask / hv）；收藏档这些通道全是 0，
  // 所以低档卡与加这批之前**逐像素一致**，华丽是从珍稀开始一级级长出来的。
  '  if (vFace < 0.5) {',
  '    // ① 彩虹流光：在**静态**虹彩（上面那两条）之上再叠一层随 uTime 平移的波。',
  '    //    停止渲染时 uTime 不动，它就退化成又一层静态虹彩 —— 所以「静止即零帧」那条铁律',
  '    //    不会在这里破掉，静止的卡也不会自己花起来。',
  // 坐标**以画面上平滑的 diag 与时间为主**：`f`（反射向量）是逐片元随法线变的量，
  // 它的系数一大就把高度场的每一处起伏都翻成一条彩虹线 —— 看着是一片细网格/经纬线
  // （放大 3 倍才看清，静图上像「渲染坏了」）。所以 f 只留很小的系数（0.10 / 0.8）。
  '    float diag = uv.x * 1.5 + uv.y * 1.2 + hv * 0.35;',
    // uHoloC = 0 时 field 恒等于 diag（那两档与加这批之前逐像素一致）；越高档越沿对数螺线：
    // 色带不再是「一条固定斜线扫过」，而是绕卡心旋出去，转动时读作「光在螺线里流」。
  '    float field = mix(diag, spiralField(uv - vec2(0.5)), uHoloC);',
  '    float wave = sin(field * 8.0 - uTime * 0.55 + f * 0.8);',
  '    float hc = fract(field * 0.35 + f * 0.10 + wave * 0.12 + uTime * 0.03);',
  '    vec3 holo = 0.5 + 0.5 * cos(6.28318 * (hc + vec3(0.0, 0.33, 0.67)));',
  // 权重压到 0.20 而且**只在掠射角**（fres）才明显：卡面是一张浅色插画，权重一高就把它洗成
  // 一层脏紫雾（第一版 0.35 就是这样，对比图上一眼可见）。要的是「转起来掠过一道彩」，
  // 不是「换了个色调」。
  // 2026-09-26 曲线重配（用户拍板）：正视项 0.10 → 0.175，掠射封顶不变（系数和仍 1.0，
  // fres=1 处与旧逐像素一致）。依据是同相位对照图（lab/结果/spin-holo-ab4）：全局 0.35
  // 在正视「明显且干净」、在掠射判「紫雾/洗灰/发脏」——所以只把正视抬到 0.35 当量
  // （0.175×0.20 = 0.10×0.35），掠射保持 0.20 现状，紫雾风险归零。
  '    col += holo * uTint * uHolo * foilMask * (0.175 + 0.825 * fres) * 0.20;',
  '    // ② 星屑闪点：哈希网格 + pow(n,110) 取稀疏点 + 闪烁门。**稀疏是关键**（见下一条注释）：',
  '    //    偶尔闪一下才像箔膜里的晶体，只长在**抬起来的地方**（hv 门），背景不撒点。',
  // 2026-09-25 改（用户报「光晕与全息别莫名其妙地闪」）：这一段原来是**每格一个白噪声**的
  // pow(n,110)，亮点直径就一格（≈2 px），加上 tw 与 hv 两道硬门 —— 逐帧量出来**单像素一帧跳
  // 满 255**、按住不动也一直在闪。四处改成软的：
  //   · **格间双线性**（取 4 个格点哈希再插值）：亮点有 2–3 格的过渡，不会一帧冒出来；
  //   · **门放宽**：hv 从 (0.15,0.60) 放到 (0.10,0.95)，渐变段拉长；
  //   · **慢闪**：周期 2.1 s → 6.3 s（uTime*3 → *1），底色 0.15 → 0.25；
  //   · **峰值** 2.5 → 1.8、夹到 1.1。
  // 密度不动（还是 pow(n,110)）：上面的注释量过它 ≈470 颗，插值会让边缘变软、颗数基本不变。
  '    vec2 gsp = puv * 280.0;',
  '    vec2 gi = floor(gsp), gf = gsp - gi;',
  '    gf = gf * gf * (3.0 - 2.0 * gf);',
  '    float h00 = fract(sin(dot(gi, vec2(12.9898, 78.233))) * 43758.5453);',
  '    float h10 = fract(sin(dot(gi + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453);',
  '    float h01 = fract(sin(dot(gi + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);',
  '    float h11 = fract(sin(dot(gi + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);',
  '    float n = mix(mix(h00, h10, gf.x), mix(h01, h11, gf.x), gf.y);',
  '    float tw = sin(uTime * 1.0 + n * 6.28318) * 0.5 + 0.5;',
  // 密度是量出来的：280×280 个格子里 n^110 > 1/2.5 的约 0.6%（≈470 颗），摊在 600×840 上
  // 约等于每 32×32 一颗 —— 那是「闪」的密度。pow 从 32 一路提到 110 全是因为对比图上
  // 浅色插画被撒成了沙地：**亮点要稀疏且亮**，密了就只剩「脏」。
  '    float sp = pow(n, 110.0) * 1.8 * uSparkle * (0.25 + 0.75 * tw) * smoothstep(0.10, 0.95, hv);',
  '    col += mix(vec3(1.0), uTint, 0.25) * min(sp, 1.1) * foilMask;',
  '    // ③ 深度背光晕：光**只出现在凸起处**（乘 hv）——「这是浮起来的一层」最直接的线索，',
  '    //    也是最便宜的一条（没有额外采样）。',
  '    float rimD = pow(1.0 - max(dot(N, V), 0.0), 2.5) * (0.25 + 0.75 * hv);',
  '    col += mix(vec3(0.74, 0.90, 1.0), uTint, 0.45) * rimD * uHalo * 0.55;',
  '    // ④ 陡坡切边：高度陡的地方（主体轮廓的侧壁）压暗 + 一道窄光。它替掉的是**拉伸的纹理**',
  '    //    —— 没有这一层，位移一加大就看到一圈糊掉的画，读作「贴上去的纸板剪影」。',
  '    //    陡度取自高度场梯度（reliefNormalF 顺手给），不引入 dFdx/dFdy 那条扩展依赖。',
  '    float cliffW = smoothstep(0.40, 1.30, slope) * uCliff;',
  '    col *= mix(1.0, 0.54, cliffW);',
  '    col += mix(vec3(1.0), uTint, 0.30) * pow(max(dot(N, H1), 0.0), 30.0) * cliffW * 0.75;',
  '    // ⑥ 侧壁取色：陡坡上不只是压暗 —— 沿坡**向下**（= 梯度反方向）取一笔崖底的颜色混上去，',
  '    //    读作「这个凸起有一层从下面延续上来的侧壁」，而不是「一块变暗的凸起」。',
  '    //    这是「人物好像要脱离卡面」里最实质的一条：有厚度 = 不是画上去的。',
  '    float wallW = uWall * smoothstep(0.45, 1.30, slope);',
  '    vec2 wallUv = clamp(puv - grad / max(length(grad), 1.0e-5)',
  '                        * (0.010 + 0.030 * min(slope, 2.5)), 0.002, 0.998);',
  '    col = mix(col, texture2D(uFace, wallUv).rgb * (0.60 + 0.30 * hv), wallW * 0.45);',
  '    // ⑦ 光锥落在画面上（caustic）：与盖子上那道光同一条函数，只是这里提亮而不是加膜。',
  '    col += mix(vec3(1.0), uTint, 0.30) * coneAt(uv) * uLid * uCone * 0.26 * foilMask;',
  '    // ⑤ 拖拽高光跟手：按住拖动时指针当第三盏灯，一个窄高光斑跟着手走（uGlint 由 JS 给 0',
  '    //    或等级值）。这条正好卡在「鼠标划过卡片不会让它动」那条要求的边界上：',
  '    //    **光可以跟手，卡不能跟手**。',
  '    vec3 Hp = normalize(uLp + V);',
  '    col += mix(vec3(1.0, 0.99, 0.94), uTint, 0.35) * pow(max(dot(N, Hp), 0.0), 60.0)',
  '           * uGlint * 1.4 * (0.25 + 0.75 * hv);',
  '  }',
  '  // 卡边的等级材质：自发光（光刃）与视角驱动的衍射（镭射）',
'  if (vFace > 1.5) {',
'    col += uEdge * uEdgeEmis * (0.6 + 0.4 * fres);',
'    vec3 dcol = 0.5 + 0.5 * cos(6.28318 * (dot(N, V) * 1.6 + vec3(0.0, 0.33, 0.67)));',
'    col += dcol * uEdgeDiff * 0.55;',
'  }',
    '  // 卡边：倒角 + 真折射（错位取样）+ RGB 色散。厚卡/亮膜卡最容易被认出来的就是这一圈。',
    '  if (vFace < 1.5) {',
    '    float e = -cardSdf(vModel.xy);',
    '    float rim = smoothstep(0.030, 0.0, e);',
    '    if (rim > 0.002) {',
    '      vec2 g = cardSdfGrad(vModel.xy);',
    '      vec2 o = -g * (0.010 + 0.018 * rim);',
    '      vec2 base = uv;',                 // 画面已按 uBgZoom 放大，这层折射取样要跟它一致
    '      vec3 refr;',
    '      refr.r = texture2D(uFace, clamp(base + o * 1.08, 0.002, 0.998)).r;',
    '      refr.g = texture2D(uFace, clamp(base + o, 0.002, 0.998)).g;',
    '      refr.b = texture2D(uFace, clamp(base + o * 0.92, 0.002, 0.998)).b;',
    '      col = mix(col, refr * 1.05, rim * 0.55);',
    '      col += uEdge * rim * rim * 0.20;',
    '      col += vec3(1.0) * pow(rim, 8.0) * 0.12;',
    '    }',
    '  }',
  '  // ---------- 透明厚盖：在卡自己的片元里合成 ----------',
  '  // 第一版是**单独一层几何 + 混合绘制**，实测代价 6.1 → 8.3ms/帧（211 帧里 179 帧超预算）——',
  '  // 多一整遍全卡填充是实打实的。而盖子与卡面 footprint 相同、且永远在卡面之前，',
  '  // 所以「盖上」这件事在数值上就是一次 mix：**同样的观感，零额外填充**。',
  '  if (vFace < 0.5 && uLid > 0.005) {',
  '    float ndv = max(V.z, 0.0);',
  '    float e = -cardSdf(vModel.xy);',
  '    float w = 0.020 / clamp(ndv, 0.35, 1.0);      // 越斜看越宽（隔着玻璃看切边就是这样）',
  '    float rim = smoothstep(w, 0.0, e);',
  '    float core = pow(rim, 5.0);',
  '    float cone = coneAt(uv) * uCone;',
  '    float press = smoothstep(0.50, 0.95, hv);     // 主体顶到玻璃的地方（hv 就是这里的高度）',
  '    float pressRing = smoothstep(0.34, 0.62, hv) * (1.0 - smoothstep(0.62, 0.88, hv));',
  '    vec3 tint = mix(vec3(1.0), uEdge, 0.25);',
  '    float a = uLid * (0.010 + 0.055 * (1.0 - ndv))',
  '            + uLid * (rim * 0.26 + core * 0.40)',
  '            + uLid * cone * 0.115',
  '            + uLid * (press * 0.10 + pressRing * 0.15);',
  '    vec3 lcol = tint * (0.72 + 0.28 * cone) + tint * (rim * 0.35 + core * 0.55) + tint * press * 0.18;',
  '    col = mix(col, lcol, clamp(a, 0.0, 0.62));',
  '  }',
    '  col *= mix(1.0, 1.06, uDark);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ];

  function shaderSource() {
    var defs = ['#define CARD_W ' + CARD_W.toFixed(4),
      '#define CARD_H ' + CARD_H.toFixed(4),
      '#define CARD_R ' + CARD_R.toFixed(4),
      // 角的形状指数：与 perimeter()、与 CSS 的 --cshape 同一个数（见 CARD_N 那条注释）
      '#define CARD_N ' + CARD_N.toFixed(1),
      '#define POM_STEPS_MAX ' + POM_STEPS_MAX];
    return { vert: defs.concat(VERT).join('\n'), frag: defs.concat(FRAG_HEAD, FRAG_BODY).join('\n') };
  }

  /* ============================================================
     4. 卡背纹理（canvas 2D 现画，零新素材）
     ============================================================ */

  var BW = 800, BH = 1120;   // 背纹理分辨率：显示宽约 430px，2x 屏上也够锐

  function star(g, x, y, r) {
    g.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 4, rr = (i % 2) ? r * 0.34 : r;
      if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  }

  // 系列徽记：用 canvas 路径画，不引入图片。三个系列各按自己的意象来。
  function emblem(g, series, cx, cy, R, color) {
    g.save();
    g.strokeStyle = color; g.fillStyle = color;
    g.lineCap = 'round';
    var i, a;
    if (series === '卡夫卡') {
      g.lineWidth = R * 0.055;                       // 彼岸花：五片细长外卷的花瓣 + 放射花蕊
      for (i = 0; i < 5; i++) {
        a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
        g.beginPath();
        g.moveTo(cx, cy);
        g.quadraticCurveTo(cx + Math.cos(a - 0.30) * R * 1.05, cy + Math.sin(a - 0.30) * R * 1.05,
          cx + Math.cos(a - 0.16) * R * 1.34, cy + Math.sin(a - 0.16) * R * 1.34);
        g.moveTo(cx, cy);
        g.quadraticCurveTo(cx + Math.cos(a + 0.30) * R * 1.05, cy + Math.sin(a + 0.30) * R * 1.05,
          cx + Math.cos(a + 0.16) * R * 1.34, cy + Math.sin(a + 0.16) * R * 1.34);
        g.stroke();
      }
      g.lineWidth = R * 0.028;
      for (i = 0; i < 14; i++) {
        a = i * (Math.PI * 2 / 14);
        g.beginPath(); g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * R * 0.60, cy + Math.sin(a) * R * 0.60);
        g.stroke();
      }
    } else if (series === '黑长直少女') {
      // 一弯新月（外弧 + 反向内弧闭合成月牙）+ 一颗星
      g.beginPath();
      g.arc(cx, cy, R * 0.92, Math.PI * 0.30, Math.PI * 1.70, false);
      g.arc(cx + R * 0.48, cy, R * 0.98, Math.PI * 1.66, Math.PI * 0.34, true);
      g.closePath(); g.fill();
      star(g, cx + R * 0.58, cy - R * 0.92, R * 0.22);
    } else {
      g.lineWidth = R * 0.055;                       // 绫华：六角结晶（与她的雪/霜意象一致）
      for (i = 0; i < 6; i++) {
        a = -Math.PI / 2 + i * (Math.PI / 3);
        g.beginPath(); g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
        var mx = cx + Math.cos(a) * R * 0.52, my = cy + Math.sin(a) * R * 0.52;
        g.beginPath();
        g.moveTo(mx, my);
        g.lineTo(mx + Math.cos(a - 0.9) * R * 0.30, my + Math.sin(a - 0.9) * R * 0.30);
        g.moveTo(mx, my);
        g.lineTo(mx + Math.cos(a + 0.9) * R * 0.30, my + Math.sin(a + 0.9) * R * 0.30);
        g.stroke();
      }
    }
    g.restore();
  }

  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // 名字过长时截断：卡背是固定宽度的画布，溢出会直接画到框外
  function clampText(g, s, max) {
    if (g.measureText(s).width <= max) return s;
    var out = s;
    while (out.length > 1 && g.measureText(out + '…').width > max) out = out.slice(0, -1);
    return out + '…';
  }

  // 主题色从 CSS 变量读（21-card-deck.css 里按明暗各给一套）—— 卡背的配色因此仍归主题管。
  function readVars() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fb) { return (cs.getPropertyValue(name) || '').trim() || fb; }
    return {
      bg1: v('--cardback-bg1', '#20222c'), bg2: v('--cardback-bg2', '#141620'),
      fg: v('--cardback-fg', '#f2f3f7'), dim: v('--cardback-dim', '#a9aec0'),
      line: v('--cardback-line', '#8a90a6'), accent: v('--cardback-accent', '#c9a25a')
    };
  }

  // 卡背（2026-09-25 升级：两层构图「外圈等级标 + 内里系列纹样」）。定位：正面清框之后
  // 这里是**唯一**的图内等级面 —— 点开卡背能看到等级是设计，不是泄漏（正面与卡边才归奇迹那套）。
  // 六条金轴：底色调 → 满幅纹样密度 → 外发光 → 框线/角饰 → 等级环 → 等级标 → 覆膜。
  function conic(g, a0, x, y, cols) {
    if (!g.createConicGradient) {           // 老 Safari 没有 conic：退成斜向渐变，颜色不丢
      var lg = g.createLinearGradient(x - 200, y - 200, x + 200, y + 200);
      cols.forEach(function (c, i) { lg.addColorStop(i / (cols.length - 1), c); });
      return lg;
    }
    var cg = g.createConicGradient(a0, x, y);
    cols.forEach(function (c, i) { cg.addColorStop(i / (cols.length - 1), c); });
    return cg;
  }

  function drawBack(canvas, data, C) {
    var g = canvas.getContext('2d');
    var fam = getComputedStyle(document.body).fontFamily || 'sans-serif';
    var key = data.rank || 'collector';
    if (!BACK_ART[key]) key = 'collector';
    var A = BACK_ART[key];
    var ri = BACK_RANK_ORDER.indexOf(key);
    var sizeK = 0.92 + ri * 0.032;
    var ringA = BACK_RING_A[Math.min(ri, 5)], ringW = BACK_RING_W[Math.min(ri, 5)];

    /* 1 底：档位底色（斜向），再压满幅纹样 */
    g.clearRect(0, 0, BW, BH);
    var bg = g.createLinearGradient(0, 0, BW * 0.35, BH);
    bg.addColorStop(0, mixHex(A.tint, '#6a7090', 0.30));
    bg.addColorStop(0.58, mixHex(A.tint, '#05070c', 0.62));
    bg.addColorStop(1, A.tint);
    g.fillStyle = bg; g.fillRect(0, 0, BW, BH);
    backPattern(g, A, key);

    /* 2 斜向反光 */
    var sh = g.createLinearGradient(0, BH, BW * 0.9, 0);
    sh.addColorStop(0.34, 'rgba(255,255,255,0)');
    sh.addColorStop(0.46, 'rgba(255,255,255,' + (0.13 + A.glow * 0.05).toFixed(3) + ')');
    sh.addColorStop(0.58, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(0, 0, BW, BH);

    /* 3 外发光（高档才有，screen 叠上去） */
    if (A.glow > 0) {
      var rg = g.createRadialGradient(BW / 2, BH * 0.34, 40, BW / 2, BH * 0.34, BW * 0.62);
      rg.addColorStop(0, 'rgba(255,246,220,' + (A.glow * 0.16).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(255,246,220,0)');
      g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = rg;
      g.fillRect(0, 0, BW, BH); g.restore();
    }

    /* 4 双线外框 + 一道内衬线（线宽随档） */
    var gold = goldGrad(g, A);
    g.save();
    g.strokeStyle = gold; g.globalAlpha = 0.85; g.lineWidth = 4.4 + ringA * 3.6;
    rrect(g, 34, 34, BW - 68, BH - 68, 26); g.stroke();
    g.globalAlpha = 0.35; g.lineWidth = 2;
    rrect(g, 52, 52, BW - 104, BH - 104, 18); g.stroke();
    g.globalAlpha = ringA > 0 ? 0.22 + ringA * 0.30 : 0.16;
    g.lineWidth = 1.4 + ringW * 0.35; g.strokeStyle = A.line;
    rrect(g, 74, 74, BW - 148, BH - 148, 14); g.stroke();
    g.restore();

    /* 5 四角角饰：卷草两笔；奇迹换四角星徽 */
    g.save();
    var corGold = A.corgold ? gold : A.line;
    g.strokeStyle = corGold; g.fillStyle = corGold;
    g.globalAlpha = 0.34 + A.corgold * 0.24;
    g.lineWidth = 2.4 + A.corgold * 1.0; g.lineCap = 'round';
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (q) {
      var sx = q[0], sy = q[1];
      var ox = sx > 0 ? 96 : BW - 96, oy = sy > 0 ? 96 : BH - 96;
      if (key === 'miracle') {
        hexStar(g, ox + sx * 16, oy + sy * 16, 15);
      } else {
        taper(g, sQuad([ox, oy + sy * 26], [ox + sx * 4, oy + sy * 4], [ox + sx * 26, oy], 12),
              3.0 + A.corgold * 1.2, 1.2, 0.55);
        taper(g, sQuad([ox + sx * 8, oy + sy * 30], [ox + sx * 14, oy + sy * 14], [ox + sx * 30, oy + sy * 8], 12),
              2.2, 1.0, 0.45);
      }
    });
    g.restore();

    /* 6 等级环：外圈就是「外圈等级标」的那一圈；奇迹走彩虹环 */
    var cx = BW / 2, cy = BH * 0.335;
    if (ringA > 0) {
      g.save();
      if (key === 'miracle') {
        g.strokeStyle = conic(g, 0.6, cx, cy, BACK_IRID);
        g.globalAlpha = ringA; g.lineWidth = ringW;
        g.beginPath(); g.arc(cx, cy, BW * 0.255, 0, 7); g.stroke();
        g.globalAlpha = 0.5; g.lineWidth = 2;
        g.beginPath(); g.arc(cx, cy, BW * 0.288, 0, 7); g.stroke();
      } else {
        g.strokeStyle = gold; g.globalAlpha = ringA; g.lineWidth = ringW;
        g.beginPath(); g.arc(cx, cy, BW * 0.255, 0, 7); g.stroke();
        if (ringA >= 0.70) {
          g.globalAlpha = 0.42; g.lineWidth = 2;
          g.beginPath(); g.arc(cx, cy, BW * 0.288, 0, 7); g.stroke();
        }
      }
      g.restore();
    }

    /* 7 等级标：盾形底场六档一致，靠**负形镂空**（收锋件）+ 金量 + 尺寸 ±8% 分档 */
    var sw = 210 * sizeK, shh = 250 * sizeK;
    var mg = g.createLinearGradient(cx - sw * 0.55, cy - shh * 0.5, cx + sw * 0.5, cy + shh * 0.55);
    mg.addColorStop(0, '#ffffff'); mg.addColorStop(0.30, A.gold);
    mg.addColorStop(0.62, A.goldLo); mg.addColorStop(1, A.gold);
    g.save();
    g.shadowColor = 'rgba(255,246,220,' + (0.40 * A.glow).toFixed(2) + ')';
    g.shadowBlur = 30 * A.glow;
    shieldPath(g, cx, cy, sw, shh); g.fillStyle = mg; g.fill();
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    // 斜向高光带（金属感的来源；纯渐变会被读成平面贴图）
    g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.20;
    var hl = g.createLinearGradient(cx - sw * 0.5, cy + shh * 0.42, cx + sw * 0.30, cy - shh * 0.5);
    hl.addColorStop(0, 'rgba(255,255,255,0)');
    hl.addColorStop(0.52, 'rgba(255,255,255,.95)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    shieldPath(g, cx, cy, sw, shh); g.fillStyle = hl; g.fill(); g.restore();
    // 双线内刻线（凹线 + 下沿亮线）
    g.strokeStyle = 'rgba(18,15,22,.34)'; g.lineWidth = 1.7;
    shieldPath(g, cx, cy, sw * 0.90, shh * 0.90); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.20)'; g.lineWidth = 1.1;
    shieldPath(g, cx, cy + 1.3, sw * 0.90, shh * 0.90); g.stroke();
    // 件：先深色「洞」，再向上 1.2px 描一道刻痕高光（负形的做法）
    g.fillStyle = 'rgba(11,9,15,.95)'; g.strokeStyle = 'rgba(11,9,15,.95)';
    PIECE[key](g, cx, cy - shh * 0.015, sw * 0.58, 1);
    g.save(); g.globalAlpha = 0.17; g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    PIECE[key](g, cx, cy - shh * 0.015 - 1.2, sw * 0.58, 1);
    g.restore();
    g.restore();

    /* 8 内里：系列纹样（不换系列就不换它，等级标只在外圈，居中不丢「这是谁的卡」） */
    g.save(); g.globalAlpha = 0.95;
    emblem(g, data.series, cx, cy + 74 * sizeK, 30 * sizeK, key === 'miracle' ? '#fff2ff' : A.gold);
    g.restore();

    /* 9 文字：阶序标记 → 卡名 → 系列 → 分隔线 → 「Ⅵ 蚀 · 奇迹」 → 出处 → 品牌 */
    var rn = data.rankNo || BACK_RN[key];
    g.save();
    g.textAlign = 'center';
    g.fillStyle = A.name; g.globalAlpha = 0.92;
    g.font = '600 ' + (38 + ringA * 24).toFixed(0) + 'px ' + fam;
    g.fillText(rn, cx, cy + shh * 0.5 + 54);
    g.globalAlpha = 1;
    g.font = '700 62px ' + fam;
    g.fillStyle = key === 'miracle' ? '#fff6ff' : mixHex(C.fg || '#f4f5f9', A.name, 0.55);
    g.fillText(clampText(g, data.label || '', BW - 190), cx, BH * 0.645);
    g.font = '400 30px ' + fam; g.fillStyle = C.dim;
    g.fillText(data.series || '', cx, BH * 0.695);
    g.globalAlpha = 0.5; g.strokeStyle = A.line; g.lineWidth = 2;
    g.beginPath(); g.moveTo(BW * 0.30, BH * 0.735); g.lineTo(BW * 0.70, BH * 0.735); g.stroke();
    g.globalAlpha = 1;
    // 短名在前：「Ⅵ 蚀 · 奇迹」。短名只在卡背出现 —— 筛选条 / meta / 正面一律还是原档名。
    if (data.rankLabel) {
      g.font = '600 30px ' + fam;
      g.fillStyle = key === 'miracle' ? conic(g, 0.5, cx, BH * 0.80, BACK_IRID) : A.gold;
      g.fillText(rn + ' ' + BACK_SHORT[key] + ' · ' + data.rankLabel, cx, BH * 0.845);
    }
    // 「07 / 63」这个序号**不印在卡背上**（2026-09-21 用户要求）：卡背是一张卡，不是一条记录，
    // 编号属于信息栏。信息本身没丢：弹层里那条 DOM 文本照样有它（见文件头第 5 条）。
    if (data.creditText) {
      g.fillStyle = C.dim; g.font = '400 26px ' + fam;
      g.fillText(clampText(g, data.creditText, BW - 160), cx, BH * 0.905);
    }
    g.globalAlpha = 0.7; g.fillStyle = C.dim; g.font = '400 24px ' + fam;
    g.fillText('KAGAMI · 卡片组', cx, BH * 0.955);
    g.globalAlpha = 1;
    g.restore();

    /* 10 覆膜：虹彩（conic）+ 细颗粒。Ⅰ/Ⅱ 不做覆膜 —— 「覆膜 = 高档」这条信号要保纯度 */
    if (A.holo > 0) {
      g.save();
      g.globalCompositeOperation = 'screen';
      var cols = key === 'miracle'
        ? BACK_IRID
        : ['#ffe9b0', '#ffc7e0', '#b6d4ff', '#c3ffe6', '#e2c7ff', '#ffe9b0'];
      g.globalAlpha = A.holo * 0.22;
      g.fillStyle = conic(g, 1.1, BW * 0.42, BH * 0.30, cols);
      g.fillRect(0, 0, BW, BH);
      g.globalAlpha = A.holo * 0.30;
      for (var i = 0; i < 900; i++) {
        g.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.22)';
        g.fillRect((i * 97) % BW, (i * 173) % BH, 2.4, 2.4);
      }
      g.restore();
    }
  }

  /* ============================================================
     5. GL 初始化与资源
     ============================================================ */

  var GL = null;                 // { gl, U, count, dist, aniso, maxAniso, pom }
  var canvas = null, host = null, deckEl = null;
  var item = null;
  var texFace = null, texBack = null, texDepth = null;
  var texDepthFor = '';         // 这张深度图属于哪一张卡（防「前一张的模型贴在新卡上」）
  var faceSeq = 0;                   // setItem 的序号：晚到的图不许盖住后来居上的那一张
  // 卡面贴图被换掉过几次（低清一次、xl 一次）。给 lab 的读数用：等它自增 = 「画面换人了」，
  // 比等某张图下完更贴近访客感知 —— 低清先上之后，这两件事不再是同一时刻（见 setItem 的注释）。
  var faceSwaps = 0;
  var texFaceW = 0, texFaceH = 0;    // 卡面纹理的像素尺寸（锐化的邻域步长要用它）   // texDepth = { tex, w, h }
  var backCanvas = null, backKey = '';
  var proj = mat4(), view = mat4(), model = mat4(), rot = mat4(), rot2 = mat4();
  var yaw = 0, pitch = 0, vy = 0, vp = 0, baseYaw = 0;
  var zoom = 1, zoomTo = 1, inspect = false;
  var itemDone = null;
  var itemProgress = null;
  // 换贴图完成时叫一声（一次性）。**没人在等就什么都不做** —— 产品路径不用它，
  // 只有「对比」与「开包」两条路会传 done 进来（见 home-deck.js）。
  function fireItemDone() {
    var f = itemDone;
    itemDone = null;
    itemProgress = null;
    if (f) { try { f(); } catch (e) { console.warn('[card3d] setItem 回调抛了：' + (e && e.message)); } }
  }
  /* 换卡时「贴图到了几成」的回报（给弹层的加载条用）。整块进度的口径是**这一次 setItem
     排出去的贴图任务数**（低清 / xl / 深度各算一个），不是为了精确到字节 —— 加载条只要
     能说明「还在动、快好了」，别在最后 10% 上停住不动就行。
     `seq` 要和 faceSeq 比：翻页很快时上一次 setItem 的任务还在落地，它的进度不该驱动
     现在这条卡上的进度条（2026-09-25 加）。 */
  function fireItemProgress(doneN, total, seq) {
    if (seq !== faceSeq) return;
    var f = itemProgress;
    if (!f) return;
    try { f(doneN, total); } catch (e) { console.warn('[card3d] 进度回调抛了：' + (e && e.message)); }
  }
  var faceWasBack = false;
  var dragging = false, pinned = false, inertia = false;
  var lastX = 0, lastY = 0, lastT = 0;
  var raf = 0, lastFrame = 0, frames = 0, lastStats = 0, open = false;
  var turned = 0;              // 本次打开以来累计转过的角度（奇迹显形的判据之一）
  var revealed = false;        // 奇迹是否已显形（本次打开内保持）
  var backSince = 0;           // 停在背面的起始时刻（另一个判据）
  var revealTimer = 0;         // 「在背面停留」的定时器
  var standEl = null;          // 展示台上的投影（DOM，attach 时建；无 GL 时不存在）
  var sweepPos = -0.5;         // 亮带当前位置（uv 空间，负值 = 还在卡外）
  var sweepK = 0;              // 亮带强度：只在转动时升起，停下衰减到 0
  // 调速器档位的**生效权重**（渐近值，见 frame() 里的斜坡）。曾经试过给时间通道加「包络」
  // 让进/出更软，量的结果是**不需要**：fxTime 是累积的相位、跨停机连续，停机那一下实测
  // 画布 Δ=0，没有跳；反而会把静止时的星屑一并抹掉（线上样张肉眼可辨）。已撤。
  var govFxk = 1;
  // 跟手高光的生效值：按下不动就整张亮起来也是「莫名其妙地闪」（一帧 0 → 0.6、52% 像素同时变），
  // 所以①只有真拖过（位移 > GLINT_MIN_PX）才亮 ②亮/灭都走斜坡。
  var glintK = 0, dragMoved = false, pressX = 0, pressY = 0, GLINT_MIN_PX = 3;
  var fxTime = 0;              // 时间相位（秒）：只在动画循环活着时推进，所以静止的卡上是冻结的
  var lastInput = 0;           // 最后一次交互的时刻（松手后的余韵以它为起点，见 FX_TAIL_MS）
  var ptrX = 0, ptrY = 0;      // 指针在台面里的位置（-1~1 的视图空间坐标，用于跟手高光）
  // 送进着色器的**生效值**（draw 每帧填）。stats().fx 直接回它 —— 让 lab 读「真正生效的数」
  // 而不是回读参数表：表到着色器之间还夹着调速器档位与编译期上限两道，回读表会假绿。
  var fxEff = { relief: 0, disp: 0, sharp: 0, steps: 0, sparkle: 0, holo: 0, halo: 0, cliff: 0, glint: 0,
               govK: 1,
              bgZoom: 0, bgParMax: 0, wall: 0, cast: 0, lid: 0, cone: 0, drift: 0,
             coneC: 0, holoC: 0,
             // flat = 这一帧的收平系数（转角把它从 1 收到 0）、bgParNow = 这一帧真挪了多少。
             // 留档的是**生效值**：「这一档有没有这条通道」与「此刻它生效了没有」是两个不同的问题，
             // 同一个读数答不了（docs/traps.md 里 bgPar 那条假绿就是这么来的）。
             flat: 1, bgParNow: 0 };
  var fxOverride = null;       // lab 拍对比图时的临时覆盖（api.setFx），产品路径上恒为 null

  function pickQuality() {
    if (qualityPicked) return;
    qualityPicked = true;
    // 没有可靠的「GPU 强弱」查询，所以只看两个粗信号，宁可保守：
    // 降级的代价只是极细的皱褶变少、新效果淡一些，而选错的代价是低端机上掉帧。
    var cores = navigator.hardwareConcurrency || 4;
    var smallViewport = Math.min(window.innerWidth, window.innerHeight) < 620;
    if (cores <= 4 || smallViewport) {
      GRID.nx = 40; GRID.ny = 56; GRID.corner = 10;
      POM_STEPS_MAX = 8;      // 编译期上限：低档机少走一半步数（档位阶梯再经 uSteps 夹一次）
      POM_STRENGTH = 0;
      // 弱设备直接从「第 1 档」起步（新效果打折、步数上限 20），而且**最多也只能回到第 1 档** ——
      // 不再另设一份 fxScale：两套系数会在同一台机器上叠乘，谁都说不清最后是多少。
      govBase = 1; govTier = 1;
    }
  }

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      return { shader: null, log: (gl.getShaderInfoLog(s) || '').trim() };
    }
    return { shader: s, log: '' };
  }

  function initGL(cv) {
    var gl = null;
    try {
      gl = cv.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false })
        || cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    } catch (e) { return { ok: false, why: 'no-context', log: String(e) }; }
    if (!gl) return { ok: false, why: 'no-context', log: '' };

    var src = shaderSource();
    var v = compile(gl, gl.VERTEX_SHADER, src.vert);
    var f = compile(gl, gl.FRAGMENT_SHADER, src.frag);
    if (!v.shader || !f.shader) {
      return { ok: false, why: 'shader', log: (v.log || '') + ' | ' + (f.log || '') };
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, v.shader); gl.attachShader(prog, f.shader);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      return { ok: false, why: 'link', log: (gl.getProgramInfoLog(prog) || '').trim() };
    }
    gl.useProgram(prog);

    var mesh = buildMesh();
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.verts), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.idx), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);          // 见文件头第 1 条：不靠绕序，靠深度测试
    gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    var aniso = gl.getExtension('EXT_texture_filter_anisotropic')
      || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    var U = {};
    // 这份名单必须与 draw() 里**实际设置过的** uniform 一字不差 —— 名字拼错时 getUniformLocation
    // 返回 null，而 gl.uniform1f(null, x) 只是静默无效（不报错、不崩，那个效果就是不会出现）。
    // 所以 check-deck.mjs 有一条守卫把这两边对起来核（名单里的都要被 set 过，set 过的都要在名单里）。
    ['uProj', 'uView', 'uModel', 'uDepth', 'uFace', 'uBack', 'uRelief', 'uPom', 'uFoil',
      'uFoilScale', 'uSpec', 'uTint', 'uEdge', 'uEye', 'uL1', 'uL2', 'uLp', 'uFoilAxis',
      'uEdgeMetal', 'uEdgeEmis', 'uEdgeDiff', 'uShadow', 'uSweepPos', 'uSweepK',
      'uTime', 'uSteps', 'uSparkle', 'uHolo', 'uHalo', 'uCliff', 'uGlint',
      'uBgZoom', 'uBgPar', 'uLid', 'uWall', 'uCast', 'uDrift', 'uCone',
      'uConeC', 'uHoloC',
      'uTexel', 'uDark', 'uDisp', 'uSharp', 'uFaceTexel'].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });

    return {
      ok: true, gl: gl, prog: prog, U: U, count: mesh.idx.length, dist: 3,
      aniso: aniso, maxAniso: aniso ? gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 0,
      pom: POM_STRENGTH
    };
  }

  function makeTex(source) {
    var gl = GL.gl;
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);   // 图的第一行 = v=0 = 卡面上边
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    // 各向异性过滤：卡片转到 70° 是极端的斜视，各向同性过滤会让卡面糊成一片，
    // 而弹层里的卖点恰恰是「转到侧面看」。探针里确认过软/硬渲染都有这个扩展。
    if (GL.aniso) gl.texParameterf(gl.TEXTURE_2D, GL.aniso.TEXTURE_MAX_ANISOTROPY_EXT, GL.maxAniso);
    return t;
  }

  function loadImage(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      // **弹层贴图插队**（2026-09-25，线上 512 kbit/s 实测）：收藏墙自己在慢网下要下
      // 0.9 MB（57 格 × 11~19 KB），那是十几秒的窗口；用户在窗口里点开一张，default
      // 优先级下它排在队尾 —— 同一档两次量到 1324 / 6735 ms，而让墙下完再点只要 263 ms
      // （= 16.6 KB 在 512 kbit/s 下的物理传输时间）。给 high 之后它跳到**还没发出**的
      // 墙图前面；墙自己的加载不受影响（不给墙降优先级：它是 LCP 候选）。
      if ('fetchPriority' in im) im.fetchPriority = 'high';
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('image load failed: ' + url)); };
      im.src = url;
    });
  }

  /* ============================================================
     6. 渲染
     ============================================================ */

  // 画布分辨率的**总像素上限**。开销的大头是逐片元成本（POM 最多 24 步 + 5 次自阴影采样），
  // 而台面 2026-09-21 从 430px 放大到 600px 之后面积是原来的 1.95 倍。所以除了把 dpr 夹到 2，
  // 再加这一条：超过就按比例降 dpr（600px 台面在 2x 屏上落到约 1.67x）。
  // 只夹 dpr 不夹面积是不行的 —— 那条线是按「小画布」定的，画布一大就失效了。
  var MAX_PIXELS = 2600 * 1000;

  function resize() {
    // 画布分辨率**跟着卡面纹理走**（2026-09-21）。卡面 xl 档是 1064px 高，而 CSS 台面高
    // 840px：在 2x 屏上「画满 2.0」等于把那张纹理再放大 1.58 倍 —— 这部分放大不带来任何
    // 信息，只把画面拉软，是「糊」最直接的来源（源头又只有 700px 高的素材，见 features.md ㊿）。
    // 这里按「纹理高 / CSS 高」再乘 1.25 作为 dpr 上限：纹理最多被上采样 1.25 倍。
    // 代价认下：卡框与几何边缘在 2x 屏上按 ~1.6x 画，比 2.0 略糙 —— 但主体是图，宁可图锐。
    var texDpr = texFaceH ? (texFaceH / Math.max(1, canvas.clientHeight)) * 1.1 : 2;
    var dpr = Math.min(window.devicePixelRatio || 1, 2, texDpr);
    var cw = Math.max(1, canvas.clientWidth), ch = Math.max(1, canvas.clientHeight);
    var cap = MAX_PIXELS * GOV[govTier].pix;
    if (cw * ch * dpr * dpr > cap) dpr = Math.max(1, Math.sqrt(cap / (cw * ch)));
    var w = Math.max(1, Math.round(cw * dpr));
    var h = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    var aspect = cw / ch;
    var fov = 30 * Math.PI / 180, tf = Math.tan(fov / 2);
    var need = Math.max(CARD_H / tf, CARD_W / (tf * aspect));
    // 呼吸系数 1.16 → 1.30（2026-09-24）：展示台要**卡下面有一块空**才放得下投影与台面
    // （brief 四.3「卡悬浮 + 投影」）。1.16 时卡占到台面高的 86%，上下只剩 6.9% 的余量，
    // 投影落进去就是贴着卡的一道黑边 —— 没有缝就没有「浮」。1.30 之后四周余量 11.5%，
    // 卡小了一档（600px 台面上 517 → 462px），但那反而正中另一件事：卡面 xl 档只有 760px，
    // 卡小了上采样倍数就小（2x 屏 1034 → 924px），**糊的主要来源就是这一步放大**（见 resize 开头）。
    // 侧面（45°）那张最坏情况也仍在框里：投影高度 85.8%（1.16 时是 97.5%，几乎顶边）。
    var dist = need * 0.5 * 1.30 / zoom;
    perspective(proj, fov, aspect, 0.1, dist * 4);
    identity(view);
    view[14] = -dist;
    GL.dist = dist;
  }

  function draw() {
    var gl = GL.gl, U = GL.U;
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    rotY(rot, yaw);
    rotX(rot2, pitch);
    multiply(model, rot, rot2);
    gl.uniformMatrix4fv(U.uProj, false, proj);
    gl.uniformMatrix4fv(U.uView, false, view);
    gl.uniformMatrix4fv(U.uModel, false, model);

    // 灯与相机在**视图空间**里固定（灯的相对朝向不随卡转），再转到模型空间：
    // 于是「卡片转动 → 卡面上的明暗与虹彩跟着走」，这正是它看起来是立体的原因。
    // 视图→模型 = (Ry·Rx)ᵀ = Rxᵀ·Ryᵀ：先绕 Y 反旋，再绕 X 反旋。
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    function toModel(vx, vy2, vz) {
      var x1 = vx * cy - vz * sy, z1 = vx * sy + vz * cy;
      return [x1, vy2 * cx + z1 * sx, -vy2 * sx + z1 * cx];
    }
    gl.uniform3fv(U.uEye, toModel(0, 0, GL.dist));
    gl.uniform3fv(U.uL1, toModel(-0.42, 0.62, 0.78));
    gl.uniform3fv(U.uL2, toModel(0.66, -0.36, 0.55));
    gl.uniform3fv(U.uFoilAxis, toModel(0.25, 0.5, 0.83));

    var S = (item && STYLE_3D[item.style]) || STYLE_3D[STYLE_FALLBACK];
    var R = selectRank();
    if (fxOverride) {                 // lab 拍对比图用的临时覆盖（见 api.setFx）：浅合并，不动原表
      var merged = {};
      for (var mk in R) if (Object.prototype.hasOwnProperty.call(R, mk)) merged[mk] = R[mk];
      for (var ok in fxOverride) if (Object.prototype.hasOwnProperty.call(fxOverride, ok)) merged[ok] = fxOverride[ok];
      R = merged;
    }
    gl.uniform1f(U.uRelief, RELIEF * S.relief * R.relief);
    gl.uniform1f(U.uPom, texDepth ? GL.pom : 0);
    gl.uniform1f(U.uFoil, S.foil);
    gl.uniform1f(U.uFoilScale, S.scale);
    gl.uniform1f(U.uSpec, S.spec);
    gl.uniform1f(U.uEdgeMetal, R.metal);
    gl.uniform1f(U.uEdgeEmis, R.emis);
    gl.uniform1f(U.uEdgeDiff, R.diff);
    gl.uniform1f(U.uShadow, R.shadow * (texDepth ? 1 : 0));

    // ---------- 立体通道（2026-09-21）----------
    // 全部过一遍当前档位的因子 G（弱设备与实测掉帧都走它，见 GOV）。两个夹取是必须的：
    //   uSteps  等级表可能给出比**编译期上限**更大的步数（弱设备上限是 8），夹住就不会白跑；
    //   uBgPar  位移不能超过放大余量，否则采样跑出画面外 —— 表里写超了也只挪到安全线。
    var bgZoom = R.bgZoom;
    var bgMax = R.bgPar;
    // 生效值留档（stats().fx 读它；见 fxEff 的声明）
    fxEff.relief = RELIEF * S.relief * R.relief;
    var G = GOV[govTier];
    fxEff.disp = R.disp * govFxk;
    fxEff.sharp = R.sharp * govFxk;
    fxEff.steps = Math.min(R.steps, G.stepsCap);
    fxEff.sparkle = R.sparkle * S.sparkle * govFxk;
    fxEff.holo = R.holo * govFxk;
    fxEff.halo = R.halo * govFxk;
    fxEff.cliff = R.cliff * govFxk;
    fxEff.bgZoom = bgZoom;
    // 「好像要脱离卡面」那四条 + 盖子。盖子单独一个系数：它**多一遍混合绘制**，
    // 弱设备上直接关掉（见 pickQuality），而不是偷偷降画质。
    fxEff.wall = R.wall * govFxk;
    fxEff.cast = R.cast * govFxk;
    fxEff.drift = R.drift * govFxk;
    fxEff.lid = R.lid  * G.lid;
    fxEff.cone = R.cone ;
    gl.uniform1f(U.uSteps, fxEff.steps);
    gl.uniform1f(U.uSparkle, fxEff.sparkle);
    gl.uniform1f(U.uHolo, fxEff.holo);
    gl.uniform1f(U.uHalo, fxEff.halo);
    gl.uniform1f(U.uCliff, fxEff.cliff);
    gl.uniform1f(U.uBgZoom, bgZoom);
    gl.uniform1f(U.uWall, fxEff.wall);
    gl.uniform1f(U.uCast, fxEff.cast);
    gl.uniform1f(U.uDrift, fxEff.drift);
    gl.uniform1f(U.uLid, fxEff.lid);
    gl.uniform1f(U.uCone, fxEff.cone);
    // 两个曲线场的权重：与其它通道一样，**进着色器的是生效值**（乘过调速器档位），
    // 这样 stats().fx 读到的就是真正生效的数
    fxEff.coneC = R.coneC * govFxk;
    fxEff.holoC = R.holoC * govFxk;
    gl.uniform1f(U.uConeC, fxEff.coneC);
    gl.uniform1f(U.uHoloC, fxEff.holoC);
    // 跟手高光只在**按住拖动**时给。这条正好卡在「鼠标划过卡片不会让它动」那条要求的边界上：
    // 光可以跟手，卡不能跟手。
    fxEff.glint = glintK * R.glint;  // 生效值：斜坡（frame 里推）× 档位表里的强度
    gl.uniform1f(U.uGlint, fxEff.glint);
    // 指针灯：把指针在台面里的位置换算成视图空间的一盏灯，再与两盏主灯一样转到模型空间。
    // 不拖时把它摆在视线方向上（N·H≈1），但那时 uGlint 是 0，所以不会有任何贡献。
    gl.uniform3fv(U.uLp, toModel(ptrX * 1.1, ptrY * 1.1, 0.8));
    // 卡内背景视差：位移量由**当前转角**给（不是速度），所以停稳时它自然回到 0；
    // 方向取负 —— 背景要读作「在卡面之后」，卡往一边转，背景往另一边挪。
    // 这里**自己折算角度、不调 wrapAngle()**：那个函数是就地改 yaw/baseYaw 的（无返回值），
    // 在 draw 里调它等于每帧改一次状态。（第一版就是 `wrapAngle(yaw-baseYaw)` 拿返回值，
    // 结果 dyaw 是 undefined、整条视差静默变成 NaN。）
    var dyaw = yaw - baseYaw;
    dyaw -= Math.round(dyaw / (Math.PI * 2)) * Math.PI * 2;
    // ---------- 收平（brief 四.4「转到侧面/背面自动收平 —— 保住实卡手感」）----------
    // 判据取的是**绝对朝向**（离正面多远），不是「离静止的那一面多远」：翻到背面停下时
    // 「离静止面」是 0，可那时卡背是另一张面，用户要的收平必须已经发生（而且翻面后转身
    // 再转回来的一路上也不该突然冒出卡内视差）。所以 |yaw| 折进 [0, π]：0 = 正面、π/2 = 侧面、
    // π = 背面，三个都在同一条斜坡上。
    // |朝向| 过 FLAT_NEAR 起把**卡内视差收掉**，到 FLAT_FAR 归零 ——
    // 侧面只剩一条边、背面是另一张面，那时还留着视差就是穿帮（实卡手感优先）。
    var fy = yaw;
    fy = Math.abs(fy - Math.round(fy / (Math.PI * 2)) * Math.PI * 2);
    var ft = (fy - FLAT_NEAR) / (FLAT_FAR - FLAT_NEAR);
    ft = ft < 0 ? 0 : (ft > 1 ? 1 : ft);
    var flat = 1 - ft * ft * (3 - 2 * ft);
    fxEff.flat = flat;
    var bx = dyaw / 0.6 * bgMax * flat;
    var by = -pitch / 0.6 * bgMax * flat;
    var bl = Math.sqrt(bx * bx + by * by);
    var lim = (0.5 - 0.5 / (1.0 + bgZoom)) * 0.9;    // 放大多少就只能挪多少
    if (bl > lim && bl > 0) { bx *= lim / bl; by *= lim / bl; }
    // 留档的是**这一档能给到的最大位移**（不是这一帧的位移）：后者静止时必然是 0，
    // 拿它当读数会让「背景视差到底有没有生效」这件事永远读成没有（第一版就这么假绿过）。
    fxEff.bgParMax = Math.min(bgMax, lim);
    fxEff.bgParNow = bl;                             // 这一帧真挪了多少（收平/静止时它才会是 0）
    gl.uniform2f(U.uBgPar, bx, by);
    gl.uniform1f(U.uTime, fxTime);
    // 亮带的强度与位置都由**当前角速度**决定：转得快就亮、停下就淡掉。
    // vy/vp 是「每帧的弧度」，这里只用来驱动视觉，不参与物理。
    var vel = Math.abs(vy) + Math.abs(vp);
    sweepK += (Math.min(0.9, vel * 9.0) * R.sweep - sweepK) * 0.25;
    if (sweepK > 0.004) {
      sweepPos += (0.055 + vel * 0.9) * Math.sign(vy || 1);
      if (sweepPos > 1.75) sweepPos = -0.45;
      if (sweepPos < -0.45) sweepPos = 1.75;
    }
    gl.uniform1f(U.uSweepPos, sweepPos);
    gl.uniform1f(U.uSweepK, sweepK);
    gl.uniform3fv(U.uTint, S.tint);
    gl.uniform3fv(U.uEdge, S.edge);
    gl.uniform1f(U.uDark, document.documentElement.getAttribute('data-theme') === 'dark' ? 1 : 0);
    gl.uniform2f(U.uTexel, texDepth ? 1 / texDepth.w : 1 / 600, texDepth ? 1 / texDepth.h : 1 / 840);
    gl.uniform2f(U.uFaceTexel, texFaceW ? 1 / texFaceW : 1 / 760,
                 texFaceH ? 1 / texFaceH : 1 / 1064);
    gl.uniform1f(U.uDisp, fxEff.disp);
    gl.uniform1f(U.uSharp, fxEff.sharp);

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texFace); gl.uniform1i(U.uFace, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texDepth ? texDepth.tex : null); gl.uniform1i(U.uDepth, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texBack); gl.uniform1i(U.uBack, 2);

    // 盖子**不是单独一遍绘制**（见片元里那段注释）：它是卡面片元里的一次 mix，
    // 所以这里只有一次 drawElements 一如从前。
    gl.drawElements(gl.TRIANGLES, GL.count, gl.UNSIGNED_SHORT, 0);
    frames++;
    syncStand();          // 展示台：卡片下面的那条投影（DOM，跟着转角走）
    var now = performance.now();
    // 观察面（lab/工具/shots.py 读它断言「转到位了」）。降频写 DOM 属性：每帧写会触发样式重算。
    if (now - lastStats > 120) {
      lastStats = now;
      canvas.setAttribute('data-yaw', yaw.toFixed(3));
      canvas.setAttribute('data-pitch', pitch.toFixed(3));
      canvas.setAttribute('data-frame', String(frames));
    }
  }

  // ---------- 展示台：投影（2026-09-24，brief 四.3「卡悬浮 + 背景压暗 + 投影 + 景深」）----------
  // 卡片**悬浮**在台面上方，投影落在它下面：一条软椭圆。它由三个量驱动，全部来自当前转角 ——
  //   · 宽度：卡片转到侧面时投影收成一条窄影（|cos| 越小越窄），正面/背面最宽；
  //   · 位移：卡片往哪边转开，投影往**反方向**让一点（与卡内背景视差同一个方向口径）；
  //   · 浓淡：正面最浓、侧面最淡（面积小了、总光通量不变的话会更暗，所以这里按面积反着给）。
  // 为什么是 DOM 而不是 GL 里的一遍绘制：一遍额外的全屏混合填充实测 6.1 → 8.3 ms
  // （docs/traps.md「多一整遍全屏填充的代价」），而这张影子只需要一个合成层的 transform。
  // 为什么每帧写 style 不违反「降频写 DOM」那条：那条针对的是 `data-*` 属性（写它只带来样式重算、
  // 换不来合成层收益）；这里只动 transform/opacity 两个**合成层属性**，代价是一个元素的属性更新。
  function syncStand() {
    if (!standEl) return;
    var ac = Math.abs(Math.cos(yaw));
    var w = STAND_SHADOW_K + (1 - STAND_SHADOW_K) * ac;
    var x = -Math.sin(yaw) * STAND_X_K;
    var y = Math.abs(pitch) * 1.2;                    // 俯仰时影子跟着往下让一点
    var op = (0.38 + 0.50 * ac) * (1 - 0.25 * Math.abs(Math.sin(pitch)));   // 2026-09-25：判读说「核心太淡、支撑感不足」→ 正面 .80→.88、侧面 .34→.38
    standEl.style.transform = 'translate(' + x.toFixed(2) + '%,' + y.toFixed(2) +
                              '%) scaleX(' + w.toFixed(3) + ')';
    standEl.style.opacity = op.toFixed(3);
  }

  function buildStand() {
    if (!host || standEl) return;
    standEl = document.createElement('div');
    standEl.className = 'home-deck-stage-shadow';
    standEl.setAttribute('aria-hidden', 'true');
    // **插在画布之前**：两个都是绝对定位、z 序由文档序决定，影子必须在卡下面（卡是画在画布上的）。
    if (canvas && canvas.parentNode === host) host.insertBefore(standEl, canvas);
    else host.appendChild(standEl);
    // 「台面」这个类由脚本加：它把台面底压暗、四周加一圈暗角（背景压暗），
    // 而回退到平面大图的那条路没有它 —— 那时没有悬浮与投影，不该跟着变暗。
    host.classList.add('is-stand');
    syncStand();
  }

  // 奇迹在显形前**借用收藏的参数**，所以「正面看起来与收藏一样」不是靠 CSS 藏的，
  // 而是这里根本不给它华丽的那一套。显形之后才切到 miracle。
  function rankOf() {
    var r = (item && item.rank) || 'collector';
    if (r === 'miracle' && !revealed) return 'collector';
    return r;
  }
  function selectRank() { return RANK_3D[rankOf()] || RANK_3D.collector; }

  // 「现在停在正面还是背面」这件事有**两个**来源：拖拽松手（settleTarget）与翻面按钮（flip）。
  // 第一版只在 settleTarget 里记账，于是按翻面按钮转到背面时「停留」的计时从来没启动 ——
  // 断言直接测出来了。抽成一个函数，两条路都走它。
  // 另外计时**必须用 setTimeout**，不能写在 update() 里：卡停稳后动画循环就停了，
  // update() 不再被调用，那个检查也就永远不会执行。
  function noteFace(back) {
    // 只在**面真的变了**的那一次广播：收藏库靠它记「翻过卡背」那半个进度
    // （见 home-deck.js 的 markSeen 那段）。老浏览器没有 CustomEvent 构造器，忽略即可。
    if (back !== faceWasBack) {
      faceWasBack = back;
      try {
        document.dispatchEvent(new CustomEvent('deck:face', { detail: { back: !!back } }));
      } catch (e) { /* 墙上少一点进度，其它照旧 */ }
    }
    if (back) {
      backSince = backSince || performance.now();
      if (!revealTimer) {
        revealTimer = window.setTimeout(function () {
          revealTimer = 0;
          maybeReveal('在背面停留');
        }, REVEAL_DWELL_MS);
      }
    } else {
      backSince = 0;
      if (revealTimer) { window.clearTimeout(revealTimer); revealTimer = 0; }
    }
  }

  function maybeReveal(why) {
    if (!item || item.rank !== 'miracle' || revealed) return;
    revealed = true;
    backKey = '';
    rebuildBack();
    if (deckEl) deckEl.classList.add('is-rank-revealed');
    console.info('[card3d] 奇迹显形（' + why + '）');
    // 显形只发生在这个闭包里，外面拿不到它 —— 而收藏库的卡片墙要把那一格的名字行
    // 从「收藏」改成「奇迹」（见 deck-wall.js 的 deck:reveal 监听）。所以广播一次，
    // 谁在听谁更新；没人听也什么都不坏。
    try {
      document.dispatchEvent(new CustomEvent('deck:reveal', {
        detail: { label: item.label || '', series: item.series || '', rank: item.rank || '' }
      }));
    } catch (e) { /* 没有 CustomEvent 构造器的老浏览器：墙上那行字不更新，其它照旧 */ }
    kick();
  }

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // 把 yaw 折算到 (-π, π]。**必须折算**：拖拽会让 yaw 一直累加（甩两圈就是 12 弧度），
  // 而「现在看的是哪一面」的判据是 |yaw| > π/2 —— 不折算时 2π（等价于 0 = 正面）会被判成背面，
  // 表现为翻面按钮的文字与 aria-pressed 反着来。实测就是这么发现的（afterFlip.yaw = 6.283）。
  function wrapAngle() {
    var k = Math.round(yaw / (Math.PI * 2));
    if (k) { yaw -= k * Math.PI * 2; baseYaw -= k * Math.PI * 2; }
  }
  function faceOf(y) {
    var t = y - Math.round(y / (Math.PI * 2)) * Math.PI * 2;
    return Math.abs(t) > Math.PI / 2 ? 'back' : 'front';
  }

  // 回弹到**最近的一面**：拖过一半就去背面，不到一半转回正面。停下时总是正对看客，
  // 不会卡在 37° 这种斜角度上（真卡拿在手里翻也是这个结果）。
  function settleTarget() {
    wrapAngle();
    baseYaw = Math.round(yaw / Math.PI) * Math.PI;
    var back = faceOf(baseYaw) === 'back';
    if (deckEl) deckEl.setAttribute('data-face', back ? 'back' : 'front');
    noteFace(back);
    if (turned >= REVEAL_TURN) maybeReveal('转满一圈');
  }

  /* 弹簧与惯性的积分。**必须分子步**：显式欧拉里阻尼项是 vy*C*dt，而 dt 会被慢帧撑到 0.05s，
     此时 C*dt = 26×0.05 = 1.3 > 1 —— 速度每步翻号且放大，卡片会自己转飞到 -85 弧度。
     实测就是这么炸的（lab/结果/deck3d/assert.js 里 afterFlip.yaw 一度是 -85.697）。
     子步长取 4ms：C*h = 0.104，稳。最多 24 个子步，够覆盖一帧 96ms。 */
  function integrate(dt) {
    var steps = Math.min(24, Math.max(1, Math.ceil(dt / 0.004)));
    var h = dt / steps;
    for (var s = 0; s < steps; s++) {
      if (inertia) {
        yaw += vy * h * 60;
        pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch + vp * h * 60));
        var k = Math.pow(INERTIA_DECAY, h * 60);
        vy *= k; vp *= k;
        if (Math.abs(vy) <= INERTIA_STOP && Math.abs(vp) <= INERTIA_STOP) {
          vy = 0; vp = 0;
          inertia = false;
          settleTarget();          // 惯性走完才决定停在哪个面 —— 甩的过程中就定目标会和惯性打架
        }
        continue;
      }
      var dy = baseYaw - yaw, dp = -pitch;
      vy += (dy * SPRING_K - vy * SPRING_C) * h;
      vp += (dp * SPRING_K - vp * SPRING_C) * h;
      yaw += vy * h; pitch += vp * h;
    }
  }

  // 时间相位的推进与「余韵」的计时都靠这两个小工具：
  // noteInput() 记下最后一次交互（触摸/拖动/键盘/翻面/换卡），update() 用它判断余韵是否走完。
  function noteInput() { lastInput = performance.now(); }

  function update(dt) {
    if (Math.abs(zoomTo - zoom) > 0.0008) {
      zoom += (zoomTo - zoom) * Math.min(1, dt * 8);
      if (Math.abs(zoomTo - zoom) <= 0.0008) zoom = zoomTo;
      return true;
    }
    if (!pinned && backSince && performance.now() - backSince > REVEAL_DWELL_MS) maybeReveal('在背面停留');
    if (pinned) return false;
    if (dragging) return true;
    if (inertia) { integrate(dt); return true; }
    if (Math.abs(baseYaw - yaw) < 0.0008 && Math.abs(pitch) < 0.0008
        && Math.abs(vy) < 0.0015 && Math.abs(vp) < 0.0015) {
      yaw = baseYaw; pitch = 0; vy = 0; vp = 0;
      // 卡已经停稳了，但**时间驱动的效果还有一段余韵**（星屑闪、彩虹流光）：距离最后一次交互
      // 不满 FX_TAIL_MS 就继续跑循环，让那点星光流完再停。
      // 原来这里是「静止立即停」（验收读数「空闲 900ms 内 0 帧」），2026-09-21 与用户确认后
      // 放宽成 2.5 秒余韵，读数相应改成「松开 3s 后 0 帧」——**这条改动只影响余韵，不影响
      // 「没人动时不烧 GPU」那条铁律**（余韵最多 2.5 秒，之后一定停）。
      if (performance.now() - lastInput < FX_TAIL_MS) return true;
      return false;                  // ← 这一条就是「静止就停掉动画循环」
    }
    integrate(dt);
    return true;
  }

  // 一帧的原始间隔（**不夹取**）：物理用夹取过的那份，调速器必须看真实值。
  var lastFrameRaw = 0;
  function govern(t) {
    if (!lastFrameRaw) { lastFrameRaw = t; return; }
    var ms = t - lastFrameRaw;
    lastFrameRaw = t;
    if (ms > 100) { govSamples.length = 0; govWarm = GOV_WARM; return; }   // 切标签/暂停回来的巨缝
    if (govWarm > 0) { govWarm--; return; }
    govSamples.push(ms);
    if (govSamples.length < GOV_WIN) return;
    var sorted = govSamples.slice().sort(function (a, b) { return a - b; });
    var p10 = sorted[Math.floor(sorted.length * 0.10)];
    govP75 = sorted[Math.floor(sorted.length * 0.75)];
    govRefresh = Math.min(govRefresh === 16.7 ? p10 : Math.min(govRefresh, p10 + 0.5), 16.7);
    var budget = govRefresh * 1.25;
    govSamples.length = 0;
    if (govP75 > budget) {
      govOver++; govUnder = 0;
      if (govOver >= 2 && govTier < 2) setTier(govTier + 1, govP75, budget);
    } else if (govP75 < govRefresh * 0.85) {
      govUnder++; govOver = 0;
      // 回不去超过**设备档位上限**（弱设备最多升回 1，不会因为某几帧宽裕就跳到全开）
      if (govUnder >= 4 && govTier > govBase) setTier(govTier - 1, govP75, budget);
    } else { govOver = 0; govUnder = 0; }
  }
  function setTier(next, p75, budget) {
    var dir = next > govTier ? '降' : '升';
    govTier = next; govOver = 0; govUnder = 0;
    console.info('[card3d] 画质' + dir + '到第 ' + next + ' 档（实测 p75 ' + p75.toFixed(1) +
      'ms / 预算 ' + budget.toFixed(1) + 'ms，刷新率约 ' + Math.round(1000 / govRefresh) + 'Hz）');
    resize();                        // 画布总像素上限跟着档位走
    kick();
  }
  function frame(t) {
    raf = 0;
    if (!open || !GL) return;
    govern(t);
    var dt = Math.min(0.05, Math.max(0.001, (t - lastFrame) / 1000));
    lastFrame = t;
    // 时间相位只在**循环活着**的时候走（而且 reduced-motion 下冻结）：新效果里那两条时间驱动的
    // 因此退化成静态的，静止的卡不会自己亮起来，也没有「一直在闪」的动效。
    if (!reduced()) fxTime += dt;
    // 调速器档位的斜坡（2026-09-25）：档位是**离散跳变**，它乘在所有立体通道上
    // （sparkle/holo/halo/cliff/...），一跳就是整卡级的变化 —— 这才是真正会「闪」的那种跳。
    // 档位本身照旧离散判（见 GOV），只是把**生效权重**做成 0.22 s 的渐近。
    var gTarget = GOV[govTier].fx;
    govFxk += (gTarget - govFxk) * Math.min(1, dt / 0.22);
    if (Math.abs(gTarget - govFxk) < 0.002) govFxk = gTarget;
    // 跟手高光的斜坡（0.2 s 上、0.25 s 下）。**这里不能读 R**：R 是 draw() 里的局部
    // （`var R = selectRank()`），在 frame() 里它是未定义标识符 —— 而且 `&&` 短路让它
    // 「没拖的时候」一直不报错，第一帧真拖动才 ReferenceError，把整个循环静默带走
    // （2026-09-25 量到 frames 停在 467、drag 还是 1、之后全静止）。所以这里只推进
    // 0..1 的权重，乘不乘 R.glint 交给 draw()。
    var glintWant = (dragging && dragMoved) ? 1 : 0;
    glintK += (glintWant - glintK) * Math.min(1, dt / 0.14);
    if (glintK < 0.002 && !glintWant) glintK = 0;
    var more = update(dt);
    draw();
    // **静止就停**：没有这一条，弹层开着（哪怕没人碰）就一直占着一个 GPU 帧循环。
    if (more) kick();
  }
  function kick() {
    if (!raf && open && GL) { lastFrame = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function halt() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  /* ============================================================
     7. 交互
     ============================================================ */

  // 指针在**台面里的位置** → 视图空间坐标（-1~1，y 向上）。只用于「跟手高光」那一条：
  // 它是一个**光源位置**，不是倾角 —— 卡本身仍然只认按住拖动（文件头第 7 条）。
  function setPtr(e) {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    ptrX = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptrY = 1 - ((e.clientY - r.top) / r.height) * 2;
  }

  function bindPointer() {
    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true; pinned = false; inertia = false;
      vy = 0; vp = 0;
      dragMoved = false; pressX = e.clientX; pressY = e.clientY;
      setPtr(e);
      lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
      noteInput();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 某些环境不支持 */ }
      canvas.classList.add('is-dragging');
      e.preventDefault();
      kick();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (dragging) {
        var now = performance.now();
        var dx = e.clientX - lastX, dy = e.clientY - lastY;
        var dtms = Math.max(8, now - lastT);
        if (!dragMoved && Math.abs(e.clientX - pressX) + Math.abs(e.clientY - pressY) > GLINT_MIN_PX) dragMoved = true;
        setPtr(e);
        yaw += dx * YAW_GAIN;
        pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch + dy * PITCH_GAIN));
        // 速度折算成「每帧(16.7ms)的位移」，供松手后的惯性使用
        vy = dx * YAW_GAIN * (16.7 / dtms) * 0.85;
        vp = dy * PITCH_GAIN * (16.7 / dtms) * 0.85;
        turned += Math.abs(dx * YAW_GAIN);
        lastX = e.clientX; lastY = e.clientY; lastT = now;
        noteInput();
        kick();
        return;
      }
    });
    function release(e) {
      if (!dragging) return;
      dragging = false;
      canvas.classList.remove('is-dragging');
      noteInput();
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* 已释放 */ }
      // 松手速度先限幅（见 INERTIA_MAX 的注释），再决定「滑一段」还是「直接吸附」
      vy = Math.max(-INERTIA_MAX, Math.min(INERTIA_MAX, vy));
      vp = Math.max(-INERTIA_MAX, Math.min(INERTIA_MAX, vp));
      if (reduced() || (Math.abs(vy) <= INERTIA_STOP && Math.abs(vp) <= INERTIA_STOP)) {
        vy = 0; vp = 0; inertia = false;
        settleTarget();
        if (reduced()) { yaw = baseYaw; pitch = 0; }   // 减少动态：不做回弹动画，直接就位
      } else {
        inertia = true;                                // 滑完再定目标（见 integrate 里的注释）
      }
      kick();
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    // 触屏：拖动即转动，所以弹层里**不能**再靠左右滑换卡（那是首页 2D 卡组的手势）。
    // 换卡走 ‹ › 按钮 —— 手机上它们是更大的目标，也更难误触。
    canvas.addEventListener('touchmove', function (e) { if (dragging) e.preventDefault(); }, { passive: false });
    canvas.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { api.flip(); e.preventDefault(); kick(); return; }
      var step = e.shiftKey ? 0.35 : 0.12, moved = true;
      if (e.key === 'ArrowLeft') yaw -= step;
      else if (e.key === 'ArrowRight') yaw += step;
      else if (e.key === 'ArrowUp') pitch = Math.max(-PITCH_MAX, pitch - step);
      else if (e.key === 'ArrowDown') pitch = Math.min(PITCH_MAX, pitch + step);
      else moved = false;
      if (!moved) return;
      e.preventDefault();
      // 键盘转动是离散的：不走惯性，直接落到最近的一面并让弹簧收尾
      vy = 0; vp = 0; inertia = false;
      settleTarget();
      noteInput();
      kick();
    });
  }

  /* ============================================================
     8. 对外接口
     ============================================================ */

  function fail(why, log) {
    var msg = why === 'no-context' ? '这台设备/浏览器没有可用的 WebGL' : '着色器未能编译或链接';
    console.error('[card3d] ' + msg + '，卡片回退为平面大图', log || '');
    if (deckEl) deckEl.setAttribute('data-gl', 'error');
    if (host) host.classList.add('is-gl-failed');
  }

  var api = {
    supported: false,
    attach: function (el, deck) {
      host = el; deckEl = deck || null;
      if (!glAvailable()) { fail('no-context'); return false; }
      pickQuality();                       // 必须在 initGL 之前：它决定网格密度与 POM 步数
      canvas = document.createElement('canvas');
      canvas.className = 'home-deck-canvas';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('tabindex', '0');
      el.appendChild(canvas);
      var r = initGL(canvas);
      if (!r.ok) { el.removeChild(canvas); canvas = null; fail(r.why, r.log); return false; }
      GL = r;
      bindPointer();
      buildStand();                    // 展示台：投影 + 台面压暗（只在 3D 可用时）
      window.addEventListener('resize', function () { if (open) { resize(); kick(); } });
      // 主题切换要重画卡背：它的颜色全部来自 CSS 变量（--cardback-*），明暗两套值不同。
      // 用 MutationObserver 盯 <html data-theme>（PaperMod 的机制），不监听点击 —— 主题也可能
      // 由「跟随系统」自己变。
      if (window.MutationObserver) {
        new MutationObserver(function () { api.setTheme(); })
          .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      }
      if (deckEl) deckEl.setAttribute('data-gl', 'ok');
      api.supported = true;
      return true;
    },
    setItem: function (next) {
      item = next;
      itemDone = (next && next.done) || null;
      itemProgress = (next && next.progress) || null;   // 换完贴图叫一声（对比 / 开包那两条路要等它）
      revealed = false; backSince = 0; backKey = '';
      govWarm = GOV_WARM; govSamples.length = 0; lastFrameRaw = 0;   // 新贴图的尖峰不算渲染成本
      api.reset();
      if (!GL) { fireItemDone(); return; }
      var jobs = [];
      // 面贴图优先用 **xl 那一档（760px）**：台面 2026-09-21 放大到 600px 之后，卡面要占到
      // 517px 宽、2x 屏上就是 1034 个物理像素，而 544px 那档是给页内 272px 的卡用的 ——
      // 拿它撑 600px 台面会被放大到近两倍，糊得看得见。xl 只在这条路上加载（不生进 srcset），
      // 所以收藏库那一页的访客不会因此多下一个字节，只有真打开弹层的人下这一张。
      //
      // **低清先上**（2026-09-22 晚）：`l`/`s` 就是这张卡在页内显示的那张，多半已经在缓存里，
      // 上传它几乎不耗时。先换它，切换的一刻画面立刻换人，不必等 760 那一档下完才动 ——
      // 这是「切换流畅」的真正来源；预取只是让它更快。xl 到了再换一次，观感是「先变过来、再变锐」。
      // `faceSeq` 防「低清后到、把后来居上的 xl 盖回去」，也防上一张的 xl 落在这一张上。
      var seq = ++faceSeq;
      // `next.low` 是页内那张真正下过的档（首页 l/s、收藏库 412）—— 不猜档，见 home-deck.js 的 lowTierOf
      var low = next.low || next.l || next.s;
      if (low && next.xl && low !== next.xl) {
        jobs.push(loadImage(low).then(function (im) {
          if (seq !== faceSeq) return;
          if (texFace) GL.gl.deleteTexture(texFace);
          texFace = makeTex(im);
          texFaceW = im.naturalWidth; texFaceH = im.naturalHeight;
          faceSwaps++;
          kick();
        }).catch(function () { /* 低清失败无所谓：xl 那条路还在 */ }));
      }
      jobs.push(loadImage(next.xl || next.l || next.s).then(function (im) {
        if (seq !== faceSeq) return;
        if (texFace) GL.gl.deleteTexture(texFace);
        texFace = makeTex(im);
        texFaceW = im.naturalWidth; texFaceH = im.naturalHeight;
        faceSwaps++;
      }).catch(function (err) {
        console.error('[card3d] 卡面图读取失败：' + (err && err.message));
      }));
      /* 深度图（= 这一张的「模型」）整块单独处理，两条纪律：
         ① **换卡的一刻先清掉**：上一张的深度留在场上，新卡就会顶着前一张的浮雕渲染 ——
            用户看到的是「前一张卡的模型留在下一张卡上」（2026-09-25 报的）。清掉之后新图到达
            之前这张渲染成平的，观感是「先平面、再浮雕」，比叠着上一张好太多。
         ② **补 `seq` 守卫**：面贴图那两条早就有了（见上），深度这条路一直漏着 —— 快速翻页时
            上一张的深度图后到，就会把这一张的浮雕换掉，而且**看不出是错的**（卡面是对的）。
         另外 `texDepthFor` 记下归属，`stats()` 会报出来给探针断言（不然只能靠肉眼）。 */
      if (texDepth && texDepth.tex) GL.gl.deleteTexture(texDepth.tex);
      texDepth = null; texDepthFor = '';
      /* `d === null` = **调用方明确说「这一张不要深度图」**（预热那条路：它只借这张卡
         编着色器、传第一张贴图，深度图留给真打开那次，见 home-deck.js 的 warmViewer）。
         与「清单里查不到深度图」必须分开 —— 否则首页与收藏库每访问一次就报一次假告警，
         真缺图那次混在噪声里反而看不见了。`''` / undefined 仍是真缺。 */
      if (next.d === null) {
        /* 故意的，什么都不做 */
      } else if (next.d) {
        jobs.push(loadImage(next.d).then(function (im) {
          if (seq !== faceSeq) return;
          texDepth = { tex: makeTex(im), w: im.naturalWidth, h: im.naturalHeight };
          texDepthFor = next.d;
        }).catch(function (err) {
          // 深度图取不到：这一张就没有浮雕。不报错的话会被当成「这张卡本来就平的」。
          console.warn('[card3d] 深度图读取失败，这张卡没有浮雕：' + (err && err.message));
          if (seq === faceSeq) { texDepth = null; texDepthFor = ''; }
        }));
      } else {
        console.warn('[card3d] 这张卡缺深度图（跑 tools/cards/make-depth.py）——它会渲染成平的');
      }
      /* 进度：每个任务自己的 `.catch` 已经吞了失败，所以它们**都会** resolve —— 把每条
         链尾接一个计数即可（失败也算「这一格走完了」，否则那格永远不落地，条会卡住）。 */
      var totalN = jobs.length, doneN = 0;
      jobs = jobs.map(function (pr) {
        return pr.then(function () { doneN++; fireItemProgress(doneN, totalN, seq); });
      });
      fireItemProgress(0, totalN, seq);      // 先报 0：条上先有动静，别等第一个任务落地
      Promise.all(jobs).then(function () { rebuildBack(); kick(); fireItemDone(); });
    },
    setOpen: function (isOpen) {
      open = !!isOpen;
      if (open) {
        baseYaw = Math.round(yaw / Math.PI) * Math.PI;
        yaw = baseYaw; pitch = 0; vy = 0; vp = 0; pinned = false; inertia = false;
        noteInput();                       // 打开的一刻算一次交互，余韵从这时开始算
        resize(); kick();
      } else {
        halt(); dragging = false; pinned = false; inertia = false;
      }
    },
    setTheme: function () { backKey = ''; rebuildBack(); kick(); },
    reset: function () {
      yaw = 0; pitch = 0; vy = 0; vp = 0; baseYaw = 0; pinned = false; inertia = false;
      turned = 0; backSince = 0;
      inspect = false; zoomTo = 1; zoom = 1; faceWasBack = false;
      if (revealTimer) { window.clearTimeout(revealTimer); revealTimer = 0; }
      if (deckEl) deckEl.classList.remove('is-rank-revealed');
      if (deckEl) deckEl.setAttribute('data-face', 'front');
      kick();
    },
    flip: function () {
      wrapAngle();                        // 先折算，目标就只需要 0 或 π 两个值
      var wantBack = !(Math.abs(yaw) > Math.PI / 2);
      // 这里**不能**调 settleTarget()：它按当前 yaw 取最近的面，会把刚定好的目标又覆盖掉
      // （那样子就永远翻不过去）。折算过之后 0 与 π 都在同一个圈内，弹簧走的是最短路径。
      baseYaw = wantBack ? Math.PI : 0;
      vy = 0; vp = 0; inertia = false; pinned = false;
      if (deckEl) deckEl.setAttribute('data-face', faceOf(baseYaw));
      noteFace(wantBack);          // 翻面按钮到背面也算「停在背面」，停留判据同样生效
      noteInput();
      kick();
      return wantBack;
    },
    isBack: function () { return faceOf(baseYaw) === 'back'; },
    // 给 lab/工具/shots.py 的读数：断言「转到位了 / 画面非空 / 空闲时真的停了 / 各档效果真的不同」
    stats: function () {
      return {
        supported: api.supported, running: !!raf, frames: frames, faceSwaps: faceSwaps,
        yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), base: +baseYaw.toFixed(3),
        face: faceOf(baseYaw),
        pom: GL ? GL.pom : 0, relief: !!texDepth, depthFor: texDepthFor, pinned: pinned,
        disp: fxEff.disp, sharp: fxEff.sharp, facePx: texFaceW,
        rank: (item && item.rank) || '', rankEff: rankOf(), revealed: revealed, turned: +turned.toFixed(2),
        canvas: canvas ? canvas.width + 'x' + canvas.height : '',
        // 调速器的状态（lab 断言读它：限速/超大台面下档位必须升、正常时不许误判）
        q: { tier: govTier, baseTier: govBase, p75: +govP75.toFixed(2),
             refreshMs: +govRefresh.toFixed(2), budget: +(govRefresh * 1.25).toFixed(2) },
        // 立体通道的**生效值**（不是表里的值：已过 fxScale、已夹进编译期上限），由 draw() 现填 ——
        // 断言「六档单调递增」「奇迹显形前 = 收藏」读的就是它。写成读数而不是让 lab 自己算，
        // 是因为「表里的值」与「真正送进着色器的值」中间还夹着打折与上限两道，读表会假绿。
        fx: {
          relief: +fxEff.relief.toFixed(4), steps: fxEff.steps,
          sparkle: +fxEff.sparkle.toFixed(4), holo: +fxEff.holo.toFixed(4),
          halo: +fxEff.halo.toFixed(4), cliff: +fxEff.cliff.toFixed(4),
          glint: +fxEff.glint.toFixed(4),
          // 时间通道的包络与**过完包络的值**：探针断言「进/出不跳」读它（lab/工具/flicker2.py）
          // 档位斜坡的生效权重（探针断言「换档不跳」读它，lab/工具/flicker2.py）
          govK: +govFxk.toFixed(4), drag: dragging ? 1 : 0, inertia: inertia ? 1 : 0,
          bgZoom: +fxEff.bgZoom.toFixed(4), bgParMax: +fxEff.bgParMax.toFixed(4),
          wall: +fxEff.wall.toFixed(4), cast: +fxEff.cast.toFixed(4),
          lid: +fxEff.lid.toFixed(4), cone: +fxEff.cone.toFixed(4), drift: +fxEff.drift.toFixed(4),
          coneC: +fxEff.coneC.toFixed(4), holoC: +fxEff.holoC.toFixed(4),
          // 收平：flat 是这一帧的收平系数、bgParNow 是这一帧真挪了多少。
          flat: +fxEff.flat.toFixed(3), bgParNow: +fxEff.bgParNow.toFixed(4)
        }
      };
    },
    // 把当前这一档的立体通道**临时**改掉（**只给 lab 拍对比图用**，与 setAngle 同一个来源）。
    // 为什么需要它：高度、切边、星屑这些数值只有摆在一起比才定得下来，而它们全在 RANK_3D 里
    // （闭包内、外面改不到）。浅合并：只覆盖传进来的那几项，其余仍按档位表走；传 null 恢复。
    setFx: function (over) {
      fxOverride = over || null;
      if (pinned && canvas && canvas.clientWidth) { resize(); draw(); } else kick();
    },
    // 把调速器**钉在指定档位**（**只给 lab 量「降档到底省不省成本」用**；产品路径上不调用）。
    // 不把它暴露成 RANK_3D 的一个通道，是因为档位不是设计参数、是运行期反馈的结果。
    setGovTier: function (n) {
      govTier = Math.max(0, Math.min(GOV.length - 1, n | 0));
      govOver = 0; govUnder = 0;
      resize();
      if (pinned && canvas && canvas.clientWidth) { resize(); draw(); } else kick();
      return govTier;
    },
    /* 「看工艺」近观开关（2026-09-25）。进 = 转到固定斜角 + 拉近机位；退 = 回正面 + 原机位。
        **只在正面有意义**：卡背没有材料可看，所以从背面按进来会先转到正面（面状态同步给
       data-face，按钮那边的文字由 home-deck.js 自己按 isBack() 同步）。 */
    setInspect: function (on) {
      inspect = !!on;
      if (!GL) return false;
      pinned = false; inertia = false; dragging = false;
      vy = 0; vp = 0;
      baseYaw = inspect ? INSPECT_YAW : 0;
      zoomTo = inspect ? INSPECT_ZOOM : 1;
      backSince = 0;
      if (deckEl) deckEl.setAttribute('data-face', 'front');
      noteInput();
      kick();
      return inspect;
    },
    isInspect: function () { return inspect; },
    /* 现画一帧、同一任务里把画布读成 dataURL（**给「存图」与「对比」用**）。
       为什么必须现画：WebGL 的绘图缓冲在同一帧之外读是空的 —— lab 那边踩过一次
       （见 lab/README.md 里 readPixels 那条坑），所以这里 resize 完立刻 draw、再立刻 toDataURL，
       中间不回到事件循环。取不到（没 GL / 画布被污染）时返回空串，调用方自己兜。 */
    snapshot: function () {
      if (!GL || !canvas || !canvas.width) return '';
      resize();
      draw();
      try { return canvas.toDataURL('image/png'); } catch (e) { return ''; }
    },
    // 把卡钉在指定角度（lab 拍照用；pin=true 时不起弹簧，不会被拉回正面）。
    // pin 时**同步画一帧**而不是排进 rAF：lab 里紧接着就要把画布 drawImage 到合成图上，
    // 而 WebGL 的绘图缓冲在同一帧之外读是空的（见 lab/README.md 里那条 readPixels 的坑）。
    setAngle: function (y, p, pin) {
      yaw = y; pitch = p || 0; vy = 0; vp = 0; dragging = false; inertia = false;
      baseYaw = pin ? y : Math.round(y / Math.PI) * Math.PI;
      pinned = !!pin;
      if (deckEl) deckEl.setAttribute('data-face', faceOf(y));
      if (pinned && canvas && canvas.clientWidth) { resize(); draw(); } else kick();
    },
    /* 读一帧的像素摘要（**给 lab 断言用**，不进产品流程）。
       两个数字是关键：
         coverage —— α>128 的像素占比。卡片写的是不透明，台面/画布背景是 α=0（clear 色），
                     所以这就是「这一帧里卡占了多少」。**它比「截图看起来不是黑的」可靠得多**：
                     转到 90° 时卡只剩一条边（约 2%），那是对的，不是空帧；而空的帧是 0。
         meanLum  —— 平均亮度，用来发现「整片过曝/全黑」那类问题。
       必须在画完**同一个任务里**读：默认 preserveDrawingBuffer 为 false，跨帧读恒为全黑。 */
    sample: function () {
      if (!GL || !canvas || !canvas.clientWidth) return null;
      resize(); draw();
      var gl = GL.gl, w = canvas.width, h = canvas.height;
      var px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      var cover = 0, sum = 0, n = 0, min = 255, max = 0, uniq = {};
      for (var i = 0; i < px.length; i += 4 * 37) {
        if (px[i + 3] > 128) {
          cover++;
          var lum = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
          sum += lum; n++;
          if (lum < min) min = lum;
          if (lum > max) max = lum;
          uniq[(px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4)] = 1;
        }
      }
      var total = Math.ceil(px.length / (4 * 37));
      return {
        coverage: +(cover / total).toFixed(4),
        meanLum: n ? Math.round(sum / n) : 0,
        minLum: n ? Math.round(min) : 0,
        maxLum: Math.round(max),
        distinct: Object.keys(uniq).length
      };
    }
  };

  function rebuildBack() {
    if (!GL || !item) return;
    var C = readVars();
    var key = [item.label, item.series, item.creditText, item.rank, revealed, C.bg1, C.fg, C.accent].join('|');
    if (key === backKey && texBack) return;
    backKey = key;
    if (!backCanvas) {
      backCanvas = document.createElement('canvas');
      backCanvas.width = BW; backCanvas.height = BH;
    }
    function paint() {
      if (backKey !== key) return;
      drawBack(backCanvas, item, C);
      if (texBack) GL.gl.deleteTexture(texBack);
      texBack = makeTex(backCanvas);
    }
    paint();
    // 字体没就绪时画出来的名字会掉回默认字体（中文尤其明显）：能等就再画一次
    if (document.fonts && document.fonts.ready && !document.fonts.__card3dReady) {
      document.fonts.ready.then(function () { document.fonts.__card3dReady = true; paint(); kick(); });
    }
  }

  window.card3d = api;
})();
