// 「体检」面板的检查项表与输出解析。
//
// 唯一目标：把仓库里那批校验脚本原样跑一遍，把结果整理成「哪个文件、哪一行、什么问题」，
// 让人在界面里一眼看到、点一下就能跳到编辑器。**规则不在本文件里复刻**——只调用脚本、
// 解析它们的输出，所以脚本改了规则（新增检查、调整提示文案），这里自动跟上。
//
// 调用口径必须与 scripts/push-blog.sh 一致：顺序、阻断项、以及「哪些检查要先构建」
// （links / katex-pairing / size 读的是 public/，没跑构建就量的是陈旧产物）。
// 谁跟谁不一致，本地全绿而 CI 炸就是必然的。
import { run } from './exec.mjs';
import { resolveBash } from './exec.mjs';
import { resolvePython } from './exec.mjs';

// needsBuild：必须在「站点构建」之后跑（依赖 public/）
// blocking：失败是否阻断发布（与 push-blog.sh 的阻断项一致，只影响界面上的措辞与颜色）
const ITEMS = [
  {
    id: 'consistency',
    label: '校验清单一致性',
    runtime: 'node',
    argv: ['scripts/check-consistency.mjs'],
    fast: true,
    blocking: true,
    hint: 'CI / push-blog / 本面板三处的校验清单、阻断口径、时区、front matter 键表是否已分叉',
  },
  {
    id: 'sections',
    label: '分区结构',
    runtime: 'bash',
    argv: ['scripts/check-sections.sh'],
    fast: true,
    blocking: true,
    hint: '每个分区目录都要有 _index.md，缺了它列表页连同导航入口一起 404',
  },
  {
    id: 'cards',
    label: '卡片页与数据一致性',
    runtime: 'node',
    // cs 是当前唯一用 gen-cards 生成卡片页的库；加了别的库要在这里补一项
    argv: ['scripts/gen-cards.mjs', 'cs', '--check'],
    fast: true,
    blocking: true,
    hint: '改了 data/cs-toolbox.json 却忘记重生成卡片页时，正文还是旧的，而构建不会报错',
  },
  {
    id: 'wiki',
    label: '知识库同步',
    runtime: 'python',
    // 只比对不写盘：与「发布」页签的按钮同一口径，写盘由那个按钮负责
    argv: ['tools/wiki-publish/publish.py', '--check'],
    fast: true,
    // **有意只警告、也刻意不进 action.yml 与 push-blog.sh。**
    // 知识库在 D:\Study\projects\wiki\statml-wiki —— 仓库外的本地绝对路径，CI 的机器上不存在，
    // 这个检查在那边必然报「知识库不存在」。所以它只能是本地检查，而且它拦的也不是
    // 「博客有问题」，只是「有卡片还没发布」，不该阻断发布。
    // 副作用：check-consistency.mjs 的解析规则只认 `bash|node scripts/...`，看不到这一项
    // （它有 EXPECTED_MIN 下限断言保证不会静默通过，所以这里被跳过是安全且已知的）。
    blocking: false,
    hint: '知识库里「已验证」的卡片有没有还没发布到数学库 / CS 库；顺带校验 _meta/分类.yaml 与 data/*-branches.yaml 三处分类表一致。仅本地可跑（CI 上没有知识库）',
  },
  {
    id: 'escapes',
    label: '公式转义',
    runtime: 'node',
    // 不带 --fix：体检面板只报告，写盘由管理页的保存/新建与 push-blog.sh 负责
    argv: ['scripts/fix-math-escapes.mjs'],
    fast: true,
    blocking: true,
    hint: '数学区里的 `\\*`、`§`、圈号 ①②③ —— 会让 KaTeX 报错、整站构建中止',
  },
  {
    id: 'frontmatter',
    label: 'Front matter',
    runtime: 'bash',
    argv: ['scripts/check-frontmatter.sh'],
    fast: true,
    blocking: true,
    hint: '必填键、键名拼写、在 section 页误写 tags 之类的「构建能过但页面是坏的」',
  },
  {
    id: 'math',
    label: '公式内容预检',
    runtime: 'node',
    argv: ['scripts/check-math-syntax.mjs'],
    fast: true,
    blocking: true,
    hint: '数学区里嵌 $、双重转义 —— 会让 KaTeX 直接中止整站构建',
  },
  {
    id: 'tags',
    label: '标签词表',
    runtime: 'bash',
    argv: ['scripts/check-tags.sh'],
    fast: true,
    blocking: false,
    hint: '词表外的标签与大小写漂移；只提醒，不阻断',
  },
  {
    id: 'schema',
    label: '编辑器字段表',
    runtime: 'node',
    argv: ['scripts/check-editor-schema.mjs'],
    fast: true,
    blocking: false,
    hint: 'archetypes 加了字段而管理页没跟上（CLI 与界面会建出不同的内容）',
  },
  {
    id: 'katex',
    label: '公式真检',
    runtime: 'node',
    argv: ['scripts/check-math-katex.mjs'],
    fast: false,
    blocking: true,
    hint: '把每个数学区逐条交给 Hugo 内嵌的 KaTeX 试渲染，覆盖全部语法错误',
  },
  {
    id: 'build',
    label: '站点构建',
    runtime: 'hugo',
    argv: ['--minify', '--gc', '--cleanDestinationDir'],
    fast: false,
    blocking: true,
    hint: 'hugo --minify --gc --cleanDestinationDir，失败会中止发布',
  },
  {
    id: 'pairing',
    label: 'KaTeX 配对',
    runtime: 'bash',
    argv: ['scripts/check-katex-pairing.sh'],
    fast: false,
    blocking: true,
    needsBuild: true,
    hint: '公式样式版本与构建产物是否配对',
  },
  {
    id: 'links',
    label: '站内链接',
    runtime: 'node',
    argv: ['scripts/check-links.mjs'],
    fast: false,
    blocking: true,
    needsBuild: true,
    hint: '扫 public/ 里的 href，查站内目标与锚点是否存在',
  },
  {
    id: 'size',
    label: '体积预算',
    runtime: 'bash',
    argv: ['scripts/report-size.sh'],
    fast: false,
    blocking: true,
    needsBuild: true,
    hint: '单页体积上限；超标时打全表（含最重页面 Top 10）',
  },
];

