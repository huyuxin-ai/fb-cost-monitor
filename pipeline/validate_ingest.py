#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
成员采集数据验收 + 合并脚本（数据库负责人用）
用法:
  python3 pipeline/validate_ingest.py 采集_成员A_20260905.xlsx          # 仅校验
  python3 pipeline/validate_ingest.py 采集_成员A_20260905.xlsx --merge  # 校验通过并合并入库
校验规则与《数据交付规范 v1.0》一致；结果输出验收报告并追加 test_log。
"""
import sys, os, json, datetime as dt
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'public', 'data')
PIPE = os.path.join(ROOT, 'pipeline')

FIELDS = ['品种ID','品种名称','细分规格','数据日期','价格','单位','口径(国产/进口)',
          '数据源名称','数据源链接','采集人','采集时间','备注(异常波动说明)']

def validate(path):
    errs, warns, rows = [], [], []
    cfg = json.load(open(os.path.join(PIPE, 'config.json')))
    known = set(cfg['meta']) | {u['id'] for u in cfg['unavailable']}
    units = {m['id']: m.get('unit') for m in
             ([{'id': k, **v} for k, v in cfg['meta'].items()] + cfg['unavailable'])}
    xl = pd.ExcelFile(path)
    for sheet in xl.sheet_names:
        if '成员' not in sheet: continue
        df = xl.parse(sheet, dtype=str).fillna('')
        if list(df.columns) != FIELDS:
            errs.append(f"[{sheet}] 表头不一致，请使用原版模板"); continue
        for i, r in df.iterrows():
            n = i + 2
            if not str(r['数据日期']).strip(): continue  # 空行跳过
            pid = str(r['品种ID']).strip()
            if pid not in known: errs.append(f"[{sheet}]行{n}: 品种ID '{pid}' 不在库中"); continue
            try: dt.datetime.strptime(str(r['数据日期']).strip()[:10], '%Y-%m-%d')
            except Exception: errs.append(f"[{sheet}]行{n}: 日期格式错误"); continue
            try: price = float(str(r['价格']).replace(',', ''))
            except Exception: errs.append(f"[{sheet}]行{n}: 价格非数值 '{r['价格']}'"); continue
            if price <= 0: errs.append(f"[{sheet}]行{n}: 价格≤0（无报价请留空并备注）")
            if str(r['口径(国产/进口)']).strip() not in ('国产','进口'):
                errs.append(f"[{sheet}]行{n}: 口径只能填 国产/进口")
            if units.get(pid) and str(r['单位']).strip() != units[pid]:
                warns.append(f"[{sheet}]行{n}: 单位'{r['单位']}'与库口径'{units[pid]}'不一致")
            if not str(r['数据源名称']).strip(): errs.append(f"[{sheet}]行{n}: 缺数据源名称")
            if not str(r['采集人']).strip(): errs.append(f"[{sheet}]行{n}: 缺采集人")
            if not str(r['备注(异常波动说明)']).strip() and '无报价' not in str(r['备注(异常波动说明)']):
                warns.append(f"[{sheet}]行{n}: 建议填写备注（无报价请注明）")
            rows.append({'material_id': pid, 'date': str(r['数据日期']).strip()[:10],
                         'price': price, 'unit': str(r['单位']).strip(),
                         'origin': str(r['口径(国产/进口)']).strip(),
                         'source': str(r['数据源名称']).strip(), 'sheet': sheet})
    # 周变动>±20% 复核提醒（与库内最近值比）
    hist_path = os.path.join(DATA, 'member_prices.csv')
    hist = pd.read_csv(hist_path, dtype={'date': str}) if os.path.exists(hist_path) else pd.DataFrame()
    for row in rows:
        h = hist[hist['material_id'] == row['material_id']] if len(hist) else pd.DataFrame()
        if len(h):
            last = h.sort_values('date').iloc[-1]
            if last['price'] and abs(row['price']/float(last['price']) - 1) > 0.2:
                warns.append(f"{row['material_id']} {row['date']}: 较上次({last['date']}={last['price']})变动超±20%，需人工复核")
    return errs, warns, rows

if __name__ == '__main__':
    path = sys.argv[1]
    merge = '--merge' in sys.argv
    errs, warns, rows = validate(path)
    print(f"=== 验收报告 {os.path.basename(path)} ===")
    print(f"有效数据行: {len(rows)}  错误: {len(errs)}  提醒: {len(warns)}")
    for e in errs: print('  [错误]', e)
    for w in warns: print('  [提醒]', w)
    if errs:
        print('结论: 退件 —— 请修正错误后重报'); sys.exit(1)
    if merge and rows:
        hist_path = os.path.join(DATA, 'member_prices.csv')
        new = pd.DataFrame(rows)
        if os.path.exists(hist_path):
            old = pd.read_csv(hist_path, dtype={'date': str})
            old = old[~old.set_index(['material_id','date']).index.isin(new.set_index(['material_id','date']).index)]
            new = pd.concat([old, new], ignore_index=True)
        new.sort_values(['material_id','date']).to_csv(hist_path, index=False)
        tl_path = os.path.join(PIPE, 'config.json')
        cfg = json.load(open(tl_path))
        cfg['test_log'].append({'id': f"T-{len(cfg['test_log'])+1:03d}", 'module': '成员数据入库',
            'issue': f"{os.path.basename(path)} 验收通过({len(rows)}行,提醒{len(warns)}条)",
            'result': '已合并 member_prices.csv', 'status': '已解决',
            'date': dt.date.today().isoformat()})
        json.dump(cfg, open(tl_path, 'w'), ensure_ascii=False, indent=1)
        print('结论: 已入库 → member_prices.csv，test_log 已登记')
    else:
        print('结论: 校验通过（未执行合并，加 --merge 入库）')
