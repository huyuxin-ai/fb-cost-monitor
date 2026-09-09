#!/usr/bin/env python3
"""原材料新闻的规范化、相关性筛选与去重。仅使用 Python 标准库。"""

from __future__ import annotations

import hashlib
import html
import ipaddress
import json
import os
import re
import tempfile
import unicodedata
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


PIPE = Path(__file__).resolve().parent
CONFIG_PATH = PIPE / "news_config.json"
BJT = timezone(timedelta(hours=8))
TRACKING_PARAMS = {
    "spm", "from", "ref", "source", "src", "track", "tracking",
    "cid", "node_id", "oid", "vt", "wm", "scm", "finpagefr",
}
HTTPS_UPGRADE_HOSTS = {
    "futures.eastmoney.com",
    "stock.eastmoney.com",
    "finance.eastmoney.com",
    "m.10jqka.com.cn",
    "www.shangbaoindonesia.com",
}
CANONICAL_HOSTS = {
    # 东方财富期货旧入口会先降级跳转到 HTTP，再回到 HTTPS。
    "futures.eastmoney.com": "finance.eastmoney.com",
}
LOWER_QUALITY_AGGREGATOR_HOSTS = {"www.fxbaogao.com"}


def load_news_config(path: Path | None = None) -> dict:
    with open(path or CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def clean_text(value: object, limit: int | None = None) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"</?(?:p|div|li|br|tr|h[1-6])\b[^>]*>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit] if limit else text


def normalized_text(value: object) -> str:
    return clean_text(value).lower()


def _contains(text: str, term: str) -> bool:
    term = normalized_text(term)
    if not term:
        return False
    if re.fullmatch(r"[a-z0-9][a-z0-9 .+/_-]*", term):
        pattern = re.escape(term).replace(r"\ ", r"\s+")
        return bool(re.search(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", text))
    return term in text


def _first_hits(text: str, terms: list[str]) -> list[str]:
    return [term for term in terms if _contains(text, term)]


def _hit_spans(text: str, terms: list[str]) -> list[tuple[str, int, int]]:
    """返回命中位置，用于避免“大豆油”同时命中“大豆”等包含关系。"""
    hits: list[tuple[str, int, int]] = []
    for original in terms:
        term = normalized_text(original)
        if not term:
            continue
        if re.fullmatch(r"[a-z0-9][a-z0-9 .+/_-]*", term):
            pattern = re.escape(term).replace(r"\ ", r"\s+")
            matches = re.finditer(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", text)
        else:
            matches = re.finditer(re.escape(term), text)
        hits.extend((original, match.start(), match.end()) for match in matches)
    return hits


def canonicalize_url(value: object) -> str | None:
    raw = clean_text(value, 2000)
    try:
        parts = urlsplit(raw)
    except ValueError:
        return None
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        return None
    if parts.username or parts.password:
        return None
    host = parts.hostname.lower().rstrip(".")
    if host == "localhost" or host.endswith(".local"):
        return None
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return None
    except ValueError:
        pass
    try:
        port = parts.port
    except ValueError:
        return None
    scheme = parts.scheme.lower()
    if scheme == "http" and host in HTTPS_UPGRADE_HOSTS:
        scheme = "https"
        if port == 80:
            port = None
    host = CANONICAL_HOSTS.get(host, host)
    host_for_netloc = f"[{host}]" if ":" in host else host
    netloc = host_for_netloc
    if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        netloc = f"{host_for_netloc}:{port}"
    kept_query = []
    for key, value in sorted(parse_qsl(parts.query, keep_blank_values=True)):
        low = key.lower()
        if low.startswith("utm_") or low in TRACKING_PARAMS:
            continue
        kept_query.append((key, value))
    path = re.sub(r"/{2,}", "/", parts.path or "/")
    return urlunsplit((scheme, netloc, path, urlencode(kept_query), ""))


def is_google_news_url(value: object) -> bool:
    """Google News 聚合跳转可留在后台待重试，但不能对客户发布。"""
    url = canonicalize_url(value)
    if not url:
        return False
    host = (urlsplit(url).hostname or "").lower()
    return host == "news.google.com" or host.endswith(".news.google.com")


def parse_datetime(value: object) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime.combine(value, time.min, tzinfo=BJT)
    elif isinstance(value, str) and re.fullmatch(r"\d{8}", value.strip()):
        try:
            parsed = datetime.strptime(value.strip(), "%Y%m%d").replace(tzinfo=BJT)
        except ValueError:
            return None
    elif isinstance(value, (int, float)) or (isinstance(value, str) and value.strip().isdigit()):
        number = float(value)
        if number > 10_000_000_000:
            number /= 1000
        try:
            parsed = datetime.fromtimestamp(number, tz=BJT)
        except (OSError, OverflowError, ValueError):
            return None
    else:
        raw = clean_text(value)
        parsed = None
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            pass
        if parsed is None:
            try:
                parsed = parsedate_to_datetime(raw)
            except (TypeError, ValueError, OverflowError):
                pass
        if parsed is None:
            for fmt in (
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%Y/%m/%d %H:%M:%S",
                "%Y/%m/%d %H:%M",
                "%Y-%m-%d",
                "%Y/%m/%d",
            ):
                try:
                    parsed = datetime.strptime(raw, fmt)
                    break
                except ValueError:
                    continue
        if parsed is None:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=BJT)
    return parsed.astimezone(BJT)


def title_has_stale_event_date(title: str, published: datetime) -> bool:
    """拦截被搜索源当成新闻重新发布的过期行情，例如 9 月抓到“3月11日价格”。"""
    text = normalized_text(title)
    exact_dates = re.findall(r"(?<!\d)(1[0-2]|0?[1-9])\s*月\s*(3[01]|[12]?\d)\s*日", text)
    if exact_dates:
        distances = []
        for month_text, day_text in exact_dates:
            for year in (published.year - 1, published.year, published.year + 1):
                try:
                    candidate = datetime(year, int(month_text), int(day_text), tzinfo=BJT)
                except ValueError:
                    continue
                distances.append(abs((candidate.date() - published.date()).days))
        return bool(distances) and min(distances) > 7

    mentioned_months = re.findall(r"(?<!\d)(1[0-2]|0?[1-9])\s*月(?!\s*(?:3[01]|[12]?\d)\s*日|\s*个)", text)
    for month_text in mentioned_months:
        month = int(month_text)
        distance = min((published.month - month) % 12, (month - published.month) % 12)
        if distance > 1:
            return True
    return False


def url_has_conflicting_date(url: str, published: datetime) -> bool:
    """拦截搜索源把旧文当成当天新闻的情况。

    例如 published_at 是 9 月 8 日，但原文路径明确写着 2026-04-30。
    允许 14 天误差，兼容专题页、时区和少量后续编辑。
    """
    path = urlsplit(url).path
    matches = re.findall(r"(?<!\d)(20\d{2})[-_/]?([01]\d)[-_/]?([0-3]\d)", path)
    candidates: list[date] = []
    for year_text, month_text, day_text in matches:
        try:
            candidates.append(date(int(year_text), int(month_text), int(day_text)))
        except ValueError:
            continue
    return bool(candidates) and min(abs((candidate - published.date()).days) for candidate in candidates) > 14


def match_materials(title: str, summary: str, cfg: dict) -> tuple[list[str], list[str], int]:
    title_norm = normalized_text(title)
    summary_norm = normalized_text(summary)
    text = f"{title_norm} {summary_norm}".strip()
    if (
        not text
        or _first_hits(text, cfg["excluded_terms"])
        or _first_hits(text, cfg.get("strong_financial_excluded_terms", []))
    ):
        return [], [], 0

    impact_title = _first_hits(title_norm, cfg["impact_terms"])
    impact_summary = _first_hits(summary_norm, cfg["impact_terms"])
    if not impact_title and not impact_summary:
        return [], [], 0

    core_hits = _first_hits(text, cfg["core_impact_terms"])
    # “食品/农业/市场”类宽泛表述不足以入选，必须有价格、供需、产能、进出口等实质影响。
    if not core_hits:
        return [], [], 0
    if _first_hits(text, cfg["financial_noise_terms"]) and not _first_hits(text, cfg["fundamental_impact_terms"]):
        return [], [], 0

    chain_context = bool(_first_hits(text, cfg["chain_context_terms"]))
    chain_required = set(cfg["chain_context_required"])
    title_candidates: dict[str, list[tuple[str, int, int]]] = {
        material_id: _hit_spans(title_norm, aliases)
        for material_id, aliases in cfg["materials"].items()
    }
    # 最长且更具体的别名优先：“维生素B12”不再同时归到 B1，“大豆油”不再归到大豆。
    all_title_hits = [
        (material_id, term, start, end)
        for material_id, hits in title_candidates.items()
        for term, start, end in hits
    ]
    for material_id, hits in list(title_candidates.items()):
        title_candidates[material_id] = [
            hit
            for hit in hits
            if not any(
                other_id != material_id
                and other_start <= hit[1]
                and other_end >= hit[2]
                and (other_end - other_start) > (hit[2] - hit[1])
                for other_id, _other_term, other_start, other_end in all_title_hits
            )
        ]

    material_ids: list[str] = []
    matched_keywords: list[str] = []
    summary_material_hit = False
    for material_id, aliases in cfg["materials"].items():
        title_hits = [hit[0] for hit in title_candidates[material_id]]
        summary_hits = _first_hits(summary_norm, aliases)
        # 摘要可补充影响语境，但不单独决定关联品种，避免 RSS 摘要串文造成误判。
        if not title_hits:
            continue
        if material_id in chain_required and not chain_context:
            continue
        material_ids.append(material_id)
        for keyword in title_hits + summary_hits:
            if keyword not in matched_keywords:
                matched_keywords.append(keyword)
        summary_material_hit = summary_material_hit or bool(summary_hits)

    if not material_ids:
        return [], [], 0
    score = 6 + (4 if summary_material_hit else 0)
    score += 2 if impact_title else 1
    score += 1 if chain_context else 0
    return material_ids, matched_keywords, score


def classify_news(text: str) -> str:
    norm = normalized_text(text)
    if any(
        _contains(norm, term)
        for term in (
            "价格", "报价", "现货", "期货", "基差", "涨价", "降价", "上涨", "下跌", "收涨", "收跌",
            "走高", "走低", "回暖", "反弹", "触底", "企稳", "承压", "走弱", "走强", "上行", "下行", "震荡",
            "price", "prices", "spot", "futures", "rise", "rises", "rose", "fall", "falls", "fell", "rebound", "decline",
        )
    ):
        return "价格行情"
    if any(_contains(norm, term) for term in ("政策", "监管", "关税", "配额", "禁运", "天气", "疫情", "policy", "tariff", "quota")):
        return "政策与供应"
    return "供需动态"


def normalize_news_item(raw: dict, cfg: dict, now: datetime, max_age_days: int) -> dict | None:
    title = clean_text(raw.get("title"), 240)
    summary = clean_text(raw.get("summary"), 500)
    source = clean_text(raw.get("source"), 80)
    url = canonicalize_url(raw.get("url"))
    # Google RSS 的历史 description 只是“标题 + 来源”，不是文章摘要。
    # 不允许它参与相关性判定，也避免误导用户。
    if url and is_google_news_url(url):
        summary = ""
    published = parse_datetime(raw.get("published_at") or raw.get("time") or raw.get("date"))
    if not title or not source or not url or not published:
        return None
    if published > now + timedelta(minutes=10):
        return None
    if published < now - timedelta(days=max_age_days):
        return None
    if title_has_stale_event_date(title, published):
        return None
    if url_has_conflicting_date(url, published):
        return None

    material_ids, matched_keywords, score = match_materials(title, summary, cfg)
    if not material_ids:
        return None

    fetched = parse_datetime(raw.get("fetched_at")) or published
    if fetched > now + timedelta(minutes=10):
        fetched = now
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]
    return {
        "id": f"news_{digest}",
        "date": published.date().isoformat(),
        "published_at": published.isoformat(timespec="minutes"),
        "fetched_at": fetched.isoformat(timespec="minutes"),
        "title": title,
        "summary": summary,
        "source": source,
        "type": classify_news(f"{title} {summary}"),
        "url": url,
        "company": clean_text(raw.get("company"), 80),
        "material_ids": material_ids,
        "matched_keywords": matched_keywords,
        "relevance_score": score,
    }


def _title_key(item: dict) -> str:
    title = normalized_text(item["title"])
    title = re.sub(r"[\W_]+", "", title, flags=re.UNICODE)
    return f"{item['date']}|{title}"


def _quality(item: dict) -> tuple[int, int, int, int, int, str, str, str]:
    direct = 0 if is_google_news_url(item["url"]) else 1
    parts = urlsplit(item["url"])
    secure = 1 if parts.scheme == "https" else 0
    publisher_quality = 0 if (parts.hostname or "").lower() in LOWER_QUALITY_AGGREGATOR_HOSTS else 1
    return (
        direct,
        secure,
        publisher_quality,
        int(item.get("relevance_score", 0)),
        len(item.get("summary", "")),
        item["published_at"],
        item["source"],
        item["url"],
    )


def _plain_title(item: dict) -> str:
    return re.sub(r"[\W_]+", "", normalized_text(item["title"]), flags=re.UNICODE)


def _has_common_substring(left: str, right: str, length: int = 7) -> bool:
    shorter, longer = sorted((left, right), key=len)
    if len(shorter) < length:
        return False
    return any(shorter[index : index + length] in longer for index in range(len(shorter) - length + 1))


def _is_semantic_duplicate(item: dict, existing: dict) -> bool:
    if item["date"] != existing["date"] or not set(item["material_ids"]) & set(existing["material_ids"]):
        return False
    left = _plain_title(item)
    right = _plain_title(existing)
    shorter, longer = sorted((left, right), key=len)
    if len(shorter) >= 12 and shorter in longer:
        return True
    # 跨媒体转载常会改写前后缀，但保留同一个核心数字和短语。
    # 同日、同品种、数字一致且有连续 7 个字符相同时，视为同篇转载。
    left_numbers = set(re.findall(r"\d+(?:\.\d+)?%?", normalized_text(item["title"])))
    right_numbers = set(re.findall(r"\d+(?:\.\d+)?%?", normalized_text(existing["title"])))
    return bool(left_numbers & right_numbers) and _has_common_substring(left, right)


def curate_news(raw_items: list[dict], cfg: dict, now: datetime | None = None) -> tuple[list[dict], dict]:
    now = (now or datetime.now(BJT)).astimezone(BJT)
    normalized = []
    rejected = 0
    for raw in raw_items:
        item = normalize_news_item(raw, cfg, now, int(cfg["archive_lookback_days"]))
        if item:
            normalized.append(item)
        else:
            rejected += 1

    normalized.sort(key=_quality, reverse=True)
    unique: list[dict] = []
    daily_counts: Counter[tuple[str, str, tuple[str, ...]]] = Counter()
    source_caps = cfg.get("source_material_daily_caps", {})
    for item in normalized:
        key = _title_key(item)
        duplicate = next(
            (
                existing
                for existing in unique
                if existing["url"] == item["url"]
                or _title_key(existing) == key
                or _is_semantic_duplicate(item, existing)
            ),
            None,
        )
        if duplicate:
            duplicate["fetched_at"] = min(duplicate["fetched_at"], item["fetched_at"])
            continue
        # 聚合源可能把同一网站写成不同来源名（如 Sohu / sohu.com），
        # 因此按实际发布域名限频，避免重复改写稿在下一轮采集时重新进入。
        publisher = (urlsplit(item["url"]).hostname or "").lower()
        cap_key = publisher if publisher in source_caps else item["source"]
        daily_key = (item["date"], cap_key, tuple(item["material_ids"]))
        source_cap = source_caps.get(cap_key)
        if isinstance(source_cap, int) and source_cap > 0 and daily_counts[daily_key] >= source_cap:
            continue
        daily_counts[daily_key] += 1
        unique.append(dict(item))
    unique.sort(key=lambda item: (item["published_at"], item["relevance_score"], item["id"]), reverse=True)
    unique = unique[: int(cfg["max_archive_items"])]
    stats = {"input": len(raw_items), "accepted": len(unique), "rejected": rejected}
    return unique, stats


def build_public_feed(curated: list[dict], cfg: dict, now: datetime | None = None) -> dict:
    now = (now or datetime.now(BJT)).astimezone(BJT)
    cutoff = now - timedelta(days=int(cfg["public_lookback_days"]))
    items = [
        item
        for item in curated
        if parse_datetime(item["published_at"]) >= cutoff
        and not is_google_news_url(item["url"])
        and urlsplit(item["url"]).scheme == "https"
    ]
    items = items[: int(cfg["max_public_items"])]
    updated_at = max((item["fetched_at"] for item in items), default=None)
    source_counts = dict(sorted(Counter(item["source"] for item in items).items()))
    return {
        "updated_at": updated_at,
        "refresh_minutes": int(cfg["refresh_minutes"]),
        "item_count": len(items),
        "source_counts": source_counts,
        "items": items,
    }


def validate_public_feed(
    feed: dict,
    cfg: dict,
    valid_material_ids: set[str] | None = None,
    now: datetime | None = None,
) -> None:
    items = feed.get("items")
    if not isinstance(items, list):
        raise ValueError("news.json 缺少 items 数组")
    if feed.get("item_count") != len(items):
        raise ValueError("news.json 的 item_count 与实际条数不一致")
    if len(items) > int(cfg["max_public_items"]):
        raise ValueError("news.json 超过最大公开条数")
    ids = [item.get("id") for item in items]
    urls = [item.get("url") for item in items]
    if len(ids) != len(set(ids)) or len(urls) != len(set(urls)):
        raise ValueError("新闻存在重复 ID 或 URL")
    if items != sorted(items, key=lambda item: (item["published_at"], item["relevance_score"], item["id"]), reverse=True):
        raise ValueError("新闻未按发布时间倒序排列")
    configured_ids = set(cfg["materials"])
    allowed_ids = configured_ids if valid_material_ids is None else configured_ids & valid_material_ids
    now = (now or datetime.now(BJT)).astimezone(BJT)
    for item in items:
        for field in ("id", "title", "source", "type", "url", "published_at", "fetched_at"):
            if not isinstance(item.get(field), str) or not item[field].strip():
                raise ValueError(f"新闻 {item.get('id')} 缺少字段 {field}")
        if not re.fullmatch(r"news_[0-9a-f]{20}", item["id"]):
            raise ValueError(f"新闻 {item.get('id')} 的 ID 格式无效")
        if item["type"] not in {"价格行情", "政策与供应", "供需动态"}:
            raise ValueError(f"新闻 {item.get('id')} 的类型无效")
        if not isinstance(item.get("material_ids"), list) or not item["material_ids"]:
            raise ValueError(f"新闻 {item.get('id')} 缺少原材料关联")
        if len(item["material_ids"]) != len(set(item["material_ids"])) or not set(item["material_ids"]) <= allowed_ids:
            raise ValueError(f"新闻 {item.get('id')} 的原材料关联无效")
        if not isinstance(item.get("matched_keywords"), list) or not item["matched_keywords"]:
            raise ValueError(f"新闻 {item.get('id')} 缺少命中关键词")
        canonical_url = canonicalize_url(item["url"])
        published = parse_datetime(item["published_at"])
        fetched = parse_datetime(item["fetched_at"])
        if canonical_url != item["url"] or not published or not fetched:
            raise ValueError(f"新闻 {item.get('id')} 的 URL 或时间无效")
        if is_google_news_url(item["url"]):
            raise ValueError(f"新闻 {item.get('id')} 仍是 Google 聚合跳转，不可发布")
        if urlsplit(item["url"]).scheme != "https":
            raise ValueError(f"新闻 {item.get('id')} 不是 HTTPS 原文链接，不可发布")
        if published > now + timedelta(minutes=10) or fetched > now + timedelta(minutes=10):
            raise ValueError(f"新闻 {item.get('id')} 的时间来自未来")
        if item.get("date") != published.date().isoformat():
            raise ValueError(f"新闻 {item.get('id')} 的 date 与 published_at 不一致")
        score = item.get("relevance_score")
        if not isinstance(score, int) or isinstance(score, bool) or score <= 0:
            raise ValueError(f"新闻 {item.get('id')} 的相关性分数无效")

    expected_counts = dict(sorted(Counter(item["source"] for item in items).items()))
    if feed.get("source_counts") != expected_counts:
        raise ValueError("news.json 的 source_counts 与实际来源不一致")
    expected_updated_at = max((item["fetched_at"] for item in items), default=None)
    if feed.get("updated_at") != expected_updated_at:
        raise ValueError("news.json 的 updated_at 与最新采集时间不一致")


def write_json_atomic(path: str | os.PathLike[str], value: object) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(temp_path, path)
    except Exception:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass
        raise
