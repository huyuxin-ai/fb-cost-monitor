#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据构建：周度聚合 + SPEC异动规则 + 生成 public/data/app_data.json
口径与数据库 dim_caliber 完全一致（单一事实源）。
用法: python3 pipeline/build_data.py
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
# 时效过滤：仅展示近90天资讯（窗口随构建日期滑动，archive 保留全量历史）
_news_cutoff = (dt.date.today() - dt.timedelta(days=90)).isoformat()
news = sorted((n for n in news if n.get('date', '') >= _news_cutoff),
              key=lambda n: n.get('date', ''), reverse=True)

# ---- 周度聚合 + 异动 ----
mat = pd.read_csv(os.path.join(DATA, 'material_spot_daily.csv'), dtype={'date': str})
mat['date'] = pd.to_datetime(mat['date'])
mat['week'] = mat['date'].dt.strftime('%G-W%V')
wk = mat.sort_values('date').groupby(['symbol','week']).agg(
    price=('spot_price','last'), date=('date','last')).reset_index()

def metrics(g):
    g = g.sort_values('date').reset_index(drop=True)
    g['wow'] = g['price'].pct_change() * 100
    streak, s = [], 0
    for i in range(len(g)):
        if i == 0 or pd.isna(g.loc[i,'wow']): s = 0
        elif g.loc[i,'wow'] > 0: s = s + 1 if s > 0 else 1
        elif g.loc[i,'wow'] < 0: s = s - 1 if s < 0 else -1
        else: s = 0
        streak.append(s)
    g['streak'] = streak
    g['absvol4'] = g['wow'].abs().rolling(4).mean().shift(1)
    r1 = g['streak'].abs() >= 3
    r2 = g['wow'].abs() > g['absvol4']
    g['anomaly'] = np.where(r1 & r2, '重大异动', np.where(r1 | r2, '普通异动', ''))
    return g

# pandas3 兼容：groupby.apply 在 pandas>=3 中不再向函数传入分组列，改用分组迭代（两版行为一致）
_groups = [metrics(g) for _, g in wk.groupby('symbol')]
wk = pd.concat(_groups, ignore_index=True) if _groups else wk

materials = []
for sym, m in cfg['meta'].items():
    g = wk[wk['symbol'] == sym]
    series = [{'week': r.week, 'date': str(r.date)[:10], 'price': round(float(r.price), 2),
               'wow': None if pd.isna(r.wow) else round(float(r.wow), 2),
               'streak': int(r.streak), 'anomaly': r.anomaly} for r in g.itertuples()]
    materials.append({**{'id': sym}, **m, 'series': series,
                      'latest': series[-1] if series else None,
                      'downstream': cfg['downstream'].get(sym, [])})
# ---- 人工采集数据并入（member_prices.csv → 待采购品种转正为已接入） ----
mem_map = {}
mem_path = os.path.join(DATA, 'member_prices.csv')
if os.path.exists(mem_path):
    mem = pd.read_csv(mem_path, dtype={'date': str})
    mem['date'] = pd.to_datetime(mem['date'])
    mem['week'] = mem['date'].dt.strftime('%G-W%V')
    memwk = mem.sort_values('date').groupby(['material_id', 'week']).agg(
        price=('price', 'last'), date=('date', 'last')).reset_index()
    mem_map = {pid: g.reset_index(drop=True) for pid, g in memwk.groupby('material_id')}

for u in cfg['unavailable']:
    g = mem_map.get(u['id'])
    series = []
    if g is not None and len(g):
        g = metrics(g)
        series = [{'week': r.week, 'date': str(r.date)[:10], 'price': round(float(r.price), 2),
                   'wow': None if pd.isna(r.wow) else round(float(r.wow), 2),
                   'streak': int(r.streak), 'anomaly': r.anomaly} for r in g.itertuples()]
    materials.append({**u,
                      'source_status': '已接入' if series else u['source_status'],
                      'basis': None, 'series': series,
                      'latest': series[-1] if series else None,
                      'downstream': cfg['downstream'].get(u['id'], [])})

# ---- 公司主档（由 kline.json 派生，行情快照并入） ----
kline = json.load(open(os.path.join(DATA, 'kline.json')))
snap_path = os.path.join(PIPE, 'snapshot.json')
snap = json.load(open(snap_path)) if os.path.exists(snap_path) else {}
companies = []
for code, v in kline.items():
    data = v['data']
    q = snap.get(code)
    companies.append({'code': code, 'name': v['name'],
                      'market': 'HK' if code.startswith('HK') else 'A',
                      'industry': (q or {}).get('industry', ''), 'main': (q or {}).get('main', ''),
                      'snapshot': q, 'kline_days': len(data), 'has_kline': bool(data)})
# 快照中存在但无K线的公司（如 *ST岩石 600696，见测试日志T-002）
for code, q in snap.items():
    if code not in kline:
        companies.append({'code': code, 'name': q.get('name', code),
                          'market': 'HK' if code.startswith('HK') else 'A',
                          'industry': q.get('industry', ''), 'main': q.get('main', ''),
                          'snapshot': q, 'kline_days': 0, 'has_kline': False})

run_log_path = os.path.join(DATA, 'run_log.json')
run_log = json.load(open(run_log_path)) if os.path.exists(run_log_path) else None

app_data = {
    'generated_at': dt.date.today().isoformat(),
    'data_week': wk['week'].max(),
    'pipeline': {'last_run': (run_log or {}).get('run_at'), 'steps': (run_log or {}).get('steps', []),
                 'mode': 'github-actions-cron', 'schedule': '每交易日 16:30 CST'},
    'materials': materials, 'companies': companies,
    'sensitivity': cfg['sensitivity'], 'news': news,
    'thresholds': cfg['thresholds'], 'data_sources': cfg['data_sources'],
    'test_log': cfg['test_log'],
}
json.dump(app_data, open(os.path.join(DATA, 'app_data.json'), 'w'), ensure_ascii=False)
n_anom = sum(1 for m in materials if m.get('latest') and m['latest'].get('anomaly'))
print(f"OK week={app_data['data_week']} materials={len(materials)} anomalies={n_anom} companies={len(companies)}")
