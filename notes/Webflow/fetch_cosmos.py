#!/usr/bin/env python3
"""Fetch Cosmos.so 'webflow' collection and export as markdown with images."""

import json
import os
import re
import ssl
import sys
import time
import urllib.request
import urllib.error
import hashlib
from pathlib import Path

COLLECTION_URL = "https://www.cosmos.so/arjunphlox/webflow"
GRAPHQL_URL = "https://api.www.cosmos.so/graphql"
BASE_DIR = Path(__file__).parent
IMAGES_DIR = BASE_DIR / "images"
OUTPUT_MD = BASE_DIR / "Webflow.md"

CDN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://www.cosmos.so/",
    "Accept": "image/webp,image/*,*/*",
}

GRAPHQL_QUERY_TEMPLATE = (
    '{{ elements(filters: {{ clusterId: {cid} }}, meta: {{ pageSize: 40{cursor_part} }}) '
    '{{ items {{ __typename '
    '... on ArticleElement {{ id articleTitle sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }} '
    '... on ImageElement {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }} '
    '... on PinterestElement {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }} '
    '... on InstagramElement {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }} '
    '... on TwitterElement {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }} '
    '... on Element {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }} '
    '}} meta {{ nextPageCursor count }} }} }}'
)

# Allow unverified SSL for macOS Python
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def fetch_url(url, headers=None, data=None, method="GET"):
    """Fetch a URL and return (response_bytes, content_type)."""
    hdrs = headers or {}
    if not any(k.lower() == "user-agent" for k in hdrs):
        hdrs["User-Agent"] = CDN_HEADERS["User-Agent"]
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    for attempt in range(3):
        try:
            resp = urllib.request.urlopen(req, context=ctx, timeout=30)
            return resp.read(), resp.headers.get("Content-Type", "")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if attempt == 2:
                raise
            print(f"  Retry {attempt+1} for {url[:80]}... ({e})")
            time.sleep(2 * (attempt + 1))


def get_cluster_id():
    """Fetch the collection page and extract cluster ID from __NEXT_DATA__."""
    print("Step 1: Fetching collection page to get cluster ID...")
    body, _ = fetch_url(COLLECTION_URL, headers={"User-Agent": CDN_HEADERS["User-Agent"]})
    html = body.decode("utf-8", errors="replace")

    # Find __NEXT_DATA__ JSON
    m = re.search(r'<script\s+id="__NEXT_DATA__"\s+type="application/json">(.*?)</script>', html, re.DOTALL)
    if not m:
        # Try alternate pattern
        m = re.search(r'__NEXT_DATA__.*?>(.*?)</script>', html, re.DOTALL)
    if not m:
        raise RuntimeError("Could not find __NEXT_DATA__ in page HTML")

    data = json.loads(m.group(1))

    # Navigate to initialApolloState -> ROOT_QUERY and find clusterId
    apollo = data.get("props", {}).get("pageProps", {}).get("initialApolloState", {})
    root_query = apollo.get("ROOT_QUERY", {})

    # Search for clusterId in the ROOT_QUERY keys/values
    cluster_id = None
    for key, val in root_query.items():
        if isinstance(val, dict):
            # Check nested dicts for clusterId
            val_str = json.dumps(val)
            cid_match = re.search(r'"clusterId"\s*:\s*"([^"]+)"', val_str)
            if cid_match:
                cluster_id = cid_match.group(1)
                break
        if isinstance(key, str) and "clusterId" in key:
            cid_match = re.search(r'clusterId["\s:]+(["\']?)([a-f0-9-]+)\1', key)
            if cid_match:
                cluster_id = cid_match.group(2)
                break

    if not cluster_id:
        # Try searching the entire JSON string
        full_str = json.dumps(apollo)
        cid_match = re.search(r'"clusterId"\s*:\s*"([^"]+)"', full_str)
        if cid_match:
            cluster_id = cid_match.group(1)

    if not cluster_id:
        # Last resort: look in the entire __NEXT_DATA__
        full_str = m.group(1)
        cid_match = re.search(r'"clusterId"\s*:\s*"([^"]+)"', full_str)
        if cid_match:
            cluster_id = cid_match.group(1)

    if not cluster_id:
        raise RuntimeError("Could not find clusterId in __NEXT_DATA__")

    print(f"  Found cluster ID: {cluster_id}")
    return cluster_id


