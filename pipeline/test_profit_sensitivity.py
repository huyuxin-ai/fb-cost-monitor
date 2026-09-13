#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验同伴敏感性结果的口径、唯一键和网站映射。"""

import json
import math
import os
import re


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIPE = os.path.join(ROOT, 'pipeline')


def expected_level(value: float) -> str:
    magnitude = abs(value)
    if magnitude >= 2:
        return '高'
    if magnitude >= 0.5:
        return '中'
    return '低'


def main() -> None:
    with open(os.path.join(PIPE, 'config.json'), encoding='utf-8') as f:
        config = json.load(f)
    with open(os.path.join(PIPE, 'profit_sensitivity.json'), encoding='utf-8') as f:
        doc = json.load(f)

    metadata = doc['metadata']
    rows = doc['items']
    assert metadata['scenario_price_change_pct'] == 20
    assert metadata['result_type'] == 'scenario'
    assert len(rows) == 25, f'同伴敏感性数据应为25条，实际{len(rows)}条'

    material_ids = set(config['meta']) | {row['id'] for row in config['unavailable']}
    pairs: set[tuple[str, str]] = set()
    source_rows: set[int] = set()

    for row in rows:
        pair = (row['material'], row['company'])
        assert pair not in pairs, f'公司×原材料组合重复: {pair}'
        pairs.add(pair)
        assert row['source_row'] not in source_rows, f'来源行重复: {row["source_row"]}'
        source_rows.add(row['source_row'])

        assert row['material'] in material_ids, f'未知原材料: {pair}'
        assert re.fullmatch(r'(?:\d{6}|HK\d{4,6})', row['company']), f'公司代码格式错误: {pair}'
        assert row['scenario_price_change_pct'] == 20, f'情景幅度不是20%: {pair}'
        assert row['baseline_year'] == metadata['baseline_year'], f'基准年份不一致: {pair}'
        assert math.isfinite(row['base_net_profit_yi']), f'基准净利润非数值: {pair}'
        assert row['base_net_profit_yi'] != 0, f'基准净利润不能为0: {pair}'
        for field in ('plus20_np_change_pct', 'minus20_np_change_pct', 'plus20_np_change_yi', 'minus20_np_change_yi'):
            assert math.isfinite(row[field]), f'{field}非有限数值: {pair}'
        assert math.isclose(
            row['plus20_np_change_pct'],
            -row['minus20_np_change_pct'],
            rel_tol=0,
            abs_tol=1e-9,
        ), f'±20%结果不对称: {pair}'
        assert math.isclose(
            row['plus20_np_change_yi'],
            row['base_net_profit_yi'] * row['plus20_np_change_pct'] / 100,
            rel_tol=0,
            abs_tol=1e-7,
        ), f'+20%利润金额与百分比不一致: {pair}'
        assert math.isclose(
            row['minus20_np_change_yi'],
            row['base_net_profit_yi'] * row['minus20_np_change_pct'] / 100,
            rel_tol=0,
            abs_tol=1e-7,
        ), f'-20%利润金额与百分比不一致: {pair}'
        assert row['level'] == expected_level(row['plus20_np_change_pct']), f'敏感等级与表内阈值不一致: {pair}'
        assert row['calculation_status'] in {'formula', 'hardcoded'}
        assert bool(row['formula']) == (row['calculation_status'] == 'formula')
        valid_flags = {
            'BASELINE_LOSS', 'CALC_NOTE_MATERIAL_MISMATCH',
            'LEVEL_INCONSISTENT_OR_MISSING', 'NOTE_RESULT_METHOD_CONFLICT',
            'CALCULATION_BASIS_INCONSISTENT', 'LARGE_SCENARIO_RESULT',
            'HARDCODED_RESULT',
        }
        assert set(row['quality_flags']) <= valid_flags, f'未知复核标记: {pair}'

        downstream_codes = {d['code'] for d in config['downstream'].get(row['material'], [])}
        assert row['company'] in downstream_codes, f'缺少可点击公司tag映射: {pair}'

    assert source_rows == set(range(2, 26)) | {200}, '工作簿来源行不完整'
    rows_by_source = {row['source_row']: row for row in rows}
    assert 'CALCULATION_BASIS_INCONSISTENT' in rows_by_source[2]['quality_flags']
    assert rows_by_source[7]['source_calculation_note'].startswith('维生素成本占比1.57%')
    assert '行业公开数据' in rows_by_source[200]['source_calculation_note']
    names_by_code: dict[str, set[str]] = {}
    for row in rows:
        names_by_code.setdefault(row['company'], set()).add(row['company_name'])
    assert all(len(names) == 1 for names in names_by_code.values()), '同一公司代码存在多个规范名称'
    print(f'同伴敏感性校验通过: {len(rows)}条 / {len({r["material"] for r in rows})}个品种 / {len({r["company"] for r in rows})}家公司')


if __name__ == '__main__':
    main()
