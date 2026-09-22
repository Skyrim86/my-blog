# -*- coding: utf-8 -*-
"""给「参数化工艺」那几条守卫做注入测试：每种漂移都应当被 check-deck.mjs 拦下。

每例：改一个字节级的目标 → 跑 node scripts/check-deck.mjs → 打印 ✗ 行 → 恢复原文件。
用法（仓库根）：python D:/.../guard-inject.py
"""
import subprocess
import sys

CRLF = chr(13) + chr(10)

CASES = [
    ('m1 手改生成物（--coverlay-op 1 → .9）',
     'assets/css/extended/21-card-styles.css', '--coverlay-op: 1;', '--coverlay-op: .9;'),
    ('m2 手改 STYLE_3D 的托管行（nacre foil 0.22 → 0.32）',
     'assets/js/card-3d.js', 'nacre:        { foil: 0.22,', 'nacre:        { foil: 0.32,'),
    ('m3 把手写块加回来（.home-card--silk 放回 21-card-deck.css）',
     'assets/css/extended/21-card-deck.css',
     '/* 极光：**高层大气发光**',
     '.home-card--silk {' + CRLF + '  --fret-line: #fff;' + CRLF + '}' + CRLF + CRLF + '/* 极光：**高层大气发光**'),
    ('m4 生成物里丢掉 --fret-line（silk）',
     'assets/css/extended/21-card-styles.css', '  --fret-line: rgba(255, 246, 240, .92);', '  /* 删掉这一行 */'),
    ('m5 档位与 $styleTier 写岔（nacre basic → advanced）',
     'data/card-styles.yaml', 'tier: basic', 'tier: advanced'),
]

for title, path, old, new in CASES:
    with open(path, 'r', encoding='utf-8', newline='') as f:
        original = f.read()
    n = original.count(old)
    if n == 0:
        print('!! 目标串没找到：' + title)
        continue
    mutated = original.replace(old, new, 1)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(mutated)
    try:
        r = subprocess.run(['node', 'scripts/check-deck.mjs'], capture_output=True, text=True,
                           encoding='utf-8', errors='replace')
        bad = [l for l in (r.stdout or '').splitlines() if l.strip().startswith('✗')]
        print('== ' + title)
        print('   退出码 ' + str(r.returncode) + '；报错 ' + str(len(bad)) + ' 条')
        for l in bad[:3]:
            print('     ' + l.strip()[:170])
        if not bad and r.returncode == 0:
            print('     !!! 没拦下 —— 这条守卫是摆设')
    finally:
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(original)
print('恢复完毕；再跑一次 check-deck 确认回到干净状态：')
r = subprocess.run(['node', 'scripts/check-deck.mjs'], capture_output=True, text=True, encoding='utf-8', errors='replace')
print(r.stdout.strip().splitlines()[-1])
sys.exit(r.returncode)