def fetch_all_items(cluster_id):
    """Fetch all items via paginated GraphQL API."""
    print("Step 2: Fetching items via GraphQL API...")
    all_items = []
    cursor = None
    page = 0

    while True:
        page += 1
        cursor_part = f', pageCursor: "{cursor}"' if cursor else ""
        query = GRAPHQL_QUERY_TEMPLATE.format(cid=cluster_id, cursor_part=cursor_part)
        payload = json.dumps({"query": query}).encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "User-Agent": CDN_HEADERS["User-Agent"],
            "Referer": "https://www.cosmos.so/",
            "Origin": "https://www.cosmos.so",
        }

        body, _ = fetch_url(GRAPHQL_URL, headers=headers, data=payload, method="POST")
        result = json.loads(body.decode("utf-8"))

        if "errors" in result:
            print(f"  GraphQL errors: {result['errors']}")
            break

        elements = result.get("data", {}).get("elements", {})
        items = elements.get("items", [])
        meta = elements.get("meta", {})

        all_items.extend(items)
        count = meta.get("count", "?")
        print(f"  Page {page}: fetched {len(items)} items (total so far: {len(all_items)}/{count})")

        cursor = meta.get("nextPageCursor")
        if not cursor:
            break
        time.sleep(0.5)

    print(f"  Total items fetched: {len(all_items)}")
    return all_items


def download_image(url, item_id):
    """Download an image and return the local filename, or None on failure."""
    if not url:
        return None

    # Determine extension from URL
    ext = ".jpg"
    url_lower = url.lower().split("?")[0]
    for e in [".png", ".webp", ".gif", ".svg", ".jpeg", ".jpg"]:
        if url_lower.endswith(e):
            ext = e
            break

    # Use hash of URL for unique filename
    url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
    filename = f"{item_id[:8]}_{url_hash}{ext}"
    filepath = IMAGES_DIR / filename

    if filepath.exists() and filepath.stat().st_size > 0:
        return filename

    try:
        data, content_type = fetch_url(url, headers=CDN_HEADERS)
        # Fix extension based on content type
        if "webp" in (content_type or ""):
            filename = filename.rsplit(".", 1)[0] + ".webp"
            filepath = IMAGES_DIR / filename
        elif "png" in (content_type or ""):
            filename = filename.rsplit(".", 1)[0] + ".png"
            filepath = IMAGES_DIR / filename

        filepath.write_bytes(data)
        return filename
    except Exception as e:
        print(f"  Failed to download image for {item_id[:8]}: {e}")
        return None


def generate_markdown(items):
    """Generate enhanced markdown from items."""
    print("Step 3: Downloading images and generating markdown...")

    lines = []
    lines.append("# Webflow Collection")
    lines.append("")
    lines.append(f"> Exported from [Cosmos.so]({COLLECTION_URL}) on 2026-03-30")
    lines.append(f"> Total items: {len(items)}")
    lines.append("")
    lines.append("---")
    lines.append("")

    for i, item in enumerate(items):
        item_id = str(item.get("id", f"item-{i}"))
        typename = item.get("__typename", "Element")
        source_url = item.get("sourceUrl", "")
        item_type = item.get("type", "")
        title = item.get("articleTitle", "")
        image_url = (item.get("image") or {}).get("url", "")
        caption_text = (item.get("generatedCaption") or {}).get("text", "")
        tags = item.get("computerVisionTags") or []

        # Download image
        local_img = None
        if image_url:
            local_img = download_image(image_url, item_id)
            sys.stdout.write(f"\r  Processing item {i+1}/{len(items)}...")
            sys.stdout.flush()

        # Build entry heading
        heading = title if title else caption_text[:80] if caption_text else f"Item {i+1}"
        heading = heading.replace("\n", " ").strip()
        if not heading:
            heading = f"Item {i+1}"

        lines.append(f"### {i+1}. {heading}")
        lines.append("")

        # Image
        if local_img:
            lines.append(f"![{heading}](images/{local_img})")
            lines.append("")

        # Metadata
        meta_parts = []
        if typename and typename != "Element":
            meta_parts.append(f"**Type:** {typename.replace('Element', '')}")
        if item_type:
            meta_parts.append(f"**Format:** {item_type}")
        if source_url:
            meta_parts.append(f"**Source:** [{source_url[:60]}{'...' if len(source_url) > 60 else ''}]({source_url})")

        if meta_parts:
            lines.append(" | ".join(meta_parts))
            lines.append("")

        # Caption
        if caption_text:
            lines.append(f"> {caption_text}")
            lines.append("")

        # Tags
        if tags:
            tag_str = " ".join(f"`{t}`" for t in tags)
            lines.append(f"**Tags:** {tag_str}")
            lines.append("")

        lines.append("---")
        lines.append("")

    print(f"\n  Done processing all items.")
    return "\n".join(lines)


def main():
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    cluster_id = get_cluster_id()
    items = fetch_all_items(cluster_id)

    if not items:
        print("No items found. Exiting.")
        return

    md_content = generate_markdown(items)
    OUTPUT_MD.write_text(md_content, encoding="utf-8")
    print(f"\nSaved markdown to: {OUTPUT_MD}")
    print(f"Images saved to: {IMAGES_DIR}")
    print(f"Total items: {len(items)}")


if __name__ == "__main__":
    main()
