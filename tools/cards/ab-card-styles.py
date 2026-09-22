# -*- coding: utf-8 -*-
"""卡面工艺参数化的像素 A/B：两份（或三份）**静态产物**逐张卡比对。

为什么是两份产物而不是注入 CSS：要证明的是「把手写块搬进生成文件之后，瀑布流里的计算值没变」，
所以两侧都得是真实构建产物（含 hugo 的 minify 与文件合并顺序），只在 http 端口上不同。

用法（仓库根）：
  python tools/cards/ab-card-styles.py --a http://127.0.0.1:8795/ --b http://127.0.0.1:8796/ --out <目录>
  复核噪声底：加 --control（把 A 再拍一遍，A↔A' 的差就是这套测量的本底）
  灵敏度自证：把 B 换成一个**故意改过一处**的产物（见 docs/exp-craft.md 的对照臂），必须报出非零差

产物：
  <out>/<臂>/<主题>/tile-<下标>-<工艺>-<等级>.png   每张卡的卡面（设备像素 = 2× CSS 像素）
  <out>/<臂>/<主题>/tiles.json                     该主题下每格的矩形（页面坐标）、贴图统计、CLIP 模式
  <out>/<臂>/<主题>/probe.json                     这一臂这一主题**实际加载**的那份 CSS 的 sha256/长度
                                                   与 silk/nacre 的**计算值**（不是像素，是计算值）
  <out>/report.json                                逐格 diff（max/mean/>2 的像素数）与几何漂移
  <out>/summary.txt                                人读的结论行

臂名 = <标签>-<端口>（a-8795 / a2-8795 / b-8796）——**不能拿 URL 当目录名**：Windows 目录名里
不许有冒号（WinError 123），而 http://127.0.0.1:8795/ 里正好有一个。

三条硬纪律（第一版全部踩过，见 docs/exp-craft.md 的「测量上的坑」）：
  1. **滚到位再拍**：页面是 `scroll-behavior: smooth` 的，`window.scrollTo(0,y)` 会动画滚动，
     0.1s 后量到的矩形还在半路上 —— 截出来是一片黑。这里改成 `behavior:"instant"` 并在拍之前
     核一次「这张卡确实在视口里」，不在就重试。
  2. **坐标口径要标定**：CDP 的 clip 到底是页面坐标还是视口坐标，实测说了算 —— 每个主题第一次
     先两种都拍一张，取**非空白**的那种（结果记进 tiles.json 的 clip_mode）。
  3. **每张图都要自检非空白**：黑图/纯色图的 diff 恒为 0，会把「什么都没测到」报成「完全一致」。
     std < 2 的一律记成 blank，并在汇总里点名。

环境：python 需要 websockets / pillow / numpy（本机 Hermes venv 的 python 有，见 docs/exp-craft.md）。
"""
import argparse
import asyncio
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import numpy as np
import websockets
from PIL import Image

BS = chr(92)
EDGE_CANDIDATES = [
    BS.join(['C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe']),
    BS.join(['C:', 'Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe']),
]
PORT = 9336
GL_ARGS = {
    'swiftshader': ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
    'gpu': ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11'],
}

JS_TILES = (
    'JSON.stringify([].map.call(document.querySelectorAll("#deck-wall-grid .deck-tile"), function(tile, i){'
    'var card = tile.querySelector(".home-card");'
    'if (!card) return {i: i, style: "?", rank: "?"};'
    'var r = card.getBoundingClientRect();'
    'var cls = String(card.className).split(" ");'
    'var st = "", rk = "";'
    'for (var k = 0; k < cls.length; k++) {'
    'if (cls[k].indexOf("home-card-rank--") === 0) rk = cls[k].slice(16);'
    'else if (cls[k].indexOf("home-card--") === 0) st = cls[k].slice(11); }'
    'return {i: i, style: st, rank: rk, w: r.width, h: r.height, top: r.top, left: r.left}; }))'
)

