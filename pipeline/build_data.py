#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据构建：周度聚合 + SPEC异动规则 + 生成 public/data/app_data.json
SPEC规则: rule1=连续>=3周同向; rule2=|本周|>前4周均|波动|; 重大=rule1&rule2 普通=rule1|rule2
"""
import json, os, datetime as dt
import pandas as pd
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'public', 'data')
os.makedirs(DATA, exist_ok=True)  # 防御：目录不存在时先创建
PIPE = os.path.join(ROOT, 'pipeline')
cfg = json.load(open(os.path.join(PIPE, 'config.json')))
news = json.load(open(os.path.join(PIPE, 'news_archive.json')))

df = pd.read_csv(os.path.join(DATA, 'material_spot_daily.csv'), dtype={'date': str})
df['date'] = pd.to_datetime(df['date'])
df['week'] = df['date'].dt.strftime('%G-W%V')
weekly = df.groupby(['symbol','week'])['price'].last().unstack('symbol')
weekly = weekly.sort_index()

NAME = dict(zip(cfg['meta']['ids'], cfg['meta']['names']))
CAT = dict(zip(cfg['meta']['ids'], cfg['meta']['cats']))
th = cfg['thresholds']
rows, alerts = [], 0
for sym in weekly.columns:
    s = weekly[sym].dropna()
    if len(s) < 6: continue
    wow = s.pct_change()
    streak = 0
    for v in wow.iloc[::-1]:
        if abs(v) < 1e-9: break
        d = 1 if v > 0 else -1
        if streak == 0 or (streak > 0) == (d > 0): streak += d
        else: break
    roll4 = wow.abs().shift(1).rolling(4).mean()
    r1 = abs(streak) >= th['streak_weeks']
    r2 = bool(abs(wow.iloc[-1]) > roll4.iloc[-1] * th['vol_mult']) if not np.isnan(roll4.iloc[-1]) else False
    level = 'major' if (r1 and r2) else ('minor' if (r1 or r2) else '')
    if level: alerts += 1
    rows.append({
        'id': sym, 'name': NAME.get(sym, sym), 'cat': CAT.get(sym, ''),
        'price': round(float(s.iloc[-1]), 2), 'wow': round(float(wow.iloc[-1])*100, 2),
        'streak': streak, 'avg4': round(float(roll4.iloc[-1])*100, 2) if not np.isnan(roll4.iloc[-1]) else None,
        'level': level, 'series': [[w, round(float(v),2)] for w, v in s.iloc[-26:].items()],
        'downstream': cfg['downstream'].get(sym, []),
    })

# 未接入品种（待采购）也入列，前端显示占位卡
have = {r['id'] for r in rows}
for mid, name in NAME.items():
    if mid not in have:
        rows.append({'id': mid, 'name': name, 'cat': CAT.get(mid,''), 'price': None, 'wow': None,
                     'streak': 0, 'avg4': None, 'level': '', 'series': [],
                     'downstream': cfg['downstream'].get(mid, []),
                     'unavailable': cfg['unavailable'].get(mid)})
rows.sort(key=lambda r: (r['cat'], r['id']))

snap = json.load(open(os.path.join(PIPE, 'snapshot.json')))
companies = snap['companies']
have_k = set(json.load(open(os.path.join(DATA, 'kline.json'))).keys())
for c in companies:
    c['has_kline'] = c['code'] in have_k
n_anom = sum(1 for r in rows if r['level'])

app_data = {
    'data_week': weekly.index[-1], 'built_at': dt.datetime.now().isoformat(timespec='seconds'),
    'materials': rows, 'companies': companies,
    'sensitivity': cfg['sensitivity'], 'news': news, 'thresholds': th,
    'data_sources': cfg['data_sources'], 'test_log': cfg['test_log'],
    'pipeline': json.load(open(os.path.join(DATA, 'run_log.json'))) if os.path.exists(os.path.join(DATA,'run_log.json')) else {},
}
json.dump(app_data, open(os.path.join(DATA, 'app_data.json'), 'w'), ensure_ascii=False)

print(f"OK week={app_data['data_week']} materials={len(rows)} anomalies={n_anom} companies={len(companies)}")
