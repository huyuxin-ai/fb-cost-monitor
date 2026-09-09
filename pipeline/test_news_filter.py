#!/usr/bin/env python3
"""原材料新闻过滤的回归测试。"""

from __future__ import annotations

import json
import unittest
from datetime import datetime
from unittest.mock import patch

import collect_news

from news_filter import (
    BJT,
    build_public_feed,
    canonicalize_url,
    curate_news,
    load_news_config,
    normalize_news_item,
    parse_datetime,
    validate_public_feed,
)
from collect_news import parse_google_batch_response, parse_google_decode_params


NOW = datetime(2026, 9, 9, 20, 0, tzinfo=BJT)


class NewsFilterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.cfg = load_news_config()

    def raw(self, title: str, summary: str = "", **overrides) -> dict:
        value = {
            "title": title,
            "summary": summary,
            "source": "测试来源",
            "url": f"https://example.com/news/{abs(hash(title))}",
            "published_at": "2026-09-09 12:00",
            "fetched_at": "2026-09-09 12:05",
        }
        value.update(overrides)
        return value

    def accept(self, title: str, summary: str = "") -> dict:
        item = normalize_news_item(self.raw(title, summary), self.cfg, NOW, 7)
        self.assertIsNotNone(item, title)
        return item  # type: ignore[return-value]

    def reject(self, title: str, summary: str = "") -> None:
        self.assertIsNone(normalize_news_item(self.raw(title, summary), self.cfg, NOW, 7), title)

    def test_clear_raw_material_news_is_accepted(self) -> None:
        self.assertEqual(self.accept("白砂糖现货价格上涨")["material_ids"], ["SR"])
        self.assertEqual(self.accept("USDA 公布 WPC80 报价与供应情况")["material_ids"], ["WPC80"])
        self.assertEqual(set(self.accept("乳清蛋白供应收紧，价格走高")["material_ids"]), {"WPC34", "WPC80"})
        self.assertEqual(self.accept("原奶价格触底回暖")["material_ids"], ["RAW_MILK"])
        self.assertEqual(self.accept("秘鲁鳀鱼捕捞配额出炉")["material_ids"], ["ANCHOVY"])
        self.assertEqual(self.accept("PET瓶片价格上涨，饮料包装成本承压")["material_ids"], ["PR"])

    def test_longest_specific_alias_wins(self) -> None:
        self.assertEqual(self.accept("维生素B12原料价格上涨")["material_ids"], ["VB12"])
        self.assertEqual(self.accept("乳清蛋白80报价上涨")["material_ids"], ["WPC80"])
        self.assertEqual(self.accept("大豆油价格上涨")["material_ids"], ["Y"])
        self.assertEqual(self.accept("美国稀奶油价格上涨")["material_ids"], ["CREAM_DOM"])
        self.assertEqual(set(self.accept("乳清蛋白供应收紧")["material_ids"]), {"WPC34", "WPC80"})

    def test_broad_industry_and_lifestyle_noise_is_rejected(self) -> None:
        for title in (
            "食品饮料板块上涨",
            "玉米饼的家常做法",
            "维C怎么吃更好",
            "VC投资市场今年回暖",
            "PET-CT临床检查价格下调",
            "光伏玻璃价格继续下跌",
            "汽车用铝价格上涨",
            "某食品公司宣布股份回购",
            "玉米市场迎来新品发布",
            "Omega-3补充剂市场增长，心血管健康受关注",
            "维生素C市场规模扩大，护肤品牌加码",
            "核桃木市场价格上涨",
            "生猪住进智能楼，探索科技养殖新空间",
            "生猪供应压力叠加政策引导，养殖ETF重视投资机会",
            "某肉业公司业绩会：生猪养殖业务净利润亏损",
        ):
            with self.subTest(title=title):
                self.reject(title)

    def test_financial_story_requires_material_driver(self) -> None:
        self.reject("某公司半年报净利润上涨，食品业务增长")
        self.reject("金达威:上半年辅酶Q10销量同比上涨15%")
        item = self.accept("某公司半年报：白砂糖原料价格上涨推高成本")
        self.assertEqual(item["material_ids"], ["SR"])

    def test_stale_republished_market_items_are_rejected(self) -> None:
        self.reject("马来西亚棕榈油价格在3月11日上涨")
        self.reject("【MPOB 3月月报】棕榈油库存大降")
        self.assertEqual(self.accept("9月9日猪价止跌上涨")["material_ids"], ["LH"])

    def test_only_ambiguous_packaging_materials_require_context(self) -> None:
        self.assertEqual(self.accept("PTA现货价格上涨")["material_ids"], ["TA"])
        self.reject("沪铝价格上涨")
        self.assertEqual(self.accept("沪铝价格上涨，易拉罐包装成本承压")["material_ids"], ["AL"])
        self.assertEqual(self.accept("浆价继续下行")["material_ids"], ["SP"])

    def test_common_english_inflections_are_accepted(self) -> None:
        self.assertEqual(self.accept("Corn prices rise as inventories fall")["material_ids"], ["C"])
        self.assertEqual(self.accept("Palm oil imports climb on stronger demand")["material_ids"], ["P"])

    def test_url_normalization_and_safety(self) -> None:
        self.assertEqual(
            canonicalize_url("https://Example.com:443/a//b?utm_source=x&id=2#top"),
            "https://example.com/a/b?id=2",
        )
        self.assertIsNone(canonicalize_url("http://127.0.0.1/private"))
        self.assertIsNone(canonicalize_url("http://example.com:bad/news"))
        self.assertEqual(
            canonicalize_url("https://example.com/news?b=2&a=1"),
            "https://example.com/news?a=1&b=2",
        )
        self.assertEqual(
            canonicalize_url("http://futures.eastmoney.com/a/123.html"),
            "https://futures.eastmoney.com/a/123.html",
        )
        self.assertEqual(
            canonicalize_url("https://[2606:4700:4700::1111]/news"),
            "https://[2606:4700:4700::1111]/news",
        )
        self.assertEqual(parse_datetime("20260909").date().isoformat(), "2026-09-09")

    def test_bad_dates_are_rejected(self) -> None:
        for value in ("", "not-a-date", "2026-09-10 01:00", "2026-08-01 12:00"):
            with self.subTest(value=value):
                self.assertIsNone(
                    normalize_news_item(self.raw("白糖价格上涨", published_at=value), self.cfg, NOW, 7)
                )

    def test_url_and_same_day_title_are_deduplicated(self) -> None:
        first = self.raw("豆粕现货价格上涨", url="https://example.com/a", summary="较长的市场供需分析")
        duplicate_url = self.raw("豆粕供应偏紧", url="https://example.com/a")
        duplicate_title = self.raw("豆粕现货价格上涨", url="https://example.com/b")
        unique = self.raw("生猪价格下跌", url="https://example.com/c")
        rows, _ = curate_news([first, duplicate_url, duplicate_title, unique], self.cfg, NOW)
        self.assertEqual(len(rows), 2)
        self.assertEqual(len({row["url"] for row in rows}), 2)

    def test_direct_link_beats_google_redirect_for_duplicate_title(self) -> None:
        google = self.raw(
            "豆粕现货价格上涨",
            url="https://news.google.com/rss/articles/abc",
            summary="很长的聚合摘要" * 10,
            fetched_at="2026-09-09 12:01",
        )
        direct = self.raw(
            "豆粕现货价格上涨",
            url="https://example.com/direct",
            summary="直接来源",
            fetched_at="2026-09-09 12:05",
        )
        rows, _ = curate_news([google, direct], self.cfg, NOW)
        self.assertEqual(rows[0]["url"], "https://example.com/direct")
        self.assertEqual(rows[0]["fetched_at"], "2026-09-09T12:01+08:00")

    def test_highlight_tags_do_not_break_chinese_words(self) -> None:
        item = normalize_news_item(
            self.raw("生猪价<em>格</em>上涨"),
            self.cfg,
            NOW,
            7,
        )
        self.assertIsNotNone(item)
        self.assertEqual(item["title"], "生猪价格上涨")
        self.assertEqual(item["type"], "价格行情")

    def test_google_decoder_response_parsers(self) -> None:
        article_id = "ABC_123"
        html = f'<div data-n-a-id="{article_id}" data-n-a-sg="signature" data-n-a-ts="123456"></div>'
        self.assertEqual(parse_google_decode_params(html, article_id), (123456, "signature"))
        inner = json.dumps(["garturlres", "https://example.com/article", 1])
        payload = ")]}'\n\n" + json.dumps([["wrb.fr", "Fbv4je", inner, None]])
        self.assertEqual(parse_google_batch_response(payload), ["https://example.com/article"])

    def test_google_decoder_keeps_each_title_url_pair(self) -> None:
        originals = [
            "https://news.google.com/rss/articles/ARTICLE_A?oc=5",
            "https://news.google.com/rss/articles/ARTICLE_B?oc=5",
        ]

        fetch_calls: list[str] = []

        def fake_fetch(url: str, _timeout: int, attempts: int = 2) -> str:
            fetch_calls.append(url)
            article_id = url.split("/articles/", 1)[1].split("?", 1)[0]
            return f'<div data-n-a-id="{article_id}" data-n-a-sg="sig-{article_id}" data-n-a-ts="123456"></div>'

        def fake_post(_url: str, fields: dict[str, str], _timeout: int, attempts: int = 2) -> str:
            request = json.loads(fields["f.req"])
            self.assertEqual(len(request[0]), 1)
            inner = json.loads(request[0][0][1])
            article_id = inner[2]
            target = f"https://media.example.com/{article_id.lower()}"
            result = json.dumps(["garturlres", target, 1])
            return ")]}'\n\n" + json.dumps([["wrb.fr", "Fbv4je", result, None]])

        with patch.object(collect_news, "fetch_text", side_effect=fake_fetch), patch.object(
            collect_news, "post_form", side_effect=fake_post
        ):
            resolved, unresolved = collect_news.resolve_google_news_urls(originals + [originals[0]], self.cfg)

        self.assertEqual(unresolved, 0)
        self.assertEqual(resolved[originals[0]], "https://media.example.com/article_a")
        self.assertEqual(resolved[originals[1]], "https://media.example.com/article_b")
        self.assertEqual(len(fetch_calls), 2)

    def test_google_decoder_fails_closed_and_stops_on_rate_limit(self) -> None:
        originals = [
            "https://news.google.com/rss/articles/ARTICLE_A?oc=5",
            "https://news.google.com/rss/articles/ARTICLE_B?oc=5",
        ]
        with patch.object(
            collect_news, "fetch_text", side_effect=RuntimeError("HTTP Error 429: Too Many Requests")
        ) as fetch_mock, patch.object(collect_news, "post_form") as post_mock:
            resolved, unresolved = collect_news.resolve_google_news_urls(originals, self.cfg)
        self.assertEqual(resolved, {})
        self.assertEqual(unresolved, 2)
        self.assertEqual(fetch_mock.call_count, 1)
        post_mock.assert_not_called()

        html = '<div data-n-a-id="ARTICLE_A" data-n-a-sg="sig" data-n-a-ts="123456"></div>'
        first = json.dumps(["garturlres", "https://example.com/one", 1])
        second = json.dumps(["garturlres", "https://example.com/two", 1])
        ambiguous = ")]}'\n\n" + json.dumps(
            [["wrb.fr", "Fbv4je", first, None], ["wrb.fr", "Fbv4je", second, None]]
        )
        with patch.object(collect_news, "fetch_text", return_value=html), patch.object(
            collect_news, "post_form", return_value=ambiguous
        ):
            resolved, unresolved = collect_news.resolve_google_news_urls([originals[0]], self.cfg)
        self.assertEqual(resolved, {})
        self.assertEqual(unresolved, 1)

    def test_public_feed_metadata_is_validated(self) -> None:
        rows, _ = curate_news([self.raw("白糖现货价格上涨")], self.cfg, NOW)
        feed = build_public_feed(rows, self.cfg, NOW)
        validate_public_feed(feed, self.cfg, set(self.cfg["materials"]), NOW)
        broken = {**feed, "item_count": 99}
        with self.assertRaises(ValueError):
            validate_public_feed(broken, self.cfg, set(self.cfg["materials"]), NOW)

    def test_google_wrapper_stays_out_of_public_feed(self) -> None:
        google = self.raw(
            "豆粕现货价格上涨",
            url="https://news.google.com/rss/articles/ARTICLE_A?oc=5",
        )
        rows, _ = curate_news([google], self.cfg, NOW)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["summary"], "")
        feed = build_public_feed(rows, self.cfg, NOW)
        self.assertEqual(feed["items"], [])
        self.assertEqual(feed["item_count"], 0)
        validate_public_feed(feed, self.cfg, set(self.cfg["materials"]), NOW)


if __name__ == "__main__":
    unittest.main()
