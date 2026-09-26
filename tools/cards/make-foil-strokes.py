"""卡面 A「真箔感」：把花纹环 token 的压印对平涂换成**箔渐变**版（多 stop 明暗交替）。

只换 paint，几何与力度都不动：
  · 原填充对 = 暗线 rgba(0,0,0,.46) + 亮线 rgba(255,255,255,.42)（压印对偶，见 §10.8）；
  · 换成 url(#gd)/url(#gl) 线性渐变（金 = 暗铜/亮金交替、银 = 冷灰/亮银交替），
    渐变 stop-opacity 对齐原 .46/.42 —— 于是线条力度与现在逐像素同档。
  · 落点是 --pat-ink / --pat-branch（花纹环，弹层走 @container 换密版）；
    角花 --pat-scroll 不动（那是稀有度金量通道 --bk-corgold 的地盘）。

生成块写进 21-card-deck.css 的 foil-strokes:BEGIN/END 标记区（可重跑覆盖）。
用法: python tools/cards/make-foil-strokes.py   （在 my-blog 仓库根跑）
"""
import re
from pathlib import Path

CSS = Path("assets/css/decks/21-card-deck.css")

# 金：暗线走暗铜四段、亮线走亮金四段；银走冷端。多 stop 明暗交替 = 箔带的缎面反光（配方 §2）。
DEF = {
    "gold": {
        "gd": ["#7a5410", "#a5762a", "#6b4608", "#94681f", "#7a5410"],
        "gl": ["#ffeeb0", "#c99a3e", "#fff6d0", "#d4a94e", "#ffeeb0"],
    },
    "silver": {
        "gd": ["#565b63", "#7d838c", "#474c53", "#6a707a", "#565b63"],
        "gl": ["#fbfdff", "#c8ced6", "#ffffff", "#b3bac2", "#fbfdff"],
    },
}
OFF = ["0", ".28", ".55", ".8", "1"]

FILL_D = "fill%3D%27rgba%280%2C0%2C0%2C.46%29%27"
FILL_L = "fill%3D%27rgba%28255%2C255%2C255%2C.42%29%27"

# %27=', %28/%29=(), %2C=,, %20=space, %23=#, %3C/%3E=<>  （与文件既有编码风格一致）
def enc(s: str) -> str:
    return (s.replace("%", "%25").replace("'", "%27").replace("(", "%28").replace(")", "%29")
             .replace(",", "%2C").replace(" ", "%20").replace("#", "%23")
             .replace("<", "%3C").replace(">", "%3E"))

def grad(gid: str, stops, op: str) -> str:
    body = "".join(f"<stop offset='{o}' stop-color='{c}' stop-opacity='{op}'/>" for o, c in zip(OFF, stops))
    return f"<linearGradient id='{gid}' x1='0' y1='0' x2='1' y2='1'>{body}</linearGradient>"

def variant(payload: str, stops_d, stops_l) -> str:
    defs = enc(f"<defs>{grad('gd', stops_d, '.46')}{grad('gl', stops_l, '.42')}</defs>")
    out = payload.replace(FILL_D, "fill%3D%27url%28%23gd%29%27").replace(FILL_L, "fill%3D%27url%28%23gl%29%27")
    # defs 插到 <svg ...> 开标签之后
    m = re.match(r"(%3Csvg%20.*?%3E)", out)
    assert m, "svg open tag not found"
    return m.group(1) + defs + out[m.end():]

def main():
    css = CSS.read_text(encoding="utf-8")
    base = {}
    for name in ("pat-ink", "pat-branch"):
        m = re.search(rf"--{name}: url\(\"data:image/svg\+xml;utf8,(.+?)\"\);", css, re.S)
        assert m, f"--{name} not found"
        base[name] = m.group(1)

    lines = []
    for craft, stops in DEF.items():
        for name in ("pat-ink", "pat-branch"):
            lines.append(f'  --{name}-{craft}: url("data:image/svg+xml;utf8,'
                         f'{variant(base[name], stops["gd"], stops["gl"])}");')

    block = (
        "/* foil-strokes:BEGIN —— 卡面 A 真箔感（tools/cards/make-foil-strokes.py 生成，勿手改）\n"
        "   烫金箔/烫银的花纹环换成「渐变烘进 SVG」的箔版：多 stop 明暗交替（配方 §2），\n"
        "   渐变 stop-opacity 对齐原压印对 .46/.42，只换 paint 不动几何与力度。\n"
        "   角花不在此列（--bk-corgold 稀有度金量通道的地盘）。 */\n"
        ".home-card {\n" + "\n".join(lines) + "\n}\n"
        ".home-card--goldfoil .home-card-motif { background-image: var(--pat-ink-gold, var(--pat-ink, none)); }\n"
        ".home-card--silver  .home-card-motif { background-image: var(--pat-ink-silver, var(--pat-ink, none)); }\n"
        "@container (min-width: 300px) {\n"
        "  .home-card--goldfoil .home-card-motif { background-image: var(--pat-branch-gold, var(--pat-branch, none)); }\n"
        "  .home-card--silver  .home-card-motif { background-image: var(--pat-branch-silver, var(--pat-branch, none)); }\n"
        "}\n"
        "/* foil-strokes:END */\n"
    )

    if "foil-strokes:BEGIN" in css:
        css = re.sub(r"/\* foil-strokes:BEGIN.*?/\* foil-strokes:END \*/\n", block, css, flags=re.S)
    else:
        css = css.rstrip() + "\n\n" + block
    CSS.write_text(css, encoding="utf-8")
    print("ok: foil-strokes block written,", len(lines), "tokens")

if __name__ == "__main__":
    main()