// 体检面板能跑的检查项。full=true 才带上慢项（真检 / 构建 / 依赖产物的三项）。
export function checkItems({ full = false, only = null } = {}) {
  let list = full ? ITEMS : ITEMS.filter((i) => i.fast);
  if (Array.isArray(only) && only.length) list = ITEMS.filter((i) => only.includes(i.id));
  return list.map((i) => ({ id: i.id, label: i.label, blocking: i.blocking, needsBuild: Boolean(i.needsBuild), fast: Boolean(i.fast), hint: i.hint }));
}

// 输出行 → 结构。不依赖脚本内部格式，只做两件事：
//   ① 行首的 ✗ / ⚠ / ! 决定严重级别（脚本的约定，见各脚本的 fail()/warn()）
//   ② 行内出现的 content/... 路径与紧随的 :行:列 决定「这条问题属于哪个文件、哪一行」
// 解析不出路径的行归到「整体」，仍然原样显示——宁可显示得啰嗦，也不能把提示吞掉。
const PATH_RE = /((?:content|archetypes|data|scripts)\/[^\s"'`：:，,、()（）[\]<>]+?\.(?:md|ya?ml|toml|json|sh|mjs))/;
const LINE_RE = /:(\d+)(?::(\d+))?/;

export function parseOutput(text) {
  const issues = [];
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.trim() === '') continue;
    const trimmed = line.replace(/^\s+/, '');
    let level = 'info';
    if (/^✗/.test(trimmed)) level = 'error';
    else if (/^(⚠|!)/.test(trimmed)) level = 'warn';

    const norm = line.replace(/\\/g, '/');
    const pm = PATH_RE.exec(norm);
    let path = null;
    let lineNo = null;
    if (pm) {
      path = pm[1];
      const rest = norm.slice(pm.index + pm[1].length);
      const lm = LINE_RE.exec(rest);
      if (lm) lineNo = Number(lm[1]);
    }
    issues.push({ level, path, line: lineNo, text: trimmed });
  }
  return issues;
}

