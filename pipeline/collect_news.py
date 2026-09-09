#!/usr/bin/env python3
"""采集与现有原材料相关的公开新闻，生成网站可轮询的 news.json。

只使用公开网页/RSS，不需要密钥，不连接老师服务器，不执行外部代码。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

from news_filter import (
    BJT,
    _title_key,
    build_public_feed,
    canonicalize_url,
    clean_text,
    curate_news,
    is_google_news_url,
    load_news_config,
    normalize_news_item,
    validate_public_feed,
    write_json_atomic,
)


ROOT = Path(__file__).resolve().parent.parent
PIPE = ROOT / "pipeline"
DEFAULT_ARCHIVE = PIPE / "news_archive.json"
DEFAULT_FEED = ROOT / "public" / "data" / "news.json"
APP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
}
MAX_RESPONSE_BYTES = 8 * 1024 * 1024


def fetch_text(url: str, timeout: int, attempts: int = 2) -> str:
    """仅请求代码内配置的公开来源，限制响应大小并短暂重试。"""
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers=APP_HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as response:
                payload = response.read(MAX_RESPONSE_BYTES + 1)
                if len(payload) > MAX_RESPONSE_BYTES:
                    raise ValueError("响应超过 8 MB 限制")
                charset = response.headers.get_content_charset() or "utf-8"
                return payload.decode(charset, errors="replace").lstrip("\ufeff")
        except Exception as exc:  # 网络源失败由上层汇总，不会覆盖旧数据
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(str(last_error) if last_error else "未知网络错误")


def post_form(url: str, fields: dict[str, str], timeout: int, attempts: int = 2) -> str:
    body = urllib.parse.urlencode(fields).encode("utf-8")
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            headers = {
                **APP_HEADERS,
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "Referer": "https://news.google.com/",
            }
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as response:
                payload = response.read(MAX_RESPONSE_BYTES + 1)
                if len(payload) > MAX_RESPONSE_BYTES:
                    raise ValueError("响应超过 8 MB 限制")
                return payload.decode("utf-8", errors="replace")
        except Exception as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(str(last_error) if last_error else "未知网络错误")


def parse_google_decode_params(payload: str, article_id: str) -> tuple[int, str]:
    tags = re.findall(r"<div\b[^>]*\bdata-n-a-sg=\"[^\"]+\"[^>]*>", payload, flags=re.I)
    for tag in tags:
        attrs = dict(re.findall(r"(data-n-a-(?:id|sg|ts))=\"([^\"]*)\"", tag, flags=re.I))
        if attrs.get("data-n-a-id") not in {None, article_id}:
            continue
        signature = attrs.get("data-n-a-sg")
        timestamp = attrs.get("data-n-a-ts")
        if signature and timestamp and timestamp.isdigit():
            return int(timestamp), signature
    raise ValueError("Google News 跳转参数缺失")


def parse_google_batch_response(payload: str) -> list[str]:
    parts = payload.split("\n\n", 1)
    if len(parts) != 2:
        raise ValueError("Google News 跳转响应格式已变更")
    rows = json.loads(parts[1])
    decoded: list[str] = []
    for row in rows:
        if not isinstance(row, list) or len(row) < 3 or row[0] != "wrb.fr" or row[1] != "Fbv4je" or not row[2]:
            continue
        inner = json.loads(row[2])
        if isinstance(inner, list) and len(inner) >= 2 and inner[0] == "garturlres":
            decoded.append(inner[1])
    return decoded


def resolve_google_news_urls(urls: list[str], cfg: dict) -> tuple[dict[str, str], int]:
    """仅对已通过相关性初筛的 Google RSS 链接解析媒体原文；解析不了就不发布聚合跳转。"""
    unique_urls = list(dict.fromkeys(url for url in urls if is_google_news_url(url)))
    if not unique_urls:
        return {}, 0
    timeout = int(cfg["timeout_seconds"])

    def get_params(url: str) -> tuple[str, str, int, str]:
        path = urllib.parse.urlsplit(url).path
        article_id = path.rstrip("/").split("/")[-1]
        if not article_id or not re.fullmatch(r"[A-Za-z0-9_-]+", article_id):
            raise ValueError("Google News 文章编号无效")
        page_url = (
            f"https://news.google.com/articles/{article_id}"
            "?hl=en-US&gl=US&ceid=US:en"
        )
        payload = fetch_text(page_url, timeout, attempts=3)
        timestamp, signature = parse_google_decode_params(payload, article_id)
        return url, article_id, timestamp, signature

    params: list[tuple[str, str, int, str]] = []
    param_errors: list[str] = []
    unresolved = 0
    remaining_urls = unique_urls
    # 先用一条做探测；如果已被 429 限流，就立即放弃本轮，
    # 避免对后续几十条重复请求。
    try:
        params.append(get_params(unique_urls[0]))
        remaining_urls = unique_urls[1:]
    except Exception as exc:
        message = clean_text(exc, 180)
        if "429" in message:
            print(f"[WARN] Google News 暂时限流，本轮跳过 {len(unique_urls)} 条聚合链接", file=sys.stderr)
            return {}, len(unique_urls)
        unresolved += 1
        param_errors.append(message)
        remaining_urls = unique_urls[1:]
    # Google 会对过多并发请求限流，这里只保留少量并发。
    if remaining_urls:
        with ThreadPoolExecutor(max_workers=min(3, len(remaining_urls))) as pool:
            futures = {pool.submit(get_params, url): url for url in remaining_urls}
            for future in as_completed(futures):
                try:
                    params.append(future.result())
                except Exception as exc:
                    unresolved += 1
                    if len(param_errors) < 3:
                        param_errors.append(clean_text(exc, 180))

    if param_errors:
        print(
            f"[WARN] Google News 跳转参数获取失败 {unresolved} 条（示例: {'; '.join(param_errors)}）",
            file=sys.stderr,
        )

    params.sort(key=lambda row: row[0])
    endpoint = "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je"

    def decode_one(row: tuple[str, str, int, str]) -> tuple[str, str]:
        original, article_id, timestamp, signature = row
        inner = [
            "garturlreq",
            [["X", "X", ["X", "X"], None, None, 1, 1, "US:en", None, 1, None, None, None, None, None, 0, 1],
             "X", "X", 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0],
            article_id,
            timestamp,
            signature,
        ]
        # batchexecute 的多条返回顺序不可依赖。每次只解析一条，
        # 才能保证新闻标题与媒体原文链接一一对应。
        request_payload = [[[
            "Fbv4je",
            json.dumps(inner, separators=(",", ":")),
            None,
            "generic",
        ]]]
        response = post_form(
            endpoint,
            {"f.req": json.dumps(request_payload, separators=(",", ":"))},
            timeout,
            attempts=3,
        )
        targets = parse_google_batch_response(response)
        if len(targets) != 1:
            raise ValueError("Google News 单条解析返回数量异常")
        canonical = canonicalize_url(targets[0])
        if not canonical or is_google_news_url(canonical):
            raise ValueError("Google News 未返回有效的媒体原文链接")
        return original, canonical

    resolved: dict[str, str] = {}
    decode_errors: list[str] = []
    remaining_params = params
    if params:
        try:
            original, target = decode_one(params[0])
            resolved[original] = target
            remaining_params = params[1:]
        except Exception as exc:
            message = clean_text(exc, 180)
            if "429" in message:
                print(f"[WARN] Google News 原文解析暂时限流，本轮跳过 {len(params)} 条", file=sys.stderr)
                return resolved, unresolved + len(params)
            unresolved += 1
            decode_errors.append(message)
            remaining_params = params[1:]
    if remaining_params:
        with ThreadPoolExecutor(max_workers=min(3, len(remaining_params))) as pool:
            futures = {pool.submit(decode_one, row): row[0] for row in remaining_params}
            for future in as_completed(futures):
                try:
                    original, target = future.result()
                    resolved[original] = target
                except Exception as exc:
                    unresolved += 1
                    if len(decode_errors) < 3:
                        decode_errors.append(clean_text(exc, 180))
    if decode_errors:
        print(
            f"[WARN] Google News 原文解析失败 {unresolved} 条（示例: {'; '.join(decode_errors)}）",
            file=sys.stderr,
        )
    return resolved, unresolved


def _run_urls(urls: list[str], timeout: int, parser) -> list[dict]:
    results: list[dict] = []
    errors: list[str] = []
    succeeded = 0
    for url in urls:
        try:
            results.extend(parser(fetch_text(url, timeout), url))
            succeeded += 1
        except Exception as exc:
            errors.append(f"{url}: {exc}")
    if not succeeded and errors:
        raise RuntimeError("; ".join(errors))
    if errors:
        print(f"[WARN] 部分地址失败: {'; '.join(errors)}", file=sys.stderr)
    return results


def fetch_sina(cfg: dict) -> list[dict]:
    source_cfg = cfg["sources"]["sina_finance"]
    if not source_cfg.get("enabled"):
        return []

    def parse(payload: str, _url: str) -> list[dict]:
        data = json.loads(payload)
        rows = data.get("result", {}).get("data", [])
        if not isinstance(rows, list):
            raise ValueError("新浪返回结构已变更")
        return [
            {
                "title": row.get("title"),
                "summary": row.get("intro") or row.get("summary"),
                "url": row.get("url"),
                "source": "新浪财经",
                "published_at": row.get("ctime"),
            }
            for row in rows
        ]

    return _run_urls(source_cfg.get("urls", []), int(cfg["timeout_seconds"]), parse)


def _eastmoney_url(query: str) -> str:
    param = {
        "uid": "",
        "keyword": query,
        "type": ["cmsArticleWebOld"],
        "client": "web",
        "clientType": "web",
        "clientVersion": "curr",
        "param": {"cmsArticleWebOld": {"searchScope": "default", "sort": "time", "pageIndex": 1, "pageSize": 12}},
    }
    encoded = urllib.parse.quote(json.dumps(param, ensure_ascii=False, separators=(",", ":")))
    return f"https://search-api-web.eastmoney.com/search/jsonp?cb=jQuery&param={encoded}"


def fetch_eastmoney(cfg: dict) -> list[dict]:
    source_cfg = cfg["sources"]["eastmoney"]
    if not source_cfg.get("enabled"):
        return []

    def parse(payload: str, _url: str) -> list[dict]:
        match = re.search(r"^[^(]*\((.*)\)\s*;?\s*$", payload, flags=re.S)
        if not match:
            raise ValueError("东方财富 JSONP 格式已变更")
        data = json.loads(match.group(1))
        rows = data.get("result", {}).get("cmsArticleWebOld", [])
        if not isinstance(rows, list):
            raise ValueError("东方财富返回结构已变更")
        return [
            {
                "title": row.get("title"),
                "summary": row.get("content"),
                "url": row.get("url"),
                "source": clean_text(row.get("mediaName")) or "东方财富",
                "published_at": row.get("date"),
            }
            for row in rows
        ]

    urls = [_eastmoney_url(query) for query in source_cfg.get("queries", [])]
    return _run_urls(urls, int(cfg["timeout_seconds"]), parse)


def _google_news_url(query: str) -> str:
    params = urllib.parse.urlencode({"q": query, "hl": "zh-CN", "gl": "CN", "ceid": "CN:zh-Hans"})
    return f"https://news.google.com/rss/search?{params}"


def fetch_google_news(cfg: dict) -> list[dict]:
    source_cfg = cfg["sources"]["google_news"]
    if not source_cfg.get("enabled"):
        return []

    def parse(payload: str, _url: str) -> list[dict]:
        root = ET.fromstring(payload)
        results = []
        for item in root.findall("./channel/item"):
            source = clean_text(item.findtext("source")) or "Google News"
            title = clean_text(item.findtext("title"))
            suffix = f" - {source}"
            if title.endswith(suffix):
                title = title[: -len(suffix)].rstrip()
            results.append(
                {
                    "title": title,
                    # Google RSS 的 description 只是标题链接，不是正文摘要。
                    "summary": "",
                    "url": item.findtext("link"),
                    "source": source,
                    "published_at": item.findtext("pubDate"),
                }
            )
        return results

    urls = [_google_news_url(query) for query in source_cfg.get("queries", [])]
    return _run_urls(urls, int(cfg["timeout_seconds"]), parse)


def fetch_cctv(cfg: dict) -> list[dict]:
    source_cfg = cfg["sources"]["cctv"]
    if not source_cfg.get("enabled"):
        return []

    def parse(payload: str, page_url: str) -> list[dict]:
        results = []
        pattern = re.compile(r"<a\b[^>]*\bhref\s*=\s*['\"](https?://[^'\"]*cctv\.com/(\d{4})/(\d{2})/(\d{2})/[^'\"]+)['\"][^>]*>(.*?)</a>", re.I | re.S)
        source = "央视财经" if "jingji.cctv.com" in page_url else "央视新闻"
        for match in pattern.finditer(payload):
            title = clean_text(match.group(5))
            if len(title) < 6:
                continue
            results.append(
                {
                    "title": title,
                    "summary": "",
                    "url": match.group(1),
                    "source": source,
                    "published_at": f"{match.group(2)}-{match.group(3)}-{match.group(4)}",
                }
            )
        return results

    return _run_urls(source_cfg.get("urls", []), int(cfg["timeout_seconds"]), parse)


def _decode_json_string(value: str) -> str:
    try:
        return json.loads(f'"{value}"')
    except json.JSONDecodeError:
        return value.replace("\\n", " ").replace('\\"', '"')


def fetch_cls(cfg: dict) -> list[dict]:
    source_cfg = cfg["sources"]["cls"]
    if not source_cfg.get("enabled"):
        return []
    payload = fetch_text(source_cfg["url"], int(cfg["timeout_seconds"]))
    results = []
    # 页面内嵌的快讯对象中 id/content/ctime 彼此距离较近。
    pattern = re.compile(
        r'"id"\s*:\s*(\d+).{0,2500}?"content"\s*:\s*"((?:\\.|[^"\\])*)".{0,2500}?"ctime"\s*:\s*(\d+)',
        re.S,
    )
    for match in pattern.finditer(payload):
        content = clean_text(_decode_json_string(match.group(2)))
        if not content:
            continue
        results.append(
            {
                "title": content[:120],
                "summary": content,
                "url": f"https://www.cls.cn/detail/{match.group(1)}",
                "source": "财联社",
                "published_at": match.group(3),
            }
        )
    return results


def collect_from_sources(cfg: dict) -> tuple[list[dict], dict[str, int], dict[str, str]]:
    providers = {
        "sina_finance": fetch_sina,
        "eastmoney": fetch_eastmoney,
        "google_news": fetch_google_news,
        "cctv": fetch_cctv,
        "cls": fetch_cls,
    }
    enabled = {name: fn for name, fn in providers.items() if cfg["sources"].get(name, {}).get("enabled")}
    rows: list[dict] = []
    counts: dict[str, int] = {}
    errors: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=min(5, max(1, len(enabled)))) as pool:
        future_names = {pool.submit(fn, cfg): name for name, fn in enabled.items()}
        for future in as_completed(future_names):
            name = future_names[future]
            try:
                batch = future.result()
                rows.extend(batch)
                counts[name] = len(batch)
                if not batch:
                    errors[name] = "页面可访问，但未解析到任何新闻（可能是页面结构已变化）"
                    print(f"[WARN] {name}: {errors[name]}", file=sys.stderr)
            except Exception as exc:
                errors[name] = clean_text(exc, 300)
                print(f"[WARN] {name} 抓取失败: {errors[name]}", file=sys.stderr)
    if enabled and len(errors) == len(enabled):
        raise RuntimeError("所有新闻源均抓取失败，已保留上一版数据")
    return rows, counts, errors


def load_material_ids() -> set[str]:
    with open(PIPE / "config.json", encoding="utf-8") as handle:
        cfg = json.load(handle)
    return set(cfg.get("meta", {})) | {row["id"] for row in cfg.get("unavailable", [])}


def load_archive(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, list):
        raise ValueError(f"{path} 必须是新闻数组")
    return value


def update_news(archive_path: Path, feed_path: Path, no_fetch: bool = False) -> dict:
    cfg = load_news_config()
    now = datetime.now(BJT)
    valid_material_ids = load_material_ids()
    old_archive, old_stats = curate_news(load_archive(archive_path), cfg, now)
    google_unresolved = 0

    # 将历史中的 Google 聚合跳转升级为媒体原文；日常运行后归档里只保留直链。
    if not no_fetch:
        old_google_urls = [item["url"] for item in old_archive if is_google_news_url(item["url"])]
        old_resolved, unresolved = resolve_google_news_urls(old_google_urls, cfg)
        google_unresolved += unresolved
        migrated_old: list[dict] = []
        for item in old_archive:
            if not is_google_news_url(item["url"]):
                migrated_old.append(item)
                continue
            target = old_resolved.get(item["url"])
            if not target:
                # 保留在后台归档中等待下轮重试；build_public_feed 会确保
                # 这种聚合跳转绝不会出现在用户看到的 news.json 中。
                migrated_old.append(item)
                continue
            migrated = normalize_news_item({**item, "url": target}, cfg, now, int(cfg["archive_lookback_days"]))
            if migrated:
                migrated_old.append(migrated)
        old_archive, _ = curate_news(migrated_old, cfg, now)

    raw_rows: list[dict] = []
    source_counts: dict[str, int] = {}
    source_errors: dict[str, str] = {}
    if not no_fetch:
        raw_rows, source_counts, source_errors = collect_from_sources(cfg)

    provisional: list[dict] = []
    for raw in raw_rows:
        raw = {**raw, "fetched_at": now.isoformat(timespec="minutes")}
        item = normalize_news_item(raw, cfg, now, int(cfg["fetch_lookback_days"]))
        if item:
            provisional.append(item)

    known_titles_with_resolution_path = {_title_key(item) for item in old_archive}
    known_titles_with_resolution_path.update(
        _title_key(item) for item in provisional if not is_google_news_url(item["url"])
    )
    google_candidates = [
        item
        for item in provisional
        if is_google_news_url(item["url"])
        and _title_key(item) not in known_titles_with_resolution_path
    ]
    fresh_resolved, unresolved = resolve_google_news_urls([item["url"] for item in google_candidates], cfg)
    google_unresolved += unresolved
    accepted_fresh: list[dict] = [item for item in provisional if not is_google_news_url(item["url"])]
    for item in google_candidates:
        target = fresh_resolved.get(item["url"])
        if not target:
            # 暂存聚合链接用于下次重试，不发布到网页。
            accepted_fresh.append(item)
            continue
        resolved_item = normalize_news_item({**item, "url": target}, cfg, now, int(cfg["fetch_lookback_days"]))
        if resolved_item:
            accepted_fresh.append(resolved_item)

    curated, merged_stats = curate_news(old_archive + accepted_fresh, cfg, now)
    # 防止配置中已删除的原材料通过历史记录重新出现。
    curated = [item for item in curated if set(item["material_ids"]) <= valid_material_ids]
    feed = build_public_feed(curated, cfg, now)
    validate_public_feed(feed, cfg, valid_material_ids)
    write_json_atomic(archive_path, curated)
    write_json_atomic(feed_path, feed)
    old_title_keys = {_title_key(item) for item in old_archive}
    new_relevant = sum(1 for item in curated if _title_key(item) not in old_title_keys)
    return {
        "run_at": now.isoformat(timespec="minutes"),
        "fetched": len(raw_rows),
        "new_relevant": new_relevant,
        "archive_items": len(curated),
        "public_items": feed["item_count"],
        "source_counts": source_counts,
        "failed_sources": sorted(source_errors),
        "google_links_unresolved": google_unresolved,
        "old_archive": old_stats,
        "merged": merged_stats,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="更新原材料相关新闻")
    parser.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE)
    parser.add_argument("--feed", type=Path, default=DEFAULT_FEED)
    parser.add_argument("--no-fetch", action="store_true", help="只清洗现有归档，不访问网络")
    parser.add_argument("--validate-only", action="store_true", help="只验证现有 news.json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.validate_only:
            cfg = load_news_config()
            with open(args.feed, encoding="utf-8") as handle:
                feed = json.load(handle)
            validate_public_feed(feed, cfg, load_material_ids())
            print(json.dumps({"ok": True, "public_items": len(feed["items"])}, ensure_ascii=False))
            return 0
        stats = update_news(args.archive, args.feed, args.no_fetch)
        print(json.dumps(stats, ensure_ascii=False, sort_keys=True))
        return 0
    except Exception as exc:
        print(f"ERROR: {clean_text(exc, 500)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
