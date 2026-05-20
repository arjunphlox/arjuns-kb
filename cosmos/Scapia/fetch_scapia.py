#!/usr/bin/env python3
"""Fetch Cosmos.so collection 'scapia' and export as enhanced markdown with images."""

import json
import os
import sys
import urllib.request
import urllib.error
import hashlib
import time
import ssl

CLUSTER_ID = 1222776450
GRAPHQL_URL = "https://api.www.cosmos.so/graphql"
PAGE_SIZE = 40

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(BASE_DIR, "images")
MD_FILE = os.path.join(BASE_DIR, "Scapia.md")

GRAPHQL_QUERY = """
{
  elements(filters: { clusterId: CLUSTER_ID }, meta: { pageSize: PAGE_SIZE CURSOR_PART }) {
    items {
      __typename
      ... on ArticleElement { id articleTitle sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on ImageElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on PinterestElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on InstagramElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on TwitterElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on Element { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
    }
    meta { nextPageCursor count }
  }
}
"""

CDN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://www.cosmos.so/",
    "Accept": "image/webp,image/*,*/*",
}

# Allow unverified SSL for CDN image downloads if needed
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


def build_query(cursor=None):
    cursor_part = f', pageCursor: "{cursor}"' if cursor else ""
    q = GRAPHQL_QUERY.replace("CLUSTER_ID", str(CLUSTER_ID))
    q = q.replace("PAGE_SIZE", str(PAGE_SIZE))
    q = q.replace("CURSOR_PART", cursor_part)
    return q


def fetch_graphql(cursor=None):
    query = build_query(cursor)
    payload = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        GRAPHQL_URL,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_all_items():
    all_items = []
    cursor = None
    page = 0
    while True:
        page += 1
        print(f"Fetching page {page} (cursor={cursor})...")
        data = fetch_graphql(cursor)
        elements = data.get("data", {}).get("elements", {})
        items = elements.get("items", [])
        meta = elements.get("meta", {})
        all_items.extend(items)
        print(f"  Got {len(items)} items (total so far: {len(all_items)}, server count: {meta.get('count')})")
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
    lower = url.lower().split("?")[0]
    for e in [".png", ".webp", ".gif", ".jpeg", ".svg"]:
        if lower.endswith(e):
            ext = e
            break

    filename = f"{item_id}{ext}"
    filepath = os.path.join(IMAGES_DIR, filename)

    if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
        return filename

    try:
        req = urllib.request.Request(url, headers=CDN_HEADERS)
        with urllib.request.urlopen(req, timeout=20, context=ssl_ctx) as resp:
            data = resp.read()
            # Check content type for better extension
            ct = resp.headers.get("Content-Type", "")
            if "png" in ct:
                ext = ".png"
            elif "webp" in ct:
                ext = ".webp"
            elif "gif" in ct:
                ext = ".gif"
            elif "svg" in ct:
                ext = ".svg"
            # Re-derive filename if extension changed
            filename = f"{item_id}{ext}"
            filepath = os.path.join(IMAGES_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(data)
        return filename
    except Exception as e:
        print(f"  Warning: failed to download image for {item_id}: {e}")
        return None


def generate_markdown(items):
    lines = []
    lines.append("# Scapia - Cosmos.so Collection")
    lines.append("")
    lines.append(f"**Source:** [cosmos.so/arjunphlox/scapia](https://www.cosmos.so/arjunphlox/scapia)")
    lines.append(f"**Total items:** {len(items)}")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Group by type
    type_groups = {}
    for item in items:
        t = item.get("__typename", item.get("type", "Unknown"))
        type_groups.setdefault(t, []).append(item)

    # Summary
    lines.append("## Overview")
    lines.append("")
    lines.append("| Type | Count |")
    lines.append("|------|-------|")
    for t, group in sorted(type_groups.items(), key=lambda x: -len(x[1])):
        lines.append(f"| {t} | {len(group)} |")
    lines.append("")
    lines.append("---")
    lines.append("")

    # All items
    lines.append("## Items")
    lines.append("")

    for idx, item in enumerate(items, 1):
        item_id = item.get("id", f"unknown-{idx}")
        typename = item.get("__typename", "Element")
        source_url = item.get("sourceUrl", "")
        title = item.get("articleTitle", "")
        caption_obj = item.get("generatedCaption")
        caption = caption_obj.get("text", "") if caption_obj else ""
        tags = item.get("computerVisionTags") or []
        image_url = ""
        img = item.get("image")
        if img and isinstance(img, dict):
            image_url = img.get("url", "")

        # Download image
        local_img = None
        if image_url:
            local_img = download_image(image_url, item_id)

        # Build entry
        heading = title if title else f"Item {idx}"
        lines.append(f"### {idx}. {heading}")
        lines.append("")
        lines.append(f"- **Type:** {typename}")
        if source_url:
            lines.append(f"- **Source:** [{source_url}]({source_url})")
        lines.append(f"- **ID:** `{item_id}`")
        lines.append("")

        if local_img:
            lines.append(f"![{caption or heading}](images/{local_img})")
            lines.append("")

        if caption:
            lines.append(f"> {caption}")
            lines.append("")

        if tags:
            tag_str = ", ".join(f"`{t}`" for t in tags)
            lines.append(f"**Tags:** {tag_str}")
            lines.append("")

        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def main():
    print("=== Cosmos.so Scapia Collection Exporter ===")
    print()

    # Fetch all items
    items = fetch_all_items()
    print(f"\nTotal items fetched: {len(items)}")

    if not items:
        print("No items found. Exiting.")
        sys.exit(1)

    # Generate markdown (downloads images along the way)
    print("\nGenerating markdown and downloading images...")
    md_content = generate_markdown(items)

    # Write markdown
    with open(MD_FILE, "w", encoding="utf-8") as f:
        f.write(md_content)

    # Count downloaded images
    img_count = len([f for f in os.listdir(IMAGES_DIR) if not f.startswith(".")])
    print(f"\nDone!")
    print(f"  Markdown: {MD_FILE}")
    print(f"  Images downloaded: {img_count}")
    print(f"  Total items: {len(items)}")


if __name__ == "__main__":
    main()