# 只针对**一张**卡：滚到它（instant）、回报视口矩形与滚动量。r.top 用来核「在不在视口里」。
JS_ONE_RECT = (
    'JSON.stringify((function(){'
    'var t=document.querySelectorAll("#deck-wall-grid .deck-tile")[%d];'
    'if(!t) return null; var c=t.querySelector(".home-card"); if(!c) return null;'
    'var r=c.getBoundingClientRect();'
    'return {x:r.x, y:r.y, w:r.width, h:r.height, top:r.top, bottom:r.bottom, sx:window.scrollX, sy:window.scrollY};})())'
)

JS_SCROLL_TO = (
    '(function(){'
    'document.documentElement.style.scrollBehavior="auto";'
    'var t=document.querySelectorAll("#deck-wall-grid .deck-tile")[%d];'
    'if(!t) return -1;'
    'var r=t.getBoundingClientRect();'
    'var y=Math.round(window.scrollY+r.top-140);'
    'window.scrollTo({top: Math.max(0,y), behavior:"instant"});'
    'return Math.round(window.scrollY);})()'
)

JS_SETTLE = (
    '(function(){document.documentElement.style.scrollBehavior="auto";'
    'var s=document.getElementById("deck-splash");if(s&&s.parentNode)s.parentNode.removeChild(s);'
    'var b=document.body;if(b)b.classList.add("is-done");'
    'return document.readyState;})()'
)

JS_IMAGES_DONE = (
    'JSON.stringify({ready: document.readyState, theme: document.documentElement.dataset.theme || "",'
    'pending: [].filter.call(document.images, function(im){return !im.complete;}).length})'
)

JS_OPEN_DIALOG = '(function(){ return !!(window.homeDeck && window.homeDeck.openAt(%d)); })()'
JS_CANVAS_RECT = (
    'JSON.stringify((function(){var c=document.querySelector(".home-deck-dialog canvas");'
    'if(!c) return null;var r=c.getBoundingClientRect();'
    'return {x: r.x, y: r.y, w: r.width, h: r.height};})())'
)

# 「这一页真正用了哪一份 CSS + 它算出来的工艺值是多少」—— 只认计算值，不看像素。
# 有它才排除「B 臂其实加载的是 A 的缓存」这一整类怀疑；计算值相同也说明生成块真的赢了基类。
JS_PROBE = (
    'JSON.stringify((function(){'
    'var out={sheets:[], craft:{}};'
    'for (var i=0;i<document.styleSheets.length;i++){var s=document.styleSheets[i];'
    'if (s.href && s.href.indexOf("stylesheet")>=0) out.sheets.push(s.href);}'
    'var pairs=[["silk",".deck-tile .home-card--silk"],["nacre",".deck-tile .home-card--nacre"]'
    ',["silver",".deck-tile .home-card--silver"],["gold",".deck-tile .home-card--gold"]];'
    'for (var k=0;k<pairs.length;k++){var el=document.querySelector(pairs[k][1]); if(!el) continue;'
    'var cs=getComputedStyle(el);'
    'out.craft[pairs[k][0]]={op: cs.getPropertyValue("--coverlay-op").trim(),'
    ' blend: cs.getPropertyValue("--cblend").trim(),'
    ' line: cs.getPropertyValue("--fret-line").trim(),'
    ' finish: cs.getPropertyValue("--cframe-finish").trim().slice(0,60),'
    ' plate: cs.getPropertyValue("--cplate-solid").trim(),'
    ' layers: cs.getPropertyValue("--coverlay").trim().split("),").length};}'
    'return out;})())'
)



def port_of(url):
    head = url.split('//')[-1].split('/')[0]
    return head.split(':')[-1] if ':' in head else ''


def arm_name(label, url):
    """臂名 → 目录名。**不能拿 URL 当目录名**：Windows 的目录名里不许有冒号
    （WinError 123），而 http://127.0.0.1:8795/ 里正好有一个。所以臂名 = 标签 + 端口。"""
    p = port_of(url)
    return (label + '-' + p) if p else label


def find_edge():
    for p in EDGE_CANDIDATES:
        if os.path.exists(p):
            return p
    raise SystemExit('找不到 msedge.exe')


