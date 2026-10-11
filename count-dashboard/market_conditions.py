"""Source-gated local Market Research journal and descriptive news editions.

Only RSS/Atom feeds with a human-set approved_internal status are polled; that
status is an assertion, not a legal rights determination. Scheduled editions
freeze source-bound event/headline metadata and conditional context. The code
does not autonomously infer sentiment, retain article bodies, or create trades.
"""

from __future__ import annotations

import hashlib
import json
import ipaddress
import socket
import sqlite3
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


CATEGORIES = {
    "rates": "Central banks, rates, bonds & sovereign funding",
    "economy": "Inflation, labor, growth, households & K-shaped conditions",
    "energy": "Geopolitics, oil, gas, power, agriculture & supply chains",
    "earnings": "Earnings, index concentration, AI & sector leadership",
    "credit": "Credit, banks, liquidity, defaults & financial stability",
    "regulation": "Regulation, fiscal policy, trade & legal decisions",
    "positioning": "Volatility, positioning, flows & market plumbing",
    "calendar": "Data releases, auctions, weather & contract mechanics",
    "international": "Foreign policy, global growth, FX & cross-border risk",
}
DIRECTIONS = {"up", "down", "mixed", "unknown"}
CONFIDENCE = {"low", "medium", "high"}
RIGHTS = {"review", "approved_internal", "restricted"}


SEED_SOURCES = (
    ("fed-releases", "Federal Reserve releases", "official", "https://www.federalreserve.gov/feeds/feeds.htm", "https://www.federalreserve.gov/feeds/press_all.xml", "rates"),
    ("bls-releases", "BLS principal economic indicators", "official", "https://www.bls.gov/feed/", "https://www.bls.gov/feed/bls_latest.rss", "economy"),
    ("eia-releases", "EIA energy releases", "official", "https://www.eia.gov/tools/rssfeeds/", "https://www.eia.gov/rss/press_rss.xml", "energy"),
    ("bea-calendar", "BEA release schedule", "official", "https://www.bea.gov/news/schedule", "", "economy"),
    ("treasury-auctions", "Treasury auctions and data", "official", "https://home.treasury.gov/policy-issues/financing-the-government/auction-schedule", "", "rates"),
    ("sec-edgar", "SEC EDGAR company filings", "official", "https://www.sec.gov/search-filings/edgar-application-programming-interfaces", "", "earnings"),
    ("cme-notices", "CME notices and calendars", "exchange", "https://www.cmegroup.com/tools-information/holiday-calendar.html", "", "calendar"),
    ("ecb-news", "European Central Bank", "central_bank", "https://www.ecb.europa.eu/press/html/index.en.html", "", "international"),
    ("bank-of-japan", "Bank of Japan", "central_bank", "https://www.boj.or.jp/en/announcements/release_2026/", "", "international"),
    ("bank-of-england", "Bank of England", "central_bank", "https://www.bankofengland.co.uk/news", "", "international"),
    ("ism-reports", "ISM manufacturing and services surveys", "association", "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/", "", "economy"),
    ("cftc", "CFTC markets and positioning", "regulator", "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm", "", "positioning"),
    ("fdic", "FDIC banking and systemic risk", "regulator", "https://www.fdic.gov/news/", "", "credit"),
    ("fiscaldata", "U.S. Treasury Fiscal Data", "official", "https://fiscaldata.treasury.gov/", "", "rates"),
    ("usda", "USDA crop and agricultural reports", "official", "https://www.usda.gov/about-usda/news", "", "energy"),
    ("noaa", "NOAA weather and climate", "official", "https://www.noaa.gov/news", "", "calendar"),
    ("european-commission", "European Commission trade and policy", "official", "https://ec.europa.eu/commission/presscorner/home/en", "", "regulation"),
    ("federal-register", "Federal Register rules and notices", "official", "https://www.federalregister.gov/", "", "regulation"),
)


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def stamp(value, field):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be an ISO timestamp with timezone")
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field} must be an ISO timestamp with timezone") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a timezone")
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")


def text(payload, key, limit, optional=False):
    value = payload.get(key, "")
    if optional and value == "":
        return ""
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise ValueError(f"{key} is required (1–{limit} characters)")
    return value.strip()


