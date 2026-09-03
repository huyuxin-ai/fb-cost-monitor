#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
成员采集数据自动入库（CI 用）
扫描 pipeline/inbox/*.xlsx → 逐个调用 validate_ingest.py --merge 验收合并
成功：文件移入 pipeline/inbox/done/；失败：留原处等待修正重传（不阻断部署）
用法: python3 pipeline/ingest_inbox.py
"""
import glob, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX = os.path.join(ROOT, 'pipeline', 'inbox')
DONE = os.path.join(INBOX, 'done')
os.makedirs(DONE, exist_ok=True)

files = sorted(glob.glob(os.path.join(INBOX, '*.xlsx')))
if not files:
    print('[ok] inbox 无待入库文件')
    sys.exit(0)

for f in files:
    name = os.path.basename(f)
    print(f'--- 验收 {name} ---', flush=True)
    r = subprocess.run([sys.executable,
                        os.path.join(ROOT, 'pipeline', 'validate_ingest.py'),
                        f, '--merge'])
    if r.returncode == 0:
        shutil.move(f, os.path.join(DONE, name))
        print(f'[ok] 已入库并归档 → inbox/done/{name}')
    else:
        # 退件：文件留在 inbox，CI 日志可见原因；不 sys.exit(1)，避免阻断站点部署
        print(f'[reject] {name} 验收未通过，已留 inbox 等待修正重传')
print('DONE')
