#!/usr/bin/env python3
"""Fetch Cosmos.so 'huegrid' collection and export as markdown with images."""

import json
import os
import re
import urllib.request
import urllib.error
import ssl
import time
from urllib.parse import urlparse

CLUSTER_ID = 228268163
GRAPHQL_URL = "https://api.www.cosmos.so/graphql"
PAGE_SIZE = 40

BASE_DIR = "/Users/arjunphlox/Documents/Personal Projects/Stello/Huegrid"
IMAGES_DIR = os.path.join(BASE_DIR, "images")
OUTPUT_MD = os.path.join(BASE_DIR, "Huegrid.md")

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

# Allow unverified SSL for CDN image downloads if needed
ssl_ctx = ssl.create_default_context()


def sanitize_filename(text):
    """Sanitize text for use as filename."""
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'\s+', '_', text.strip())
    return text[:80] if text else "Untitled"


def get_title(item):
    """Get title with fallback chain: articleTitle -> caption -> tags -> domain -> Untitled."""
    # articleTitle
    title = item.get("articleTitle")
    if title and title.strip():
        return title.strip()

    # generatedCaption
    caption = item.get("generatedCaption")
    if caption and isinstance(caption, dict):
        text = caption.get("text", "")
        if text and text.strip():
            # Clean up caption: take first sentence, limit length
            cleaned = text.strip().split(".")[0].strip()
            if cleaned:
                return cleaned[:120]

    # computerVisionTags
    tags = item.get("computerVisionTags")
    if tags and isinstance(tags, list) and len(tags) > 0:
        return ", ".join(tags[:5])

    # domain from sourceUrl
    source_url = item.get("sourceUrl", "")
    if source_url:
        try:
            domain = urlparse(source_url).netloc
            if domain:
                return domain
        except Exception:
            pass

    return "Untitled"


def fetch_graphql(cursor=None):
    """Fetch a page of elements from the GraphQL API."""
    cursor_part = f', pageCursor: "{cursor}"' if cursor else ""
    query = GRAPHQL_QUERY % (CLUSTER_ID, PAGE_SIZE, cursor_part)
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

    with urllib.request.urlopen(req, context=ssl_ctx, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    elements = data.get("data", {}).get("elements", {})
    items = elements.get("items", [])
    meta = elements.get("meta", {})
    return items, meta.get("nextPageCursor"), meta.get("count", 0)


def download_image(image_url, filename):
    """Download an image from CDN."""
    filepath = os.path.join(IMAGES_DIR, filename)
    if os.path.exists(filepath):
        return filepath

    req = urllib.request.Request(image_url, headers=CDN_HEADERS)
    try:
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=30) as resp:
            with open(filepath, "wb") as f:
                f.write(resp.read())
        return filepath
    except Exception as e:
        print(f"  [WARN] Failed to download {image_url}: {e}")
        return None


def main():
    os.makedirs(IMAGES_DIR, exist_ok=True)

    # Step 1: Fetch all items via paginated GraphQL
    all_items = []
    cursor = None
    page = 0

    print("Fetching items from Cosmos.so GraphQL API...")
    while True:
        page += 1
        items, next_cursor, count = fetch_graphql(cursor)
        all_items.extend(items)
        print(f"  Page {page}: fetched {len(items)} items (total so far: {len(all_items)}/{count})")

        if not next_cursor or not items:
            break
        cursor = next_cursor
        time.sleep(0.5)

    print(f"\nTotal items fetched: {len(all_items)}")

    # Step 2: Download images and build markdown
    print("\nDownloading images and building markdown...")
    md_lines = [
        "# HueGrid Collection",
        "",
        f"> Exported from [cosmos.so/arjunphlox/huegrid](https://www.cosmos.so/arjunphlox/huegrid)",
        f"> {len(all_items)} items | Exported on 2026-03-30",
        "",
        "---",
        "",
    ]

    downloaded = 0
    failed = 0

    for i, item in enumerate(all_items, 1):
        title = get_title(item)
        element_id = item.get("id", "unknown")
        typename = item.get("__typename", "Element")
        source_url = item.get("sourceUrl", "")
        image_data = item.get("image") or {}
        image_url = image_data.get("url", "")
        caption = ""
        cap_obj = item.get("generatedCaption")
        if cap_obj and isinstance(cap_obj, dict):
            caption = cap_obj.get("text", "")
        tags = item.get("computerVisionTags") or []

        safe_title = sanitize_filename(title)
        img_filename = f"{safe_title}_{element_id}.webp"

        # Download image
        local_img_path = None
        if image_url:
            print(f"  [{i}/{len(all_items)}] Downloading: {title[:60]}...")
            local_img_path = download_image(image_url, img_filename)
            if local_img_path:
                downloaded += 1
            else:
                failed += 1

        # Build markdown entry
        md_lines.append(f"## {i}. {title}")
        md_lines.append("")

        if local_img_path:
            rel_path = f"images/{img_filename}"
            md_lines.append(f"![{title}]({rel_path})")
            md_lines.append("")

        # Metadata table
        md_lines.append(f"| Field | Value |")
        md_lines.append(f"|-------|-------|")
        md_lines.append(f"| **Type** | {typename} |")
        if source_url:
            md_lines.append(f"| **Source** | [{urlparse(source_url).netloc}]({source_url}) |")
        if caption:
            md_lines.append(f"| **Caption** | {caption} |")
        if tags:
            md_lines.append(f"| **Tags** | {', '.join(tags)} |")
        md_lines.append("")

        if image_url:
            md_lines.append(f"<details><summary>CDN URL</summary>")
            md_lines.append(f"")
            md_lines.append(f"`{image_url}`")
            md_lines.append(f"")
            md_lines.append(f"</details>")
            md_lines.append("")

        md_lines.append("---")
        md_lines.append("")

    # Write markdown file
    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))

    print(f"\nDone!")
    print(f"  Markdown: {OUTPUT_MD}")
    print(f"  Images downloaded: {downloaded}")
    print(f"  Images failed: {failed}")
    print(f"  Total entries: {len(all_items)}")


if __name__ == "__main__":
    main()
