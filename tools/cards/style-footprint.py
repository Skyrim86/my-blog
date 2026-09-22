# -*- coding: utf-8 -*-
"""测绘：**一种**卡面工艺到底分散在几处、各占多少行 —— 可复跑，不靠人肉数。

用法（仓库根）：
  python tools/cards/style-footprint.py                 # 5 处清单 + 每种工艺的占用
  python tools/cards/style-footprint.py --style silk    # 只看一种（-v 打印每处原文）

为什么从 HEAD 读 CSS/JS：这两个文件正是「参数化」动过的 —— 手写态只存在于 HEAD。
`git show HEAD:<path>` 直接拿仓库里的那一版，不受工作区影响。

判读口径：
  · 一份工艺的「迁移面」= 它在 5 个文件里**必须同步**的片段。少改一处，卡面就有一半新一半旧。
  · 行数是**必须手写/同步的行**，不含空行与注释（注释不参与渲染）。
"""
import argparse
import re
import subprocess
import sys

CARD_CSS = 'assets/css/extended/21-card-deck.css'
CARD_3D = 'assets/js/card-3d.js'
CARDS_YAML = 'data/home-cards.yaml'
I18N = 'i18n/zh.toml'
MANIFEST = 'layouts/_partials/deck-manifest.html'
WALL = 'layouts/_partials/deck-wall.html'

# 现役 16 种（顺序按 CSS 文件里的出现顺序，便于对照）
STYLES = ['foil', 'washi', 'ink', 'yukika', 'starnight', 'frostcrack', 'nacre', 'silk',
          'holo-prism', 'glass', 'gold', 'kintsugi', 'filigree', 'enamel', 'silver', 'aurora']
PARAMETERIZED = {'nacre', 'silk'}


def head(path):
    return subprocess.run(['git', 'show', 'HEAD:' + path], capture_output=True, text=True,
                          encoding='utf-8').stdout