def start_edge(profile, gl='swiftshader'):
    shutil.rmtree(profile, ignore_errors=True)
    os.makedirs(profile, exist_ok=True)
    proc = subprocess.Popen(
        [find_edge(), '--headless=new', '--remote-debugging-port=%d' % PORT,
         '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
         '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1',
         *GL_ARGS[gl], 'about:blank'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=0x00000008)
    for _ in range(60):
        try:
            with urllib.request.urlopen('http://127.0.0.1:%d/json/version' % PORT, timeout=2) as r:
                json.load(r)
            return proc
        except Exception:
            time.sleep(0.5)
    proc.kill()
    raise SystemExit('Edge CDP 未就绪')


def pick_target():
    with urllib.request.urlopen('http://127.0.0.1:%d/json' % PORT, timeout=10) as r:
        pages = [t for t in json.load(r) if t.get('type') == 'page']
    if pages:
        return pages[0]
    req = urllib.request.Request('http://127.0.0.1:%d/json/new?about:blank' % PORT, method='PUT')
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


async def send(ws, counter, method, **params):
    counter[0] += 1
    mid = counter[0]
    await ws.send(json.dumps({'id': mid, 'method': method, 'params': params}))
    while True:
        msg = json.loads(await ws.recv())
        if msg.get('id') == mid:
            if 'error' in msg:
                raise RuntimeError(method + ': ' + str(msg['error']))
            return msg.get('result', {})


async def ev(ws, counter, expr, await_promise=False):
    r = await send(ws, counter, 'Runtime.evaluate', expression=expr, returnByValue=True,
                   awaitPromise=await_promise)
    if 'exceptionDetails' in r:
        raise RuntimeError('JS 抛错: ' + json.dumps(r['exceptionDetails'])[:300])
    return r.get('result', {}).get('value')


async def wait_ready(ws, counter, timeout=25.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = await ev(ws, counter, JS_IMAGES_DONE)
        if v:
            d = json.loads(v) if isinstance(v, str) else v
            if d.get('ready') == 'complete' and d.get('pending') == 0:
                return d
        await asyncio.sleep(0.25)
    return {}


async def shoot(ws, counter, path, clip, beyond=False):
    r = await send(ws, counter, 'Page.captureScreenshot', format='png', clip=clip,
                   fromSurface=True, captureBeyondViewport=beyond)
    with open(path, 'wb') as f:
        f.write(base64.b64decode(r['data']))


def blank_stats(path):
    a = np.asarray(Image.open(path).convert('RGB'))
    return {'w': int(a.shape[1]), 'h': int(a.shape[0]),
            'std': float(round(float(a.std()), 3)), 'mean': float(round(float(a.mean()), 2))}


def clip_of(rect, mode):
    """mode: viewport（clip 在视口坐标里）| page（clip 在页面坐标里）"""
    if mode == 'page':
        x, y = rect['x'] + rect['sx'], rect['y'] + rect['sy']
    else:
        x, y = rect['x'], rect['y']
    return {'x': x, 'y': y, 'width': rect['w'], 'height': rect['h'], 'scale': 1}


async def settle_tile(ws, counter, idx, tries=4):
    """滚到这张卡并确认它真的在视口里（smooth 滚动会让「滚完就量」量到半路上）"""
    for _ in range(tries):
        await ev(ws, counter, JS_SCROLL_TO % idx)
        await asyncio.sleep(0.18)
        r = json.loads(await ev(ws, counter, JS_ONE_RECT % idx) or 'null')
        if r and r['top'] > 0 and r['bottom'] < 900:
            return r
    return r


async def capture_pass(ws, counter, url, arm, theme, out, limit=0):
    d = os.path.join(out, arm, theme)
    os.makedirs(d, exist_ok=True)
    await send(ws, counter, 'Page.navigate', url=url + 'collection/')
    await wait_ready(ws, counter)
    await ev(ws, counter, 'localStorage.setItem("pref-theme","' + theme + '")')
    await send(ws, counter, 'Page.navigate', url=url + 'collection/')
    info = await wait_ready(ws, counter)
    await ev(ws, counter, JS_SETTLE)
    probe = json.loads(await ev(ws, counter, JS_PROBE) or '{}')
    css = {}
    if probe.get('sheets'):
        # 页面里 link[rel=stylesheet] 的 href 就是**这一臂实际请求的那份 CSS**；
        # 再从外面 fetch 一次算 sha256 —— 两臂的 sha256 不同才谈得上「A/B 是两份产物」。
        href = probe['sheets'][0]
        try:
            with urllib.request.urlopen(href, timeout=15) as r:
                body = r.read()
            css = {'href': href, 'len': len(body), 'sha256': hashlib.sha256(body).hexdigest()}
        except Exception as e:
            css = {'href': href, 'error': str(e)}
    # 先把整页滚一遍让 lazy 图开始下，再回顶部等解码
    await ev(ws, counter, 'window.scrollTo({top: document.body.scrollHeight, behavior:"instant"})')
    await asyncio.sleep(0.8)
    await ev(ws, counter, 'window.scrollTo({top: 0, behavior:"instant"})')
    await wait_ready(ws, counter)
    await ev(ws, counter, JS_SETTLE)
    tiles = json.loads(await ev(ws, counter, JS_TILES))
    if limit:
        tiles = tiles[:limit]          # 冒烟用：先拍前 N 张，确认标定/非空白再跑全量
    print('  ' + arm + ' ' + theme + ': ' + str(len(tiles)) + ' 格  CSS=' + (css.get('sha256') or '?')[:12], flush=True)

    mode = None
    for t in tiles:
        rect = await settle_tile(ws, counter, t['i'])
        if not rect or rect['w'] <= 0:
            t['rect'] = None
            continue
        t['rect'] = rect
        name = 'tile-%02d-%s-%s.png' % (t['i'], t['style'], t['rank'])
        path = os.path.join(d, name)
        if mode is None:
            # 标定：两种坐标口径各拍一张，取非空白的那种（结果写进 tiles.json 与 report）
            await shoot(ws, counter, path, clip_of(rect, 'viewport'))
            s_view = blank_stats(path)
            tmp = path + '.page.png'
            await shoot(ws, counter, tmp, clip_of(rect, 'page'), beyond=True)
            s_page = blank_stats(tmp)
            mode = 'page' if (s_page['std'] > 2 and s_page['std'] > s_view['std']) else 'viewport'
            if os.path.exists(tmp):
                os.remove(tmp)
            print('    CLIP 标定: viewport std=%s / page std=%s → 用 %s' %
                  (s_view['std'], s_page['std'], mode), flush=True)
        await shoot(ws, counter, path, clip_of(rect, mode), beyond=(mode == 'page'))
        t['png'] = name
        t['stats'] = blank_stats(path)
        t['blank'] = t['stats']['std'] < 2.0
        if t['i'] % 20 == 0:
            print('    %d/%d %s std=%s' % (t['i'], len(tiles), name, t['stats']['std']), flush=True)
    with open(os.path.join(d, 'tiles.json'), 'w', encoding='utf-8') as f:
        json.dump({'theme_after': info.get('theme', ''), 'clip_mode': mode, 'tiles': tiles}, f,
                  ensure_ascii=False, indent=1)
    with open(os.path.join(d, 'probe.json'), 'w', encoding='utf-8') as f:
        json.dump({'css': css, 'computed': probe, 'clip_mode': mode}, f, ensure_ascii=False, indent=1)
    return {'css': css, 'computed': probe, 'clip_mode': mode}


async def capture_dialog(ws, counter, url, arm, index, out, tag):
    d = os.path.join(out, arm, 'dialog')
    os.makedirs(d, exist_ok=True)
    await send(ws, counter, 'Page.navigate', url=url + 'collection/')
    await wait_ready(ws, counter)
    await ev(ws, counter, JS_SETTLE)
    await asyncio.sleep(0.4)
    ok = await ev(ws, counter, JS_OPEN_DIALOG % index)
    if not ok:
        return None
    await asyncio.sleep(3.2)          # 弹层入场 + 3D 台面把首帧画完（渲染循环空闲后停）
    rect = json.loads(await ev(ws, counter, JS_CANVAS_RECT) or 'null')
    if not rect or rect['w'] <= 0:
        return None
    path = os.path.join(d, 'dialog-%d-%s.png' % (index, tag))
    await shoot(ws, counter, path, {'x': rect['x'], 'y': rect['y'], 'width': rect['w'],
                                    'height': rect['h'], 'scale': 1})
    return {'rect': rect, 'stats': blank_stats(path)}


def localize(pa, pb, out_path):
    """把差异定位到具体位置：差分图（放大 8 倍另存）+ 差异像素的包围盒 + 「边框圈 / 画面内」占比。
    一张图说清「差在哪」——梯度/印纹在画面内均匀地差，与「边缘一圈差」是完全不同的两件事。"""
    a = np.asarray(Image.open(pa).convert('RGB')).astype(np.int16)
    b = np.asarray(Image.open(pb).convert('RGB')).astype(np.int16)
    if a.shape != b.shape:
        return None
    d = np.abs(a - b).max(axis=2)
    ys, xs = np.nonzero(d > 2)
    info = {'gt2': int(len(ys))}
    if len(ys) == 0:
        return info
    h, w = d.shape
    info['bbox'] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    ring = int(min(h, w) * 0.12)
    edge = ((ys < ring) | (ys >= h - ring) | (xs < ring) | (xs >= w - ring)).sum()
    info['on_edge_ring'] = int(edge)
    info['inside'] = int(len(ys) - edge)
    amp = np.clip(d * 8, 0, 255).astype(np.uint8)
    Image.fromarray(amp).save(out_path)
    return info


def diff_pair(pa, pb):
    """同尺寸才直接相减。**尺寸不一致时不做「直接减」**：那会把两张不同构图的图错位相减，
    出来的差别与工艺无关。这里改成如实标注 misaligned，并另给一个「取共同左上区域」的参考值。"""
    a = np.asarray(Image.open(pa).convert('RGB')).astype(np.int16)
    b = np.asarray(Image.open(pb).convert('RGB')).astype(np.int16)
    if a.shape != b.shape:
        h = min(a.shape[0], b.shape[0])
        w = min(a.shape[1], b.shape[1])
        da = np.abs(a[:h, :w] - b[:h, :w])
        return {'misaligned': True, 'shape_a': list(a.shape), 'shape_b': list(b.shape),
                'max': None, 'common_max': int(da.max()), 'common_gt2': int((da.max(axis=2) > 2).sum()),
                'common_px': int(h * w)}
    d = np.abs(a - b)
    return {
        'misaligned': False,
        'max': int(d.max()),
        'mean': float(round(float(d.mean()), 6)),
        'gt2': int((d.max(axis=2) > 2).sum()),
        'gt0': int((d.max(axis=2) > 0).sum()),
        'px': int(d.shape[0] * d.shape[1]),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--a', required=True)
    ap.add_argument('--b', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--themes', default='dark,light')
    ap.add_argument('--gl', default='swiftshader', choices=['swiftshader', 'gpu'])
    ap.add_argument('--control', action='store_true', help='把 A 再拍一遍（噪声底）')
    ap.add_argument('--dialog', default='', help='要额外拍 3D 弹层的卡下标（逗号分隔；空 = 不拍）')
    ap.add_argument('--limit', type=int, default=0, help='只拍前 N 张（冒烟用；0 = 全量）')
    args = ap.parse_args()

    out = args.out
    os.makedirs(out, exist_ok=True)
    themes = [t for t in args.themes.split(',') if t]
    profile = os.path.join(os.environ.get('TMPDIR', '.'), 'edge-ab-craft')
    proc = start_edge(profile, args.gl)
    result = {'a': args.a, 'b': args.b, 'gl': args.gl, 'themes': themes, 'tiles': [], 'dialog': [],
              'passes': []}
    arms = [('a', args.a, arm_name('a', args.a))]
    if args.control:
        arms.append(('a2', args.a, arm_name('a2', args.a)))
    arms.append(('b', args.b, arm_name('b', args.b)))
    base_arm = arms[0][2]
    result['arms'] = [{'label': l, 'url': u, 'dir': d} for l, u, d in arms]
    try:
        target = pick_target()

        async def run():
            counter = [0]
            async with websockets.connect(target['webSocketDebuggerUrl'], max_size=None,
                                          ping_interval=None) as ws:
                await send(ws, counter, 'Page.enable')
                await send(ws, counter, 'Runtime.enable')
                await send(ws, counter, 'Network.enable')
                # 两臂在同一个浏览器里跑：不关缓存的话 B 有可能直接吃 A 的同名资源
                await send(ws, counter, 'Network.setCacheDisabled', cacheDisabled=True)
                await send(ws, counter, 'Emulation.setDeviceMetricsOverride', width=1680, height=900,
                           deviceScaleFactor=2, mobile=False)
                idxs = [int(x) for x in args.dialog.split(',') if x.strip()]
                for theme in themes:
                    for label, url, arm in arms:
                        # 对照臂（同一臂连截两次）在**每个主题**都要拍：判读差异时那条判据是
                        # 「AB 差 ≤ AA 差 ⇒ 与重复性同量级」，只在 dark 拍就不够用了。
                        p = await capture_pass(ws, counter, url, arm, theme, out, args.limit)
                        result['passes'].append({'arm': arm, 'theme': theme, 'css': p['css'],
                                                 'computed': p['computed'], 'clip_mode': p['clip_mode']})
                for i in idxs:
                    for label, url, arm in arms:
                        r = await capture_dialog(ws, counter, url, arm, i, out, label)
                        result['dialog'].append({'index': i, 'side': label, 'rect': r})
        asyncio.run(run())
    finally:
        proc.kill()

    # ---- 比对 ----
    lines = []
    for theme in themes:
        base_dir = os.path.join(out, base_arm, theme)
        with open(os.path.join(base_dir, 'tiles.json'), encoding='utf-8') as f:
            base = json.load(f)
        for t in base['tiles']:
            if not t.get('png'):
                continue
            row = {'theme': theme, 'i': t['i'], 'style': t['style'], 'rank': t['rank'],
                   'rect_a': t.get('rect'), 'std_a': t.get('stats', {}).get('std')}
            for label, url, arm in arms:
                if label == 'a':
                    continue
                pj = os.path.join(out, arm, theme, 'tiles.json')
                if os.path.exists(pj):
                    with open(pj, encoding='utf-8') as f:
                        ot = json.load(f)['tiles']
                    cand = ot[t['i']] if t['i'] < len(ot) else {}
                    row['rect_' + label] = cand.get('rect')
                    row['std_' + label] = cand.get('stats', {}).get('std')
                    row['blank_' + label] = cand.get('blank')
                    row['geom_drift_' + label] = (cand.get('rect') != t.get('rect'))
                img = os.path.join(out, arm, theme, t['png'])
                row['diff_' + label] = diff_pair(os.path.join(base_dir, t['png']), img) if os.path.exists(img) else None
                if row['diff_' + label] and row['diff_' + label].get('gt2'):
                    # 有差就得说清差在哪：另存放大 8 倍的差分图 + 包围盒 + 边框圈/画面内占比
                    dpath = os.path.join(out, theme, 'diff-%02d-%s-%s.png' % (t['i'], t['style'], label))
                    os.makedirs(os.path.dirname(dpath), exist_ok=True)
                    row['loc_' + label] = localize(os.path.join(base_dir, t['png']), img, dpath)
                    row['diff_png_' + label] = os.path.relpath(dpath, out)
            result['tiles'].append(row)
    for i in sorted({d['index'] for d in result['dialog']}):
        pa = os.path.join(out, base_arm, 'dialog', 'dialog-%d-a.png' % i)
        for label, url, arm in arms:
            if label == 'a':
                continue
            pb = os.path.join(out, arm, 'dialog', 'dialog-%d-%s.png' % (i, label))
            if os.path.exists(pa) and os.path.exists(pb):
                result['dialog'].append({'index': i, 'diff_' + label: diff_pair(pa, pb)})

    # ---- 汇总 ----
    def worst(rows, tag):
        vals = [r['diff_' + tag] for r in rows
                if r.get('diff_' + tag) and r['diff_' + tag].get('max') is not None]
        if not vals:
            return None, None, 0
        return max(v['max'] for v in vals), max(v['gt2'] for v in vals), len(vals)

    lines.append('== 这一轮每臂实际加载的 CSS（sha256 取自页面里 fetch 到的文本）')
    for p in result['passes']:
        c = p['css']
        lines.append('  %-9s %-5s sha256=%s len=%s clip=%s' %
                     (p['arm'], p['theme'], (c.get('sha256') or '?')[:16], c.get('len'), p['clip_mode']))
    lines.append('== 计算值（silk/nacre 的 --coverlay-op / --cblend / --coverlay 层数；只看值，不看像素）')
    for p in result['passes']:
        for k in ('silk', 'nacre'):
            v = (p['computed'].get('craft') or {}).get(k)
            if v:
                lines.append('  %-9s %-5s %-6s op=%s blend=%s layers=%s line=%s' %
                             (p['arm'], p['theme'], k, v.get('op'), v.get('blend'), v.get('layers'), v.get('line')))
    lines.append('== 逐张卡面（设备像素 2x，视口 1680x900，同一下标、滚到位再拍）')
    per_style = {}
    for r in result['tiles']:
        per_style.setdefault(r['style'], []).append(r)
    for style in sorted(per_style):
        rows = per_style[style]
        m, g, n = worst(rows, 'b')
        mc, gc, _ = worst(rows, 'a2') if args.control else (None, None, 0)
        # 判据只有一条：AB 差 ≤ AA 差 ⇒ 与重复性同量级（既不能说「不等价」也不能说「等价」，
        # 只能报「差异在噪声内」）；AB 差 > AA 差 ⇒ 真差异，必须定位到卡位与方向。
        if m is None:
            verdict = '未测到'
        elif m == 0:
            verdict = '完全一致（0/255）'
        elif mc is None:
            verdict = 'AB>0 但无 AA 上界 —— 判读不了（要补 --control）'
        elif m <= mc:
            verdict = '在重复性内（AB %d ≤ AA %d）' % (m, mc)
        else:
            verdict = '真差异（AB %d > AA %d）' % (m, mc)
        lines.append('%s%-10s n=%2d  A↔B max=%s  >2/255 的像素=%s  A↔A(对照) max=%s   → %s' %
                     ('  ', style, n, m, g, mc, verdict))
        for r in rows:
            for tag in ('b', 'a2'):
                loc = r.get('loc_' + tag)
                if loc and loc.get('gt2'):
                    lines.append('      · 差在卡#%02d(%s) %s：包围盒=%s 边框圈内=%s 画面内=%s 差分图=%s' %
                                 (r['i'], r['style'], tag, loc.get('bbox'),
                                  loc.get('on_edge_ring'), loc.get('inside'), r.get('diff_png_' + tag)))
        blanks = [r['i'] for r in rows if r.get('std_a') is not None and r['std_a'] < 2.0]
        if blanks:
            lines.append('      !! 有空白/近纯色截图（重拍后再看）下标: ' + str(blanks))
        mis = [r['i'] for r in rows if r.get('diff_b') and r['diff_b'].get('max') is None]
        if mis:
            lines.append('      !! 两臂截图尺寸不一致（未直接相减）下标: ' + str(mis))
        moved = [r['i'] for r in rows if r.get('geom_drift_b')]
        if moved:
            for r in rows:
                if r.get('geom_drift_b'):
                    lines.append('      !! 几何漂移 卡#%02d %s：a=%s b=%s（量的是同一张卡、同一滚动位？）' %
                                 (r['i'], r['style'], r['rect_a'], r.get('rect_b')))
    for d in result['dialog']:
        if 'diff_b' in d:
            lines.append('  3D 弹层 卡#%d  A↔B max=%s gt2=%s px=%s' %
                         (d['index'], d['diff_b'].get('max'), d['diff_b'].get('gt2'), d['diff_b'].get('px')))
        if 'diff_a2' in d:
            lines.append('  3D 弹层 卡#%d  A↔A(对照) max=%s gt2=%s' %
                         (d['index'], d['diff_a2'].get('max'), d['diff_a2'].get('gt2')))
    with open(os.path.join(out, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    with open(os.path.join(out, 'summary.txt'), 'w', encoding='utf-8') as f:
        f.write(chr(10).join(lines) + chr(10))
    print(chr(10).join(lines))
    return 0


if __name__ == '__main__':
    sys.exit(main())
