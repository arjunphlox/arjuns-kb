#!/usr/bin/env python3
"""Fetch Cosmos.so photography collection and export as markdown with images."""

import json
import os
import sys
import urllib.request
import urllib.error
import hashlib
import time
from pathlib import Path

CLUSTER_ID = 195622828
GRAPHQL_URL = "https://api.www.cosmos.so/graphql"
PAGE_SIZE = 40

BASE_DIR = Path(__file__).parent
IMAGES_DIR = BASE_DIR / "images"
OUTPUT_MD = BASE_DIR / "Photography.md"

GRAPHQL_QUERY = """
{
  elements(filters: { clusterId: CLUSTER_ID_PLACEHOLDER }, meta: { pageSize: PAGE_SIZE_PLACEHOLDER CURSOR_PLACEHOLDER }) {
    items {
      __typename
      ... on ArticleElement { id articleTitle sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on ImageElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on PinterestElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on InstagramElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on TwitterElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on Element { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
    }
    meta {
      nextPageCursor
      count
    }
  }
}
"""

CDN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://www.cosmos.so/",
    "Accept": "image/webp,image/*,*/*",
}


def build_query(cursor=None):
    q = GRAPHQL_QUERY.replace("CLUSTER_ID_PLACEHOLDER", str(CLUSTER_ID))
    q = q.replace("PAGE_SIZE_PLACEHOLDER", str(PAGE_SIZE))
    if cursor:
        q = q.replace("CURSOR_PLACEHOLDER", f', pageCursor: "{cursor}"')
    else:
        q = q.replace("CURSOR_PLACEHOLDER", "")
    return q


def fetch_page(cursor=None):
    query = build_query(cursor)
    payload = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        GRAPHQL_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        },
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
        print(f"  Fetching page {page}...")
        data = fetch_page(cursor)
        elements = data.get("data", {}).get("elements", {})
        items = elements.get("items", [])
        meta = elements.get("meta", {})
        all_items.extend(items)
        print(f"    Got {len(items)} items (total so far: {len(all_items)})")
        cursor = meta.get("nextPageCursor")
        if not cursor:
            break
        time.sleep(0.3)
    return all_items


def get_image_extension(url):
    path = url.split("?")[0]
    if "." in path.split("/")[-1]:
        ext = path.split("/")[-1].rsplit(".", 1)[-1].lower()
        if ext in ("jpg", "jpeg", "png", "gif", "webp", "svg", "avif"):
            return ext
    return "jpg"


def download_image(url, item_id):
    if not url:
        return None
    ext = get_image_extension(url)
    filename = f"{item_id}.{ext}"
    filepath = IMAGES_DIR / filename
    if filepath.exists():
        print(f"    [cached] {filename}")
        return filename
    try:
        req = urllib.request.Request(url, headers=CDN_HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        filepath.write_bytes(data)
        size_kb = len(data) / 1024
        print(f"    [downloaded] {filename} ({size_kb:.0f} KB)")
        return filename
    except Exception as e:
        print(f"    [error] {filename}: {e}")
        return None


def generate_markdown(items):
    lines = []
    lines.append("# Photography Collection")
    lines.append("")
    lines.append(f"> Exported from [Cosmos.so](https://www.cosmos.so/arjunphlox/photography) | {len(items)} items")
    lines.append("")
    lines.append("---")
    lines.append("")

    for i, item in enumerate(items, 1):
        typename = item.get("__typename", "Element")
        item_id = item.get("id", f"unknown_{i}")
        source_url = item.get("sourceUrl", "")
        item_type = item.get("type", "")
        title = item.get("articleTitle", "")
        caption_obj = item.get("generatedCaption")
        caption = caption_obj.get("text", "") if caption_obj else ""
        tags = item.get("computerVisionTags") or []
        image_obj = item.get("image")
        image_url = image_obj.get("url", "") if image_obj else ""

        # Build heading
        display_title = title or caption or f"Item {i}"
        # Truncate long captions for heading
        if len(display_title) > 100:
            display_title = display_title[:97] + "..."

        lines.append(f"## {i}. {display_title}")
        lines.append("")

        # Download and embed image
        if image_url:
            local_file = download_image(image_url, item_id)
            if local_file:
                lines.append(f"![{display_title}](images/{local_file})")
                lines.append("")

        # Metadata table
        lines.append("| Field | Value |")
        lines.append("|-------|-------|")
        lines.append(f"| **Type** | {typename} ({item_type}) |")
        if source_url:
            lines.append(f"| **Source** | [{source_url}]({source_url}) |")
        if title:
            lines.append(f"| **Title** | {title} |")
        if caption:
            lines.append(f"| **Caption** | {caption} |")
        if tags:
            lines.append(f"| **Tags** | {', '.join(tags)} |")
        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def main():
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    print("[1/3] Fetching collection items via GraphQL API...")
    items = fetch_all_items()
    print(f"\n  Total items fetched: {len(items)}")

    if not items:
        print("No items found. Exiting.")
        sys.exit(1)

    print(f"\n[2/3] Downloading {len(items)} images...")
    # We download inside generate_markdown, so this step is combined

    print(f"\n[3/3] Generating markdown...")
    md_content = generate_markdown(items)
    OUTPUT_MD.write_text(md_content, encoding="utf-8")
    print(f"\n  Saved to: {OUTPUT_MD}")

    # Summary
    downloaded = len(list(IMAGES_DIR.glob("*")))
    print(f"\n--- Summary ---")
    print(f"  Items:  {len(items)}")
    print(f"  Images: {downloaded}")
    print(f"  Output: {OUTPUT_MD}")
    print(f"  Done!")


if __name__ == "__main__":
    main()