def work(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def css_blocks(text):
    """`.home-card--<名> { ... }` → 每块的行号区间、行数、字节数、声明数"""
    lines = text.split(chr(10))
    out = {}
    i = 0
    while i < len(lines):
        m = re.match(r'^\.home-card--([a-z0-9-]+)\s*\{', lines[i])
        if m:
            j = i
            buf = []
            while j < len(lines):
                buf.append(lines[j])
                if re.search(r'\}\s*$', lines[j]):
                    break
                j += 1
            body = [l for l in buf[1:-1] if l.strip() and not l.strip().startswith('/*')]
            out[m.group(1)] = {'start': i + 1, 'end': j + 1, 'lines': len(body),
                               'bytes': len(chr(10).join(buf))}
            i = j + 1
            continue
        i += 1
    return out


def three_d_entries(text):
    """STYLE_3D 表里 `  <名>: { ... }` 的条目 → 行数/字节数"""
    i = text.find('var STYLE_3D')
    j = text.find('var STYLE_FALLBACK')
    seg = text[i:j]
    lines = seg.split(chr(10))
    out = {}
    k = 0
    while k < len(lines):
        m = re.match(r'^\s{2}([a-z0-9-]+):\s*\{', lines[k])
        if m:
            e = k
            buf = []
            while e < len(lines):
                buf.append(lines[e])
                if re.search(r'\},?\s*$', lines[e]) and e > k:
                    break
                e += 1
            out[m.group(1)] = {'line': i + k + 1, 'lines': len([x for x in buf if x.strip()]),
                               'bytes': len(chr(10).join(buf))}
            k = e + 1
            continue
        k += 1
    return out


def yaml_style_lines(text, style):
    """清单里 style: <名> 的行号（一种工艺用几张卡，每张一行）"""
    hits = []
    for n, l in enumerate(text.split(chr(10)), 1):
        m = re.match(r'^\s*style:\s*(\S+)', l)
        if m and m.group(1) == style:
            hits.append(n)
    return hits


def i18n_lines(text, style):
    """deckStyle<Name> 的键行 + 值行（值里带中文名，是卡面/清单上显示的文字）"""
    lines = text.split(chr(10))
    key = 'deckStyle' + style[0].upper() + style[1:].replace('-', '')
    out = []
    for n, l in enumerate(lines, 1):
        if key in l:
            out.append(n)
    return out, key


def manifest_lines(text, style):
    """manifest 里出现该工艺名的所有行（styleLabel / $styleTier 两张表都在这）"""
    return [n for n, l in enumerate(text.split(chr(10)), 1) if re.search(r'\b' + re.escape(style) + r'\b', l)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--style', default='')
    ap.add_argument('-v', '--verbose', action='store_true')
    args = ap.parse_args()

    css = css_blocks(head(CARD_CSS))
    t3 = three_d_entries(head(CARD_3D))
    yml = work(CARDS_YAML)
    i18 = work(I18N)
    man = work(MANIFEST)
    wall = work(WALL)
    css_all = head(CARD_CSS)
    styles = [args.style] if args.style else STYLES

    print('== 现状：一种工艺分散在五处（行号取自 HEAD；CSS/JS 用 git show HEAD: 读手写态）')
    print('%-11s %-34s %-22s %-26s %-12s' % ('工艺', '①21-card-deck.css 块', '②card-3d.js STYLE_3D',
                                             '③i18n/zh.toml deckStyle*', '④manifest 两张表'))
    tot = {'css': 0, 't3': 0, 'i18n': 0, 'man': 0, 'yml': 0}
    for s in styles:
        c = css.get(s)
        t = t3.get(s)
        yn = yaml_style_lines(yml, s)
        il, key = i18n_lines(i18, s)
        mn = manifest_lines(man, s)
        wn = manifest_lines(wall, s)
        tot['css'] += (c or {}).get('lines', 0)
        tot['t3'] += (t or {}).get('lines', 0)
        tot['i18n'] += len(il)
        tot['man'] += len(mn)
        tot['yml'] += len(yn)
        print('%-11s %-34s %-22s %-26s %-12s' % (
            s,
            ('行 %d-%d (%d 行/声明 %d 条)' % (c['start'], c['end'], c['lines'], 0)) if c else '—',
            ('行 %d (%d 行)' % (t['line'], t['lines'])) if t else '—',
            ('行 %s (%s)' % (','.join(map(str, il)), key)) if il else '—',
            ('行 %s' % (','.join(map(str, mn)))) if mn else '—'))
        if args.verbose:
            print('    ⑤清单 style: 行 %s（%d 张卡）' % (','.join(map(str, yn)) or '无', len(yn)))
            print('    deck-wall.html 命中行: %s' % (','.join(map(str, wn)) or '无'))
    print()
    print('== 文件规模')
    print('  21-card-deck.css（手写态）：%d 行 / %d 字节' % (len(css_all.split(chr(10))),
                                                len(css_all.encode('utf-8'))))
    print('  其中 .home-card--* 工艺块合计：%d 行 / %d 字节（%d 种工艺）' % (
        tot['css'], sum(v['bytes'] for v in css.values()), len(css)))
    print('  card-3d.js STYLE_3D：%d 条 / %d 行' % (len(t3), tot['t3']))
    print()
    print('== 十六种工艺的「同步面」合计（每加一种要跟着改的行数）')
    print('  ①CSS 块 %d 行 + ②STYLE_3D %d 行 + ③i18n %d 行 + ④manifest %d 行 = %d 行；'
          '另需在 ⑤清单里给 3 张卡写 style:（每张 1 行）' % (
              tot['css'], tot['t3'], tot['i18n'], tot['man'],
              tot['css'] + tot['t3'] + tot['i18n'] + tot['man']))
    print()
    print('== 已参数化：%s' % ', '.join(sorted(PARAMETERIZED)))
    for s in sorted(PARAMETERIZED):
        c = css.get(s)
        print('  %-6s 手写块仍在 HEAD：行 %d-%d / %d 行 / %d 字节' % (
            s, c['start'], c['end'], c['lines'], c['bytes']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
