#!/usr/bin/env python3
"""Fetch Cosmos.so 'quotes' collection and export as Markdown with images."""

import json
import os
import re
import urllib.request
import urllib.error
import hashlib
import ssl
import time

CLUSTER_ID = 1424522166
GRAPHQL_URL = "https://api.www.cosmos.so/graphql"
PAGE_SIZE = 40

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(BASE_DIR, "images")
OUTPUT_MD = os.path.join(BASE_DIR, "Quotes.md")

CDN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://www.cosmos.so/",
    "Accept": "image/webp,image/*,*/*",
}

GRAPHQL_QUERY = """
{
  elements(filters: { clusterId: %d }, meta: { pageSize: %d%s }) {
    items {
      __typename
      ... on ArticleElement {
        id articleTitle sourceUrl type
        image { url }
        generatedCaption { text }
        computerVisionTags
      }
      ... on ImageElement {
        id sourceUrl type
        image { url }
        generatedCaption { text }
        computerVisionTags
      }
      ... on PinterestElement {
        id sourceUrl type
        image { url }
        generatedCaption { text }
        computerVisionTags
      }
      ... on InstagramElement {
        id sourceUrl type
        image { url }
        generatedCaption { text }
        computerVisionTags
      }
      ... on TwitterElement {
        id sourceUrl type
        image { url }
        generatedCaption { text }
        computerVisionTags
      }
      ... on Element {
        id sourceUrl type
        image { url }
        generatedCaption { text }
        computerVisionTags
      }
    }
    meta { nextPageCursor count }
  }
}
"""

# Allow unverified SSL for CDN image downloads if needed
ctx = ssl.create_default_context()


def build_query(cursor=None):
    cursor_part = ', pageCursor: "%s"' % cursor if cursor else ""
    return GRAPHQL_QUERY % (CLUSTER_ID, PAGE_SIZE, cursor_part)


def graphql_request(cursor=None):
    query = build_query(cursor)
    payload = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        GRAPHQL_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "Referer": "https://www.cosmos.so/",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_all_items():
    all_items = []
    cursor = None
    page = 0
    while True:
        page += 1
        print(f"  Fetching page {page}...")
        data = graphql_request(cursor)
        elements = data.get("data", {}).get("elements", {})
        items = elements.get("items", [])
        meta = elements.get("meta", {})
        all_items.extend(items)
        print(f"    Got {len(items)} items (total so far: {len(all_items)}, server count: {meta.get('count')})")
        cursor = meta.get("nextPageCursor")
        if not cursor:
            break
        time.sleep(0.3)
    return all_items


def download_image(url, item_id):
    if not url:
        return None
    # Determine extension from URL
    ext = ".jpg"
    url_lower = url.split("?")[0].lower()
    for e in [".png", ".webp", ".gif", ".jpeg", ".jpg", ".svg"]:
        if url_lower.endswith(e):
            ext = e
            break

    # Use a hash-based filename to avoid conflicts
    safe_name = f"{item_id}{ext}"
    filepath = os.path.join(IMAGES_DIR, safe_name)

    if os.path.exists(filepath):
        print(f"    [cached] {safe_name}")
        return safe_name

    try:
        req = urllib.request.Request(url, headers=CDN_HEADERS)
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = resp.read()
            # Check content type for better extension
            ct = resp.headers.get("Content-Type", "")
            if "png" in ct:
                ext = ".png"
            elif "webp" in ct:
                ext = ".webp"
            elif "gif" in ct:
                ext = ".gif"
            # Re-derive filename if extension changed
            safe_name = f"{item_id}{ext}"
            filepath = os.path.join(IMAGES_DIR, safe_name)
            with open(filepath, "wb") as f:
                f.write(data)
        print(f"    [downloaded] {safe_name} ({len(data)} bytes)")
        return safe_name
    except Exception as e:
        print(f"    [FAILED] {url}: {e}")
        return None


def detect_source_platform(source_url):
    if not source_url:
        return None
    su = source_url.lower()
    if "twitter.com" in su or "x.com" in su:
        return "Twitter/X"
    if "instagram.com" in su:
        return "Instagram"
    if "pinterest.com" in su or "pin.it" in su:
        return "Pinterest"
    if "reddit.com" in su:
        return "Reddit"
    if "tumblr.com" in su:
        return "Tumblr"
    return None


def item_to_markdown(item, index):
    lines = []
    typename = item.get("__typename", "Element")
    item_id = item.get("id", "unknown")
    source_url = item.get("sourceUrl", "")
    article_title = item.get("articleTitle", "")
    caption_obj = item.get("generatedCaption") or {}
    caption = caption_obj.get("text", "")
    tags = item.get("computerVisionTags") or []
    image_obj = item.get("image") or {}
    image_url = image_obj.get("url", "")
    elem_type = item.get("type", "")

    # Title
    title = article_title or caption or f"Item {index}"
    # Truncate long titles
    if len(title) > 120:
        title = title[:117] + "..."
    lines.append(f"### {index}. {title}")
    lines.append("")

    # Image
    if image_url:
        local_img = download_image(image_url, item_id)
        if local_img:
            lines.append(f"![{title}](images/{local_img})")
            lines.append("")

    # Metadata table
    platform = detect_source_platform(source_url)
    meta_parts = []
    if typename and typename != "Element":
        meta_parts.append(f"**Type:** {typename.replace('Element', '')}")
    if platform:
        meta_parts.append(f"**Platform:** {platform}")
    if elem_type:
        meta_parts.append(f"**Content type:** {elem_type}")
    if meta_parts:
        lines.append(" | ".join(meta_parts))
        lines.append("")

    # Caption (if not already used as title)
    if caption and caption != title and not title.startswith(caption[:20]):
        lines.append(f"> {caption}")
        lines.append("")

    # Source link
    if source_url:
        lines.append(f"[Source]({source_url})")
        lines.append("")

    # Tags
    if tags:
        tag_str = ", ".join(f"`{t}`" for t in tags)
        lines.append(f"**Tags:** {tag_str}")
        lines.append("")

    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def main():
    print("Fetching Cosmos.so collection 'quotes' (cluster %d)..." % CLUSTER_ID)
    os.makedirs(IMAGES_DIR, exist_ok=True)

    items = fetch_all_items()
    print(f"\nTotal items fetched: {len(items)}")

    if not items:
        print("No items found. Exiting.")
        return

    print("\nDownloading images and generating Markdown...")
    md_parts = []
    md_parts.append("# Quotes Collection")
    md_parts.append("")
    md_parts.append(f"*Exported from [cosmos.so/arjunphlox/quotes](https://www.cosmos.so/arjunphlox/quotes)*")
    md_parts.append(f"*{len(items)} items*")
    md_parts.append("")
    md_parts.append("---")
    md_parts.append("")

    for i, item in enumerate(items, 1):
        print(f"  Processing item {i}/{len(items)}...")
        md_parts.append(item_to_markdown(item, i))

    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(md_parts))

    print(f"\nDone! Markdown saved to: {OUTPUT_MD}")
    print(f"Images saved to: {IMAGES_DIR}/")


if __name__ == "__main__":
    main()
