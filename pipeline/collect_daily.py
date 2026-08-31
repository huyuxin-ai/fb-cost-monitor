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
                time.sleep(1.5)
    if frames:
        new = pd.concat(frames, ignore_index=True)
        new['date'] = new['date'].astype(str)
        if len(old):
            old = old[~old.set_index(['date','symbol']).index.isin(new.set_index(['date','symbol']).index)]
        out = pd.concat([old, new], ignore_index=True).sort_values(['symbol','date'])
        out.to_csv(path, index=False)
    log('spot_prices', 'ok' if not fails else 'partial',
        f'+{sum(len(f) for f in frames)}行' + (f', 失败日期:{fails}' if fails else ''))

def collect_kline():
    import akshare as ak, pandas as pd
    from concurrent.futures import ThreadPoolExecutor, as_completed
    kpath = os.path.join(DATA, 'kline.json')
    bootstrap = not os.path.exists(kpath)
    kline = json.load(open(kpath)) if not bootstrap else {}
    start = (dt.date.today() - dt.timedelta(days=20)).strftime('%Y-%m-%d')
    errs = []

    def sina_sym(code):
        code = str(code).zfill(6)
        if code.startswith(('600','601','603','605','688')): return 'sh' + code
        if code.startswith(('920','83','87')): return 'bj' + code
        return 'sz' + code

    def fetch(code, full=False):
        try:
            st = '2026-01-01' if full else start
            if code.startswith('HK'):
                df = ak.stock_hk_daily(symbol=code.replace('HK','').zfill(5), adjust='qfq')
                df['date'] = df['date'].astype(str)
                df = df[df['date'] >= st]
            else:
                df = ak.stock_zh_a_daily(symbol=sina_sym(code), start_date=st.replace('-',''),
                                         end_date=dt.date.today().strftime('%Y%m%d'), adjust='qfq')
                df['date'] = df['date'].astype(str)
            if df is None or len(df) == 0: return code, None
            df = df.rename(columns={'涨跌幅': 'pct'})
            if 'pct' not in df: df['pct'] = df['close'].pct_change() * 100
            recs = df[['date','open','close','high','low','volume','pct']].round(3).to_dict('records')
            return code, recs
        except Exception as e:
            return code, f'{type(e).__name__}'

    if bootstrap:
        # 首次运行：从 pipeline/snapshot.json 的公司清单全量抓取
        snap = json.load(open(os.path.join(ROOT, 'pipeline', 'snapshot.json')))
        log('kline_bootstrap', 'ok', f'自举抓取{len(snap)}只全年K线')
        ok = 0
        with ThreadPoolExecutor(max_workers=5) as ex:
            futs = {ex.submit(fetch, c, True): c for c in snap}
            for f in as_completed(futs):
                code, res = f.result()
                if isinstance(res, list) and res:
                    kline[code] = {'name': snap[code].get('name', code), 'data': res}; ok += 1
                else: errs.append(code)
        json.dump(kline, open(kpath, 'w'), ensure_ascii=False)
        log('kline', 'ok' if not errs else 'partial', f'自举{ok}/{len(snap)}只' + (f', 失败:{errs[:5]}' if errs else ''))
        return

    codes = list(kline.keys())
    updated = 0
    with ThreadPoolExecutor(max_workers=5) as ex:
        futs = {ex.submit(fetch, c): c for c in codes}
        for f in as_completed(futs):
            code, res = f.result()
            if isinstance(res, list) and res:
                old = {r['date']: r for r in kline[code]['data']}
                for r in res: old[r['date']] = r
                kline[code]['data'] = [old[d] for d in sorted(old)]
                updated += 1
            elif res:
                errs.append(code)
    json.dump(kline, open(kpath, 'w'), ensure_ascii=False)
    log('kline', 'ok' if not errs else 'partial', f'更新{updated}/{len(codes)}只' + (f', 失败:{errs[:5]}' if errs else ''))

if __name__ == '__main__':
    try: collect_spot()
    except Exception as e: log('spot_prices', 'fail', repr(e)[:150])
    try: collect_kline()
    except Exception as e: log('kline', 'fail', repr(e)[:150])
    json.dump(run_log, open(os.path.join(DATA, 'run_log.json'), 'w'), ensure_ascii=False, indent=1)
    print('DONE')