// 脚本收尾那行「✓ … / ✗ …」是结论，用它做摘要；没匹配到就退回整段的第一行非空内容。
function summarize(exitCode, issues, stdout) {
  const tail = [...issues].reverse().find((i) => /^[✓·]/.test(i.text) || /^✗/.test(i.text));
  if (tail) return tail.text;
  const first = issues[0]?.text ?? '';
  return first || (exitCode === 0 ? '通过' : `退出码 ${exitCode}`);
}

// 服务端流式体检按 id 逐项跑；id 不合法直接报错，别静默跳过（跳过等于谎报通过）。
export async function runCheckById(repoRoot, id, opts) {
  const item = ITEMS.find((i) => i.id === id);
  if (!item) throw Object.assign(new Error(`未知的检查项：${id}`), { status: 400 });
  return runCheckItem(repoRoot, item, opts);
}

// 跑一个检查项。超时、找不到可执行文件都不抛异常：体检面板要能显示「这项没跑起来」，
// 而不是整个面板挂掉。
export async function runCheckItem(repoRoot, item, { timeoutMs = 600000 } = {}) {
  const started = Date.now();
  let cmd = item.runtime;
  let args = item.argv;
  if (item.runtime === 'python') {
    // Python 不是本仓库的默认运行时（管理页是零依赖 Node），所以走 resolvePython：
    // 它顺便确认 PyYAML 在，缺的时候给一句人话，而不是把 traceback 甩到界面上。
    try {
      cmd = await resolvePython();
    } catch (err) {
      return {
        id: item.id,
        label: item.label,
        ok: false,
        error: err.message,
        ms: 0,
        exitCode: null,
        stdout: '',
        stderr: '',
        issues: [{ level: 'error', path: null, line: null, text: `✗ ${err.message}` }],
        summary: 'Python 不可用，这项没跑',
        blocking: item.blocking,
      };
    }
  }
  if (item.runtime === 'bash') {
    try {
      cmd = await resolveBash();
    } catch (err) {
      return {
        id: item.id,
        label: item.label,
        ok: false,
        error: err.message,
        ms: 0,
        exitCode: null,
        stdout: '',
        stderr: '',
        issues: [{ level: 'error', path: null, line: null, text: `✗ ${err.message}` }],
        summary: 'bash 不可用，这项没跑',
        blocking: item.blocking,
      };
    }
    args = item.argv;
  }
  let result;
  try {
    result = await run(cmd, args, { cwd: repoRoot, timeoutMs });
  } catch (err) {
    return {
      id: item.id,
      label: item.label,
      ok: false,
      error: err.message,
      ms: Date.now() - started,
      exitCode: null,
      stdout: '',
      stderr: '',
      issues: [{ level: 'error', path: null, line: null, text: `✗ ${err.message}` }],
      summary: err.message,
      blocking: item.blocking,
    };
  }
  const combined = [result.stdout, result.stderr].filter(Boolean).join('\n');
  const issues = parseOutput(combined);
  // hugo 构建成功时只吐一行统计，没有 ✓；所以判定以退出码为准，输出只用来显示。
  const ok = result.code === 0 && !result.timedOut;
  return {
    id: item.id,
    label: item.label,
    ok,
    ms: Date.now() - started,
    exitCode: result.code,
    timedOut: result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
    issues,
    // 只提醒不阻断的项失败时，措辞要区分，免得看着像「不能发布」
    summary: summarize(result.code, issues, result.stdout),
    blocking: item.blocking,
  };
}
