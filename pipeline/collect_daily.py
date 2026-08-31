#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每日采集脚本（GitHub Actions / cron 通用）
- 生意社现货 15 品种：补齐最近 10 个交易日（含修订覆盖）
- 股票K线 159 只：增量补最近 10 个交易日
- 所有失败登记 pipeline/run_log.json
用法: python3 pipeline/collect_daily.py
"""
import json, os, sys, time, warnings, datetime as dt
warnings.filterwarnings('ignore')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'public', 'data')
os.makedirs(DATA, exist_ok=True)  # 仓库初始不含 public/data，首次自举前必须建目录
KEEP = ['SR','P','C','M','A','Y','AL','FG','SP','TA','PF','RM','OI','LH','BZ']
run_log = {'run_at': dt.datetime.now().isoformat(timespec='seconds'), 'steps': []}

def log(step, status, detail=''):
    run_log['steps'].append({'step': step, 'status': status, 'detail': detail})
    print(f"[{status}] {step} {detail}", flush=True)

def collect_spot():
    import akshare as ak, pandas as pd
    path = os.path.join(DATA, 'material_spot_daily.csv')
    if os.path.exists(path):
        old = pd.read_csv(path, dtype={'date': str})
        start = (dt.date.today() - dt.timedelta(days=20)).strftime('%Y%m%d')
    else:  # 首次运行自举：补齐全年历史（用于26周周度聚合）
        old = pd.DataFrame()
        start = '20260301'
        log('spot_bootstrap', 'ok', 'kline/csv缺失，自举抓取2026-03以来历史')
    end = dt.date.today().strftime('%Y%m%d')
    frames, fails = [], []
    for d in pd.bdate_range(start, end):
        ds = d.strftime('%Y%m%d')
        for attempt in range(3):
            try:
                df = ak.futures_spot_price(ds)
                frames.append(df[df['symbol'].isin(KEEP)]); break
            except Exception as e:
                if attempt == 2: fails.append(ds)
                else: time.sleep(1.5)
    if frames:
        new = pd.concat(frames, ignore_index=True)
        new['date'] = pd.to_datetime(new['date']).dt.strftime('%Y-%m-%d')
        if not old.empty:
            new = pd.concat([old, new]).drop_duplicates(['symbol','date'], keep='last')
        new.sort_values(['symbol','date']).to_csv(path, index=False)
        log('spot_prices', 'ok', f'{len(new)}行 {new.date.min()}~{new.date.max()} 失败日{len(fails)}')
    else:
        log('spot_prices', 'fail', f'全部失败 {fails[:3]}')

def collect_kline():
    import akshare as ak, pandas as pd
    snap = json.load(open(os.path.join(ROOT, 'pipeline', 'snapshot.json')))
    codes = [c['code'] for c in snap['companies']]
    kpath = os.path.join(DATA, 'kline.json')
    kline = json.load(open(kpath)) if os.path.exists(kpath) else {}
    if not kline: log('kline_bootstrap', 'ok', f'自举抓取{len(codes)}只全年K线')
    start = (dt.date.today() - dt.timedelta(days=25)).strftime('%Y%m%d') if kline else '20250101'
    end = dt.date.today().strftime('%Y%m%d')
    ok, fail = 0, []
    for i, code in enumerate(codes):
        try:
            if code.startswith('HK'):
                df = ak.stock_hk_daily(symbol=code.replace('HK','').zfill(5), adjust='')
                df = df[df['date'] >= start]
            else:
                df = ak.stock_zh_a_daily(symbol=('sh' if code.startswith('6') else 'sz')+code, start_date=start, end_date=end, adjust='')
            if df is None or df.empty: raise ValueError('empty')
            df.columns = [str(c).lower() for c in df.columns]
            df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
            rows = df[['date','open','high','low','close','volume']].dropna().values.tolist()
            hist = {r[0]: r for r in kline.get(code, [])}
            for r in rows: hist[r[0]] = r
            kline[code] = sorted(hist.values(), key=lambda r: r[0])[-300:]
            ok += 1
        except Exception as e:
            fail.append(f'{code}:{type(e).__name__}')
        if i % 20 == 19: time.sleep(1.2)
    json.dump(kline, open(kpath, 'w'))
    log('kline', 'ok' if ok else 'fail', f'成功{ok}/{len(codes)} 失败{len(fail)} {" ".join(fail[:6])}')

if __name__ == '__main__':
    try: collect_spot()
    except Exception as e: log('spot_prices', 'fail', repr(e))
    try: collect_kline()
    except Exception as e: log('kline', 'fail', repr(e))
    json.dump(run_log, open(os.path.join(DATA, 'run_log.json'), 'w'), ensure_ascii=False, indent=1)
    print('DONE', json.dumps(run_log, ensure_ascii=False)[:400])