def digest(payload):
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def connect(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS sources (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, source_type TEXT NOT NULL,
            url TEXT NOT NULL, rights_status TEXT NOT NULL DEFAULT 'review',
            rights_note TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            feed_url TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'calendar',
            last_scan_at TEXT NOT NULL DEFAULT '', last_scan_status TEXT NOT NULL DEFAULT 'not_scanned',
            last_scan_note TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), source_url TEXT NOT NULL,
            title TEXT NOT NULL, category TEXT NOT NULL, event_at TEXT NOT NULL, observed_at TEXT NOT NULL,
            published_at TEXT, direction TEXT NOT NULL, impact INTEGER NOT NULL,
            confidence TEXT NOT NULL, products_json TEXT NOT NULL,
            transmission TEXT NOT NULL, counterpath TEXT NOT NULL,
            evidence_kind TEXT NOT NULL, expires_at TEXT NOT NULL,
            content_hash TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS discoveries (
            id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
            title TEXT NOT NULL, item_url TEXT NOT NULL, published_at TEXT,
            observed_at TEXT NOT NULL, content_hash TEXT NOT NULL UNIQUE,
            review_status TEXT NOT NULL DEFAULT 'unreviewed'
        );
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY, session_date TEXT NOT NULL, session_name TEXT NOT NULL,
            timezone_name TEXT NOT NULL, product TEXT NOT NULL, cutoff TEXT NOT NULL,
            event_ids_json TEXT NOT NULL, snapshot_json TEXT NOT NULL,
            snapshot_hash TEXT NOT NULL, created_at TEXT NOT NULL,
            UNIQUE(session_date,session_name,product,cutoff)
        );
        CREATE TABLE IF NOT EXISTS brief_schedule (
            id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 1,
            session_label TEXT NOT NULL, timezone_name TEXT NOT NULL,
            session_open TEXT NOT NULL, session_close TEXT NOT NULL,
            product TEXT NOT NULL DEFAULT 'ALL FUTURES', updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS briefs (
            id TEXT PRIMARY KEY, run_key TEXT NOT NULL UNIQUE,
            session_date TEXT NOT NULL, edition TEXT NOT NULL,
            session_label TEXT NOT NULL, timezone_name TEXT NOT NULL, product TEXT NOT NULL,
            cutoff TEXT NOT NULL, trigger_kind TEXT NOT NULL,
            clips_json TEXT NOT NULL, source_manifest_json TEXT NOT NULL,
            coverage_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS brief_feedback (
            id TEXT PRIMARY KEY, brief_id TEXT NOT NULL REFERENCES briefs(id),
            clip_id TEXT NOT NULL, vote TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
            actor TEXT NOT NULL, created_at TEXT NOT NULL
        );
    """)
    columns = {row["name"] for row in db.execute("PRAGMA table_info(events)")}
    if "source_url" not in columns:
        db.execute("ALTER TABLE events ADD COLUMN source_url TEXT")
        db.execute("UPDATE events SET source_url=(SELECT url FROM sources WHERE sources.id=events.source_id) WHERE source_url IS NULL")
    if "event_at" not in columns:
        db.execute("ALTER TABLE events ADD COLUMN event_at TEXT")
        db.execute("UPDATE events SET event_at=observed_at WHERE event_at IS NULL")
    source_columns = {row["name"] for row in db.execute("PRAGMA table_info(sources)")}
    for name, declaration in {
        "feed_url": "TEXT NOT NULL DEFAULT ''", "category": "TEXT NOT NULL DEFAULT 'calendar'",
        "last_scan_at": "TEXT NOT NULL DEFAULT ''", "last_scan_status": "TEXT NOT NULL DEFAULT 'not_scanned'",
        "last_scan_note": "TEXT NOT NULL DEFAULT ''",
    }.items():
        if name not in source_columns:
            db.execute(f"ALTER TABLE sources ADD COLUMN {name} {declaration}")
    for ident, name, kind, url, feed_url, category in SEED_SOURCES:
        db.execute("""INSERT OR IGNORE INTO sources
            (id,name,source_type,url,rights_status,rights_note,enabled,created_at,updated_at,feed_url,category)
            VALUES (?,?,?,?, 'review','Rights and permitted internal derived use require human confirmation.',1,?,?,?,?)""",
            (ident, name, kind, url, now(), now(), feed_url, category))
        if feed_url:
            db.execute("UPDATE sources SET feed_url=? WHERE id=? AND feed_url=''", (feed_url, ident))
            db.execute("UPDATE sources SET category=? WHERE id=? AND category='calendar'", (category, ident))
    db.execute("""INSERT OR IGNORE INTO brief_schedule
        (id,enabled,session_label,timezone_name,session_open,session_close,product,updated_at)
        VALUES (1,1,'US equity-index RTH proxy','America/Chicago','08:30','15:00','ALL FUTURES',?)""", (now(),))
    db.commit()
    return db


def list_sources(db):
    return {"sources": [dict(row) for row in db.execute(
        "SELECT * FROM sources ORDER BY source_type,name")],
        "categories": CATEGORIES,
        "discoveries": list_discoveries(db),
        "scanBoundary": "Only enabled HTTPS RSS/Atom feeds with human-approved internal derived use are polled. No general web crawl or licensed news feed is included.",
        "rightsBoundary": "Candidate sources are not approved for use until a human records the applicable rights and intended internal use."}


def save_source(db, payload):
    ident = text(payload, "id", 80)
    name = text(payload, "name", 160)
    kind = text(payload, "source_type", 40)
    url = text(payload, "url", 1000)
    parsed = urlparse(url)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        raise ValueError("url must be an http or https URL")
    feed_url = text(payload, "feed_url", 1000, optional=True)
    if feed_url:
        feed = urlparse(feed_url)
        if feed.scheme != "https" or not feed.hostname:
            raise ValueError("feed_url must be an HTTPS RSS or Atom endpoint")
    category = payload.get("category", "calendar")
    if category not in CATEGORIES:
        raise ValueError("category must be a supported market influence category")
    rights = payload.get("rights_status", "review")
    if rights not in RIGHTS:
        raise ValueError("rights_status must be review, approved_internal, or restricted")
    rights_note = text(payload, "rights_note", 1000, optional=True)
    enabled = payload.get("enabled", True)
    if type(enabled) not in {bool, int} or enabled not in {0, 1, False, True}:
        raise ValueError("enabled must be true or false")
    enabled = bool(enabled)
    ts = now()
    db.execute("""INSERT INTO sources
        (id,name,source_type,url,rights_status,rights_note,enabled,created_at,updated_at,feed_url,category)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,source_type=excluded.source_type,
        url=excluded.url,rights_status=excluded.rights_status,rights_note=excluded.rights_note,
        enabled=excluded.enabled,updated_at=excluded.updated_at,feed_url=excluded.feed_url,
        category=excluded.category""",
        (ident, name, kind, url, rights, rights_note, int(enabled), ts, ts, feed_url, category))
    db.commit()
    return {"source": dict(db.execute("SELECT * FROM sources WHERE id=?", (ident,)).fetchone())}


def list_discoveries(db, limit=200):
    rows = db.execute("""SELECT discoveries.*,sources.name AS source_name,sources.url AS source_home_url,
        sources.category,sources.rights_status FROM discoveries JOIN sources ON sources.id=discoveries.source_id
        ORDER BY discoveries.observed_at DESC LIMIT ?""", (limit,))
    return [dict(row) for row in rows]


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Feed redirected; update the registered HTTPS feed URL after review")


def _public_https(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Only public HTTPS feed URLs are eligible for scanning")
    host = parsed.hostname
    try:
        addresses = {entry[4][0] for entry in socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)}
    except OSError as exc:
        raise ValueError("Feed host did not resolve") from exc
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("Feed host must resolve only to public IP addresses")


def scan_approved_feeds(db):
    sources = db.execute("""SELECT * FROM sources WHERE enabled=1 AND rights_status='approved_internal'
        AND feed_url!='' ORDER BY source_type,name""").fetchall()
    result = {"scanned": 0, "new_discoveries": 0, "errors": [], "observed_at": now()}
    opener = urllib.request.build_opener(_NoRedirect)
    for source in sources:
        try:
            _public_https(source["feed_url"])
            request = urllib.request.Request(source["feed_url"], headers={
                "User-Agent": "MarketResearchLocal/1.0 (RSS reader; contact: local user)",
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
            })
            with opener.open(request, timeout=8) as response:
                body = response.read(2_000_001)
            if len(body) > 2_000_000:
                raise ValueError("Feed exceeded 2 MB safety limit")
            root = ET.fromstring(body)
            entries = [node for node in root.iter() if node.tag.rsplit("}", 1)[-1].lower() in {"item", "entry"}]
            added = 0
            for entry in entries[:100]:
                fields = {}
                for child in list(entry):
                    key = child.tag.rsplit("}", 1)[-1].lower()
                    if key == "link":
                        fields[key] = child.attrib.get("href") or (child.text or "").strip()
                    elif key in {"title", "pubdate", "published", "updated", "date"}:
                        fields[key] = (child.text or "").strip()
                title = fields.get("title", "")[:500]
                item_url = fields.get("link", "")
                if not title or urlparse(item_url).scheme not in {"https", "http"}:
                    continue
                published = fields.get("published") or fields.get("updated") or fields.get("pubdate") or fields.get("date") or ""
                event_published = None
                if published:
                    try:
                        parsed_date = datetime.fromisoformat(published.replace("Z", "+00:00"))
                        event_published = parsed_date.astimezone(timezone.utc).isoformat(timespec="seconds") if parsed_date.tzinfo else None
                    except ValueError:
                        try:
                            from email.utils import parsedate_to_datetime
                            parsed_date = parsedate_to_datetime(published)
                            event_published = parsed_date.astimezone(timezone.utc).isoformat(timespec="seconds")
                        except (TypeError, ValueError, OverflowError):
                            event_published = None
                fingerprint = digest({"source_id": source["id"], "title": title, "item_url": item_url, "published_at": event_published})
                cursor = db.execute("""INSERT OR IGNORE INTO discoveries
                    (id,source_id,title,item_url,published_at,observed_at,content_hash)
                    VALUES (?,?,?,?,?,?,?)""", (uuid.uuid4().hex, source["id"], title, item_url,
                                                   event_published, result["observed_at"], fingerprint))
                added += cursor.rowcount
            db.execute("UPDATE sources SET last_scan_at=?,last_scan_status='ok',last_scan_note=? WHERE id=?",
                       (result["observed_at"], f"Feed read; {added} new headline links. Titles and links only.", source["id"]))
            result["scanned"] += 1
            result["new_discoveries"] += added
        except Exception as exc:
            note = str(exc)[:240]
            db.execute("UPDATE sources SET last_scan_at=?,last_scan_status='error',last_scan_note=? WHERE id=?",
                       (result["observed_at"], note, source["id"]))
            result["errors"].append({"source_id": source["id"], "source": source["name"], "error": note})
    db.commit()
    result["sources_eligible"] = len(sources)
    result["coverage"] = "partial" if result["errors"] or len(sources) < 3 else "approved_feed_subset"
    return result


def list_events(db, limit=200):
    if type(limit) is not int or not 1 <= limit <= 500:
        raise ValueError("limit must be between 1 and 500")
    rows = db.execute("""SELECT events.*,sources.name AS source_name,sources.url AS source_home_url,
        sources.rights_status,sources.rights_note,sources.updated_at AS rights_reviewed_at,
        sources.enabled AS source_enabled FROM events JOIN sources ON sources.id=events.source_id
        ORDER BY events.observed_at DESC,events.id DESC LIMIT ?""", (limit,))
    result = []
    for row in rows:
        item = dict(row)
        item["products"] = json.loads(item.pop("products_json"))
        item["freshness"] = "stale" if item["expires_at"] <= now() else "current"
        result.append(item)
    return {"events": result}


def save_event(db, payload):
    source_id = text(payload, "source_id", 80)
    source = db.execute("SELECT * FROM sources WHERE id=?", (source_id,)).fetchone()
    if source is None or not source["enabled"]:
        raise ValueError("Choose an enabled source from the registry")
    if source["rights_status"] == "restricted":
        raise ValueError("This source is marked restricted and cannot be used in a report")
    category = payload.get("category")
    if category not in CATEGORIES:
        raise ValueError("Choose a supported influence category")
    direction = payload.get("direction")
    if direction not in DIRECTIONS:
        raise ValueError("direction must be up, down, mixed, or unknown")
    confidence = payload.get("confidence")
    if confidence not in CONFIDENCE:
        raise ValueError("confidence must be low, medium, or high")
    evidence_kind = payload.get("evidence_kind")
    if evidence_kind not in {"official_fact", "reported_claim", "analysis", "rumor"}:
        raise ValueError("Choose how the information is characterized")
    impact = payload.get("impact")
    if type(impact) is not int or impact not in {1, 2, 3}:
        raise ValueError("impact must be 1, 2, or 3")
    products = payload.get("products")
    if not isinstance(products, list) or not products or len(products) > 12 or any(
        not isinstance(item, str) or not item.strip() or len(item) > 80 for item in products
    ):
        raise ValueError("products must contain 1–12 named products")
    observed = stamp(payload.get("observed_at"), "observed_at")
    event_at = stamp(payload.get("event_at"), "event_at")
    published = stamp(payload["published_at"], "published_at") if payload.get("published_at") else None
    expires = stamp(payload.get("expires_at"), "expires_at")
    if expires <= observed:
        raise ValueError("expires_at must follow observed_at")
    item = {
        "id": uuid.uuid4().hex, "source_id": source_id,
        "source_url": text(payload, "source_url", 1000),
        "title": text(payload, "title", 240), "category": category,
        "event_at": event_at, "observed_at": observed, "published_at": published, "direction": direction,
        "impact": impact, "confidence": confidence,
        "products": sorted({p.strip() for p in products}),
        "transmission": text(payload, "transmission", 1500),
        "counterpath": text(payload, "counterpath", 1000, optional=True),
        "evidence_kind": evidence_kind, "expires_at": expires, "created_at": now(),
    }
    item_url = urlparse(item["source_url"])
    if item_url.scheme not in {"https", "http"} or not item_url.netloc:
        raise ValueError("source_url must be an http or https URL for the specific source item")
    item["content_hash"] = digest(item)
    db.execute("""INSERT INTO events
        (id,source_id,source_url,title,category,event_at,observed_at,published_at,direction,impact,
         confidence,products_json,transmission,counterpath,evidence_kind,expires_at,content_hash,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (item["id"], source_id, item["source_url"], item["title"], category, event_at, observed, published,
         direction, impact, confidence, json.dumps(item["products"]), item["transmission"],
         item["counterpath"], evidence_kind, expires, item["content_hash"], item["created_at"]))
    db.commit()
    return {"event": item, "rightsStatus": source["rights_status"],
            "notice": "Append-only event record; create a new record to correct or update it."}


def list_reports(db, limit=40):
    rows = db.execute("SELECT * FROM reports ORDER BY created_at DESC,id DESC LIMIT ?", (limit,))
    result = []
    for row in rows:
        item = dict(row)
        item["snapshot"] = json.loads(item.pop("snapshot_json"))
        item["event_ids"] = json.loads(item.pop("event_ids_json"))
        result.append(item)
    return {"reports": result}


def get_brief_schedule(db):
    row = db.execute("SELECT * FROM brief_schedule WHERE id=1").fetchone()
    return dict(row) if row else {}


def save_brief_schedule(db, payload):
    current = get_brief_schedule(db)
    enabled = payload.get("enabled", bool(current.get("enabled", 1)))
    if not isinstance(enabled, bool):
        raise ValueError("enabled must be true or false")
    label = text(payload, "session_label", 120)
    zone = text(payload, "timezone_name", 80)
    try:
        ZoneInfo(zone)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError("timezone_name must be an installed IANA timezone") from exc
    opened = text(payload, "session_open", 5)
    closed = text(payload, "session_close", 5)
    for field, value in (("session_open", opened), ("session_close", closed)):
        try:
            datetime.strptime(value, "%H:%M")
        except ValueError as exc:
            raise ValueError(f"{field} must use 24-hour HH:MM") from exc
    product = text(payload, "product", 100).upper()
    db.execute("""UPDATE brief_schedule SET enabled=?,session_label=?,timezone_name=?,session_open=?,
        session_close=?,product=?,updated_at=? WHERE id=1""",
        (int(enabled), label, zone, opened, closed, product, now()))
    db.commit()
    return {"schedule": get_brief_schedule(db)}


def _event_clip(row, product):
    direction = {"up": "conditional higher-price channel", "down": "conditional lower-price channel",
                 "mixed": "two-way / mixed", "unknown": "not signed"}.get(row["direction"], "not signed")
    paragraphs = [
        f"{row['title']} — recorded from {row['source_name']} ({row['evidence_kind'].replace('_', ' ')}). "
        f"Published {row['published_at'] or 'time unknown'}; observed {row['observed_at']}.",
        f"Market Research indicator read for {product}: {direction}; human-assessed impact {row['impact']}/3; "
        f"{row['confidence']} confidence. Transmission: {row['transmission']}",
        f"Counterpath: {row['counterpath'] or 'none recorded; require a second source or opposing evidence before upgrading this read'}. "
        f"This is a conditional context report, not a price forecast or trade instruction.",
    ]
    return {"id": row["id"], "kind": "reviewed_event", "title": row["title"],
            "category": row["category"], "source_name": row["source_name"],
            "source_url": row["source_url"], "published_at": row["published_at"],
            "observed_at": row["observed_at"], "direction": direction,
            "impact": row["impact"], "confidence": row["confidence"], "paragraphs": paragraphs}


CHANNEL_WATCH = {
    "rates": "Watch the policy path, Treasury funding calendar, and the rates and dollar response; those market reactions were not fetched by this headline scan.",
    "economy": "Watch the release details, revisions, wages, labor participation, and household breadth; the headline alone does not establish the growth or inflation impulse.",
    "energy": "Check the physical supply route, inventory or production detail, and product-specific curve response; no price series is attached to this clip.",
    "earnings": "Check guidance, index weight, cross-company confirmation, and whether the story changes expected cash flows; this headline does not establish a broad index effect.",
    "credit": "Check funding, deposit, spread, and counterparty evidence before calling a systemic channel; this feed item alone cannot establish stress.",
    "regulation": "Verify the primary text, jurisdiction, effective date, and directly affected exposures before estimating a market channel.",
    "positioning": "Positioning is not direction by itself; compare the source's reporting window with current participation and liquidity evidence.",
    "calendar": "Verify the release time, contract calendar, and any holiday or roll exception against the relevant exchange schedule.",
    "international": "Trace the affected jurisdiction, FX/rates channel, and cross-market confirmation; geographic headlines can transmit in opposing directions.",
}


def _headline_clip(row, product):
    channel = CATEGORIES.get(row["category"], row["category"])
    paragraphs = [
        f"{row['title']} — headline published by {row['source_name']}. "
        f"Published {row['published_at'] or 'time unknown'}; first observed {row['observed_at']}.",
        f"Indicator link for {product}: {channel.lower()}. The source item has no human-reviewed direction, impact, "
        "or product transmission yet, so Market Research leaves its bias unsigned.",
        f"Reporter watch: {CHANNEL_WATCH.get(row['category'], 'Verify the original source and map its transmission before assigning a market view')} "
        "This clip contains headline metadata only; open the source item for its full reporting.",
    ]
    return {"id": row["id"], "kind": "headline_lead", "title": row["title"],
            "category": row["category"], "source_name": row["source_name"],
            "source_url": row["item_url"], "published_at": row["published_at"],
            "observed_at": row["observed_at"], "direction": "unsigned",
            "impact": None, "confidence": "unreviewed", "paragraphs": paragraphs}


def list_briefs(db, limit=30):
    rows = db.execute("SELECT * FROM briefs ORDER BY created_at DESC LIMIT ?", (limit,))
    output = []
    for row in rows:
        item = dict(row)
        item["clips"] = json.loads(item.pop("clips_json"))
        item["source_manifest"] = json.loads(item.pop("source_manifest_json"))
        item["coverage"] = json.loads(item.pop("coverage_json"))
        output.append(item)
    return output


def list_brief_feedback(db, limit=100):
    rows = db.execute("SELECT * FROM brief_feedback ORDER BY created_at DESC LIMIT ?", (limit,))
    return [dict(row) for row in rows]


def create_brief(db, payload, trigger_kind="on_demand", run_key=None):
    edition = payload.get("edition")
    if edition not in {"morning", "close"}:
        raise ValueError("edition must be morning or close")
    schedule = get_brief_schedule(db)
    timezone_name = text(payload, "timezone_name", 80, optional=True) or schedule.get("timezone_name", "America/Chicago")
    try:
        zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("timezone_name must be an installed IANA timezone") from exc
    cutoff = stamp(payload.get("cutoff") or now(), "cutoff")
    cutoff_dt = datetime.fromisoformat(cutoff)
    session_date = cutoff_dt.astimezone(zone).date().isoformat()
    session_label = text(payload, "session_label", 120, optional=True) or schedule.get("session_label", "US equity-index RTH proxy")
    product = (text(payload, "product", 100, optional=True) or schedule.get("product", "ALL FUTURES")).upper()
    max_age = datetime.fromtimestamp(cutoff_dt.timestamp() - 24 * 60 * 60, timezone.utc).isoformat(timespec="seconds")

    event_rows = db.execute("""SELECT events.*,sources.name AS source_name,sources.rights_status
        FROM events JOIN sources ON sources.id=events.source_id
        WHERE sources.enabled=1 AND sources.rights_status='approved_internal'
        AND events.observed_at<=? AND events.observed_at>=? AND events.expires_at>?
        AND events.evidence_kind!='rumor' ORDER BY events.observed_at DESC""",
        (cutoff, max_age, cutoff)).fetchall()
    matching_events = []
    for row in event_rows:
        item = dict(row)
        item["products"] = json.loads(item.pop("products_json"))
        if product == "ALL FUTURES" or product in item["products"]:
            matching_events.append(item)
    confidence_rank = {"high": 2, "medium": 1, "low": 0}
    matching_events.sort(key=lambda item: (item["impact"], confidence_rank.get(item["confidence"], 0), item["observed_at"]), reverse=True)
    event_by_url = {item["source_url"] for item in matching_events}
    headline_rows = db.execute("""SELECT discoveries.*,sources.name AS source_name,sources.url AS source_home_url,
        sources.category,sources.rights_status FROM discoveries JOIN sources ON sources.id=discoveries.source_id
        WHERE sources.enabled=1 AND sources.rights_status='approved_internal'
        AND discoveries.observed_at<=? AND discoveries.observed_at>=? ORDER BY discoveries.observed_at DESC LIMIT 100""",
        (cutoff, max_age)).fetchall()
    clips = [_event_clip(item, product) for item in matching_events[:3]]
    categories = {clip["category"] for clip in clips}
    for row in headline_rows:
        if len(clips) == 3:
            break
        if row["item_url"] in event_by_url:
            continue
        if row["category"] in categories:
            continue
        clips.append(_headline_clip(dict(row), product))
        categories.add(row["category"])
    if len(clips) < 3:
        for row in headline_rows:
            if len(clips) == 3:
                break
            if row["item_url"] in event_by_url or any(clip["source_url"] == row["item_url"] for clip in clips):
                continue
            clips.append(_headline_clip(dict(row), product))
    source_manifest = [{"source": clip["source_name"], "url": clip["source_url"],
                        "published_at": clip["published_at"], "observed_at": clip["observed_at"],
                        "kind": clip["kind"]} for clip in clips]
    source_counts = db.execute("""SELECT COUNT(*) AS homes,
        SUM(CASE WHEN feed_url!='' THEN 1 ELSE 0 END) AS configured,
        SUM(CASE WHEN feed_url!='' AND rights_status='approved_internal' AND enabled=1 THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN feed_url!='' AND enabled=1 AND rights_status='approved_internal' AND last_scan_status='ok' AND last_scan_at<=? THEN 1 ELSE 0 END) AS scanned,
        SUM(CASE WHEN feed_url!='' AND enabled=1 AND rights_status='approved_internal' AND last_scan_status='error' AND last_scan_at<=? THEN 1 ELSE 0 END) AS failed
        FROM sources""", (cutoff, cutoff)).fetchone()
    coverage = {key: int(source_counts[key] or 0) for key in ("homes", "configured", "approved", "scanned", "failed")}
    coverage.update({"exhaustive": False, "clip_count": len(clips), "maximum_clips": 3,
                     "maximum_paragraphs_per_clip": 3, "article_bodies_retained": False})
    created_at = now()
    ident = uuid.uuid4().hex
    record = {"id": ident, "run_key": run_key or f"manual:{uuid.uuid4().hex}",
              "session_date": session_date, "edition": edition,
              "session_label": session_label, "timezone_name": timezone_name,
              "product": product, "cutoff": cutoff, "trigger_kind": trigger_kind,
              "clips": clips, "source_manifest": source_manifest,
              "coverage": coverage, "created_at": created_at,
              "reporter": "Market Research Reporter", "status": "descriptive_unscored"}
    record["snapshot_hash"] = digest(record)
    db.execute("""INSERT INTO briefs
        (id,run_key,session_date,edition,session_label,timezone_name,product,cutoff,trigger_kind,
         clips_json,source_manifest_json,coverage_json,snapshot_hash,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (ident, record["run_key"], session_date, edition, session_label, timezone_name, product,
         cutoff, trigger_kind, json.dumps(clips, sort_keys=True, ensure_ascii=False),
         json.dumps(source_manifest, sort_keys=True, ensure_ascii=False),
         json.dumps(coverage, sort_keys=True), record["snapshot_hash"], created_at))
    db.commit()
    return {"brief": record}


def scheduled_briefs_due(db, when=None):
    current = when or datetime.now(timezone.utc)
    schedule = get_brief_schedule(db)
    if not schedule or not schedule["enabled"]:
        return []
    zone = ZoneInfo(schedule["timezone_name"])
    local_now = current.astimezone(zone)
    if local_now.weekday() >= 5:
        return []
    opening_hour, opening_minute = (int(part) for part in schedule["session_open"].split(":"))
    closing_hour, closing_minute = (int(part) for part in schedule["session_close"].split(":"))
    open_publish_dt = datetime.combine(local_now.date(), datetime.min.time()).replace(hour=opening_hour, minute=opening_minute, tzinfo=zone) - timedelta(minutes=30)
    close_publish_dt = datetime.combine(local_now.date(), datetime.min.time()).replace(hour=closing_hour, minute=closing_minute, tzinfo=zone) + timedelta(minutes=30)
    due = []
    local_date = local_now.date()
    for edition, scheduled_at in (("morning", open_publish_dt), ("close", close_publish_dt)):
        lateness = (local_now - scheduled_at).total_seconds()
        if not 0 <= lateness < 60:
            continue
        run_key = f"scheduled:{local_date.isoformat()}:{edition}:{schedule['timezone_name']}"
        if db.execute("SELECT 1 FROM briefs WHERE run_key=?", (run_key,)).fetchone():
            continue
        due.append({"edition": edition, "run_key": run_key,
                    "cutoff": scheduled_at.astimezone(timezone.utc).isoformat(timespec="seconds"),
                    "timezone_name": schedule["timezone_name"],
                    "session_label": schedule["session_label"], "product": schedule["product"]})
    return due


def record_brief_feedback(db, payload):
    brief_id = text(payload, "brief_id", 80)
    clip_id = text(payload, "clip_id", 80)
    vote = payload.get("vote")
    if vote not in {"useful", "noise", "missed_channel"}:
        raise ValueError("vote must be useful, noise, or missed_channel")
    actor = text(payload, "actor", 120, optional=True) or "local reviewer"
    note = text(payload, "note", 1000, optional=True)
    if not db.execute("SELECT 1 FROM briefs WHERE id=?", (brief_id,)).fetchone():
        raise ValueError("brief_id does not identify a saved reporter edition")
    ident = uuid.uuid4().hex
    created_at = now()
    db.execute("INSERT INTO brief_feedback VALUES (?,?,?,?,?,?,?)",
               (ident, brief_id, clip_id, vote, note, actor, created_at))
    db.commit()
    return {"feedback": {"id": ident, "brief_id": brief_id, "clip_id": clip_id,
                         "vote": vote, "note": note, "actor": actor, "created_at": created_at},
            "notice": "Human feedback is an editorial observation, not a scored indicator outcome."}


def create_report(db, payload):
    date = text(payload, "session_date", 10)
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("session_date must use YYYY-MM-DD") from exc
    session_name = text(payload, "session_name", 100)
    timezone_name = text(payload, "timezone_name", 80)
    product = text(payload, "product", 100)
    cutoff = stamp(payload.get("cutoff"), "cutoff")
    requested_ids = payload.get("event_ids", [])
    if not isinstance(requested_ids, list) or len(requested_ids) > 500:
        raise ValueError("event_ids must be a list")
    selected = []
    if requested_ids:
        placeholders = ",".join("?" for _ in requested_ids)
        rows = db.execute(f"""SELECT events.*,sources.name AS source_name,sources.url AS source_home_url,
            sources.rights_status,sources.rights_note,sources.updated_at AS rights_reviewed_at,
            sources.enabled AS source_enabled FROM events JOIN sources ON sources.id=events.source_id
            WHERE events.id IN ({placeholders})""", tuple(requested_ids)).fetchall()
        selected = [dict(row) for row in rows]
        if len(selected) != len(set(requested_ids)):
            raise ValueError("Every selected event must exist in the local research ledger")
    if any(item["rights_status"] != "approved_internal" for item in selected):
        raise ValueError("Confirm internal derived-use rights for every selected source before publishing a report")
    if any(not item["source_enabled"] for item in selected):
        raise ValueError("Disabled sources cannot contribute to a new report")
    if any(item["evidence_kind"] == "rumor" for item in selected):
        raise ValueError("Rumors are retained in the event ledger but excluded from session reports")
    if any(item["observed_at"] > cutoff for item in selected):
        raise ValueError("A report cannot include information observed after its cutoff")
    active, stale = [], []
    for item in selected:
        item["products"] = json.loads(item.pop("products_json"))
        (active if product in item["products"] and item["expires_at"] > cutoff else stale).append(item)
    source_coverage = [dict(row) for row in db.execute("""SELECT id,name,source_type,category,enabled,
        rights_status,feed_url,last_scan_at,last_scan_status,last_scan_note FROM sources ORDER BY category,name""")]
    eligible = [source for source in source_coverage if source["enabled"] and source["rights_status"] == "approved_internal" and source["feed_url"]]
    scanned_by_cutoff = [source for source in eligible if source["last_scan_at"] and source["last_scan_at"] <= cutoff]
    coverage_summary = {
        "source_home_count": len(source_coverage),
        "configured_feed_count": sum(bool(source["feed_url"]) for source in source_coverage),
        "approved_feed_count": len(eligible),
        "scanned_by_cutoff_count": len(scanned_by_cutoff),
        "failed_by_cutoff_count": sum(source["last_scan_status"] == "error" for source in scanned_by_cutoff),
        "never_scanned_approved_count": len(eligible) - len(scanned_by_cutoff),
        "coverage_is_exhaustive": False,
    }
    snapshot = {
        "indicator_id": "market-research",
        "status": "descriptive_unscored",
        "session_date": date, "session_name": session_name,
        "timezone_name": timezone_name, "product": product, "cutoff": cutoff,
        "coverage": "approved_feed_subset_and_human_curated",
        "coverage_summary": coverage_summary,
        "source_coverage": source_coverage,
        "active_events": active,
        "stale_or_nonmatching_events": stale,
        "directional_state": "mixed_or_insufficient_coverage",
        "method_note": "No aggregate directional score is calculated. Feed coverage is partial and rights-gated; empty, stale, failed, or mixed coverage must remain visible.",
    }
    snap_hash = digest(snapshot)
    ident = uuid.uuid4().hex
    created_at = now()
    try:
        db.execute("""INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (ident, date, session_name, timezone_name, product, cutoff,
             json.dumps([item["id"] for item in active]),
             json.dumps(snapshot, sort_keys=True, ensure_ascii=False), snap_hash, created_at))
        db.commit()
    except sqlite3.IntegrityError as exc:
        raise ValueError("A report with this session, product, and cutoff already exists") from exc
    return {"report": {"id": ident, "snapshot": snapshot, "snapshot_hash": snap_hash,
                        "created_at": created_at}}
